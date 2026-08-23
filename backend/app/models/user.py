from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.membership import Membership
    from app.models.platform_membership import PlatformMembership
    from app.models.session import Session
    from app.models.user_auth_identity import UserAuthIdentity


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    # Nullable since 0025: accounts created exclusively via an external
    # identity provider (e.g. Google) never get a Croniu password. Never set
    # this to a synthetic/blank value — NULL means "no password login",
    # enforced in app.services.auth.authenticate_user.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    memberships: Mapped[list[Membership]] = relationship(back_populates="user")
    sessions: Mapped[list[Session]] = relationship(back_populates="user")
    platform_memberships: Mapped[list[PlatformMembership]] = relationship(
        back_populates="user",
        foreign_keys="PlatformMembership.user_id",
    )
    auth_identities: Mapped[list[UserAuthIdentity]] = relationship(back_populates="user")
