"""Agenda domain: timezone, locations, appointments, conflicts."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.appointment import Appointment
from app.models.client import Client
from app.models.cycle import Cycle
from app.models.location import Location
from app.models.organization import Organization
from app.models.service import Service
from app.schemas.agenda import (
    DEFAULT_ORG_TIMEZONE,
    AppointmentConflictItem,
    AppointmentOut,
    DayAgendaOut,
    LocationOut,
    OrganizationPreferencesOut,
)
from app.services.auth import AuthError

MAX_AGENDA_RANGE_DAYS = 31


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise AuthError(
            "naive_datetime",
            "Instantes devem incluir fuso (UTC ou offset).",
            status_code=422,
        )
    return dt.astimezone(UTC)


def validate_timezone(tz_name: str) -> str:
    cleaned = tz_name.strip()
    if not cleaned:
        raise AuthError("invalid_timezone", "Informe um fuso IANA válido.", status_code=422)
    try:
        ZoneInfo(cleaned)
    except ZoneInfoNotFoundError as exc:
        raise AuthError(
            "invalid_timezone",
            "Fuso horário inválido. Use um identificador IANA (ex.: America/Sao_Paulo).",
            status_code=422,
        ) from exc
    return cleaned


def get_org_timezone(org: Organization) -> str:
    return org.timezone or DEFAULT_ORG_TIMEZONE


def org_local_today(org: Organization, *, now: datetime | None = None) -> date:
    tz = ZoneInfo(get_org_timezone(org))
    instant = now or datetime.now(UTC)
    return instant.astimezone(tz).date()


def day_bounds_utc(day: date, tz_name: str) -> tuple[datetime, datetime]:
    tz = ZoneInfo(tz_name)
    start_local = datetime.combine(day, time.min, tzinfo=tz)
    end_local = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _validate_http_url(value: str | None, *, field: str) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise AuthError("invalid_url", f"URL inválida em {field}.", status_code=422)
    return cleaned


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def get_organization(db: Session, organization_id: uuid.UUID) -> Organization:
    org = db.get(Organization, organization_id)
    if org is None:
        raise AuthError("organization_not_found", "Organização não encontrada.", status_code=404)
    return org


def get_organization_preferences(
    db: Session, *, organization_id: uuid.UUID
) -> OrganizationPreferencesOut:
    org = get_organization(db, organization_id)
    return OrganizationPreferencesOut(
        id=org.id,
        name=org.name,
        timezone=get_org_timezone(org),
        local_today=org_local_today(org),
    )


def update_organization_timezone(
    db: Session,
    *,
    organization_id: uuid.UUID,
    timezone: str,
    role: str,
) -> OrganizationPreferencesOut:
    if role not in {"owner", "admin"}:
        raise AuthError(
            "forbidden",
            "Apenas administradores da organização podem alterar o fuso.",
            status_code=403,
        )
    org = get_organization(db, organization_id)
    org.timezone = validate_timezone(timezone)
    db.add(org)
    db.commit()
    db.refresh(org)
    return get_organization_preferences(db, organization_id=org.id)


def list_locations(
    db: Session,
    *,
    organization_id: uuid.UUID,
    status: str | None = "active",
    q: str | None = None,
) -> list[Location]:
    query = select(Location).where(Location.organization_id == organization_id)
    if status:
        query = query.where(Location.status == status)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(
            or_(
                Location.name.ilike(term),
                Location.address.ilike(term),
                Location.address_detail.ilike(term),
            )
        )
    return list(db.scalars(query.order_by(Location.name.asc())).all())


def get_location(
    db: Session, *, organization_id: uuid.UUID, location_id: uuid.UUID
) -> Location:
    row = db.scalar(
        select(Location).where(
            Location.id == location_id,
            Location.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("location_not_found", "Local não encontrado.", status_code=404)
    return row


def create_location(
    db: Session,
    *,
    organization_id: uuid.UUID,
    name: str,
    address: str | None,
    address_detail: str | None,
    map_url: str | None,
    meeting_url: str | None,
    notes: str | None,
) -> Location:
    row = Location(
        organization_id=organization_id,
        name=name.strip(),
        address=_normalize_optional(address),
        address_detail=_normalize_optional(address_detail),
        map_url=_validate_http_url(map_url, field="map_url"),
        meeting_url=_validate_http_url(meeting_url, field="meeting_url"),
        notes=_normalize_optional(notes),
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_location(
    db: Session,
    *,
    organization_id: uuid.UUID,
    location_id: uuid.UUID,
    fields: dict,
) -> Location:
    row = get_location(db, organization_id=organization_id, location_id=location_id)
    if "name" in fields and fields["name"] is not None:
        row.name = str(fields["name"]).strip()
    for key in ("address", "address_detail", "notes"):
        if key in fields:
            setattr(row, key, _normalize_optional(fields[key]))
    if "map_url" in fields:
        row.map_url = _validate_http_url(fields["map_url"], field="map_url")
    if "meeting_url" in fields:
        row.meeting_url = _validate_http_url(fields["meeting_url"], field="meeting_url")
    if "status" in fields and fields["status"] is not None:
        status = fields["status"]
        if status == "archived" and row.status != "archived":
            row.status = "archived"
            row.archived_at = datetime.now(UTC)
        elif status == "active":
            row.status = "active"
            row.archived_at = None
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def location_to_out(row: Location) -> LocationOut:
    return LocationOut.model_validate(row)


def _appointment_out(row: Appointment) -> AppointmentOut:
    client_name = row.client.full_name if row.client is not None else None
    service_name = row.service.name if row.service is not None else None
    location_name = row.location.name if row.location is not None else None
    cycle_service = None
    if row.cycle is not None and row.cycle.service is not None:
        cycle_service = row.cycle.service.name
    return AppointmentOut(
        id=row.id,
        client_id=row.client_id,
        cycle_id=row.cycle_id,
        service_id=row.service_id,
        location_id=row.location_id,
        title=row.title,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        status=row.status,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
        client_name=client_name,
        service_name=service_name,
        location_name=location_name,
        cycle_service_name=cycle_service,
    )


def _load_appointment(
    db: Session, *, organization_id: uuid.UUID, appointment_id: uuid.UUID
) -> Appointment:
    row = db.scalar(
        select(Appointment)
        .where(
            Appointment.id == appointment_id,
            Appointment.organization_id == organization_id,
        )
        .options(
            selectinload(Appointment.client),
            selectinload(Appointment.service),
            selectinload(Appointment.location),
            selectinload(Appointment.cycle).selectinload(Cycle.service),
        )
    )
    if row is None:
        raise AuthError("appointment_not_found", "Compromisso não encontrado.", status_code=404)
    return row


def get_appointment(
    db: Session, *, organization_id: uuid.UUID, appointment_id: uuid.UUID
) -> Appointment:
    return _load_appointment(db, organization_id=organization_id, appointment_id=appointment_id)


def _validate_relations(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    cycle_id: uuid.UUID | None,
    service_id: uuid.UUID | None,
    location_id: uuid.UUID | None,
) -> None:
    client = db.scalar(
        select(Client).where(Client.id == client_id, Client.organization_id == organization_id)
    )
    if client is None:
        raise AuthError(
            "client_not_found", "Cliente inválido para esta organização.", status_code=400
        )

    if cycle_id is not None:
        cycle = db.scalar(
            select(Cycle).where(Cycle.id == cycle_id, Cycle.organization_id == organization_id)
        )
        if cycle is None:
            raise AuthError(
                "cycle_not_found", "Ciclo inválido para esta organização.", status_code=400
            )
        if cycle.client_id != client_id:
            raise AuthError(
                "cycle_client_mismatch",
                "O ciclo informado não pertence a este cliente.",
                status_code=400,
            )

    if service_id is not None:
        service = db.scalar(
            select(Service).where(
                Service.id == service_id, Service.organization_id == organization_id
            )
        )
        if service is None:
            raise AuthError(
                "service_not_found", "Serviço inválido para esta organização.", status_code=400
            )

    if location_id is not None:
        location = db.scalar(
            select(Location).where(
                Location.id == location_id, Location.organization_id == organization_id
            )
        )
        if location is None:
            raise AuthError(
                "location_not_found", "Local inválido para esta organização.", status_code=400
            )


def find_conflicts(
    db: Session,
    *,
    organization_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    exclude_appointment_id: uuid.UUID | None = None,
) -> list[Appointment]:
    starts_at = _ensure_aware(starts_at)
    ends_at = _ensure_aware(ends_at)
    query = (
        select(Appointment)
        .where(
            Appointment.organization_id == organization_id,
            Appointment.status != "cancelled",
            Appointment.starts_at < ends_at,
            Appointment.ends_at > starts_at,
        )
        .options(selectinload(Appointment.client))
        .order_by(Appointment.starts_at.asc())
    )
    if exclude_appointment_id is not None:
        query = query.where(Appointment.id != exclude_appointment_id)
    return list(db.scalars(query).all())


def _raise_conflict(conflicts: list[Appointment]) -> None:
    items = [
        AppointmentConflictItem(
            id=row.id,
            client_name=row.client.full_name if row.client else None,
            starts_at=row.starts_at,
            ends_at=row.ends_at,
            status=row.status,
        )
        for row in conflicts
    ]
    raise AuthError(
        "appointment_conflict",
        "Há sobreposição com outro compromisso ativo.",
        status_code=409,
        details={"conflicts": [item.model_dump(mode="json") for item in items]},
    )


def create_appointment(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    cycle_id: uuid.UUID | None = None,
    service_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    title: str | None = None,
    notes: str | None = None,
) -> Appointment:
    starts_at = _ensure_aware(starts_at)
    ends_at = _ensure_aware(ends_at)
    if ends_at <= starts_at:
        raise AuthError("invalid_interval", "O fim deve ser posterior ao início.", status_code=422)

    _validate_relations(
        db,
        organization_id=organization_id,
        client_id=client_id,
        cycle_id=cycle_id,
        service_id=service_id,
        location_id=location_id,
    )
    conflicts = find_conflicts(
        db, organization_id=organization_id, starts_at=starts_at, ends_at=ends_at
    )
    if conflicts:
        _raise_conflict(conflicts)

    row = Appointment(
        organization_id=organization_id,
        client_id=client_id,
        cycle_id=cycle_id,
        service_id=service_id,
        location_id=location_id,
        title=_normalize_optional(title),
        starts_at=starts_at,
        ends_at=ends_at,
        notes=_normalize_optional(notes),
        status="scheduled",
    )
    db.add(row)
    db.commit()
    return _load_appointment(db, organization_id=organization_id, appointment_id=row.id)


def update_appointment(
    db: Session,
    *,
    organization_id: uuid.UUID,
    appointment_id: uuid.UUID,
    fields: dict,
) -> Appointment:
    row = _load_appointment(db, organization_id=organization_id, appointment_id=appointment_id)

    client_id = fields.get("client_id", row.client_id)
    cycle_id = fields["cycle_id"] if "cycle_id" in fields else row.cycle_id
    service_id = fields["service_id"] if "service_id" in fields else row.service_id
    location_id = fields["location_id"] if "location_id" in fields else row.location_id
    starts_at = _ensure_aware(fields["starts_at"]) if "starts_at" in fields else row.starts_at
    ends_at = _ensure_aware(fields["ends_at"]) if "ends_at" in fields else row.ends_at

    if ends_at <= starts_at:
        raise AuthError("invalid_interval", "O fim deve ser posterior ao início.", status_code=422)

    _validate_relations(
        db,
        organization_id=organization_id,
        client_id=client_id,
        cycle_id=cycle_id,
        service_id=service_id,
        location_id=location_id,
    )

    new_status = fields.get("status", row.status)
    if new_status != "cancelled":
        conflicts = find_conflicts(
            db,
            organization_id=organization_id,
            starts_at=starts_at,
            ends_at=ends_at,
            exclude_appointment_id=row.id,
        )
        if conflicts:
            _raise_conflict(conflicts)

    row.client_id = client_id
    row.cycle_id = cycle_id
    row.service_id = service_id
    row.location_id = location_id
    row.starts_at = starts_at
    row.ends_at = ends_at
    if "title" in fields:
        row.title = _normalize_optional(fields["title"])
    if "notes" in fields:
        row.notes = _normalize_optional(fields["notes"])
    if "status" in fields and fields["status"] is not None:
        row.status = fields["status"]

    db.add(row)
    db.commit()
    return _load_appointment(db, organization_id=organization_id, appointment_id=row.id)


def list_day_agenda(
    db: Session,
    *,
    organization_id: uuid.UUID,
    day: date | None = None,
    include_cancelled: bool = False,
) -> DayAgendaOut:
    org = get_organization(db, organization_id)
    tz_name = get_org_timezone(org)
    target = day or org_local_today(org)
    start_utc, end_utc = day_bounds_utc(target, tz_name)

    query = (
        select(Appointment)
        .where(
            Appointment.organization_id == organization_id,
            Appointment.starts_at >= start_utc,
            Appointment.starts_at < end_utc,
        )
        .options(
            selectinload(Appointment.client),
            selectinload(Appointment.service),
            selectinload(Appointment.location),
            selectinload(Appointment.cycle).selectinload(Cycle.service),
        )
        .order_by(Appointment.starts_at.asc())
    )
    rows = list(db.scalars(query).all())
    if not include_cancelled:
        active = [row for row in rows if row.status != "cancelled"]
    else:
        active = rows

    conflict_count = 0
    for row in active:
        if row.status == "cancelled":
            continue
        others = find_conflicts(
            db,
            organization_id=organization_id,
            starts_at=row.starts_at,
            ends_at=row.ends_at,
            exclude_appointment_id=row.id,
        )
        if others:
            conflict_count += 1

    return DayAgendaOut(
        date=target,
        timezone=tz_name,
        appointments=[_appointment_out(row) for row in active],
        conflict_count=conflict_count,
    )


def appointment_to_out(row: Appointment) -> AppointmentOut:
    return _appointment_out(row)


def list_today_appointments(
    db: Session, *, organization_id: uuid.UUID
) -> list[AppointmentOut]:
    agenda = list_day_agenda(db, organization_id=organization_id, include_cancelled=False)
    return [item for item in agenda.appointments if item.status == "scheduled"]


def next_upcoming_appointment(
    db: Session, *, organization_id: uuid.UUID, now: datetime | None = None
) -> Appointment | None:
    instant = now or datetime.now(UTC)
    return db.scalar(
        select(Appointment)
        .where(
            Appointment.organization_id == organization_id,
            Appointment.status == "scheduled",
            Appointment.ends_at > instant,
        )
        .options(
            selectinload(Appointment.client),
            selectinload(Appointment.service),
            selectinload(Appointment.location),
            selectinload(Appointment.cycle).selectinload(Cycle.service),
        )
        .order_by(Appointment.starts_at.asc())
        .limit(1)
    )


def count_appointments(db: Session, *, organization_id: uuid.UUID | None = None) -> int:
    from sqlalchemy import func

    query = select(func.count()).select_from(Appointment).where(Appointment.status != "cancelled")
    if organization_id is not None:
        query = query.where(Appointment.organization_id == organization_id)
    return int(db.scalar(query) or 0)
