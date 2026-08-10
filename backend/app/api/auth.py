from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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

router = APIRouter(prefix="/auth", tags=["auth"])


def _http_error(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(
        status_code=exc.status_code,
        detail=detail,
    )


@router.post("/register", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
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
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
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
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PasswordResetRequestResponse:
    raw_token = request_password_reset(db, email=str(payload.email))
    # E-mail delivery is not wired yet. In local/dev, expose the token for testing.
    # Never expose tokens in HML/production-like environments.
    dev_token = None if settings.is_production_like else raw_token
    if raw_token and not settings.is_production_like:
        # Structured log without storing the raw token in DB.
        print(f"[croniu-dev] password reset token for {payload.email}: {raw_token}")
    return PasswordResetRequestResponse(
        message=PASSWORD_RESET_GENERIC_MESSAGE,
        dev_reset_token=dev_token,
    )


@router.post("/password-reset/confirm", response_model=MessageResponse)
def password_reset_confirm(
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db),
) -> MessageResponse:
    try:
        confirm_password_reset(db, token=payload.token, new_password=payload.password)
    except AuthError as exc:
        raise _http_error(exc) from exc
    return MessageResponse(message="Senha atualizada. Você já pode entrar com a nova senha.")
