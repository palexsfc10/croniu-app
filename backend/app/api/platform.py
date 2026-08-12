from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.feedback import (
    FeedbackAdminListOut,
    FeedbackAdminOut,
    FeedbackStatusUpdateIn,
)
from app.schemas.platform import (
    OrganizationDetail,
    OverviewMetrics,
    PaginatedOrganizations,
    PaginatedUsers,
    PlatformLoginRequest,
    PlatformMeResponse,
)
from app.services.auth import AuthError
from app.services.platform import (
    get_organization_detail,
    get_overview_metrics,
    list_organizations,
    list_users,
)
from app.services.environment_label import normalize_croniu_env
from app.services.platform_auth import (
    PlatformAuthContext,
    authenticate_platform_user,
    clear_platform_session_cookie,
    client_meta,
    create_platform_session,
    get_current_platform_auth,
    get_platform_membership,
    resolve_platform_session,
    revoke_platform_session,
    set_platform_session_cookie,
    write_admin_audit,
)

router = APIRouter(prefix="/platform", tags=["platform"])


def _platform_me_response(
    *,
    user_id: uuid.UUID,
    email: str,
    full_name: str,
    role: str,
    settings: Settings,
) -> PlatformMeResponse:
    return PlatformMeResponse(
        id=user_id,
        email=email,
        full_name=full_name,
        role=role,
        environment=normalize_croniu_env(settings.croniu_env),
    )


