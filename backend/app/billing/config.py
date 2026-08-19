"""Billing runtime configuration guards (sandbox vs production Asaas)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.billing.asaas_url import normalize_asaas_api_url
from app.config import get_settings
from app.services.auth import AuthError
from app.services.environment_label import normalize_croniu_env

ASAAS_SANDBOX_URL_MARKER = "sandbox.asaas.com"
ASAAS_PROD_URL_MARKER = "api.asaas.com"


@dataclass(frozen=True)
class BillingRuntimeStatus:
    billing_enabled: bool
    asaas_environment: str
    asaas_api_url: str
    asaas_credentials_present: bool
    webhook_token_present: bool
    config_valid: bool
    checkout_globally_enabled: bool
    card_enabled: bool
    sandbox_mode: bool
    allowlist_active: bool
    sandbox_allow_all_active: bool
    issues: tuple[str, ...]

    def to_public_dict(self) -> dict:
        return {
            "billing_enabled": self.billing_enabled,
            "asaas_environment": self.asaas_environment,
            "asaas_api_url": self.asaas_api_url,
            "asaas_credentials_present": self.asaas_credentials_present,
            "webhook_token_present": self.webhook_token_present,
            "config_valid": self.config_valid,
            "checkout_globally_enabled": self.checkout_globally_enabled,
            "card_enabled": self.card_enabled,
            "sandbox_mode": self.sandbox_mode,
            "allowlist_active": self.allowlist_active,
            "sandbox_allow_all_active": self.sandbox_allow_all_active,
            "issues": list(self.issues),
        }


def _parse_allowlist(raw: str) -> set[uuid.UUID]:
    out: set[uuid.UUID] = set()
    for part in (raw or "").split(","):
        token = part.strip()
        if not token:
            continue
        try:
            out.add(uuid.UUID(token))
        except ValueError:
            continue
    return out


def get_sandbox_allowlist() -> set[uuid.UUID]:
    return _parse_allowlist(get_settings().billing_sandbox_allowlist_org_ids)


def validate_asaas_environment_config() -> tuple[bool, list[str]]:
    settings = get_settings()
    issues: list[str] = []
    env = (settings.asaas_environment or "").strip().lower()
    url = normalize_asaas_api_url(
        settings.asaas_api_url or "",
        environment=env,
    ).lower()

    if env not in {"sandbox", "production"}:
        issues.append("asaas_environment_invalid")

    if env == "sandbox" and ASAAS_SANDBOX_URL_MARKER not in url and "api-sandbox.asaas.com" not in url:
        issues.append("sandbox_requires_sandbox_api_url")

    if env == "production" and ASAAS_SANDBOX_URL_MARKER in url:
        issues.append("production_cannot_use_sandbox_api_url")

    if env == "production" and ASAAS_PROD_URL_MARKER not in url:
        issues.append("production_requires_asaas_api_url")

    key = settings.asaas_api_key.strip()
    if env == "sandbox" and key and "prod" in key.lower() and "hmlg" not in key.lower():
        issues.append("sandbox_key_looks_like_production")

    return (len(issues) == 0, issues)


def is_sandbox_allow_all_active(*, sandbox_mode: bool | None = None) -> bool:
    """Explicit, env-gated opt-in — see BILLING_SANDBOX_ALLOW_ALL in app/config.py.

    Fail-closed: requires ALL of — the flag set, CRONIU_ENV normalizing to
    exactly "hml" (never "production"), and Asaas itself in sandbox mode.
    Any one of these being false means the flag has no effect, even if set.
    """
    settings = get_settings()
    if not settings.billing_sandbox_allow_all:
        return False
    env_token = normalize_croniu_env(settings.croniu_env)
    if env_token != "hml":
        return False
    if sandbox_mode is None:
        env = (settings.asaas_environment or "sandbox").strip().lower()
        sandbox_mode = env != "production"
    return bool(sandbox_mode)


def get_billing_runtime_status() -> BillingRuntimeStatus:
    settings = get_settings()
    env = (settings.asaas_environment or "sandbox").strip().lower()
    sandbox_mode = env != "production"
    config_ok, issues = validate_asaas_environment_config()
    creds = bool(settings.asaas_api_key.strip())
    webhook = bool(settings.asaas_webhook_token.strip())
    allowlist = get_sandbox_allowlist()
    allowlist_active = bool(allowlist)

    sandbox_allow_all_active = is_sandbox_allow_all_active(sandbox_mode=sandbox_mode)
    if settings.billing_sandbox_allow_all and not sandbox_allow_all_active:
        # Flag was set but conditions weren't met (wrong env and/or Asaas
        # environment) — never silently grant access; surface it loudly.
        issues = [*issues, "billing_sandbox_allow_all_ignored_outside_hml_sandbox"]

    checkout_global = bool(settings.billing_enabled and settings.billing_checkout_enabled)
    if settings.is_production_like and sandbox_mode:
        if not allowlist_active and not sandbox_allow_all_active:
            checkout_global = False
            if "homologation_requires_allowlist" not in issues:
                issues = [*issues, "homologation_requires_allowlist"]

    if settings.billing_enabled and (not creds or not config_ok):
        checkout_global = False
        if not creds and "asaas_api_key_missing" not in issues:
            issues = [*issues, "asaas_api_key_missing"]

    return BillingRuntimeStatus(
        billing_enabled=bool(settings.billing_enabled),
        asaas_environment=env,
        asaas_api_url=normalize_asaas_api_url(
            settings.asaas_api_url,
            environment=env,
        ),
        asaas_credentials_present=creds,
        webhook_token_present=webhook,
        config_valid=config_ok,
        checkout_globally_enabled=checkout_global,
        card_enabled=bool(settings.billing_card_enabled),
        sandbox_mode=sandbox_mode,
        allowlist_active=allowlist_active,
        sandbox_allow_all_active=sandbox_allow_all_active,
        issues=tuple(issues),
    )


def is_checkout_allowed_for_org(organization_id: uuid.UUID) -> bool:
    settings = get_settings()
    status = get_billing_runtime_status()
    if not status.billing_enabled:
        return False
    if (
        not status.checkout_globally_enabled
        and not status.allowlist_active
        and not status.sandbox_allow_all_active
    ):
        return False
    if not status.asaas_credentials_present or not status.config_valid:
        return False
    if status.sandbox_allow_all_active:
        return True
    allowlist = get_sandbox_allowlist()
    if allowlist:
        return organization_id in allowlist
    if not settings.is_production_like:
        return status.checkout_globally_enabled
    return status.checkout_globally_enabled


def require_checkout_allowed(organization_id: uuid.UUID) -> None:
    status = get_billing_runtime_status()
    if not status.billing_enabled:
        raise AuthError(
            "billing_provider_error",
            "Billing temporariamente indisponível.",
            status_code=503,
        )
    if not is_checkout_allowed_for_org(organization_id):
        raise AuthError(
            "forbidden",
            "Checkout de assinatura não está disponível para esta organização "
            "durante a homologação.",
            status_code=403,
        )
    if not status.asaas_credentials_present:
        raise AuthError(
            "billing_provider_error",
            "Integração de pagamento não configurada.",
            status_code=503,
        )


def require_hosted_card_checkout_allowed(organization_id: uuid.UUID) -> None:
    require_checkout_allowed(organization_id)
    status = get_billing_runtime_status()
    if not status.card_enabled:
        raise AuthError(
            "validation_error",
            "Pagamento com cartão temporariamente indisponível.",
            status_code=422,
        )
