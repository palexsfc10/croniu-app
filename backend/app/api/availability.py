from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.availability import (
    AvailabilityDayOut,
    AvailabilityRangeOut,
    AvailabilitySettingsOut,
    AvailabilitySettingsUpdate,
    MAX_SLOT_DURATION_MINUTES,
    MIN_SLOT_DURATION_MINUTES,
)
from app.services import agenda as agenda_svc
from app.services import availability as availability_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["availability"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("/availability/settings", response_model=AvailabilitySettingsOut)
def get_availability_settings(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AvailabilitySettingsOut:
    return availability_svc.get_settings(db, organization_id=auth.organization.id)


@router.put("/availability/settings", response_model=AvailabilitySettingsOut)
def put_availability_settings(
    payload: AvailabilitySettingsUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AvailabilitySettingsOut:
    try:
        return availability_svc.update_settings(
            db,
            organization_id=auth.organization.id,
            role=auth.membership.role,
            payload=payload,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/availability/day", response_model=AvailabilityDayOut)
def get_availability_day(
    day: date = Query(...),
    duration_minutes: int | None = Query(
        default=None, ge=MIN_SLOT_DURATION_MINUTES, le=MAX_SLOT_DURATION_MINUTES
    ),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AvailabilityDayOut:
    org = agenda_svc.get_organization(db, auth.organization.id)
    today = agenda_svc.org_local_today(org)
    if abs((day - today).days) > agenda_svc.MAX_AGENDA_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "date_range_limited",
                "message": f"Consulta limitada a ±{agenda_svc.MAX_AGENDA_RANGE_DAYS} dias.",
            },
        )
    return availability_svc.compute_day(
        db,
        organization_id=auth.organization.id,
        day=day,
        duration_minutes=duration_minutes,
    )


@router.get("/availability/range", response_model=AvailabilityRangeOut)
def get_availability_range(
    start_date: date = Query(...),
    end_date: date = Query(...),
    duration_minutes: int | None = Query(
        default=None, ge=MIN_SLOT_DURATION_MINUTES, le=MAX_SLOT_DURATION_MINUTES
    ),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AvailabilityRangeOut:
    try:
        return availability_svc.compute_range(
            db,
            organization_id=auth.organization.id,
            start_date=start_date,
            end_date=end_date,
            duration_minutes=duration_minutes,
        )
    except AuthError as exc:
        raise _http(exc) from exc
