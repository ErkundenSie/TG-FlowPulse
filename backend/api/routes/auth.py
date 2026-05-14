from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core import auth as auth_core
from backend.core.auth import authenticate_user, create_access_token, verify_totp
from backend.core.database import get_db
from backend.core.security import verify_password
from backend.models.user import User
from backend.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter()
logger = logging.getLogger("backend.auth")
_LOGIN_FAILURES: dict[str, tuple[int, datetime]] = {}
_MAX_LOGIN_FAILURES = 5
_LOGIN_LOCKOUT_SECONDS = 300


class ResetTOTPRequest(BaseModel):
    """重置 TOTP 请求（需已登录并通过密码验证）"""

    username: str | None = None
    password: str


class ResetTOTPResponse(BaseModel):
    """重置 TOTP 响应"""

    success: bool
    message: str


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    return (
        forwarded_for.split(",", 1)[0].strip()
        or request.headers.get("x-real-ip", "").strip()
        or (request.client.host if request.client else "")
    )


def _login_rate_key(request: Request, username: str) -> str:
    return f"{_client_ip(request)}:{username.strip().lower()}"


def _check_login_rate_limit(key: str) -> None:
    failure = _LOGIN_FAILURES.get(key)
    if not failure:
        return
    count, last_failed_at = failure
    elapsed = (datetime.utcnow() - last_failed_at).total_seconds()
    if elapsed > _LOGIN_LOCKOUT_SECONDS:
        _LOGIN_FAILURES.pop(key, None)
        return
    if count >= _MAX_LOGIN_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please try again later.",
        )


def _record_login_failure(key: str) -> None:
    count, _ = _LOGIN_FAILURES.get(key, (0, datetime.utcnow()))
    _LOGIN_FAILURES[key] = (count + 1, datetime.utcnow())


def _clear_login_failures(key: str) -> None:
    _LOGIN_FAILURES.pop(key, None)


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    rate_key = _login_rate_key(request, payload.username)
    _check_login_rate_limit(rate_key)
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        _record_login_failure(rate_key)
        logger.warning("Authentication failed for user: %s", payload.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if user.totp_secret:
        if not payload.totp_code or not verify_totp(
            user.totp_secret, payload.totp_code
        ):
            _record_login_failure(rate_key)
            logger.warning("TOTP verification failed for user: %s", user.username)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="TOTP_REQUIRED_OR_INVALID",
            )
    _clear_login_failures(rate_key)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(hours=12),
    )
    try:
        from backend.services.config import get_config_service
        from backend.services.push_notifications import send_login_notification

        ip_address = _client_ip(request)
        settings = get_config_service().get_global_settings()
        background_tasks.add_task(
            send_login_notification,
            settings,
            username=user.username,
            ip_address=ip_address,
        )
    except Exception as exc:
        logger.warning("Failed to queue login notification: %s", exc)
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(auth_core.get_current_user)):
    return current_user


@router.post("/reset-totp", response_model=ResetTOTPResponse)
def reset_totp(
    request: ResetTOTPRequest,
    current_user: User = Depends(auth_core.get_current_user),
    db: Session = Depends(get_db),
):
    """
    重置当前登录用户的 TOTP。

    该接口不再允许仅凭用户名和密码在未登录状态下关闭 2FA。
    """
    if request.username and request.username != current_user.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能重置当前登录用户的两步验证",
        )

    if not verify_password(request.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误"
        )

    if not current_user.totp_secret:
        return ResetTOTPResponse(success=True, message="该用户未启用两步验证，无需重置")

    current_user.totp_secret = None
    db.commit()
    logger.info("TOTP reset for current user: %s", current_user.username)

    return ResetTOTPResponse(success=True, message="两步验证已重置")
