"""Outbound transactional e-mail orchestration."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.email.factory import get_email_provider
from app.email.messages import email_verification_email, password_reset_email, welcome_email
from app.models.email_verification_token import EmailVerificationToken
from app.models.user import User
from app.security.passwords import generate_session_token, hash_session_token

logger = logging.getLogger(__name__)

EMAIL_VERIFICATION_TTL_HOURS = 24
EMAIL_VERIFICATION_GENERIC_MESSAGE = (
    "Se existir uma conta com este e-mail, enviaremos instruções de verificação."
)


def _idempotency_key(purpose: str, user_id: uuid.UUID, token_hash: str) -> str:
    raw = f"{purpose}:{user_id}:{token_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _public_app_url(settings: Settings) -> str:
    return (settings.app_public_url or settings.public_app_base_url).rstrip("/")


def _safe_send(settings: Settings, message) -> None:
    try:
        get_email_provider(settings).send(message)
    except Exception:
        logger.exception("email_delivery_failed tags=%s", list(message.tags))


def send_password_reset_email(
    *,
    settings: Settings,
    user: User,
    raw_token: str,
    token_hash: str,
) -> None:
    message = password_reset_email(
        to=user.email,
        token=raw_token,
        app_public_url=_public_app_url(settings),
        reply_to=settings.email_reply_to or None,
        idempotency_key=_idempotency_key("password_reset", user.id, token_hash),
    )
    _safe_send(settings, message)


def issue_email_verification_token(db: Session, *, user: User) -> str:
    """Create a one-time verification token and invalidate previous unused ones."""
    now = datetime.now(UTC)
    pending = db.scalars(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        )
    ).all()
    for token in pending:
        token.used_at = now
        db.add(token)

    raw_token = generate_session_token()
    record = EmailVerificationToken(
        user_id=user.id,
        token_hash=hash_session_token(raw_token),
        expires_at=now + timedelta(hours=EMAIL_VERIFICATION_TTL_HOURS),
    )
    db.add(record)
    db.flush()
    return raw_token


def send_email_verification(
    *,
    settings: Settings,
    user: User,
    raw_token: str,
) -> None:
    token_hash = hash_session_token(raw_token)
    message = email_verification_email(
        to=user.email,
        token=raw_token,
        app_public_url=_public_app_url(settings),
        reply_to=settings.email_reply_to or None,
        idempotency_key=_idempotency_key("email_verification", user.id, token_hash),
    )
    _safe_send(settings, message)


def send_welcome_email(*, settings: Settings, user: User) -> None:
    message = welcome_email(
        to=user.email,
        full_name=user.full_name,
        app_public_url=_public_app_url(settings),
        reply_to=settings.email_reply_to or None,
        idempotency_key=_idempotency_key("welcome", user.id, "v1"),
    )
    _safe_send(settings, message)


def request_email_verification(db: Session, *, email: str, settings: Settings) -> str | None:
    """Issue/resend verification. Returns raw token only for non-production callers."""
    normalized = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized))
    if user is None:
        return None
    if user.email_verified_at is not None:
        return None
    raw = issue_email_verification_token(db, user=user)
    db.commit()
    send_email_verification(settings=settings, user=user, raw_token=raw)
    return raw


def confirm_email_verification(db: Session, *, token: str) -> None:
    from app.services.auth import AuthError

    token_hash = hash_session_token(token.strip())
    record = db.scalar(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash)
    )
    now = datetime.now(UTC)
    if record is None or record.used_at is not None:
        raise AuthError(
            "invalid_verification_token",
            "Link de verificação inválido ou já utilizado.",
            400,
        )
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        raise AuthError(
            "expired_verification_token",
            "Este link de verificação expirou. Solicite um novo.",
            400,
        )
    user = db.get(User, record.user_id)
    if user is None:
        raise AuthError(
            "invalid_verification_token",
            "Link de verificação inválido ou já utilizado.",
            400,
        )
    user.email_verified_at = now
    record.used_at = now
    db.add(user)
    db.add(record)
    siblings = db.scalars(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.id != record.id,
        )
    ).all()
    for sibling in siblings:
        sibling.used_at = now
        db.add(sibling)
    db.commit()
    db.refresh(user)

    from app.config import get_settings

    send_welcome_email(settings=get_settings(), user=user)