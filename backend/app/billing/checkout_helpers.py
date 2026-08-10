"""Hosted checkout helpers — callbacks, money, nextDueDate, URL validation."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import urlparse

from app.config import get_settings
from app.models.billing import Subscription
from app.services.auth import AuthError

# Official hosted-checkout hosts only (no suffix matching — avoids fakeasaas.com etc.)
ASAAS_CHECKOUT_HOSTS_SANDBOX = frozenset({"sandbox.asaas.com"})
ASAAS_CHECKOUT_HOSTS_PRODUCTION = frozenset({"asaas.com", "www.asaas.com"})

# Minimal 1×1 PNG — OpenAPI CheckoutSessionItemsDTO lists imageBase64 as required
ASAAS_CHECKOUT_ITEM_IMAGE_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def cents_to_asaas_decimal(amount_cents: int) -> Decimal:
    """Convert integer cents → Decimal money with exactly 2 places."""
    if not isinstance(amount_cents, int):
        raise AuthError("validation_error", "Valor de cobrança inválido.", status_code=422)
    if amount_cents < 0:
        raise AuthError("validation_error", "Valor de cobrança inválido.", status_code=422)
    return (Decimal(amount_cents) / Decimal(100)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def asaas_money_json_number(amount: Decimal) -> float:
    """Encode Decimal money for JSON number without binary float division of cents."""
    if not isinstance(amount, Decimal):
        raise TypeError("amount must be Decimal")
    quantized = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(format(quantized, "f"))


def cents_to_asaas_value(amount_cents: int) -> float:
    """Public helper: cents → JSON-safe Asaas value via Decimal."""
    return asaas_money_json_number(cents_to_asaas_decimal(amount_cents))


def format_asaas_next_due_date(due: date) -> str:
    """Asaas checkout subscription.nextDueDate — OpenAPI format: date (YYYY-MM-DD)."""
    return due.isoformat()


def first_charge_date_for_subscription(
    subscription: Subscription, *, now: datetime | None = None
) -> date:
    """Charge on/after trial_ends_at when trial is open."""
    current = now or datetime.now(UTC)
    ends = subscription.trial_ends_at
    if ends is not None:
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=UTC)
        if ends > current:
            return ends.date()
    return current.date()


def normalize_cpf_cnpj(raw: str | None) -> str | None:
    if raw is None:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return None
    if len(digits) not in {11, 14}:
        raise AuthError(
            "validation_error",
            "CPF/CNPJ inválido. Informe 11 ou 14 dígitos.",
            status_code=422,
        )
    return digits


def _reject_control_chars(value: str, *, field_label: str) -> str:
    if any(ord(ch) < 32 for ch in value):
        raise AuthError(
            "validation_error",
            f"{field_label} contém caracteres inválidos.",
            status_code=422,
        )
    return value


def normalize_phone_br(raw: str | None) -> str:
    """Normalize BR phone to 10–11 digits (DDD + number). Strips leading 55."""
    if raw is None or not str(raw).strip():
        raise AuthError("validation_error", "Telefone é obrigatório.", status_code=422)
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if digits.startswith("55") and len(digits) in {12, 13}:
        digits = digits[2:]
    if len(digits) not in {10, 11}:
        raise AuthError(
            "validation_error",
            "Telefone inválido. Informe DDD + número (10 ou 11 dígitos).",
            status_code=422,
        )
    if digits[0] == "0":
        raise AuthError(
            "validation_error",
            "Telefone inválido. Informe DDD + número sem zero inicial.",
            status_code=422,
        )
    return digits


def normalize_postal_code(raw: str | None) -> str:
    if raw is None or not str(raw).strip():
        raise AuthError("validation_error", "CEP é obrigatório.", status_code=422)
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digits) != 8:
        raise AuthError(
            "validation_error",
            "CEP inválido. Informe 8 dígitos.",
            status_code=422,
        )
    return digits


def normalize_address_line(
    raw: str | None, *, field_label: str, min_len: int, max_len: int
) -> str:
    if raw is None:
        raise AuthError(
            "validation_error",
            f"{field_label} é obrigatório.",
            status_code=422,
        )
    value = _reject_control_chars(str(raw).strip(), field_label=field_label)
    if len(value) < min_len:
        raise AuthError(
            "validation_error",
            f"{field_label} é muito curto.",
            status_code=422,
        )
    if len(value) > max_len:
        raise AuthError(
            "validation_error",
            f"{field_label} é muito longo.",
            status_code=422,
        )
    return value


def normalize_address_number(raw: str | None) -> str:
    if raw is None or not str(raw).strip():
        raise AuthError(
            "validation_error",
            "Número do endereço é obrigatório.",
            status_code=422,
        )
    value = _reject_control_chars(str(raw).strip(), field_label="Número")
    if len(value) > 20:
        raise AuthError(
            "validation_error",
            "Número do endereço é muito longo.",
            status_code=422,
        )
    normalized = value.casefold()
    if normalized in {"s/n", "sn", "s.n", "s.n."}:
        return "S/N"
    if not any(ch.isalnum() for ch in value):
        raise AuthError(
            "validation_error",
            "Número do endereço inválido.",
            status_code=422,
        )
    return value


def normalize_optional_complement(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = _reject_control_chars(str(raw).strip(), field_label="Complemento")
    if not value:
        return None
    if len(value) > 100:
        raise AuthError(
            "validation_error",
            "Complemento é muito longo.",
            status_code=422,
        )
    return value


def build_validated_billing_customer(
    *,
    cpf_cnpj: str | None,
    phone: str | None,
    postal_code: str | None,
    address: str | None,
    address_number: str | None,
    province: str | None,
    complement: str | None = None,
) -> dict[str, str]:
    """Validate and normalize billing customer fields for Asaas customer create/update."""
    cpf = normalize_cpf_cnpj(cpf_cnpj)
    if not cpf:
        raise AuthError(
            "validation_error",
            "CPF/CNPJ é obrigatório para o checkout com cartão.",
            status_code=422,
        )
    result: dict[str, str] = {
        "cpf_cnpj": cpf,
        "phone": normalize_phone_br(phone),
        "postal_code": normalize_postal_code(postal_code),
        "address": normalize_address_line(
            address, field_label="Endereço", min_len=3, max_len=120
        ),
        "address_number": normalize_address_number(address_number),
        "province": normalize_address_line(
            province, field_label="Bairro", min_len=2, max_len=80
        ),
    }
    complement_n = normalize_optional_complement(complement)
    if complement_n:
        result["complement"] = complement_n
    return result


def billing_customer_to_asaas_fields(customer: dict[str, str]) -> dict[str, str]:
    """Map validated snake_case billing customer → Asaas camelCase."""
    mapped: dict[str, str] = {
        "cpfCnpj": customer["cpf_cnpj"],
        "phone": customer["phone"],
        "postalCode": customer["postal_code"],
        "address": customer["address"],
        "addressNumber": customer["address_number"],
        "province": customer["province"],
    }
    if customer.get("complement"):
        mapped["complement"] = customer["complement"]
    return mapped


def validate_frontend_base_url(raw: str | None = None) -> str:
    """Return normalized PUBLIC_APP_BASE_URL origin; reject unsafe hosts/schemes."""
    settings = get_settings()
    base = (raw if raw is not None else settings.public_app_base_url).strip().rstrip("/")
    if not base:
        raise AuthError(
            "billing_provider_error",
            "URL do frontend não configurada para retorno de checkout.",
            status_code=503,
        )
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"}:
        raise AuthError(
            "billing_provider_error",
            "PUBLIC_APP_BASE_URL inválida para callbacks de checkout.",
            status_code=503,
        )
    if not parsed.netloc:
        raise AuthError(
            "billing_provider_error",
            "PUBLIC_APP_BASE_URL inválida para callbacks de checkout.",
            status_code=503,
        )
    if "@" in parsed.netloc or parsed.username or parsed.password:
        raise AuthError(
            "billing_provider_error",
            "PUBLIC_APP_BASE_URL inválida para callbacks de checkout.",
            status_code=503,
        )
    host = (parsed.hostname or "").lower()
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and host not in local_hosts:
        raise AuthError(
            "billing_provider_error",
            "PUBLIC_APP_BASE_URL deve usar HTTPS fora de ambiente local.",
            status_code=503,
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def build_checkout_callback_urls(*, frontend_url: str | None = None) -> dict[str, str]:
    base = validate_frontend_base_url(frontend_url)
    return {
        "successUrl": f"{base}/app/billing/return/success",
        "cancelUrl": f"{base}/app/billing/return/cancel",
        "expiredUrl": f"{base}/app/billing/return/expired",
    }


def is_allowed_asaas_checkout_link(
    url: str, *, sandbox_mode: bool | None = None
) -> bool:
    parsed = urlparse((url or "").strip())
    if parsed.scheme != "https":
        return False
    if parsed.username or parsed.password or "@" in (parsed.netloc or ""):
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if sandbox_mode is None:
        env = (get_settings().asaas_environment or "sandbox").strip().lower()
        sandbox_mode = env != "production"
    allowed = (
        ASAAS_CHECKOUT_HOSTS_SANDBOX
        if sandbox_mode
        else ASAAS_CHECKOUT_HOSTS_PRODUCTION
    )
    return host in allowed


def clamp_minutes_to_expire(minutes: int) -> int:
    return max(10, min(1440, int(minutes)))


def compute_expires_at(
    *,
    minutes: int,
    now: datetime | None = None,
) -> datetime:
    current = now or datetime.now(UTC)
    return current + timedelta(minutes=clamp_minutes_to_expire(minutes))
