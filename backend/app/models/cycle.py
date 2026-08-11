from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Cycle(Base):
    __tablename__ = "cycles"

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
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    cycle_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycle_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cycle_type: Mapped[str] = mapped_column(String(32), nullable=False, default="period")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    weekdays: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    lesson_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    subtotal_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    adjustment_cents: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    value_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lesson_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_starts_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    duration_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    duration_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weekly_frequency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_legacy: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_contacted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    contact_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization = relationship("Organization", back_populates="cycles")
    client = relationship("Client", back_populates="cycles")
    service = relationship("Service", back_populates="cycles")
    cycle_template = relationship("CycleTemplate", back_populates="cycles")
    default_location = relationship("Location")
    receivables = relationship("Receivable", back_populates="cycle")
