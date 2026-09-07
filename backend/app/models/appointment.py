from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID, ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.cycle import Cycle
    from app.models.location import Location
    from app.models.organization import Organization
    from app.models.service import Service

# Shared with agenda_svc.commit_or_raise_conflict, which must recognize
# exclusively this constraint's SQLSTATE 23P01 violations as a booking
# conflict — never any other exclusion/check constraint that happens to
# also raise 23P01. Migration 0030_appointment_overlap_guard creates the
# same-named constraint via raw DDL and keeps its own literal string
# (migrations must not import application code), so this name must be
# kept in sync with it by hand if it's ever renamed.
APPOINTMENT_NO_OVERLAP_CONSTRAINT = "ck_appointments_no_overlap"


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_appointments_ends_after_starts"),
        Index("ix_appointments_org_starts", "organization_id", "starts_at"),
        Index("ix_appointments_org_status_starts", "organization_id", "status", "starts_at"),
        # Database-level guarantee against double-booking — the app-level
        # check-then-insert in agenda_svc.find_conflicts/create_appointment
        # has no protection against two concurrent requests both passing
        # that check for the same free slot (reproduced directly: two
        # threads booking the identical slot both succeeded). Mirrors
        # migration 0030_appointment_overlap_guard, which applies the same
        # constraint via raw DDL for real (Alembic-managed) databases —
        # this ORM-level declaration is what actually creates it for the
        # test database, which is built via `Base.metadata.create_all()`,
        # not Alembic (see conftest.py). Half-open `[starts_at, ends_at)`
        # matches `ck_appointments_ends_after_starts` and
        # `find_conflicts`'s own overlap comparison — back-to-back
        # appointments (one's `ends_at` equal to the other's `starts_at`)
        # do not overlap and stay allowed. Cancelled appointments are
        # excluded: a cancelled slot must remain bookable.
        ExcludeConstraint(
            (text("organization_id"), "="),
            (text("tstzrange(starts_at, ends_at, '[)')"), "&&"),
            where=text("status <> 'cancelled'"),
            using="gist",
            name=APPOINTMENT_NO_OVERLAP_CONSTRAINT,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cycles.id", ondelete="SET NULL"), nullable=True
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="SET NULL"), nullable=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship(back_populates="appointments")
    client: Mapped[Client] = relationship()
    cycle: Mapped[Cycle | None] = relationship()
    service: Mapped[Service | None] = relationship()
    location: Mapped[Location | None] = relationship()
