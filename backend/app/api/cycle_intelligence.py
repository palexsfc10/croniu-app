from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.cycle_intelligence import (
    CycleTemplateCreate,
    CycleTemplateOut,
    CycleTemplateUpdate,
)
from app.services import cycle_intelligence as intel_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["cycle-templates"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("/cycle-templates", response_model=list[CycleTemplateOut])
def list_templates(
    status_filter: str | None = Query(default="active", alias="status"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[CycleTemplateOut]:
    rows = intel_svc.list_templates(
        db, organization_id=auth.organization.id, status=status_filter or None
    )
    return [intel_svc.template_to_out(row) for row in rows]


@router.post(
    "/cycle-templates",
    response_model=CycleTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_template(
    payload: CycleTemplateCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleTemplateOut:
    try:
        row = intel_svc.create_template(
            db,
            organization_id=auth.organization.id,
            name=payload.name,
            weekly_frequency=payload.weekly_frequency,
            duration_type=payload.duration_type,
            duration_value=payload.duration_value,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return intel_svc.template_to_out(row)


@router.get("/cycle-templates/{template_id}", response_model=CycleTemplateOut)
def get_template(
    template_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleTemplateOut:
    try:
        row = intel_svc.get_template(
            db, organization_id=auth.organization.id, template_id=template_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return intel_svc.template_to_out(row)


@router.patch("/cycle-templates/{template_id}", response_model=CycleTemplateOut)
def update_template(
    template_id: UUID,
    payload: CycleTemplateUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleTemplateOut:
    try:
        row = intel_svc.update_template(
            db,
            organization_id=auth.organization.id,
            template_id=template_id,
            **payload.model_dump(exclude_unset=True),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return intel_svc.template_to_out(row)
