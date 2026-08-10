"""Minimal billing provider protocol for Croniu (Asaas first)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Protocol


@dataclass
class ProviderCustomer:
    id: str
    email: str | None = None
    name: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderSubscription:
    id: str
    customer_id: str
    status: str
    billing_type: str | None = None
    next_due_date: date | None = None
    value: float | None = None
    cycle: str | None = None
    payment_link: str | None = None
    invoice_url: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderCancelOutcome:
    """Result of DELETE subscription — never invents confirmation from 404 alone."""

    kind: str
    error_code: str | None = None
    provider_subscription_id: str | None = None


@dataclass
class ProviderCheckout:
    id: str
    link: str
    status: str
    billing_types: list[str] = field(default_factory=list)
    charge_types: list[str] = field(default_factory=list)
    minutes_to_expire: int | None = None
    external_reference: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedWebhookEvent:
    external_event_id: str
    event_type: str
    provider_customer_id: str | None
    provider_subscription_id: str | None
    provider_payment_id: str | None
    payment_status: str | None
    occurred_at: datetime | None
    sanitized_payload: dict[str, Any]
    provider_checkout_id: str | None = None
    external_reference: str | None = None
    checkout_status: str | None = None
    checkout_link: str | None = None


class BillingProvider(Protocol):
    code: str

    def create_customer(
        self,
        *,
        name: str,
        email: str,
        cpf_cnpj: str | None = None,
        external_reference: str | None = None,
        phone: str | None = None,
        postal_code: str | None = None,
        address: str | None = None,
        address_number: str | None = None,
        province: str | None = None,
        complement: str | None = None,
    ) -> ProviderCustomer: ...

    def update_customer(
        self,
        customer_id: str,
        *,
        name: str | None = None,
        email: str | None = None,
        cpf_cnpj: str | None = None,
        phone: str | None = None,
        postal_code: str | None = None,
        address: str | None = None,
        address_number: str | None = None,
        province: str | None = None,
        complement: str | None = None,
    ) -> ProviderCustomer: ...

    def create_subscription(
        self,
        *,
        customer_id: str,
        billing_type: str,
        value: float,
        next_due_date: date,
        cycle: str = "MONTHLY",
        description: str | None = None,
        external_reference: str | None = None,
        credit_card_token: str | None = None,
        remote_ip: str | None = None,
    ) -> ProviderSubscription: ...

    def create_hosted_checkout(
        self,
        *,
        value: float,
        next_due_date: date,
        item_name: str,
        external_reference: str,
        success_url: str,
        cancel_url: str,
        expired_url: str,
        minutes_to_expire: int = 60,
        customer_name: str | None = None,
        customer_email: str | None = None,
        customer_cpf_cnpj: str | None = None,
        customer_id: str | None = None,
        item_description: str | None = None,
    ) -> ProviderCheckout: ...

    def get_subscription(self, subscription_id: str) -> ProviderSubscription: ...

    def cancel_subscription(self, subscription_id: str) -> ProviderCancelOutcome: ...

    def parse_and_validate_webhook(
        self,
        *,
        payload: dict[str, Any],
        access_token: str | None,
    ) -> ParsedWebhookEvent: ...

    def map_provider_status(
        self,
        *,
        provider_subscription_status: str | None = None,
        provider_payment_status: str | None = None,
        event_type: str | None = None,
    ) -> str: ...
