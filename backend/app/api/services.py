from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.domain import ServiceCreate, ServiceOut, ServiceUpdate
from app.services import domain as domain_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/services", tags=["services"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("", response_model=list[ServiceOut])
def list_services(
    status_filter: str | None = Query(default="active", alias="status"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ServiceOut]:
    rows = domain_svc.list_services(
        db, organization_id=auth.organization.id, status=status_filter or None
    )
    return [ServiceOut.model_validate(row) for row in rows]


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ServiceOut:
    try:
        row = domain_svc.create_service(
            db,
            organization_id=auth.organization.id,
            name=payload.name,
            description=payload.description,
            default_duration_days=payload.default_duration_days,
            default_duration_minutes=payload.default_duration_minutes,
            default_price_cents=payload.default_price_cents,
            pricing_mode=payload.pricing_mode,
            fixed_price_cents=payload.fixed_price_cents,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ServiceOut.model_validate(row)


@router.get("/{service_id}", response_model=ServiceOut)
def get_service(
    service_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ServiceOut:
    try:
        row = domain_svc.get_service(
            db, organization_id=auth.organization.id, service_id=service_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ServiceOut.model_validate(row)


@router.patch("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: UUID,
    payload: ServiceUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ServiceOut:
    try:
        row = domain_svc.update_service(
            db,
            organization_id=auth.organization.id,
            service_id=service_id,
            **payload.model_dump(exclude_unset=True),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ServiceOut.model_validate(row)
