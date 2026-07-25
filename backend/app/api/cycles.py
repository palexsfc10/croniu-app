from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.domain import (
    ConfirmContactIn,
    CycleCreate,
    CycleOut,
    WhatsAppPrepOut,
)
from app.services import domain as domain_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/cycles", tags=["cycles"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


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
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(cycle)


@router.get("/{cycle_id}", response_model=CycleOut)
def get_cycle(
    cycle_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> CycleOut:
    try:
        cycle = domain_svc.get_cycle(db, organization_id=auth.organization.id, cycle_id=cycle_id)
    except AuthError as exc:
        raise _http(exc) from exc
    return domain_svc.cycle_to_out(cycle)


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
        raise _http(exc) from exc
