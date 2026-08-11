from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CycleTemplate(Base):
    __tablename__ = "cycle_templates"
    __table_args__ = (
        CheckConstraint(
            "weekly_frequency >= 1 AND weekly_frequency <= 7",
            name="ck_cycle_templates_weekly_frequency",
        ),
        CheckConstraint(
            "duration_type IN ('calendar_months', 'fixed_days')",
            name="ck_cycle_templates_duration_type",
        ),
        CheckConstraint(
            "duration_value >= 1 AND duration_value <= 730",
            name="ck_cycle_templates_duration_value",
        ),
        CheckConstraint("status IN ('active', 'archived')", name="ck_cycle_templates_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    weekly_frequency: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_type: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_value: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization = relationship("Organization", back_populates="cycle_templates")
    cycles = relationship("Cycle", back_populates="cycle_template")
