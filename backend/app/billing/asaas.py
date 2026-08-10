"""Asaas sandbox/production billing provider for Croniu (Brazil / BRL)."""

from __future__ import annotations

import hashlib
import hmac
import json as json_lib
import logging
from datetime import date, datetime
from typing import Any

import httpx

from app.billing.checkout_helpers import (
    ASAAS_CHECKOUT_ITEM_IMAGE_BASE64,
    format_asaas_next_due_date,
    is_allowed_asaas_checkout_link,
)
from app.billing.protocols import (
    ParsedWebhookEvent,
    ProviderCancelOutcome,
    ProviderCheckout,
    ProviderCustomer,
    ProviderSubscription,
)
from app.config import get_settings
from app.models.billing import SubscriptionStatus
from app.services.auth import AuthError

logger = logging.getLogger(__name__)

# Events we care about (Asaas v3 naming)
RELEVANT_EVENTS = frozenset(
    {
        "PAYMENT_CREATED",
        "PAYMENT_UPDATED",
        "PAYMENT_CONFIRMED",
        "PAYMENT_RECEIVED",
        "PAYMENT_OVERDUE",
        "PAYMENT_DELETED",
        "PAYMENT_REFUNDED",
        "PAYMENT_REFUND_IN_PROGRESS",
        "PAYMENT_CHARGEBACK_REQUESTED",
        "PAYMENT_CHARGEBACK_DISPUTE",
        "PAYMENT_AWAITING_RISK_ANALYSIS",
        "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
        "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
        "SUBSCRIPTION_CREATED",
        "SUBSCRIPTION_UPDATED",
        "SUBSCRIPTION_DELETED",
        "SUBSCRIPTION_INACTIVATED",
        "SUBSCRIPTION_REACTIVATED",
        "CHECKOUT_CREATED",
        "CHECKOUT_CANCELED",
        "CHECKOUT_EXPIRED",
        "CHECKOUT_PAID",
    }
)

SENSITIVE_KEYS = frozenset(
    {
        "creditCard",
        "creditCardHolderInfo",
        "creditCardToken",
        "password",
        "apiKey",
        "accessToken",
        "remoteIp",
        "ccv",
        "cvv",
        "number",
        "customerData",
        "cpfCnpj",
        "cpf_cnpj",
        "cpf",
        "cnpj",
        "phone",
        "mobilePhone",
        "postalCode",
        "postal_code",
        "address",
        "addressNumber",
        "address_number",
        "province",
        "complement",
    }
)


def sanitize_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        cleaned: dict[str, Any] = {}
        for key, value in payload.items():
            if key in SENSITIVE_KEYS:
                cleaned[key] = "[redacted]"
            else:
                cleaned[key] = sanitize_payload(value)
        return cleaned
    if isinstance(payload, list):
        return [sanitize_payload(item) for item in payload]
    return payload


def summarize_asaas_api_errors(payload: Any) -> list[dict[str, str]]:
    """Extract a safe, bounded summary of Asaas `errors` for structured logs.

    Only `code` (≤100) and `description` (≤500) are kept, max 5 items.
    Unexpected shapes yield an empty list — never the raw body.
    """
    if not isinstance(payload, dict):
        return []
    errors = payload.get("errors")
    if not isinstance(errors, list):
        return []

    summaries: list[dict[str, str]] = []
    for item in errors:
        if len(summaries) >= 5:
            break
        if not isinstance(item, dict):
            continue
        entry: dict[str, str] = {}
        if "code" in item:
            entry["code"] = str(item["code"])[:100]
        if "description" in item:
            entry["description"] = str(item["description"])[:500]
        if entry:
            summaries.append(entry)
    return summaries


