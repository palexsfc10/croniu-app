from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.db import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.platform_membership import PlatformMembership
from app.models.platform_session import PlatformSession
from app.models.user import User
from app.security.passwords import (
    generate_session_token,
    hash_session_token,
    verify_password,
)
from app.services.auth import AuthError

PLATFORM_ROLES = frozenset({"platform_admin", "platform_viewer"})


@dataclass
class PlatformAuthContext:
    user: User
    membership: PlatformMembership
    session: PlatformSession


def get_platform_membership(db: Session, user_id: uuid.UUID) -> PlatformMembership | None:
    return db.scalar(select(PlatformMembership).where(PlatformMembership.user_id == user_id))


def authenticate_platform_user(db: Session, *, email: str, password: str) -> User:
    normalized_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError(
            "invalid_credentials",
            "E-mail ou senha inválidos.",
            status.HTTP_401_UNAUTHORIZED,
        )
    if user.account_status != "active":
        raise AuthError(
            "account_disabled",
            "Conta indisponível.",
            status.HTTP_403_FORBIDDEN,
        )
    membership = get_platform_membership(db, user.id)
    if membership is None or membership.role not in PLATFORM_ROLES:
        raise AuthError(
            "platform_forbidden",
            "Acesso administrativo negado.",
            status.HTTP_403_FORBIDDEN,
        )
    return user


def create_platform_session(
    db: Session,
    *,
    user: User,
    settings: Settings,
) -> tuple[PlatformSession, str]:
    raw_token = generate_session_token()
    session = PlatformSession(
        user_id=user.id,
        token_hash=hash_session_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(hours=settings.admin_session_ttl_hours),
    )
    db.add(session)
    user.last_login_at = datetime.now(UTC)
    db.add(user)
    db.commit()
    db.refresh(session)
    return session, raw_token


def set_platform_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.admin_session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
        max_age=settings.admin_session_ttl_hours * 3600,
        path="/",
    )


def clear_platform_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.admin_session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
    )


def resolve_platform_session(db: Session, raw_token: str | None) -> PlatformAuthContext:
    if not raw_token:
        raise AuthError("unauthenticated", "Autenticação necessária.", status.HTTP_401_UNAUTHORIZED)

    token_hash = hash_session_token(raw_token)
    session = db.scalar(
        select(PlatformSession)
        .where(PlatformSession.token_hash == token_hash)
        .options(selectinload(PlatformSession.user))
    )
    if session is None or session.revoked_at is not None:
        raise AuthError("invalid_session", "Sessão inválida.", status.HTTP_401_UNAUTHORIZED)

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise AuthError("session_expired", "Sessão expirada.", status.HTTP_401_UNAUTHORIZED)

    membership = get_platform_membership(db, session.user_id)
    if membership is None or membership.role not in PLATFORM_ROLES:
        raise AuthError(
            "platform_forbidden",
            "Acesso administrativo negado.",
            status.HTTP_403_FORBIDDEN,
        )
    if session.user.account_status != "active":
        raise AuthError(
            "account_disabled",
            "Conta indisponível.",
            status.HTTP_403_FORBIDDEN,
        )

    return PlatformAuthContext(user=session.user, membership=membership, session=session)


def revoke_platform_session(db: Session, session: PlatformSession) -> None:
    session.revoked_at = datetime.now(UTC)
    db.add(session)
    db.commit()


def write_admin_audit(
    db: Session,
    *,
    actor_user_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    organization_id: uuid.UUID | None = None,
    reason: str | None = None,
    before_state: dict | None = None,
    after_state: dict | None = None,
    metadata_safe: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        actor_user_id=actor_user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        organization_id=organization_id,
        reason=reason,
        before_state=before_state,
        after_state=after_state,
        metadata_safe=metadata_safe,
        ip_address=ip_address,
        user_agent=(user_agent[:500] if user_agent else None),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_current_platform_auth(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PlatformAuthContext:
    token = request.cookies.get(settings.admin_session_cookie_name)
    try:
        return resolve_platform_session(db, token)
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


def client_meta(request: Request) -> tuple[str | None, str | None]:
    forwarded = request.headers.get("x-forwarded-for")
    ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else None)
    )
    ua = request.headers.get("user-agent")
    return ip, ua
