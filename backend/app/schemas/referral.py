from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ReferralCodeCheckOut(BaseModel):
    valid: bool
    code: str
    discount_percent: int | None = None


class MyReferralOut(BaseModel):
    enabled: bool
    code: str | None = None
    discount_percent: int | None = None
    link: str | None = None


class EnablePartnerIn(BaseModel):
    user_id: uuid.UUID
    code: str = Field(min_length=3, max_length=32)
    commission_percent: Decimal = Field(ge=0, le=100)


class UpdateCommissionIn(BaseModel):
    commission_percent: Decimal = Field(ge=0, le=100)


class CodeAvailabilityOut(BaseModel):
    available: bool
    code: str


class PartnerSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    partner_id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str
    user_email: str
    enabled: bool
    campaign_id: uuid.UUID | None
    code: str | None
    status: str | None
    discount_percent: int | None
    commission_percent: Decimal | None
    signups: int
    payers: int
    active: int
    projected_monthly_commission_cents: int
    link: str | None = None


class PartnerSummaryListOut(BaseModel):
    items: list[PartnerSummaryOut]
