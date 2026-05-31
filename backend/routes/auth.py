"""
Authentication routes.

POST   /auth/register          create account
POST   /auth/login             sign in
GET    /auth/me                current user
PATCH  /auth/me                update name
DELETE /auth/me                delete account + all trips
POST   /auth/change-password   change password (logged in)
POST   /auth/forgot-password   request reset token (console)
POST   /auth/reset-password    use token to set new password
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from models.trip_storage import get_trip_store
from models.user import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdate,
)
from services.auth import get_auth_service, require_user_from_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@router.post("/register", status_code=201, summary="Create a new account")
async def register(payload: UserCreate) -> JSONResponse:
    auth_service = get_auth_service()
    try:
        user, token = auth_service.register(
            name=payload.name,
            email=str(payload.email),
            password=payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return JSONResponse(
        status_code=201,
        content={
            "user": user.model_dump(),
            "access_token": token,
            "token_type": "bearer",
        },
    )


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/login", summary="Sign in to an existing account")
async def login(payload: UserLogin) -> JSONResponse:
    auth_service = get_auth_service()
    try:
        user, token = auth_service.login(
            email=str(payload.email),
            password=payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    return JSONResponse(
        content={
            "user": user.model_dump(),
            "access_token": token,
            "token_type": "bearer",
        }
    )


# ---------------------------------------------------------------------------
# Get current user
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserResponse, summary="Get current user")
async def get_me(authorization: str = Header(...)) -> UserResponse:
    return require_user_from_header(authorization)


# ---------------------------------------------------------------------------
# Update name
# ---------------------------------------------------------------------------

@router.patch("/me", response_model=UserResponse, summary="Update profile name")
async def update_me(
    payload: UserUpdate,
    authorization: str = Header(...),
) -> UserResponse:
    current_user = require_user_from_header(authorization)
    auth_service = get_auth_service()

    updated = auth_service.update_name(current_user.id, payload.name)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update profile.")

    return updated


# ---------------------------------------------------------------------------
# Change password (logged in)
# ---------------------------------------------------------------------------

@router.post("/change-password", summary="Change password while logged in")
async def change_password(
    payload: ChangePasswordRequest,
    authorization: str = Header(...),
) -> JSONResponse:
    current_user = require_user_from_header(authorization)
    auth_service = get_auth_service()

    try:
        auth_service.change_password(
            user_id=current_user.id,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return JSONResponse(
        content={"status": "ok", "message": "Password changed successfully."}
    )


# ---------------------------------------------------------------------------
# Delete account
# ---------------------------------------------------------------------------

@router.delete("/me", summary="Delete account and all associated trips")
async def delete_me(authorization: str = Header(...)) -> JSONResponse:
    current_user = require_user_from_header(authorization)
    auth_service = get_auth_service()
    trip_store = get_trip_store()

    # 1. Delete all trips owned by this user
    deleted_trips = trip_store.delete_all_for_user(current_user.id)

    # 2. Delete the user
    if not auth_service.delete_account(current_user.id):
        raise HTTPException(status_code=500, detail="Failed to delete account.")

    logger.info(
        "Account deleted | user_id=%s | trips_deleted=%d",
        current_user.id,
        deleted_trips,
    )

    return JSONResponse(
        content={
            "status": "deleted",
            "trips_deleted": deleted_trips,
            "message": "Your account and all associated data have been deleted.",
        }
    )


# ---------------------------------------------------------------------------
# Forgot password (console-only)
# ---------------------------------------------------------------------------

@router.post("/forgot-password", summary="Request a password reset link (console-only)")
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
) -> JSONResponse:
    """
    Generate a password reset link and print it to the backend console.

    For security, this endpoint ALWAYS returns 200, regardless of whether
    the email exists. This prevents attackers from enumerating registered emails.
    """
    auth_service = get_auth_service()

    # Determine frontend base URL from Origin/Referer header
    # Falls back to localhost:5173 for development
    origin = request.headers.get("origin") or request.headers.get("referer")
    if origin:
        # Strip path from referer if needed
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        frontend_base = f"{parsed.scheme}://{parsed.netloc}"
    else:
        frontend_base = "http://localhost:5173"

    auth_service.request_password_reset(
        email=str(payload.email),
        reset_base_url=frontend_base,
    )

    # Always return generic success
    return JSONResponse(
        content={
            "status": "ok",
            "message": (
                "If an account exists for this email, a password reset link "
                "has been generated. Check the backend console for the link."
            ),
        }
    )


# ---------------------------------------------------------------------------
# Reset password (with token)
# ---------------------------------------------------------------------------

@router.post("/reset-password", summary="Use a reset token to set a new password")
async def reset_password(payload: ResetPasswordRequest) -> JSONResponse:
    auth_service = get_auth_service()

    try:
        auth_service.reset_password(
            token=payload.token,
            new_password=payload.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return JSONResponse(
        content={
            "status": "ok",
            "message": "Your password has been reset. You can now sign in.",
        }
    )