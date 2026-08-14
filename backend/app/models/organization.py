from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.client import Client
    from app.models.cycle import Cycle
    from app.models.cycle_template import CycleTemplate
    from app.models.location import Location
    from app.models.membership import Membership
    from app.models.receivable import Receivable
    from app.models.service import Service


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="evaluating")
    plan_code: Mapped[str] = mapped_column(String(50), nullable=False, default="starter")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Sao_Paulo")
    profession_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    profession_specialty: Mapped[str | None] = mapped_column(String(64), nullable=True)
    profession_other: Mapped[str | None] = mapped_column(String(200), nullable=True)
    use_cases: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    profession_onboarding_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    routine_defaults: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    memberships: Mapped[list[Membership]] = relationship(back_populates="organization")
    clients: Mapped[list[Client]] = relationship(back_populates="organization")
    services: Mapped[list[Service]] = relationship(back_populates="organization")
    cycle_templates: Mapped[list[CycleTemplate]] = relationship(back_populates="organization")
    cycles: Mapped[list[Cycle]] = relationship(back_populates="organization")
    receivables: Mapped[list[Receivable]] = relationship(back_populates="organization")
    locations: Mapped[list[Location]] = relationship(back_populates="organization")
    appointments: Mapped[list[Appointment]] = relationship(back_populates="organization")
