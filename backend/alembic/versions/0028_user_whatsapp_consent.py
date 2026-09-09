"""Users gain an optional WhatsApp contact + marketing consent.

Additive only, all 3 columns nullable, no server_default, no backfill — every
existing row gets NULL and is unaffected. This is the phone number and
consent of the *person who created the account* (owner/professional),
collected during the post-login onboarding wizard — never at registration,
never required. It is unrelated to `organization_payment_settings.whatsapp_e164`
(renewal-receipt WhatsApp sent to clients) and must never be used for auth.

`whatsapp_marketing_consent_version` records which version of the consent
text the user accepted; there is no existing generic consent/audit-log model
usable here without widening its scope (`ConsentRecord` in
app/models/intake.py has NOT NULL FKs to client_id/submission_id, scoped to
client intake — not to users; `AdminAuditLog` is for admin actions on
resources, not a user's own consent), so a version column is the smallest
correct primitive.

Revision ID: 0028_user_whatsapp_consent
Revises: 0027_fixed_period_plan_pricing
Create Date: 2026-09-03
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028_user_whatsapp_consent"
down_revision: str | None = "0027_fixed_period_plan_pricing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("contact_whatsapp_e164", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "whatsapp_marketing_consent_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "users",
        sa.Column("whatsapp_marketing_consent_version", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "whatsapp_marketing_consent_version")
    op.drop_column("users", "whatsapp_marketing_consent_at")
    op.drop_column("users", "contact_whatsapp_e164")
