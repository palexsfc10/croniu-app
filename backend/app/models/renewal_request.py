from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class RenewalRequest(Base):
    """Client interest in renewing — does not create a cycle."""

    __tablename__ = "renewal_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('requested', 'acknowledged', 'payment_reported', 'resolved', 'dismissed')",
            name="ck_renewal_requests_status",
        ),
        Index("ix_renewal_requests_org_status", "organization_id", "status"),
        Index(
            "uq_renewal_requests_active",
            "client_id",
            "source_cycle_id",
            unique=True,
            postgresql_where=text(
                "status IN ('requested', 'acknowledged', 'payment_reported')"
            ),
        ),
        Index(
            "uq_renewal_requests_created_cycle",
            "created_cycle_id",
            unique=True,
            postgresql_where=text("created_cycle_id IS NOT NULL"),
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
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="requested")
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="SET NULL"),
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
    created_cycle = relationship("Cycle", foreign_keys=[created_cycle_id])
