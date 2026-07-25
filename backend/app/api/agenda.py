from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.agenda import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
    DayAgendaOut,
    LocationCreate,
    LocationOut,
    LocationUpdate,
    OrganizationPreferencesOut,
    OrganizationTimezoneUpdate,
)
from app.services import agenda as agenda_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["agenda"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("/organization/preferences", response_model=OrganizationPreferencesOut)
def get_preferences(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> OrganizationPreferencesOut:
    return agenda_svc.get_organization_preferences(db, organization_id=auth.organization.id)


@router.patch("/organization/preferences", response_model=OrganizationPreferencesOut)
def patch_preferences(
    payload: OrganizationTimezoneUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> OrganizationPreferencesOut:
    try:
        return agenda_svc.update_organization_timezone(
            db,
            organization_id=auth.organization.id,
            timezone=payload.timezone,
            role=auth.membership.role,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/locations", response_model=list[LocationOut])
def list_locations(
    status_filter: str | None = Query(default="active", alias="status"),
    q: str | None = Query(default=None, max_length=100),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[LocationOut]:
    rows = agenda_svc.list_locations(
        db,
        organization_id=auth.organization.id,
        status=status_filter or None,
        q=q,
    )
    return [agenda_svc.location_to_out(row) for row in rows]


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> LocationOut:
    try:
        row = agenda_svc.create_location(
            db,
            organization_id=auth.organization.id,
            name=payload.name,
            address=payload.address,
            address_detail=payload.address_detail,
            map_url=payload.map_url,
            meeting_url=payload.meeting_url,
            notes=payload.notes,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return agenda_svc.location_to_out(row)


@router.get("/locations/{location_id}", response_model=LocationOut)
def get_location(
    location_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> LocationOut:
    try:
        row = agenda_svc.get_location(
            db, organization_id=auth.organization.id, location_id=location_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return agenda_svc.location_to_out(row)


@router.patch("/locations/{location_id}", response_model=LocationOut)
def update_location(
    location_id: UUID,
    payload: LocationUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> LocationOut:
    try:
        row = agenda_svc.update_location(
            db,
            organization_id=auth.organization.id,
            location_id=location_id,
            fields=payload.model_dump(exclude_unset=True),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return agenda_svc.location_to_out(row)


@router.get("/agenda/day", response_model=DayAgendaOut)
def agenda_day(
    day: date | None = Query(default=None),
    include_cancelled: bool = Query(default=False),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> DayAgendaOut:
    org = agenda_svc.get_organization(db, auth.organization.id)
    today = agenda_svc.org_local_today(org)
    target = day or today
    if abs((target - today).days) > agenda_svc.MAX_AGENDA_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "date_range_limited",
                "message": f"Consulta limitada a ±{agenda_svc.MAX_AGENDA_RANGE_DAYS} dias.",
            },
        )
    return agenda_svc.list_day_agenda(
        db,
        organization_id=auth.organization.id,
        day=target,
        include_cancelled=include_cancelled,
    )


@router.post("/appointments", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AppointmentOut:
    try:
        row = agenda_svc.create_appointment(
            db,
            organization_id=auth.organization.id,
            client_id=payload.client_id,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            cycle_id=payload.cycle_id,
            service_id=payload.service_id,
            location_id=payload.location_id,
            title=payload.title,
            notes=payload.notes,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return agenda_svc.appointment_to_out(row)


@router.get("/appointments/{appointment_id}", response_model=AppointmentOut)
def get_appointment(
    appointment_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AppointmentOut:
    try:
        row = agenda_svc.get_appointment(
            db, organization_id=auth.organization.id, appointment_id=appointment_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return agenda_svc.appointment_to_out(row)


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: UUID,
    payload: AppointmentUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AppointmentOut:
    try:
        row = agenda_svc.update_appointment(
            db,
            organization_id=auth.organization.id,
            appointment_id=appointment_id,
            fields=payload.model_dump(exclude_unset=True),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return agenda_svc.appointment_to_out(row)