def _http_error(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.post("/auth/login", response_model=PlatformMeResponse)
def platform_login(
    payload: PlatformLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PlatformMeResponse:
    ip, ua = client_meta(request)
    try:
        user = authenticate_platform_user(db, email=str(payload.email), password=payload.password)
        membership = get_platform_membership(db, user.id)
        assert membership is not None
        _, token = create_platform_session(db, user=user, settings=settings)
        write_admin_audit(
            db,
            actor_user_id=user.id,
            action="platform.login",
            resource_type="platform_session",
            resource_id=str(user.id),
            metadata_safe={"result": "success"},
            ip_address=ip,
            user_agent=ua,
        )
    except AuthError as exc:
        write_admin_audit(
            db,
            actor_user_id=None,
            action="platform.login_failed",
            resource_type="platform_session",
            metadata_safe={"result": "denied", "code": exc.code},
            ip_address=ip,
            user_agent=ua,
        )
        raise _http_error(exc) from exc

    set_platform_session_cookie(response, token, settings)
    return _platform_me_response(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role,
        settings=settings,
    )


@router.post("/auth/logout")
def platform_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    raw = request.cookies.get(settings.admin_session_cookie_name)
    if raw:
        try:
            auth = resolve_platform_session(db, raw)
            revoke_platform_session(db, auth.session)
            ip, ua = client_meta(request)
            write_admin_audit(
                db,
                actor_user_id=auth.user.id,
                action="platform.logout",
                resource_type="platform_session",
                resource_id=str(auth.session.id),
                ip_address=ip,
                user_agent=ua,
            )
        except AuthError:
            pass
    clear_platform_session_cookie(response, settings)
    return {"message": "Sessão administrativa encerrada."}


@router.get("/auth/me", response_model=PlatformMeResponse)
def platform_me(
    auth: PlatformAuthContext = Depends(get_current_platform_auth),
    settings: Settings = Depends(get_settings),
) -> PlatformMeResponse:
    return _platform_me_response(
        user_id=auth.user.id,
        email=auth.user.email,
        full_name=auth.user.full_name,
        role=auth.membership.role,
        settings=settings,
    )


@router.get("/overview", response_model=OverviewMetrics)
def platform_overview(
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
) -> OverviewMetrics:
    return get_overview_metrics(db)


@router.get("/organizations", response_model=PaginatedOrganizations)
def platform_organizations(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    search: str | None = Query(default=None, max_length=100),
) -> PaginatedOrganizations:
    return list_organizations(db, settings=settings, page=page, page_size=page_size, search=search)


@router.get("/organizations/{organization_id}", response_model=OrganizationDetail)
def platform_organization_detail(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
) -> OrganizationDetail:
    detail = get_organization_detail(db, organization_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Organização não encontrada."},
        )
    return detail


@router.get("/users", response_model=PaginatedUsers)
def platform_users(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    search: str | None = Query(default=None, max_length=100),
) -> PaginatedUsers:
    return list_users(db, settings=settings, page=page, page_size=page_size, search=search)


@router.get("/ai-ops")
def platform_ai_ops(
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
) -> dict:
    """Sanitized AI usage overview — no conversation bodies, no API keys."""
    from app.services.platform_ai_ops import get_ai_ops_overview

    return get_ai_ops_overview(db)


@router.get("/feedbacks", response_model=FeedbackAdminListOut)
def platform_feedbacks(
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    category: str | None = Query(default=None, max_length=32),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    created_from: date | None = Query(default=None),
    created_to: date | None = Query(default=None),
) -> FeedbackAdminListOut:
    from app.services import feedback as feedback_svc

    return feedback_svc.list_feedbacks_admin(
        db,
        page=page,
        page_size=page_size,
        category=category,
        status=status_filter,
        created_from=created_from,
        created_to=created_to,
    )


@router.patch("/feedbacks/{feedback_id}", response_model=FeedbackAdminOut)
def platform_feedback_status(
    feedback_id: uuid.UUID,
    payload: FeedbackStatusUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    auth: PlatformAuthContext = Depends(get_current_platform_auth),
) -> FeedbackAdminOut:
    from app.services import feedback as feedback_svc
    from app.services.auth import AuthError

    try:
        return feedback_svc.update_feedback_status(
            db,
            feedback_id=feedback_id,
            status=payload.status,
            actor_user_id=auth.user.id,
        )
    except AuthError as exc:
        ip, ua = client_meta(request)
        write_admin_audit(
            db,
            actor_user_id=auth.user.id,
            action="platform.feedback_status_denied",
            resource_type="user_feedback",
            resource_id=str(feedback_id),
            metadata_safe={"result": "denied", "code": exc.code},
            ip_address=ip,
            user_agent=ua,
        )
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


@router.get("/cycle-agenda-integrity")
def platform_cycle_agenda_integrity(
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
    organization_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=50),
) -> dict:
    from app.services.platform_pilot_ops import list_cycle_agenda_integrity

    return list_cycle_agenda_integrity(
        db,
        organization_id=organization_id,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )


@router.get("/organizations/{organization_id}/timeline")
def platform_organization_timeline(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
) -> dict:
    from app.services.platform_pilot_ops import get_organization_timeline

    timeline = get_organization_timeline(db, organization_id)
    if timeline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Organização não encontrada."},
        )
    return timeline


@router.get("/ai-runs")
def platform_ai_runs(
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
    organization_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    proposal_status: str | None = Query(default=None, max_length=32),
    message_type: str | None = Query(default=None, max_length=16),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=50),
) -> dict:
    from app.services.platform_pilot_ops import list_ai_runs

    return list_ai_runs(
        db,
        organization_id=organization_id,
        status=status_filter,
        proposal_status=proposal_status,
        message_type=message_type,
        page=page,
        page_size=page_size,
    )


@router.get("/errors")
def platform_errors(
    db: Session = Depends(get_db),
    _auth: PlatformAuthContext = Depends(get_current_platform_auth),
    organization_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict:
    from app.services.platform_pilot_ops import list_sanitized_errors

    return list_sanitized_errors(db, organization_id=organization_id, limit=limit)


@router.post("/self-elevate", include_in_schema=False)
def refuse_self_elevate() -> None:
    """Explicitly refuse role elevation attempts if ever exposed."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "elevation_forbidden",
            "message": "Elevação de papel da plataforma não é permitida por esta API.",
        },
    )
