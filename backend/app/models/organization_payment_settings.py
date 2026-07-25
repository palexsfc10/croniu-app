from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OrganizationPaymentSettings(Base):
    """Manual Pix / external payment instructions shown on Meu Ciclo when enabled."""

    __tablename__ = "organization_payment_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    holder_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pix_key_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pix_key: Mapped[str | None] = mapped_column(String(320), nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_payment_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    show_on_my_cycle: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
