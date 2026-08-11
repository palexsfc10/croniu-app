"""Billing API schemas."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BillingCustomerInput(BaseModel):
    """Billing contact/address for Asaas customer (hosted card checkout)."""

    cpf_cnpj: str = Field(..., min_length=11, max_length=18)
    phone: str = Field(..., min_length=8, max_length=20)
    postal_code: str = Field(..., min_length=8, max_length=12)
    address: str = Field(..., min_length=3, max_length=120)
    address_number: str = Field(..., min_length=1, max_length=20)
    province: str = Field(..., min_length=2, max_length=80)
    complement: str | None = Field(default=None, max_length=100)

    @field_validator(
        "cpf_cnpj",
        "phone",
        "postal_code",
        "address",
        "address_number",
        "province",
        "complement",
        mode="before",
    )
    @classmethod
    def strip_strings(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class CreateHostedCheckoutRequest(BaseModel):
    price_id: UUID | None = None
    billing_method: Literal["credit_card"] = "credit_card"
    customer: BillingCustomerInput


class CheckoutOut(BaseModel):
    checkout_id: UUID | str
    checkout_url: str | None
    status: str
    expires_at: datetime | str | None = None
    amount_cents: int
    currency: str
    billing_type: str
    charge_type: str
    paid_at: datetime | str | None = None
    canceled_at: datetime | str | None = None
    expired_at: datetime | str | None = None


class EntitlementOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    subscription_status: str
    payment_status: str | None = None
    has_active_access: bool
    can_write: bool
    trial_days_remaining: int | None = None
    billing_setup_status: str = "available"
    payment_prepared: bool = False
    checkout_available: bool = False
    card_enabled: bool = False


class BillingStatusOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    billing_enabled: bool
    card_enabled: bool
    checkout_globally_enabled: bool
    sandbox_mode: bool
    checkout_available: bool | None = None
    organization_id: str | None = None


class WebhookResultOut(BaseModel):
    status: str
    external_event_id: str
    detail: dict[str, Any] | None = None
