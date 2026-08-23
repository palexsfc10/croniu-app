"""Google OAuth support — external identities table + optional password_hash.

Adds `user_auth_identities` (provider + provider_subject unique) so a Croniu
account can be reached through more than one auth provider without
duplicating the user, and relaxes `users.password_hash` to nullable for
accounts created exclusively via Google Sign-In (no Croniu password is ever
set for those — no synthetic/blank password is generated either;
`authenticate_user` refuses password login when the column is NULL).

Existing password-based accounts are untouched by this migration; every
current row keeps its `password_hash` value.

Downgrade requires no NULL `password_hash` rows (i.e. no Google-only
accounts created since upgrade) — expected and acceptable for this
feature-flagged, HML-first rollout.

Revision ID: 0025_user_auth_identities
Revises: 0024_organization_admin_controls
Create Date: 2026-08-23
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025_user_auth_identities"
down_revision: str | None = "0024_organization_admin_controls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )

    op.create_table(
        "user_auth_identities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "email_verified", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "provider", "provider_subject", name="uq_auth_identity_provider_subject"
        ),
    )
    op.create_index(
        "ix_user_auth_identities_user_id", "user_auth_identities", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_user_auth_identities_user_id", table_name="user_auth_identities")
    op.drop_table("user_auth_identities")
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
