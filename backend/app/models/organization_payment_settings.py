from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OrganizationPaymentSettings(Base):
    """Manual Pix / external payment instructions shown on Meu Ciclo when enabled."""

    __tablename__ = "organization_payment_settings"
    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_org_payment_settings_org"),
        CheckConstraint(
            "pix_key_type IS NULL OR pix_key_type IN "
            "('cpf', 'cnpj', 'email', 'phone', 'random')",
            name="ck_org_payment_pix_key_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    holder_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pix_key_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pix_key: Mapped[str | None] = mapped_column(String(320), nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_payment_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    show_on_my_cycle: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    institution: Mapped[str | None] = mapped_column(String(120), nullable=True)
    whatsapp_e164: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
