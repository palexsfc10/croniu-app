"""Contact WhatsApp + marketing consent of the person who owns a login.

Distinct from `organization_payment_settings.whatsapp_e164` (renewal
receipts sent to clients) and from any future org-level operational
WhatsApp. Never used for authentication. Collected in the post-login
onboarding wizard, always optional, never touched at registration.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.models.user import User
from app.services.auth import AuthError

# Bump when the consent text shown to the user changes materially, so
# `whatsapp_marketing_consent_version` on old grants stays an honest record
# of what the user actually agreed to.
WHATSAPP_MARKETING_CONSENT_VERSION = "2026-09-03"


def normalize_whatsapp_e164(raw: str | None) -> str | None:
    """Normalize to digits-only international form (e.g. 5511999999999).

    Same validation shape as app.services.my_cycle._normalize_whatsapp_e164 —
    defaults bare 10/11-digit numbers to Brazil (country code 55) while still
    accepting other country codes typed with their own DDI.
    """
    if raw is None or not str(raw).strip():
        return None
    digits = re.sub(r"\D", "", raw.strip())
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) in (10, 11):
        digits = f"55{digits}"
    if not digits.isdigit() or len(digits) < 12 or len(digits) > 15:
        raise AuthError(
            "invalid_whatsapp",
            "Informe o WhatsApp com DDI e DDD (ex.: 5511999999999).",
            422,
        )
    if digits.startswith("55") and len(digits) not in {12, 13}:
        raise AuthError(
            "invalid_whatsapp",
            "WhatsApp brasileiro inválido. Use DDI 55 + DDD + número.",
            422,
        )
    return digits


def update_whatsapp_consent(
    user: User,
    *,
    contact_whatsapp_e164: str | None,
    clear_number: bool,
    consent_granted: bool | None,
) -> User:
    """Apply a partial WhatsApp contact/consent update in-place.

    `contact_whatsapp_e164` is the raw (unnormalized) input; pass
    `clear_number=True` to explicitly wipe the stored number (also revokes
    consent). `consent_granted=True` requires a number to exist by the end of
    this call (just-set or already stored) — consent without a number is
    rejected. `consent_granted=False` revokes consent but keeps the number.
    """
    if clear_number:
        user.contact_whatsapp_e164 = None
        user.whatsapp_marketing_consent_at = None
        user.whatsapp_marketing_consent_version = None
        return user

    if contact_whatsapp_e164 is not None:
        user.contact_whatsapp_e164 = normalize_whatsapp_e164(contact_whatsapp_e164)

    if consent_granted is True:
        if not user.contact_whatsapp_e164:
            raise AuthError(
                "whatsapp_required_for_consent",
                "Informe um WhatsApp antes de autorizar o contato.",
                422,
            )
        user.whatsapp_marketing_consent_at = datetime.now(UTC)
        user.whatsapp_marketing_consent_version = WHATSAPP_MARKETING_CONSENT_VERSION
    elif consent_granted is False:
        user.whatsapp_marketing_consent_at = None
        user.whatsapp_marketing_consent_version = None

    return user
