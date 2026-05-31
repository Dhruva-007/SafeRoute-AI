"""
Authentication service.
Handles password hashing, JWT, and user lifecycle operations.
"""

from __future__ import annotations

import base64
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from config.settings import get_settings
from models.user import (
    ResetTokenStore,
    UserInDB,
    UserResponse,
    UserStore,
    get_reset_token_store,
    get_user_store,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Password hashing (SHA-256 prehash + bcrypt — no 72-byte limit)
# ---------------------------------------------------------------------------

def _prehash(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(plain: str) -> str:
    prehashed = _prehash(plain)
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(prehashed, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        prehashed = _prehash(plain)
        return bcrypt.checkpw(prehashed, hashed.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        logger.debug("Password verification error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        return user_id if user_id else None
    except JWTError as exc:
        logger.debug("JWT decode failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Auth service
# ---------------------------------------------------------------------------

_DUMMY_HASH = (
    "$2b$12$CwTycUXWue0Thq9StjUM0u"
    "Ji/eq2YzKBlz6jXcK2yPS1Oa5tZNYxq"
)


class AuthService:
    def __init__(self, store: UserStore, token_store: ResetTokenStore) -> None:
        self._store = store
        self._token_store = token_store

    # ── Registration / Login ─────────────────────────────────────────────

    def register(self, name: str, email: str, password: str) -> tuple[UserResponse, str]:
        if self._store.email_exists(email):
            raise ValueError("An account with this email already exists. Please sign in.")

        hashed = hash_password(password)
        user_in_db = self._store.create(name=name.strip(), email=email, hashed_pw=hashed)
        token = create_access_token(user_in_db.id)
        return self._to_response(user_in_db), token

    def login(self, email: str, password: str) -> tuple[UserResponse, str]:
        user_in_db = self._store.get_by_email(email)
        stored_hash = user_in_db.hashed_pw if user_in_db else _DUMMY_HASH
        password_ok = verify_password(password, stored_hash)

        if user_in_db is None or not password_ok:
            raise ValueError("Invalid email or password. Please check your credentials.")

        token = create_access_token(user_in_db.id)
        return self._to_response(user_in_db), token

    def get_user_from_token(self, token: str) -> Optional[UserResponse]:
        user_id = decode_access_token(token)
        if not user_id:
            return None
        user_in_db = self._store.get_by_id(user_id)
        if not user_in_db:
            return None
        return self._to_response(user_in_db)

    # ── Profile updates ──────────────────────────────────────────────────

    def update_name(self, user_id: str, new_name: str) -> Optional[UserResponse]:
        updated = self._store.update_name(user_id, new_name)
        return self._to_response(updated) if updated else None

    def change_password(
        self, user_id: str, current_password: str, new_password: str
    ) -> None:
        """Verify current password, then update to new. Raises ValueError on failure."""
        user = self._store.get_by_id(user_id)
        if not user:
            raise ValueError("User not found.")

        if not verify_password(current_password, user.hashed_pw):
            raise ValueError("Current password is incorrect.")

        if verify_password(new_password, user.hashed_pw):
            raise ValueError("New password must be different from your current password.")

        new_hash = hash_password(new_password)
        if not self._store.update_password(user_id, new_hash):
            raise ValueError("Failed to update password.")

    def delete_account(self, user_id: str) -> bool:
        """Delete user account. Caller is responsible for cleaning up their trips."""
        return self._store.delete(user_id)

    # ── Password reset ───────────────────────────────────────────────────

    def request_password_reset(self, email: str, reset_base_url: str) -> None:
        """
        Generate a reset token if the email exists.
        Prints the reset link to console (no email sending).
        Never raises — caller should always show generic success message.
        """
        user = self._store.get_by_email(email)
        if not user:
            logger.info(
                "Password reset requested for non-existent email: %s (silent)",
                email,
            )
            return

        token = self._token_store.create_token(user.id)
        reset_url = f"{reset_base_url.rstrip('/')}/reset-password?token={token}"

        # ─── CONSOLE OUTPUT ───────────────────────────────────────
        logger.info("=" * 70)
        logger.info("🔐 PASSWORD RESET LINK FOR: %s", user.email)
        logger.info("👤 User: %s (id=%s)", user.name, user.id)
        logger.info("⏰ Expires: 1 hour from now")
        logger.info("🔗 Reset URL:")
        logger.info("   %s", reset_url)
        logger.info("=" * 70)

    def reset_password(self, token: str, new_password: str) -> None:
        """
        Validate token and update password.
        Raises ValueError if token invalid / expired / used.
        """
        user_id = self._token_store.validate_token(token)
        if not user_id:
            raise ValueError(
                "This reset link is invalid or has expired. Please request a new one."
            )

        new_hash = hash_password(new_password)
        if not self._store.update_password(user_id, new_hash):
            raise ValueError("Failed to update password.")

        self._token_store.consume_token(token)
        logger.info("Password successfully reset for user_id=%s", user_id)

    # ── Helpers ──────────────────────────────────────────────────────────

    def _to_response(self, user_in_db: UserInDB) -> UserResponse:
        return UserResponse(
            id=user_in_db.id,
            name=user_in_db.name,
            email=user_in_db.email,
            created_at=user_in_db.created_at,
        )


# ---------------------------------------------------------------------------
# Singleton + dependency helper
# ---------------------------------------------------------------------------

_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService(get_user_store(), get_reset_token_store())
    return _auth_service


# Convenience function for routes that need the current user from header
def require_user_from_header(authorization: Optional[str]) -> UserResponse:
    """Extract and validate user from Authorization header. Raises if invalid."""
    from fastapi import HTTPException

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please sign in.",
        )

    token = authorization.removeprefix("Bearer ").strip()
    user = get_auth_service().get_user_from_token(token)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid. Please sign in again.",
        )

    return user