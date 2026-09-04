from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.renewal_case import (
    EndWithoutRenewalIn,
    MarkAwaitingClientIn,
    RenewalCaseView,
)
from app.services import agenda as agenda_svc
from app.services import renewal_case as renewal_case_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/renewal-cases", tags=["renewal-cases"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("", response_model=list[RenewalCaseView])
def list_renewal_cases(
    scope: str = Query(default="needs_decision", pattern="^(needs_decision|all)$"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[RenewalCaseView]:
    org = agenda_svc.get_organization(db, auth.organization.id)
    today = agenda_svc.org_local_today(org)
    return renewal_case_svc.list_renewal_cases(
        db, organization_id=auth.organization.id, today=today, scope=scope
    )


@router.post("/{cycle_id}/awaiting-client", response_model=RenewalCaseView)
def mark_awaiting_client(
    cycle_id: UUID,
    payload: MarkAwaitingClientIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RenewalCaseView:
    try:
        renewal_case_svc.mark_awaiting_client(
            db,
            organization_id=auth.organization.id,
            cycle_id=cycle_id,
            next_contact_date=payload.next_contact_date,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    org = agenda_svc.get_organization(db, auth.organization.id)
    today = agenda_svc.org_local_today(org)
    return _single_view(db, organization_id=auth.organization.id, cycle_id=cycle_id, today=today)


@router.post("/{cycle_id}/end-without-renewal", response_model=RenewalCaseView)
def end_without_renewal(
    cycle_id: UUID,
    payload: EndWithoutRenewalIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RenewalCaseView:
    try:
        renewal_case_svc.end_without_renewal(
            db,
            organization_id=auth.organization.id,
            cycle_id=cycle_id,
            resolution_reason=payload.resolution_reason,
            resolution_note=payload.resolution_note,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    org = agenda_svc.get_organization(db, auth.organization.id)
    today = agenda_svc.org_local_today(org)
    return _single_view(db, organization_id=auth.organization.id, cycle_id=cycle_id, today=today)


def _single_view(db: Session, *, organization_id: UUID, cycle_id: UUID, today) -> RenewalCaseView:
    views = renewal_case_svc.list_renewal_cases(
        db, organization_id=organization_id, today=today, scope="all"
    )
    for view in views:
        if view.source_cycle_id == cycle_id:
            return view
    raise HTTPException(
        status_code=404, detail={"code": "not_found", "message": "Ciclo não encontrado."}
    )
