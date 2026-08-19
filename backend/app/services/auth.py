from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.db import get_db
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.password_reset_token import PasswordResetToken
from app.models.session import Session as SessionModel
from app.models.user import User
from app.security.passwords import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)

PASSWORD_RESET_TTL_HOURS = 1
PASSWORD_RESET_GENERIC_MESSAGE = (
    "Se existir uma conta com este e-mail, enviaremos instruções para redefinir a senha."
)


@dataclass
class AuthContext:
    user: User
    organization: Organization
    membership: Membership
    session: SessionModel


class AuthError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: object | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


def register_owner(
    db: Session,
    *,
    email: str,
    password: str,
    full_name: str,
    organization_name: str,
    profession_code: str | None = None,
    profession_specialty: str | None = None,
    profession_other: str | None = None,
    use_cases: list[str] | None = None,
    referral_code: str | None = None,
) -> tuple[User, Organization, Membership]:
    normalized_email = email.strip().lower()
    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing is not None:
        raise AuthError(
            "email_taken",
            "Não foi possível criar a conta com este e-mail.",
            status.HTTP_409_CONFLICT,
        )

    cleaned = None
    if profession_code:
        from app.services import profession as profession_svc

        try:
            cleaned = profession_svc.validate_profession_payload(
                profession_code=profession_code,
                profession_specialty=profession_specialty,
                profession_other=profession_other,
                use_cases=use_cases,
            )
        except ValueError as exc:
            raise AuthError("invalid_profession", str(exc), 422) from exc

    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        full_name=full_name.strip(),
    )
    organization = Organization(name=organization_name.strip())
    if cleaned:
        organization.profession_code = cleaned["profession_code"]
        organization.profession_specialty = cleaned["profession_specialty"]
        organization.profession_other = cleaned["profession_other"]
        organization.use_cases = cleaned["use_cases"]
        organization.profession_onboarding_done = True
    db.add(user)
    db.add(organization)
    try:
        db.flush()
        membership = Membership(user_id=user.id, organization_id=organization.id, role="owner")
        db.add(membership)
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AuthError(
            "email_taken",
            "Este e-mail já possui uma conta. Entre ou use outro e-mail.",
            status.HTTP_409_CONFLICT,
        ) from exc

    from app.billing.service import BillingService
    from app.services.referral import create_attribution_if_eligible

    try:
        BillingService(db).create_trial(organization_id=organization.id)
        create_attribution_if_eligible(
            db, organization_id=organization.id, raw_code=referral_code
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AuthError(
            "register_failed",
            "Não foi possível criar sua conta. Revise as informações ou tente novamente.",
            status.HTTP_409_CONFLICT,
        ) from exc
    except AuthError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise AuthError(
            "register_failed",
            "Não foi possível criar sua conta. Tente novamente em instantes.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ) from None

    db.refresh(user)
    db.refresh(organization)
    db.refresh(membership)

    # Optional transactional mail (fake in tests; Resend in PRD). Never blocks signup.
    # Welcome is sent only after successful e-mail verification.
    try:
        from app.config import get_settings
        from app.services.email_flow import (
            issue_email_verification_token,
            send_email_verification,
        )

        settings = get_settings()
        raw_verify = issue_email_verification_token(db, user=user)
        db.commit()
        send_email_verification(settings=settings, user=user, raw_token=raw_verify)
    except Exception:
        # Registration must succeed even if outbound e-mail fails.
        db.rollback()
        db.refresh(user)
        db.refresh(organization)
        db.refresh(membership)

    return user, organization, membership


def ensure_email_verified(user: User, settings: Settings) -> None:
    """Raise when PRD-style hard-gate is on and the account is still pending."""
    if not settings.email_verification_required:
        return
    if user.email_verified_at is not None:
        return
    raise AuthError(
        "email_unverified",
        "Confirme seu e-mail para acessar o Croniu.",
        status.HTTP_403_FORBIDDEN,
    )

def authenticate_user(db: Session, *, email: str, password: str) -> User:
    normalized_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError(
            "invalid_credentials",
            "E-mail ou senha inválidos.",
            status.HTTP_401_UNAUTHORIZED,
        )
    return user


def create_session(
    db: Session,
    *,
    user: User,
    organization_id: uuid.UUID,
    settings: Settings,
) -> tuple[SessionModel, str]:
    raw_token = generate_session_token()
    session = SessionModel(
        user_id=user.id,
        organization_id=organization_id,
        token_hash=hash_session_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, raw_token


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
    )


def resolve_session(
    db: Session,
    raw_token: str | None,
) -> AuthContext:
    if not raw_token:
        raise AuthError("unauthenticated", "Autenticação necessária.", status.HTTP_401_UNAUTHORIZED)

    token_hash = hash_session_token(raw_token)
    session = db.scalar(
        select(SessionModel)
        .where(SessionModel.token_hash == token_hash)
        .options(
            selectinload(SessionModel.user).selectinload(User.memberships),
        )
    )
    if session is None or session.revoked_at is not None:
        raise AuthError("invalid_session", "Sessão inválida.", status.HTTP_401_UNAUTHORIZED)

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise AuthError("session_expired", "Sessão expirada.", status.HTTP_401_UNAUTHORIZED)

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == session.user_id,
            Membership.organization_id == session.organization_id,
        )
    )
    organization = db.get(Organization, session.organization_id)
    if membership is None or organization is None:
        raise AuthError("invalid_session", "Sessão inválida.", status.HTTP_401_UNAUTHORIZED)

    return AuthContext(
        user=session.user,
        organization=organization,
        membership=membership,
        session=session,
    )


