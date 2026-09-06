from __future__ import annotations

import uuid
from datetime import date as date_, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class RenewalCase(Base):
    """One row per cycle that ever needed an explicit renewal decision.

    Distinct from `RenewalRequest` (a portal-submitted client signal): this
    entity tracks the professional-side process — who's turn it is, when to
    follow up, and how the case was actually resolved. It exists for at most
    one row per source cycle (never reopened once resolved), and it is only
    ever created lazily, on the first real action taken against a cycle's
    renewal (never backfilled for existing accounts).
    """

    __tablename__ = "renewal_cases"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'awaiting_client', 'renewed', 'ended_without_renewal')",
            name="ck_renewal_cases_status",
        ),
        CheckConstraint(
            "resolution_reason IS NULL OR resolution_reason IN "
            "('client_declined', 'no_response', 'service_ended', 'other')",
            name="ck_renewal_cases_resolution_reason",
        ),
        Index("ix_renewal_cases_org_status", "organization_id", "status"),
        Index(
            "uq_renewal_cases_source_cycle",
            "source_cycle_id",
            unique=True,
        ),
        Index(
            "uq_renewal_cases_successor_cycle",
            "successor_cycle_id",
            unique=True,
            postgresql_where=text("successor_cycle_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    next_contact_date: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    resolution_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    successor_cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Informational link to the portal signal that may have kicked this case
    # off — never required, never authoritative over `status` on its own.
    renewal_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("renewal_requests.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    client = relationship("Client")
    source_cycle = relationship("Cycle", foreign_keys=[source_cycle_id])
    successor_cycle = relationship("Cycle", foreign_keys=[successor_cycle_id])
    renewal_request = relationship("RenewalRequest")
