from __future__ import annotations

from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.domain import (
    ReceivableCreate,
    ReceivableMarkPaid,
    ReceivableOut,
)
from app.schemas.financial_overview import FinancialOverviewOut
from app.services import agenda as agenda_svc
from app.services import domain as domain_svc
from app.services import financial_overview as financial_overview_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/receivables", tags=["receivables"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


# Declared before "/{receivable_id}" so the literal path is matched first.
@router.get("/overview", response_model=FinancialOverviewOut)
def get_financial_overview(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> FinancialOverviewOut:
    tz_name = agenda_svc.get_org_timezone(auth.organization)
    today = agenda_svc.org_local_today(auth.organization)
    overview = financial_overview_svc.build_overview(
        db, organization_id=auth.organization.id, tz=ZoneInfo(tz_name), today=today
    )
    return FinancialOverviewOut(
        summary=overview.summary.__dict__,
        monthly_trend=[m.__dict__ for m in overview.monthly_trend],
    )


@router.get("", response_model=list[ReceivableOut])
def list_receivables(
    status_filter: str | None = Query(default=None, alias="status"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ReceivableOut]:
    return domain_svc.list_receivables(
        db, organization_id=auth.organization.id, status=status_filter
    )


@router.post("", response_model=ReceivableOut, status_code=status.HTTP_201_CREATED)
def create_receivable(
    payload: ReceivableCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ReceivableOut:
    try:
        return domain_svc.create_receivable(
            db,
            organization_id=auth.organization.id,
            cycle_id=payload.cycle_id,
            amount_cents=payload.amount_cents,
            due_on=payload.due_on,
            notes=payload.notes,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/{receivable_id}", response_model=ReceivableOut)
def get_receivable(
    receivable_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ReceivableOut:
    try:
        row = domain_svc.get_receivable(
            db, organization_id=auth.organization.id, receivable_id=receivable_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return domain_svc.receivable_to_out(row)


@router.post("/{receivable_id}/mark-paid", response_model=ReceivableOut)
def mark_paid(
    receivable_id: UUID,
    payload: ReceivableMarkPaid,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ReceivableOut:
    try:
        return domain_svc.mark_receivable_paid(
            db,
            organization_id=auth.organization.id,
            receivable_id=receivable_id,
            payment_method=payload.payment_method,
            notes=payload.notes,
        )
    except AuthError as exc:
        raise _http(exc) from exc
