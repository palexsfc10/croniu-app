from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

RESOLUTION_REASONS = ("client_declined", "no_response", "service_ended", "other")

# The *display* status — always derived (never trusted as-is from the stored
# row alone), combining the case's stored `status` with the source cycle's
# real dates. "overdue" is never persisted: it is `open`/`awaiting_client`
# plus the cycle having actually ended.
DISPLAY_STATUSES = (
    "upcoming",
    "pending",
    "awaiting_client",
    "overdue",
    "renewed",
    "ended_without_renewal",
)


class RenewalCaseView(BaseModel):
    """One row of the renewal-management surface — a real cycle, its derived
    renewal state, and (if one exists) the persisted case underneath it."""

    model_config = ConfigDict(from_attributes=True)

    case_id: UUID | None = None
    client_id: UUID
    client_name: str | None = None
    source_cycle_id: UUID
    service_name: str | None = None
    ends_on: date
    display_status: str
    portal_requested: bool = False
    next_contact_date: date | None = None
    resolution_reason: str | None = None
    resolution_note: str | None = None
    resolved_at: datetime | None = None
    successor_cycle_id: UUID | None = None


class MarkAwaitingClientIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    next_contact_date: date


class EndWithoutRenewalIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolution_reason: str = Field(pattern="^(" + "|".join(RESOLUTION_REASONS) + ")$")
    resolution_note: str | None = Field(default=None, max_length=2000)
