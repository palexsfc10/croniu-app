from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.agenda import AppointmentOut
from app.schemas.domain import ClientCreate, ClientOut, ClientUpdate, ReceivableOut
from app.services import agenda as agenda_svc
from app.services import domain as domain_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/clients", tags=["clients"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("", response_model=list[ClientOut])
def list_clients(
    status_filter: str | None = Query(default="active", alias="status"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ClientOut]:
    rows = domain_svc.list_clients(
        db, organization_id=auth.organization.id, status=status_filter or None
    )
    return [ClientOut.model_validate(row) for row in rows]


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientOut:
    try:
        row = domain_svc.create_client(
            db,
            organization_id=auth.organization.id,
            full_name=payload.full_name,
            phone=payload.phone,
            email=str(payload.email) if payload.email else None,
            notes=payload.notes,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ClientOut.model_validate(row)


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientOut:
    try:
        row = domain_svc.get_client(db, organization_id=auth.organization.id, client_id=client_id)
    except AuthError as exc:
        raise _http(exc) from exc
    return ClientOut.model_validate(row)


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientOut:
    try:
        data = payload.model_dump(exclude_unset=True)
        if "email" in data and data["email"] is not None:
            data["email"] = str(data["email"])
        row = domain_svc.update_client(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            **data,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ClientOut.model_validate(row)


@router.get("/{client_id}/appointments", response_model=list[AppointmentOut])
def list_client_appointments(
    client_id: UUID,
    limit: int = Query(default=10, ge=1, le=50),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[AppointmentOut]:
    """Upcoming visible appointments for one client — powers the Cliente
    360° Agenda tab."""
    try:
        rows = agenda_svc.list_client_appointments(
            db, organization_id=auth.organization.id, client_id=client_id, limit=limit
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return [agenda_svc.appointment_to_out(row) for row in rows]


@router.get("/{client_id}/receivables", response_model=list[ReceivableOut])
def list_client_receivables(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ReceivableOut]:
    """A client's receivables — powers the Cliente 360° Financeiro tab.
    Exposes `list_receivables_for_client`, which already existed for the AI
    agent's tools but had no REST route."""
    try:
        domain_svc.get_client(db, organization_id=auth.organization.id, client_id=client_id)
    except AuthError as exc:
        raise _http(exc) from exc
    return domain_svc.list_receivables_for_client(
        db, organization_id=auth.organization.id, client_id=client_id
    )