def revoke_session(db: Session, session: SessionModel) -> None:
    session.revoked_at = datetime.now(UTC)
    db.add(session)
    db.commit()


def get_current_auth(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    session_token = request.cookies.get(settings.session_cookie_name)
    try:
        auth = resolve_session(db, session_token)
        ensure_email_verified(auth.user, settings)
        return auth
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


def primary_organization_id(db: Session, user: User) -> uuid.UUID:
    membership = db.scalar(
        select(Membership)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at.asc())
    )
    if membership is None:
        raise AuthError(
            "no_organization",
            "Usuário sem organização.",
            status.HTTP_400_BAD_REQUEST,
        )
    return membership.organization_id


def request_password_reset(
    db: Session,
    *,
    email: str,
    settings: Settings | None = None,
) -> str | None:
    """Create a reset token when the user exists. Always safe to call.

    Returns the raw token only for the caller to expose in non-production.
    When settings are provided, attempts outbound e-mail delivery.
    """
    normalized_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        return None

    raw_token = generate_session_token()
    token_hash = hash_session_token(raw_token)
    token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(hours=PASSWORD_RESET_TTL_HOURS),
    )
    db.add(token)
    db.commit()

    if settings is not None:
        from app.services.email_flow import send_password_reset_email

        send_password_reset_email(
            settings=settings,
            user=user,
            raw_token=raw_token,
            token_hash=token_hash,
        )
    return raw_token

def confirm_password_reset(db: Session, *, token: str, new_password: str) -> None:
    token_hash = hash_session_token(token.strip())
    reset = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    now = datetime.now(UTC)
    if reset is None or reset.used_at is not None:
        raise AuthError(
            "invalid_reset_token",
            "Link de redefinição inválido ou já utilizado.",
            status.HTTP_400_BAD_REQUEST,
        )
    expires_at = reset.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        raise AuthError(
            "expired_reset_token",
            "Este link de redefinição expirou. Solicite um novo.",
            status.HTTP_400_BAD_REQUEST,
        )

    user = db.get(User, reset.user_id)
    if user is None:
        raise AuthError(
            "invalid_reset_token",
            "Link de redefinição inválido ou já utilizado.",
            status.HTTP_400_BAD_REQUEST,
        )

    user.password_hash = hash_password(new_password)
    reset.used_at = now
    db.add(user)
    db.add(reset)

    # Revoke outstanding sessions and other unused reset tokens for this user.
    sessions = db.scalars(
        select(SessionModel).where(
            SessionModel.user_id == user.id,
            SessionModel.revoked_at.is_(None),
        )
    ).all()
    for session in sessions:
        session.revoked_at = now
        db.add(session)

    other_tokens = db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.id != reset.id,
        )
    ).all()
    for other in other_tokens:
        other.used_at = now
        db.add(other)

    db.commit()
