from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.cycle_intelligence import (
    CyclePreviewIn,
    CyclePreviewOut,
    FinancialCycleUpdate,
    IntelligentCycleCreate,
    IntelligentCycleUpdate,
)
from app.schemas.domain import (
    ConfirmContactIn,
    CycleCreate,
    CycleOut,
    WhatsAppPrepOut,
)
from app.services import cycle_intelligence as intel_svc
from app.services import domain as domain_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/cycles", tags=["cycles"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("", response_model=list[CycleOut])
def list_cycles(
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: UUID | None = None,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[CycleOut]:
    return domain_svc.list_cycles(
        db,
        organization_id=auth.organization.id,
        status=status_filter,
        client_id=client_id,
    )


@router.post("/preview", response_model=CyclePreviewOut)
def preview_cycle(
    payload: CyclePreviewIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CyclePreviewOut:
    try:
        return intel_svc.build_preview(
            db, organization_id=auth.organization.id, payload=payload
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc


@router.post(
    "/intelligent",
    response_model=CycleOut,
    status_code=status.HTTP_201_CREATED,
)
def create_intelligent_cycle(
    payload: IntelligentCycleCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = intel_svc.create_intelligent_cycle(
            db, organization_id=auth.organization.id, payload=payload
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)


@router.post("", response_model=CycleOut, status_code=status.HTTP_201_CREATED)
def create_cycle(
    payload: CycleCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = domain_svc.create_cycle(
            db,
            organization_id=auth.organization.id,
            client_id=payload.client_id,
            service_id=payload.service_id,
            starts_on=payload.starts_on,
            ends_on=payload.ends_on,
            value_cents=payload.value_cents,
            notes=payload.notes,
            create_receivable=payload.create_receivable,
            receivable_due_on=payload.receivable_due_on,
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)


@router.patch("/{cycle_id}/intelligent", response_model=CycleOut)
def update_intelligent_cycle(
    cycle_id: UUID,
    payload: IntelligentCycleUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = intel_svc.update_intelligent_cycle(
            db,
            organization_id=auth.organization.id,
            cycle_id=cycle_id,
            payload=payload,
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)


@router.patch("/{cycle_id}/financial", response_model=CycleOut)
def update_cycle_financial(
    cycle_id: UUID,
    payload: FinancialCycleUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = intel_svc.update_cycle_financial(
            db,
            organization_id=auth.organization.id,
            cycle_id=cycle_id,
            payload=payload,
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)


@router.get("/{cycle_id}", response_model=CycleOut)
def get_cycle(
    cycle_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = domain_svc.get_cycle(db, organization_id=auth.organization.id, cycle_id=cycle_id)
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)


@router.post("/{cycle_id}/whatsapp-prep", response_model=WhatsAppPrepOut)
def whatsapp_prep(
    cycle_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> WhatsAppPrepOut:
    try:
        return domain_svc.prepare_whatsapp_renewal(
            db, organization_id=auth.organization.id, cycle_id=cycle_id
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc


@router.post("/{cycle_id}/confirm-contact", response_model=CycleOut)
def confirm_contact(
    cycle_id: UUID,
    payload: ConfirmContactIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        return domain_svc.confirm_cycle_contact(
            db,
            organization_id=auth.organization.id,
            cycle_id=cycle_id,
            note=payload.note,
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc


@router.post("/{cycle_id}/cancel", response_model=CycleOut)
def cancel_cycle(
    cycle_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = domain_svc.cancel_cycle(
            db, organization_id=auth.organization.id, cycle_id=cycle_id
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)


@router.delete("/{cycle_id}", response_model=CycleOut)
def delete_cycle(
    cycle_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    """Alias de cancelamento (exclusão lógica)."""
    try:
        cycle = domain_svc.cancel_cycle(
            db, organization_id=auth.organization.id, cycle_id=cycle_id
        )
    except AuthError as exc:
        db.rollback()
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(db, cycle)