class AsaasBillingProvider:
    code = "asaas"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        api_url: str | None = None,
        webhook_token: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = (
            api_key if api_key is not None else get_settings().asaas_api_key
        ).strip()
        self.api_url = (
            api_url if api_url is not None else get_settings().asaas_api_url
        ).rstrip("/") + "/"
        self.webhook_token = (
            webhook_token if webhook_token is not None else get_settings().asaas_webhook_token
        ).strip()
        self.timeout = timeout
        if not self.api_key:
            raise AuthError(
                "billing_provider_error",
                "Integração de pagamento não configurada.",
                status_code=503,
            )

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self.api_url,
            headers={
                "access_token": self.api_key,
                "Content-Type": "application/json",
                "User-Agent": "Croniu-Billing/1.0",
            },
            timeout=self.timeout,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._client() as client:
            response = client.request(method, path.lstrip("/"), json=json)
        if response.status_code >= 400:
            payload = self._safe_json(response)
            provider_errors = summarize_asaas_api_errors(payload)
            # Path is the internal relative path only (never full URL / query / headers).
            safe_path = str(path).split("?", 1)[0][:200]
            logger.warning(
                "asaas_api_error path=%s provider_errors=%s",
                safe_path,
                json_lib.dumps(provider_errors, ensure_ascii=False),
                extra={"status_code": response.status_code},
            )
            raise AuthError(
                "billing_provider_error",
                "Falha ao comunicar com o provedor de pagamento.",
                status_code=502,
                details={"provider_status": response.status_code},
            )
        data = self._safe_json(response)
        if not isinstance(data, dict):
            raise AuthError(
                "billing_provider_error",
                "Resposta inválida do provedor de pagamento.",
                status_code=502,
            )
        return data

    @staticmethod
    def _safe_json(response: httpx.Response) -> Any:
        try:
            return response.json()
        except Exception:
            return {"raw": response.text[:500]}

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
    ) -> ProviderCustomer:
        body: dict[str, Any] = {"name": name, "email": email}
        if cpf_cnpj:
            body["cpfCnpj"] = cpf_cnpj
        if external_reference:
            body["externalReference"] = external_reference
        if phone:
            body["phone"] = phone
        if postal_code:
            body["postalCode"] = postal_code
        if address:
            body["address"] = address
        if address_number:
            body["addressNumber"] = address_number
        if province:
            body["province"] = province
        if complement:
            body["complement"] = complement
        data = self._request("POST", "customers", json=body)
        logger.info(
            "asaas_customer_created",
            extra={"provider_customer_id": data.get("id")},
        )
        return ProviderCustomer(
            id=str(data["id"]),
            email=data.get("email"),
            name=data.get("name"),
            raw=sanitize_payload(data),
        )

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
    ) -> ProviderCustomer:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if email is not None:
            body["email"] = email
        if cpf_cnpj is not None:
            body["cpfCnpj"] = cpf_cnpj
        if phone is not None:
            body["phone"] = phone
        if postal_code is not None:
            body["postalCode"] = postal_code
        if address is not None:
            body["address"] = address
        if address_number is not None:
            body["addressNumber"] = address_number
        if province is not None:
            body["province"] = province
        if complement:
            body["complement"] = complement
        data = self._request("PUT", f"customers/{customer_id}", json=body)
        return ProviderCustomer(
            id=str(data["id"]),
            email=data.get("email"),
            name=data.get("name"),
            raw=sanitize_payload(data),
        )

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
    ) -> ProviderSubscription:
        body: dict[str, Any] = {
            "customer": customer_id,
            "billingType": billing_type,
            "value": value,
            "nextDueDate": next_due_date.isoformat(),
            "cycle": cycle,
        }
        if description:
            body["description"] = description
        if external_reference:
            body["externalReference"] = external_reference
        if credit_card_token:
            body["creditCardToken"] = credit_card_token
        if remote_ip:
            body["remoteIp"] = remote_ip

        data = self._request("POST", "subscriptions", json=body)
        logger.info(
            "asaas_subscription_created",
            extra={
                "provider_subscription_id": data.get("id"),
                "billing_type": billing_type,
                "next_due_date": next_due_date.isoformat(),
            },
        )
        return self._map_subscription(data)

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
    ) -> ProviderCheckout:
        """POST /v3/checkouts — customer XOR customerData (Asaas official rule)."""
        body: dict[str, Any] = {
            "billingTypes": ["CREDIT_CARD"],
            "chargeTypes": ["RECURRENT"],
            "minutesToExpire": minutes_to_expire,
            "externalReference": external_reference,
            "callback": {
                "successUrl": success_url,
                "cancelUrl": cancel_url,
                "expiredUrl": expired_url,
            },
            "items": [
                {
                    "name": item_name[:30],
                    "description": (item_description or item_name)[:150],
                    "quantity": 1,
                    "value": value,
                    "imageBase64": ASAAS_CHECKOUT_ITEM_IMAGE_BASE64,
                }
            ],
            "subscription": {
                "cycle": "MONTHLY",
                "nextDueDate": format_asaas_next_due_date(next_due_date),
                # endDate intentionally omitted (optional in Asaas OpenAPI)
            },
        }

        # Official rule: use only one of customer | customerData — never both.
        if customer_id:
            body["customer"] = customer_id
        else:
            customer_data: dict[str, str] = {}
            if customer_name:
                customer_data["name"] = customer_name[:100]
            if customer_email:
                customer_data["email"] = customer_email[:100]
            if customer_cpf_cnpj:
                digits = "".join(ch for ch in customer_cpf_cnpj if ch.isdigit())
                if digits:
                    customer_data["cpfCnpj"] = digits
            if customer_data:
                body["customerData"] = customer_data

        assert not ("customer" in body and "customerData" in body), (
            "Asaas checkout forbids customer + customerData together"
        )

        data = self._request("POST", "checkouts", json=body)
        checkout_id = data.get("id")
        link = data.get("link")
        status = data.get("status")
        if not checkout_id or not link or not status:
            raise AuthError(
                "billing_provider_error",
                "Resposta incompleta do checkout Asaas.",
                status_code=502,
            )
        if not is_allowed_asaas_checkout_link(str(link)):
            logger.warning(
                "asaas_checkout_link_rejected",
                extra={"provider_checkout_id": str(checkout_id)},
            )
            raise AuthError(
                "billing_provider_error",
                "Link de checkout inválido retornado pelo provedor.",
                status_code=502,
            )

        logger.info(
            "asaas_hosted_checkout_created",
            extra={
                "provider_checkout_id": str(checkout_id),
                "status": status,
                "next_due_date": format_asaas_next_due_date(next_due_date),
                "external_reference": external_reference,
            },
        )
        return ProviderCheckout(
            id=str(checkout_id),
            link=str(link),
            status=str(status),
            billing_types=list(data.get("billingTypes") or []),
            charge_types=list(data.get("chargeTypes") or []),
            minutes_to_expire=(
                int(data["minutesToExpire"])
                if data.get("minutesToExpire") is not None
                else minutes_to_expire
            ),
            external_reference=data.get("externalReference") or external_reference,
            raw=sanitize_payload(data),
        )

    def get_subscription(self, subscription_id: str) -> ProviderSubscription:
        data = self._request("GET", f"subscriptions/{subscription_id}")
        return self._map_subscription(data)

    def cancel_subscription(self, subscription_id: str) -> ProviderCancelOutcome:
        """DELETE subscription with explicit outcomes (404 is never auto-success)."""
        path = f"subscriptions/{subscription_id}"
        try:
            with self._client() as client:
                response = client.request("DELETE", path)
        except httpx.TimeoutException:
            logger.warning(
                "asaas_cancel_timeout",
                extra={"provider_subscription_id": subscription_id},
            )
            return ProviderCancelOutcome(kind="timeout")
        except httpx.HTTPError:
            logger.warning(
                "asaas_cancel_network_error",
                extra={"provider_subscription_id": subscription_id},
            )
            return ProviderCancelOutcome(kind="network_error")

        if response.status_code == 404:
            logger.warning(
                "asaas_cancel_not_found",
                extra={"provider_subscription_id": subscription_id},
            )
            return ProviderCancelOutcome(
                kind="not_found",
                error_code="http_404",
                provider_subscription_id=subscription_id,
            )

        if response.status_code >= 500:
            payload = self._safe_json(response)
            provider_errors = summarize_asaas_api_errors(payload)
            logger.warning(
                "asaas_api_error path=%s provider_errors=%s",
                path,
                json_lib.dumps(provider_errors, ensure_ascii=False),
                extra={"status_code": response.status_code},
            )
            return ProviderCancelOutcome(
                kind="error_5xx",
                error_code=f"http_{response.status_code}",
            )

        if response.status_code >= 400:
            payload = self._safe_json(response)
            provider_errors = summarize_asaas_api_errors(payload)
            logger.warning(
                "asaas_api_error path=%s provider_errors=%s",
                path,
                json_lib.dumps(provider_errors, ensure_ascii=False),
                extra={"status_code": response.status_code},
            )
            code = None
            if provider_errors:
                code = str(provider_errors[0].get("code") or "")[:64] or None
            return ProviderCancelOutcome(
                kind="error_4xx",
                error_code=code or f"http_{response.status_code}",
            )

        data = self._safe_json(response)
        if isinstance(data, dict) and data.get("deleted") is True:
            logger.info(
                "asaas_subscription_cancelled",
                extra={"provider_subscription_id": subscription_id},
            )
            return ProviderCancelOutcome(
                kind="deleted",
                provider_subscription_id=str(data.get("id") or subscription_id),
            )

        logger.warning(
            "asaas_cancel_ambiguous_response",
            extra={
                "provider_subscription_id": subscription_id,
                "status_code": response.status_code,
            },
        )
        return ProviderCancelOutcome(kind="ambiguous_response")

    def parse_and_validate_webhook(
        self,
        *,
        payload: dict[str, Any],
        access_token: str | None,
    ) -> ParsedWebhookEvent:
        expected = self.webhook_token
        if expected:
            provided = (access_token or "").strip()
            if not provided or not hmac.compare_digest(provided, expected):
                raise AuthError(
                    "forbidden",
                    "Webhook Asaas não autorizado.",
                    status_code=403,
                )

        event_type = str(payload.get("event") or "UNKNOWN")
        payment = (
            payload.get("payment") if isinstance(payload.get("payment"), dict) else {}
        )
        subscription = (
            payload.get("subscription")
            if isinstance(payload.get("subscription"), dict)
            else {}
        )
        checkout = (
            payload.get("checkout") if isinstance(payload.get("checkout"), dict) else {}
        )

        # Prefer payment id + event for uniqueness; fall back to subscription/checkout + event
        payment_id = payment.get("id")
        subscription_id = (
            payment.get("subscription")
            or subscription.get("id")
            or checkout.get("subscription")
        )
        if isinstance(subscription_id, dict):
            subscription_id = subscription_id.get("id")
        customer_id = (
            payment.get("customer")
            or subscription.get("customer")
            or checkout.get("customer")
        )
        checkout_id = checkout.get("id")
        external_reference = (
            checkout.get("externalReference")
            or payment.get("externalReference")
            or subscription.get("externalReference")
        )

        seed = (
            f"{event_type}:{payment_id or ''}:{subscription_id or ''}:"
            f"{checkout_id or ''}:{payload.get('id') or ''}"
        )
        external_event_id = str(
            payload.get("id") or hashlib.sha256(seed.encode("utf-8")).hexdigest()
        )

        occurred_raw = payment.get("confirmedDate") or payment.get("paymentDate")
        occurred_at = None
        if isinstance(occurred_raw, str) and occurred_raw:
            try:
                occurred_at = datetime.fromisoformat(occurred_raw)
            except ValueError:
                occurred_at = None

        return ParsedWebhookEvent(
            external_event_id=external_event_id,
            event_type=event_type,
            provider_customer_id=str(customer_id) if customer_id else None,
            provider_subscription_id=str(subscription_id) if subscription_id else None,
            provider_payment_id=str(payment_id) if payment_id else None,
            payment_status=str(payment.get("status"))
            if payment.get("status")
            else None,
            occurred_at=occurred_at,
            sanitized_payload=sanitize_payload(payload),
            provider_checkout_id=str(checkout_id) if checkout_id else None,
            external_reference=str(external_reference) if external_reference else None,
            checkout_status=str(checkout.get("status"))
            if checkout.get("status")
            else None,
            checkout_link=str(checkout.get("link")) if checkout.get("link") else None,
        )

    def map_provider_status(
        self,
        *,
        provider_subscription_status: str | None = None,
        provider_payment_status: str | None = None,
        event_type: str | None = None,
    ) -> str:
        """Map Asaas statuses/events → Kyvora SubscriptionStatus value."""
        event = (event_type or "").upper()
        pay = (provider_payment_status or "").upper()
        sub = (provider_subscription_status or "").upper()

        if event in {"PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"} or pay in {
            "RECEIVED",
            "CONFIRMED",
            "RECEIVED_IN_CASH",
        }:
            return SubscriptionStatus.ACTIVE.value

        if event == "PAYMENT_OVERDUE" or pay == "OVERDUE":
            return SubscriptionStatus.PAST_DUE.value

        if event in {"PAYMENT_REFUNDED", "PAYMENT_DELETED"}:
            return SubscriptionStatus.PROVIDER_ERROR.value

        if event in {"SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"} or sub in {
            "INACTIVE",
            "EXPIRED",
        }:
            return SubscriptionStatus.CANCELLED.value

        if event == "PAYMENT_CREATED" or pay in {"PENDING", "AWAITING_PAYMENT"}:
            return SubscriptionStatus.PAYMENT_PENDING.value

        if sub == "ACTIVE":
            return SubscriptionStatus.PENDING_ACTIVATION.value

        return SubscriptionStatus.PROVIDER_ERROR.value

    def _map_subscription(self, data: dict[str, Any]) -> ProviderSubscription:
        next_due = data.get("nextDueDate")
        next_due_date = None
        if isinstance(next_due, str) and next_due:
            try:
                next_due_date = date.fromisoformat(next_due[:10])
            except ValueError:
                next_due_date = None

        return ProviderSubscription(
            id=str(data.get("id") or ""),
            customer_id=str(data.get("customer") or ""),
            status=str(data.get("status") or ""),
            billing_type=data.get("billingType"),
            next_due_date=next_due_date,
            value=float(data["value"]) if data.get("value") is not None else None,
            cycle=data.get("cycle"),
            payment_link=data.get("paymentLink") or data.get("invoiceUrl"),
            invoice_url=data.get("invoiceUrl"),
            raw=sanitize_payload(data),
        )


def build_asaas_provider() -> AsaasBillingProvider:
    return AsaasBillingProvider()
