"""Agenda domain: timezone, locations, appointments, conflicts."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.appointment import APPOINTMENT_NO_OVERLAP_CONSTRAINT, Appointment
from app.models.client import Client
from app.models.cycle import Cycle
from app.models.location import Location
from app.models.organization import Organization
from app.models.service import Service
from app.schemas.agenda import (
    DEFAULT_ORG_TIMEZONE,
    AgendaRangeOut,
    AppointmentConflictItem,
    AppointmentOut,
    DayAgendaOut,
    LocationOut,
    OrganizationPreferencesOut,
)
from app.services.auth import AuthError

AGENDA_VISIBLE_STATUSES = ("scheduled", "completed", "no_show")
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
    exclude_cycle_id: uuid.UUID | None = None,
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
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        query = query.with_for_update()
    if exclude_appointment_id is not None:
        query = query.where(Appointment.id != exclude_appointment_id)
    if exclude_cycle_id is not None:
        # Keep NULL cycle_id rows (standalone appointments); drop only the excluded cycle.
        query = query.where(
            (Appointment.cycle_id.is_(None)) | (Appointment.cycle_id != exclude_cycle_id)
        )
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


def _is_overlap_violation(exc: IntegrityError) -> bool:
    """True only for a genuine `ck_appointments_no_overlap` exclusion-constraint
    hit (Postgres SQLSTATE 23P01) — never for any other exclusion/check
    constraint that happens to share that generic "exclusion_violation" code,
    present or future. `orig`/`orig.diag` are read defensively via getattr:
    depending on the driver/exception, either may not exist."""
    orig = getattr(exc, "orig", None)
    diag = getattr(orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    return (
        getattr(orig, "sqlstate", None) == "23P01"
        and constraint_name == APPOINTMENT_NO_OVERLAP_CONSTRAINT
    )


def _handle_overlap_integrity_error(
    db: Session,
    exc: IntegrityError,
    *,
    organization_id: uuid.UUID | None,
    starts_at: datetime | None,
    ends_at: datetime | None,
    exclude_appointment_id: uuid.UUID | None,
) -> None:
    """Must be called only from within an active `except IntegrityError:`
    handler for `exc` — relies on a bare `raise` to re-raise the original
    exception with its traceback intact when it isn't a
    `ck_appointments_no_overlap` violation. Python's exception-handling
    context is tracked per-thread, not lexically, so this works correctly
    even though the `raise` sits inside a separate function from the
    `except` block that called it, as long as that block is still on the
    call stack.

    Always rolls back before classifying. Only `_is_overlap_violation`
    cases are ever translated into a 409 `appointment_conflict`. When the
    caller's own slot is known, the conflicting row(s) are reloaded and
    reported the same way a normal pre-insert conflict is
    (`AppointmentConflictItem` list) — safe because the failed transaction
    was already rolled back, so this is a fresh read. When it isn't (e.g. a
    bulk cycle-generation write spanning many slots at once), a plain 409
    with no `details` is raised instead of guessing which slot lost.

    Shared by `_flush_or_commit_and_raise_conflict` (the `flush_or_raise_
    conflict`/`commit_or_raise_conflict` point-protection helpers) and
    `appointment_overlap_guard` (the transactional-boundary context
    manager) so the classification logic never diverges between the two.
    """
    db.rollback()
    if not _is_overlap_violation(exc):
        raise
    if organization_id is not None and starts_at is not None and ends_at is not None:
        conflicts = find_conflicts(
            db,
            organization_id=organization_id,
            starts_at=starts_at,
            ends_at=ends_at,
            exclude_appointment_id=exclude_appointment_id,
        )
        if conflicts:
            _raise_conflict(conflicts)
    raise AuthError(
        "appointment_conflict",
        "Este horário acabou de ser ocupado por outra reserva. Atualize e tente novamente.",
        status_code=409,
    ) from exc


def _flush_or_commit_and_raise_conflict(
    db: Session,
    action: Callable[[], None],
    *,
    organization_id: uuid.UUID | None,
    starts_at: datetime | None,
    ends_at: datetime | None,
    exclude_appointment_id: uuid.UUID | None,
) -> None:
    """Run `action` (either `db.flush` or `db.commit`), translating a
    database-level `ck_appointments_no_overlap` exclusion violation
    (Postgres 23P01) into the same 409 `appointment_conflict` shape as
    `_raise_conflict` above. Shared by `flush_or_raise_conflict` and
    `commit_or_raise_conflict` so the classification logic never diverges
    between the two.

    This is the backstop for the race the app-level pre-check can never
    fully close on its own: `find_conflicts` runs a SELECT before any
    INSERT, but two concurrent requests can both pass that check for the
    same free slot (nothing exists yet to lock) and both attempt to
    write — only one can win once the database constraint exists, and the
    loser lands here instead of raising a raw `IntegrityError` (never a
    bare 500). Every write path that creates or reschedules an Appointment
    flushes/commits through these helpers rather than calling
    `db.flush()`/`db.commit()` directly.

    This point-protects a single flush/commit call. For an operation that
    materializes many Appointment rows across several auxiliary service
    calls — where a conflict can just as easily surface through an
    explicit `db.flush()`/`db.commit()` buried several calls deep in the
    stack (e.g. inside an auxiliary service the caller invokes), not only
    at a call site you remembered to wrap — use `appointment_overlap_guard`
    instead: it covers the entire unit of work, not one call. (This
    session factory sets `autoflush=False` — see `app/db.py` — so an
    ordinary read query never flushes pending writes on its own here; the
    risk is specifically an explicit flush/commit somewhere in the call
    tree, not implicit autoflush ahead of a query.)
    """
    try:
        action()
    except IntegrityError as exc:
        _handle_overlap_integrity_error(
            db,
            exc,
            organization_id=organization_id,
            starts_at=starts_at,
            ends_at=ends_at,
            exclude_appointment_id=exclude_appointment_id,
        )


@contextmanager
def appointment_overlap_guard(
    db: Session,
    *,
    organization_id: uuid.UUID | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    exclude_appointment_id: uuid.UUID | None = None,
) -> Iterator[None]:
    """Transactional boundary for `ck_appointments_no_overlap`: wrap every
    mutation of an operation that materializes Appointment rows, from the
    first `db.add()`/attribute change through its final `db.commit()`, in a
    single `with appointment_overlap_guard(db, ...):` block.

    Protecting individual `flush()`/`commit()` call sites (see
    `flush_or_raise_conflict`/`commit_or_raise_conflict` above) is the
    wrong granularity for an operation with several intermediate steps:
    Postgres validates the exclusion constraint immediately on every
    INSERT/UPDATE, and an explicit `db.flush()`/`db.commit()` buried
    several calls deep in an auxiliary service — with no flush of its own
    visible at the call site that invokes it — flushes this same pending
    unit of work just as much as one written directly here (e.g.
    `create_intelligent_cycle` calling `renewal_case_svc.mark_renewed`,
    which queries `Cycle` and then flushes explicitly on its own, line
    335 of `renewal_case.py`). This session factory sets `autoflush=False`
    (see `app/db.py`), so an ordinary read query never triggers this on
    its own here — the risk is specifically an explicit flush/commit
    anywhere in the call tree, present or added later, not implicit
    autoflush ahead of a query. Wrapping only the call site you happened
    to notice leaves every other explicit flush/commit in the same scope
    unprotected.

    This context manager is the actual boundary instead: it catches an
    `IntegrityError` raised *anywhere* within its `with` block, no matter
    how deep in the call stack the flush/commit that triggered it
    originated (a nested service call, or the final commit), and reuses
    the exact same classifier as the point-protection helpers via
    `_handle_overlap_integrity_error` — same rollback-before-classification
    order, same `_is_overlap_violation` check, same bare-`raise` traceback
    preservation for anything else."""
    try:
        yield
    except IntegrityError as exc:
        _handle_overlap_integrity_error(
            db,
            exc,
            organization_id=organization_id,
            starts_at=starts_at,
            ends_at=ends_at,
            exclude_appointment_id=exclude_appointment_id,
        )


def flush_or_raise_conflict(
    db: Session,
    *,
    organization_id: uuid.UUID | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    exclude_appointment_id: uuid.UUID | None = None,
) -> None:
    """`db.flush()` variant of `commit_or_raise_conflict` — see there for the
    full rationale. Postgres validates an exclusion constraint immediately on
    each INSERT/UPDATE, not only at COMMIT, so any write path that flushes
    Appointment changes before its own final commit needs this same
    translation at the flush site too — otherwise a concurrent-booking loss
    surfaces as a raw `IntegrityError`/500 before ever reaching the commit
    handler."""
    _flush_or_commit_and_raise_conflict(
        db,
        db.flush,
        organization_id=organization_id,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_appointment_id=exclude_appointment_id,
    )


def commit_or_raise_conflict(
    db: Session,
    *,
    organization_id: uuid.UUID | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    exclude_appointment_id: uuid.UUID | None = None,
) -> None:
    """`db.commit()` variant — see `_flush_or_commit_and_raise_conflict` for
    the full rationale. Every write path that creates or reschedules an
    Appointment (`create_appointment`, `update_appointment`, cycle/agenda
    generation in `cycle_intelligence.py` and `cycle_schedule.py`) commits
    through this function rather than calling `db.commit()` directly."""
    _flush_or_commit_and_raise_conflict(
        db,
        db.commit,
        organization_id=organization_id,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_appointment_id=exclude_appointment_id,
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
    commit_or_raise_conflict(
        db, organization_id=organization_id, starts_at=starts_at, ends_at=ends_at
    )
    return _load_appointment(db, organization_id=organization_id, appointment_id=row.id)


def _active_cycle_for_appointment(db: Session, row: Appointment) -> Cycle | None:
    """Vincula aula avulsa ao ciclo ativo do cliente na data do compromisso, se houver um."""
    org = get_organization(db, row.organization_id)
    tz_name = get_org_timezone(org)
    local_day = row.starts_at.astimezone(ZoneInfo(tz_name)).date()
    matches = list(
        db.scalars(
            select(Cycle).where(
                Cycle.organization_id == row.organization_id,
                Cycle.client_id == row.client_id,
                Cycle.status == "active",
                Cycle.starts_on <= local_day,
                Cycle.ends_on > local_day,
            )
        ).all()
    )
    if len(matches) == 1:
        return matches[0]
    return None


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

    # Explicit, protected checkpoint for this row's pending starts_at/
    # ends_at change, ahead of the protected commit below. (This session
    # factory sets autoflush=False — see app/db.py — so
    # _active_cycle_for_appointment's query just below does not flush this
    # row on its own; the final commit_or_raise_conflict call is what
    # actually enforces ck_appointments_no_overlap here. This early flush
    # is redundant defense-in-depth, not a gap-closer.)
    db.add(row)
    flush_or_raise_conflict(
        db,
        organization_id=organization_id,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_appointment_id=row.id,
    )

    # Realizado / falta encerra a aula e consome 1 do saldo do ciclo do cliente.
    if row.status in {"completed", "no_show"}:
        if row.cycle_id is None:
            linked = _active_cycle_for_appointment(db, row)
            if linked is not None:
                row.cycle_id = linked.id

    db.add(row)
    commit_or_raise_conflict(
        db,
        organization_id=organization_id,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_appointment_id=row.id,
    )
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
    from app.services import routine_occurrences as occ_svc

    occ_svc.persist_for_day(db, organization_id=organization_id, day=target)
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


def list_range_agenda(
    db: Session,
    *,
    organization_id: uuid.UUID,
    start_date: date,
    end_date: date,
    include_cancelled: bool = False,
) -> AgendaRangeOut:
    """Powers the desktop Week view — one `list_day_agenda` call per day in
    the range, so the exact same conflict/cancelled/routine-materialization
    logic already proven for `/agenda/day` applies to every day, with no
    separate implementation to keep in sync."""
    if end_date < start_date:
        raise AuthError("invalid_range", "A data final deve ser igual ou posterior à inicial.", 422)
    span_days = (end_date - start_date).days + 1
    if span_days > MAX_AGENDA_RANGE_DAYS:
        raise AuthError(
            "date_range_limited", f"Consulta limitada a {MAX_AGENDA_RANGE_DAYS} dias.", 400
        )
    org = get_organization(db, organization_id)
    tz_name = get_org_timezone(org)
    days_out: list[DayAgendaOut] = []
    for offset in range(span_days):
        day = start_date + timedelta(days=offset)
        days_out.append(
            list_day_agenda(
                db,
                organization_id=organization_id,
                day=day,
                include_cancelled=include_cancelled,
            )
        )
    return AgendaRangeOut(timezone=tz_name, days=days_out)


def appointment_to_out(row: Appointment) -> AppointmentOut:
    return _appointment_out(row)


def list_today_appointments(
    db: Session, *, organization_id: uuid.UUID
) -> list[AppointmentOut]:
    agenda = list_day_agenda(db, organization_id=organization_id, include_cancelled=False)
    return [item for item in agenda.appointments if item.status == "scheduled"]


def list_upcoming_appointments(
    db: Session,
    *,
    organization_id: uuid.UUID,
    within_days: int = 3,
    limit: int = 20,
) -> list[AppointmentOut]:
    """Scheduled appointments from now through the end of the local day horizon."""
    org = get_organization(db, organization_id)
    tz_name = get_org_timezone(org)
    today = org_local_today(org)
    now = datetime.now(UTC)
    horizon_day = today + timedelta(days=max(0, within_days))
    _start_utc, end_utc = day_bounds_utc(horizon_day, tz_name)
    rows = list(
        db.scalars(
            select(Appointment)
            .where(
                Appointment.organization_id == organization_id,
                Appointment.status == "scheduled",
                Appointment.starts_at >= now,
                Appointment.starts_at < end_utc,
            )
            .options(
                selectinload(Appointment.client),
                selectinload(Appointment.service),
                selectinload(Appointment.location),
                selectinload(Appointment.cycle).selectinload(Cycle.service),
            )
            .order_by(Appointment.starts_at.asc())
            .limit(limit)
        ).all()
    )
    return [_appointment_out(row) for row in rows]


def next_visible_appointment_after(
    db: Session,
    *,
    organization_id: uuid.UUID,
    after_day: date,
) -> Appointment | None:
    org = get_organization(db, organization_id)
    tz_name = get_org_timezone(org)
    _start, end_utc = day_bounds_utc(after_day, tz_name)
    return db.scalar(
        select(Appointment)
        .where(
            Appointment.organization_id == organization_id,
            Appointment.status.in_(AGENDA_VISIBLE_STATUSES),
            Appointment.starts_at >= end_utc,
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


def list_client_appointments(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    after: datetime | None = None,
    limit: int = 10,
) -> list[Appointment]:
    """A single client's upcoming visible appointments, soonest first.

    Powers the Cliente 360° Agenda tab — unlike `list_upcoming_appointments`,
    this has no `within_days` horizon: a client's next session may be weeks
    out, and it is still real, already-scheduled data worth showing.
    """
    from app.services import domain as domain_svc

    domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)
    cutoff = after or datetime.now(UTC)
    return list(
        db.scalars(
            select(Appointment)
            .where(
                Appointment.organization_id == organization_id,
                Appointment.client_id == client_id,
                Appointment.status.in_(AGENDA_VISIBLE_STATUSES),
                Appointment.starts_at >= cutoff,
            )
            .options(
                selectinload(Appointment.client),
                selectinload(Appointment.service),
                selectinload(Appointment.location),
                selectinload(Appointment.cycle).selectinload(Cycle.service),
            )
            .order_by(Appointment.starts_at.asc())
            .limit(limit)
        ).all()
    )


def next_appointment_by_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_ids: list[uuid.UUID] | None = None,
    after: datetime | None = None,
) -> dict[uuid.UUID, Appointment]:
    """The single next visible appointment for every client that has one.

    One query, reduced to first-per-client in Python (kept portable rather
    than a Postgres-only `DISTINCT ON`). Powers the Clientes list "próxima
    sessão" column without an N+1 fetch per row. Bounded to a 180-day
    look-ahead and a defensive row cap so a large organization can never
    turn this into an unbounded scan.
    """
    cutoff = after or datetime.now(UTC)
    horizon = cutoff + timedelta(days=180)
    query = select(Appointment).where(
        Appointment.organization_id == organization_id,
        Appointment.status.in_(AGENDA_VISIBLE_STATUSES),
        Appointment.starts_at >= cutoff,
        Appointment.starts_at < horizon,
    )
    if client_ids is not None:
        query = query.where(Appointment.client_id.in_(client_ids))
    rows = db.scalars(
        query.options(
            selectinload(Appointment.client),
            selectinload(Appointment.service),
            selectinload(Appointment.location),
            selectinload(Appointment.cycle).selectinload(Cycle.service),
        ).order_by(Appointment.starts_at.asc())
        .limit(2000)
    ).all()
    result: dict[uuid.UUID, Appointment] = {}
    for row in rows:
        if row.client_id not in result:
            result[row.client_id] = row
    return result


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
