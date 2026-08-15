from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class PaymentReport(Base):
    """Client-reported payment awaiting professional confirmation."""

    __tablename__ = "payment_reports"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_review', 'confirmed', 'rejected')",
            name="ck_payment_reports_status",
        ),
        CheckConstraint("amount_cents >= 0", name="ck_payment_reports_amount"),
        Index("ix_payment_reports_org_status", "organization_id", "status"),
        Index(
            "uq_payment_reports_active",
            "receivable_id",
            unique=True,
            postgresql_where=text("status = 'pending_review'"),
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
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="CASCADE"),
        nullable=False,
    )
    receivable_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("receivables.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending_review")
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    method_note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    proof = relationship("PaymentProof", back_populates="payment_report", uselist=False)
    client = relationship("Client")
    receivable = relationship("Receivable")
