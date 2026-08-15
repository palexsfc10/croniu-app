from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class PaymentProof(Base):
    """Optional receipt image metadata (binary stored outside public web root)."""

    __tablename__ = "payment_proofs"
    __table_args__ = (
        UniqueConstraint("payment_report_id", name="uq_payment_proofs_report"),
        UniqueConstraint("storage_key", name="uq_payment_proofs_storage_key"),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 5242880", name="ck_payment_proofs_size"),
        CheckConstraint(
            "mime_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name="ck_payment_proofs_mime",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payment_report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payment_reports.id", ondelete="CASCADE"),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(String(200), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    payment_report = relationship("PaymentReport", back_populates="proof")
