from __future__ import annotations

import uuid
from datetime import datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.organization import Organization


class AvailabilitySchedule(Base):
    """One row per weekday (0=Mon…6=Sun) configured for an organization's working hours."""

    __tablename__ = "availability_schedules"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "weekday", name="uq_availability_schedules_org_weekday"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    starts_time: Mapped[time] = mapped_column(Time, nullable=False)
    ends_time: Mapped[time] = mapped_column(Time, nullable=False)
    break_starts_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    break_ends_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    default_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped[Organization] = relationship()
