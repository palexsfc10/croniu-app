from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.domain import ClientCreate, ClientOut, ClientUpdate
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
