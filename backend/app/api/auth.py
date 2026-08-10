from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models.organization import Organization
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    MessageResponse,
    OrganizationOut,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RegisterRequest,
    UserOut,
)
from app.security.rate_limit import public_rate_limiter
from app.services.auth import (
    PASSWORD_RESET_GENERIC_MESSAGE,
    AuthContext,
    AuthError,
    authenticate_user,
    clear_session_cookie,
    confirm_password_reset,
    create_session,
    get_current_auth,
    primary_organization_id,
    register_owner,
    request_password_reset,
    resolve_session,
    revoke_session,
    set_session_cookie,
)
from app.services.email_flow import (
    EMAIL_VERIFICATION_GENERIC_MESSAGE,
    confirm_email_verification,
    request_email_verification,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationRequestResponse(BaseModel):
    message: str
    dev_verification_token: str | None = None


class EmailVerificationConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=200)


def _http_error(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(
        status_code=exc.status_code,
        detail=detail,
    )


def _enforce_auth_rate_limit(request: Request, settings: Settings, bucket: str) -> None:
    client = request.client.host if request.client else "unknown"
    key = f"auth:{bucket}:{client}"
    if not public_rate_limiter.allow(
        key,
        limit=settings.auth_rate_limit_per_minute,
        window_seconds=60.0,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": "Muitas tentativas. Aguarde um momento."},
        )


@router.post("/register", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
    _enforce_auth_rate_limit(request, settings, "register")
    try:
        user, organization, membership = register_owner(
            db,
            email=str(payload.email),
            password=payload.password,
            full_name=payload.full_name,
            organization_name=payload.organization_name,
        )
        _, token = create_session(db, user=user, organization_id=organization.id, settings=settings)
    except AuthError as exc:
        raise _http_error(exc) from exc

    set_session_cookie(response, token, settings)
    return MeResponse(
        user=UserOut.model_validate(user),
        organization=OrganizationOut.model_validate(organization),
        role=membership.role,
    )


@router.post("/login", response_model=MeResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
    _enforce_auth_rate_limit(request, settings, "login")
    try:
        user = authenticate_user(db, email=str(payload.email), password=payload.password)
        organization_id = primary_organization_id(db, user)
        _, token = create_session(db, user=user, organization_id=organization_id, settings=settings)
        user.last_login_at = datetime.now(UTC)
        db.add(user)
        organization = db.get(Organization, organization_id)
        if organization is not None:
            organization.last_activity_at = datetime.now(UTC)
            db.add(organization)
        db.commit()
        auth = resolve_session(db, token)
    except AuthError as exc:
        raise _http_error(exc) from exc

    set_session_cookie(response, token, settings)
    return MeResponse(
        user=UserOut.model_validate(auth.user),
        organization=OrganizationOut.model_validate(auth.organization),
        role=auth.membership.role,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token:
        try:
            auth = resolve_session(db, raw_token)
            revoke_session(db, auth.session)
        except AuthError:
            pass
    clear_session_cookie(response, settings)
    return MessageResponse(message="Sessão encerrada.")


@router.get("/me", response_model=MeResponse)
def me(auth: AuthContext = Depends(get_current_auth)) -> MeResponse:
    return MeResponse(
        user=UserOut.model_validate(auth.user),
        organization=OrganizationOut.model_validate(auth.organization),
        role=auth.membership.role,
    )


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PasswordResetRequestResponse:
    _enforce_auth_rate_limit(request, settings, "password-reset")
    raw_token = request_password_reset(db, email=str(payload.email), settings=settings)
    # Never expose tokens in HML/production-like environments.
    dev_token = None if settings.is_production_like else raw_token
    return PasswordResetRequestResponse(
        message=PASSWORD_RESET_GENERIC_MESSAGE,
        dev_reset_token=dev_token,
    )


@router.post("/password-reset/confirm", response_model=MessageResponse)
def password_reset_confirm(
    payload: PasswordResetConfirm,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    _enforce_auth_rate_limit(request, settings, "password-reset-confirm")
    try:
        confirm_password_reset(db, token=payload.token, new_password=payload.password)
    except AuthError as exc:
        raise _http_error(exc) from exc
    return MessageResponse(message="Senha atualizada. Você já pode entrar com a nova senha.")


@router.post("/email-verification/request", response_model=EmailVerificationRequestResponse)
def email_verification_request(
    payload: EmailVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EmailVerificationRequestResponse:
    _enforce_auth_rate_limit(request, settings, "email-verification")
    raw_token = request_email_verification(db, email=str(payload.email), settings=settings)
    dev_token = None if settings.is_production_like else raw_token
    return EmailVerificationRequestResponse(
        message=EMAIL_VERIFICATION_GENERIC_MESSAGE,
        dev_verification_token=dev_token,
    )


@router.post("/email-verification/confirm", response_model=MessageResponse)
def email_verification_confirm(
    payload: EmailVerificationConfirm,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    _enforce_auth_rate_limit(request, settings, "email-verification-confirm")
    try:
        confirm_email_verification(db, token=payload.token)
    except AuthError as exc:
        raise _http_error(exc) from exc
    return MessageResponse(message="E-mail confirmado com sucesso.")
