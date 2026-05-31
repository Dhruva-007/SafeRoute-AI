"""
User model and schema definitions.
SQLite-backed user storage for SafeRoute AI authentication.
"""

from __future__ import annotations

import sqlite3
import uuid
import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "users.db"


def _get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_user_db() -> None:
    """Create users and password_reset_tokens tables if they don't exist."""
    with _get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                email       TEXT NOT NULL UNIQUE,
                hashed_pw   TEXT NOT NULL,
                created_at  TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                token       TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL,
                expires_at  TEXT NOT NULL,
                used        INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_reset_tokens_user
            ON password_reset_tokens(user_id)
        """)
        conn.commit()
    logger.info("User database initialised | path=%s", DB_PATH)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Name cannot be blank.")
        return stripped

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: str


class UserInDB(BaseModel):
    id: str
    name: str
    email: str
    hashed_pw: str
    created_at: str


class UserUpdate(BaseModel):
    """Payload for PATCH /auth/me — currently only name."""
    name: str = Field(..., min_length=2, max_length=80)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Name cannot be blank.")
        return stripped


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("New password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("New password must contain at least one number.")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number.")
        return v


# ---------------------------------------------------------------------------
# UserStore
# ---------------------------------------------------------------------------

class UserStore:
    """CRUD operations for the users table."""

    def create(self, name: str, email: str, hashed_pw: str) -> UserInDB:
        user_id = str(uuid.uuid4())
        created_at = datetime.utcnow().isoformat() + "Z"

        with _get_connection() as conn:
            conn.execute(
                "INSERT INTO users (id, name, email, hashed_pw, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (user_id, name, email.lower().strip(), hashed_pw, created_at),
            )
            conn.commit()

        logger.info("User created | id=%s | email=%s", user_id, email)
        return UserInDB(
            id=user_id,
            name=name,
            email=email.lower().strip(),
            hashed_pw=hashed_pw,
            created_at=created_at,
        )

    def get_by_email(self, email: str) -> Optional[UserInDB]:
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?",
                (email.lower().strip(),),
            ).fetchone()
        if row is None:
            return None
        return UserInDB(**dict(row))

    def get_by_id(self, user_id: str) -> Optional[UserInDB]:
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return UserInDB(**dict(row))

    def email_exists(self, email: str) -> bool:
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM users WHERE email = ?",
                (email.lower().strip(),),
            ).fetchone()
        return row is not None

    def update_name(self, user_id: str, new_name: str) -> Optional[UserInDB]:
        with _get_connection() as conn:
            result = conn.execute(
                "UPDATE users SET name = ? WHERE id = ?",
                (new_name.strip(), user_id),
            )
            conn.commit()
            if result.rowcount == 0:
                return None
        logger.info("User name updated | id=%s", user_id)
        return self.get_by_id(user_id)

    def update_password(self, user_id: str, new_hashed_pw: str) -> bool:
        with _get_connection() as conn:
            result = conn.execute(
                "UPDATE users SET hashed_pw = ? WHERE id = ?",
                (new_hashed_pw, user_id),
            )
            conn.commit()
        if result.rowcount > 0:
            logger.info("User password updated | id=%s", user_id)
            return True
        return False

    def delete(self, user_id: str) -> bool:
        """Delete user. Reset tokens cascade automatically."""
        with _get_connection() as conn:
            result = conn.execute(
                "DELETE FROM users WHERE id = ?",
                (user_id,),
            )
            conn.commit()
        if result.rowcount > 0:
            logger.info("User deleted | id=%s", user_id)
            return True
        return False


# ---------------------------------------------------------------------------
# Password Reset Token Store
# ---------------------------------------------------------------------------

RESET_TOKEN_LIFETIME_HOURS = 1


class ResetTokenStore:
    """Manages password reset tokens."""

    def create_token(self, user_id: str) -> str:
        """Generate a new reset token. Invalidates any existing tokens for the user."""
        # Invalidate any existing tokens for this user
        with _get_connection() as conn:
            conn.execute(
                "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
                (user_id,),
            )
            conn.commit()

        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=RESET_TOKEN_LIFETIME_HOURS)

        with _get_connection() as conn:
            conn.execute(
                "INSERT INTO password_reset_tokens "
                "(token, user_id, expires_at, used, created_at) "
                "VALUES (?, ?, ?, 0, ?)",
                (token, user_id, expires.isoformat(), now.isoformat()),
            )
            conn.commit()

        return token

    def validate_token(self, token: str) -> Optional[str]:
        """
        Validate a token. Returns user_id if valid, None otherwise.
        Does NOT mark as used — call consume_token() for that.
        """
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT user_id, expires_at, used FROM password_reset_tokens "
                "WHERE token = ?",
                (token,),
            ).fetchone()

        if row is None:
            return None
        if row["used"]:
            return None

        try:
            expires = datetime.fromisoformat(row["expires_at"])
            if datetime.now(timezone.utc) > expires:
                return None
        except (ValueError, TypeError):
            return None

        return row["user_id"]

    def consume_token(self, token: str) -> None:
        """Mark a token as used."""
        with _get_connection() as conn:
            conn.execute(
                "UPDATE password_reset_tokens SET used = 1 WHERE token = ?",
                (token,),
            )
            conn.commit()

    def cleanup_expired(self) -> int:
        """Delete expired tokens. Called periodically (or on startup)."""
        with _get_connection() as conn:
            result = conn.execute(
                "DELETE FROM password_reset_tokens "
                "WHERE used = 1 OR datetime(expires_at) < datetime('now')"
            )
            conn.commit()
            return result.rowcount


# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------

_user_store: Optional[UserStore] = None
_reset_token_store: Optional[ResetTokenStore] = None


def get_user_store() -> UserStore:
    global _user_store
    if _user_store is None:
        _user_store = UserStore()
    return _user_store


def get_reset_token_store() -> ResetTokenStore:
    global _reset_token_store
    if _reset_token_store is None:
        _reset_token_store = ResetTokenStore()
    return _reset_token_store