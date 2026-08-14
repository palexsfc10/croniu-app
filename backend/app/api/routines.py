"""Authenticated recurring routine APIs."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.intake import (
    OccurrenceDecideIn,
    RoutineCreateIn,
    RoutineDefaultsIn,
    RoutineOut,
    RoutineUpdateIn,
)
from app.services import pendencies as pendency_svc
from app.services import routines as routine_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/routines", tags=["routines"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _out(row) -> RoutineOut:
    return RoutineOut(
        id=row.id,
        name=row.name,
        task_type=row.task_type,
        weekday=row.weekday,
        recurrence=row.recurrence,
        lead_days=row.lead_days,
        filter_json=row.filter_json,
        next_run_on=row.next_run_on,
        status=row.status,
        last_completed_at=row.last_completed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[RoutineOut])
def list_routines(
    status: str | None = Query(default="active"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[RoutineOut]:
    rows = routine_svc.list_routines(
        db, organization_id=auth.organization.id, status=status
    )
    return [_out(r) for r in rows]


@router.post("", response_model=RoutineOut, status_code=201)
def create_routine(
    payload: RoutineCreateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RoutineOut:
    try:
        row = routine_svc.create_routine(
            db,
            organization_id=auth.organization.id,
            name=payload.name,
            task_type=payload.task_type,
            recurrence=payload.recurrence,
            weekday=payload.weekday,
            lead_days=payload.lead_days,
            filter_json=payload.filter_json,
            next_run_on=payload.next_run_on,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _out(row)


@router.patch("/{task_id}", response_model=RoutineOut)
def update_routine(
    task_id: UUID,
    payload: RoutineUpdateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RoutineOut:
    try:
        row = routine_svc.update_routine(
            db,
            organization_id=auth.organization.id,
            task_id=task_id,
            **payload.model_dump(exclude_unset=True),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _out(row)


@router.post("/{task_id}/complete", response_model=RoutineOut)
def complete_routine(
    task_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RoutineOut:
    try:
        row = routine_svc.complete_routine(
            db, organization_id=auth.organization.id, task_id=task_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _out(row)


@router.get("/board")
def routines_board(
    bucket: str | None = Query(default=None),
    client_id: UUID | None = Query(default=None),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return pendency_svc.board(
            db,
            organization_id=auth.organization.id,
            bucket=bucket,
            client_id=client_id,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/defaults")
def get_routine_defaults(
    auth: AuthContext = Depends(get_current_auth),
) -> dict:
    return pendency_svc.routine_defaults(auth.organization)


@router.patch("/defaults")
def patch_routine_defaults(
    payload: RoutineDefaultsIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    org = auth.organization
    current = pendency_svc.routine_defaults(org)
    current.update({k: v for k, v in payload.model_dump(exclude_unset=True).items()})
    org.routine_defaults = current
    db.add(org)
    db.commit()
    db.refresh(org)
    return pendency_svc.routine_defaults(org)


@router.post("/occurrences/{occurrence_id}/decide")
def decide_occurrence(
    occurrence_id: UUID,
    payload: OccurrenceDecideIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    try:
        row = pendency_svc.decide(
            db,
            organization_id=auth.organization.id,
            occurrence_id=occurrence_id,
            status=payload.status,
            deferred_until=payload.deferred_until,
            reason=payload.reason,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return {"id": str(row.id), "status": row.status}
