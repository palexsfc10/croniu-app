from __future__ import annotations

import uuid
from decimal import Decimal

from app.models.organization import Organization
from app.models.platform_membership import PlatformMembership
from app.models.referral import ReferralAttribution, ReferralCampaign, ReferralPartner
from app.models.user import User
from app.security.passwords import hash_password
from app.services import referral as referral_svc
from sqlalchemy import select


def _create_platform_user(db, *, role: str = "platform_admin") -> tuple[User, str]:
    password = "AdminSenhaForte1!"
    user = User(
        email=f"platform_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Admin Plataforma",
        password_hash=hash_password(password),
        account_status="active",
    )
    db.add(user)
    db.flush()
    db.add(PlatformMembership(user_id=user.id, role=role))
    db.commit()
    db.refresh(user)
    return user, password


def _login_platform(client, email: str, password: str) -> None:
    resp = client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text


def _register(client, payload) -> dict:
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _make_user(db) -> User:
    user = User(
        email=f"u_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Fixture User",
        password_hash=hash_password("SenhaForte1!"),
        account_status="active",
    )
    db.add(user)
    db.flush()
    return user


def _distinct_payload(base_payload, suffix: str) -> dict:
    payload = dict(base_payload)
    payload["email"] = f"{suffix}_{payload['email']}"
    payload["organization_name"] = f"{payload['organization_name']} {suffix}"
    return payload


# --- Admin: enable / update / disable partner -------------------------------


def test_enable_partner_requires_platform_admin_role(client, db_session, register_payload):
    org_owner = _register(client, register_payload)
    target_user_id = org_owner["user"]["id"]

    viewer, viewer_password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, viewer_password)

    resp = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": target_user_id, "code": "PARCEIRO1", "commission_percent": "10"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"


def test_enable_partner_happy_path_and_counters_zero(client, db_session, register_payload):
    org_owner = _register(client, register_payload)
    target_user_id = org_owner["user"]["id"]

    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": target_user_id, "code": " leila-parceira ", "commission_percent": "15"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["code"] == "LEILA-PARCEIRA"
    assert body["enabled"] is True
    assert body["discount_percent"] == 10
    assert body["signups"] == 0
    assert body["payers"] == 0
    assert body["active"] == 0


def test_reserved_and_invalid_codes_rejected(client, db_session, register_payload):
    org_owner = _register(client, register_payload)
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    reserved = client.post(
        "/api/v1/platform/referrals",
        json={
            "user_id": org_owner["user"]["id"],
            "code": "ADMIN",
            "commission_percent": "10",
        },
    )
    assert reserved.status_code == 422
    assert reserved.json()["code"] == "reserved_code"

    too_short = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": org_owner["user"]["id"], "code": "ab", "commission_percent": "10"},
    )
    assert too_short.status_code == 422


def test_duplicate_code_case_insensitive_rejected(client, db_session, register_payload):
    owner_a = _register(client, register_payload)
    owner_b = _register(client, _distinct_payload(register_payload, "b"))

    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    first = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": owner_a["user"]["id"], "code": "PARCEIRO1", "commission_percent": "10"},
    )
    assert first.status_code == 201

    dup = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": owner_b["user"]["id"], "code": "parceiro1", "commission_percent": "5"},
    )
    assert dup.status_code == 409
    assert dup.json()["code"] == "code_taken"


def test_commission_out_of_range_rejected(client, db_session, register_payload):
    owner = _register(client, register_payload)
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": owner["user"]["id"], "code": "PARCEIRO2", "commission_percent": "150"},
    )
    assert resp.status_code == 422


def test_disable_then_reenable_partner(client, db_session, register_payload):
    owner = _register(client, register_payload)
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    created = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": owner["user"]["id"], "code": "PARCEIRO3", "commission_percent": "10"},
    ).json()
    partner_id = created["partner_id"]

    off = client.patch(f"/api/v1/platform/referrals/{partner_id}/status?enabled=false")
    assert off.status_code == 200
    assert off.json()["enabled"] is False

    check = referral_svc.validate_public_code(db_session, "PARCEIRO3")
    assert check.valid is False

    on = client.patch(f"/api/v1/platform/referrals/{partner_id}/status?enabled=true")
    assert on.status_code == 200
    assert on.json()["enabled"] is True


# --- Public coupon validation + registration attribution --------------------


def _enable_campaign(db_session, client, register_payload, *, code: str, commission="10") -> dict:
    owner = _register(client, register_payload)
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)
    resp = client.post(
        "/api/v1/platform/referrals",
        json={"user_id": owner["user"]["id"], "code": code, "commission_percent": commission},
    )
    assert resp.status_code == 201, resp.text
    client.post("/api/v1/platform/auth/logout")
    return resp.json()


def test_validate_public_code_valid_and_invalid(client, db_session, register_payload):
    _enable_campaign(db_session, client, register_payload, code="VALIDACODE")

    ok = client.get("/api/v1/referrals/validate?code=validacode")
    assert ok.status_code == 200
    assert ok.json() == {"valid": True, "code": "VALIDACODE", "discount_percent": 10}

    bad = client.get("/api/v1/referrals/validate?code=NAOEXISTE")
    assert bad.status_code == 200
    assert bad.json()["valid"] is False
    assert "discount_percent" not in bad.json() or bad.json()["discount_percent"] is None


def test_register_without_coupon_charges_full_price(client, db_session, register_payload):
    payload = _distinct_payload(register_payload, "nocoupon")
    result = _register(client, payload)
    org_id = uuid.UUID(result["organization"]["id"])
    attribution = db_session.scalar(
        select(ReferralAttribution).where(ReferralAttribution.organization_id == org_id)
    )
    assert attribution is None


def test_register_with_valid_coupon_creates_attribution_with_correct_price(
    client, db_session, register_payload
):
    _enable_campaign(db_session, client, register_payload, code="DESCONTO10")

    payload = _distinct_payload(register_payload, "referred")
    payload["referral_code"] = "desconto10"
    result = _register(client, payload)
    org_id = uuid.UUID(result["organization"]["id"])

    attribution = db_session.scalar(
        select(ReferralAttribution).where(ReferralAttribution.organization_id == org_id)
    )
    assert attribution is not None
    assert attribution.code_used == "DESCONTO10"
    assert attribution.discount_percent_snapshot == 10
    assert attribution.base_amount_cents_snapshot == 2990
    assert attribution.final_amount_cents_snapshot == 2691


def test_register_with_invalid_coupon_does_not_block_signup(client, register_payload):
    payload = _distinct_payload(register_payload, "badcoupon")
    payload["referral_code"] = "NAOEXISTE"
    result = _register(client, payload)
    assert result["organization"]["id"]


def test_register_with_inactive_partner_coupon_grants_no_discount(
    client, db_session, register_payload
):
    created = _enable_campaign(db_session, client, register_payload, code="FICAINATIVO")
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)
    client.patch(f"/api/v1/platform/referrals/{created['partner_id']}/status?enabled=false")
    client.post("/api/v1/platform/auth/logout")

    payload = _distinct_payload(register_payload, "afterdisable")
    payload["referral_code"] = "FICAINATIVO"
    result = _register(client, payload)
    org_id = uuid.UUID(result["organization"]["id"])
    attribution = db_session.scalar(
        select(ReferralAttribution).where(ReferralAttribution.organization_id == org_id)
    )
    assert attribution is None


def test_double_registration_same_org_cannot_get_second_attribution(db_session):
    """create_attribution_if_eligible is idempotent per-organization by construction."""
    user = _make_user(db_session)
    partner = ReferralPartner(user_id=user.id, enabled=True)
    db_session.add(partner)
    db_session.flush()
    campaign = ReferralCampaign(
        partner_id=partner.id,
        code="ONCEONLY",
        commission_percent=Decimal("10"),
    )
    db_session.add(campaign)
    db_session.flush()

    org = Organization(name="Org Once")
    db_session.add(org)
    db_session.flush()
    db_session.commit()

    first = referral_svc.create_attribution_if_eligible(
        db_session, organization_id=org.id, raw_code="ONCEONLY"
    )
    db_session.commit()
    assert first is not None

    second = referral_svc.create_attribution_if_eligible(
        db_session, organization_id=org.id, raw_code="ONCEONLY"
    )
    assert second is None


# --- Checkout price: backend is the source of truth -------------------------


def test_checkout_price_cannot_be_manipulated_by_client(client, db_session, register_payload):
    """Even if the client tries to pass an explicit price_id, the referral
    discount is applied purely server-side from the organization's
    attribution — never from client input."""
    from app.billing.service import ensure_billing_catalog

    _enable_campaign(db_session, client, register_payload, code="NOMANIP")
    payload = _distinct_payload(register_payload, "nomanip")
    payload["referral_code"] = "nomanip"
    result = _register(client, payload)
    org_id = uuid.UUID(result["organization"]["id"])

    from app.services.referral import resolve_checkout_amount_cents

    _, price = ensure_billing_catalog(db_session)
    amount, attribution = resolve_checkout_amount_cents(
        db_session, organization_id=org_id, base_amount_cents=price.amount_cents
    )
    assert amount == 2691
    assert attribution is not None


def test_hosted_checkout_charges_discounted_price_for_referred_org(
    client, db_session, register_payload, monkeypatch
):
    """End-to-end: Asaas receives the discounted amount, not the client's request."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock, patch

    from app.config import get_settings

    _enable_campaign(db_session, client, register_payload, code="CHECKOUT10")

    get_settings.cache_clear()
    settings = get_settings()
    monkeypatch.setattr(settings, "asaas_api_key", "test_key_$aact_hmlg_x")
    monkeypatch.setattr(settings, "billing_card_enabled", True)
    monkeypatch.setattr(settings, "billing_checkout_enabled", True)
    monkeypatch.setattr(settings, "billing_enabled", True)
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "asaas_api_url", "https://sandbox.asaas.com/api/v3")

    payload = _distinct_payload(register_payload, "checkoutreferred")
    payload["referral_code"] = "checkout10"
    reg = client.post("/api/v1/auth/register", json=payload)
    assert reg.status_code == 201, reg.text

    remote = SimpleNamespace(
        id="chk_remote_ref",
        link="https://sandbox.asaas.com/checkoutSession/i/ref",
        status="ACTIVE",
        minutes_to_expire=60,
    )
    mock_provider = MagicMock()
    mock_provider.create_customer.return_value = SimpleNamespace(id="cus_ref")
    mock_provider.create_hosted_checkout.return_value = remote
    mock_provider.code = "asaas"

    captured = {}

    def _capture_checkout(**kwargs):
        captured.update(kwargs)
        return remote

    mock_provider.create_hosted_checkout.side_effect = _capture_checkout

    with patch("app.billing.service.build_asaas_provider", return_value=mock_provider):
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "billing_method": "credit_card",
                "customer": {
                    "cpf_cnpj": "52998224725",
                    "phone": "11987654321",
                    "postal_code": "01310100",
                    "address": "Av Paulista",
                    "address_number": "1000",
                    "province": "Bela Vista",
                },
            },
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["amount_cents"] == 2691
    # The value actually sent to Asaas ("value" in BRL, not cents) must match.
    assert captured["value"] == 26.91

    get_settings.cache_clear()


def test_resolve_checkout_amount_without_attribution_is_full_price(db_session):
    from app.billing.service import ensure_billing_catalog

    _, price = ensure_billing_catalog(db_session)
    org = Organization(name="Org Sem Cupom")
    db_session.add(org)
    db_session.commit()

    from app.services.referral import resolve_checkout_amount_cents

    amount, attribution = resolve_checkout_amount_cents(
        db_session, organization_id=org.id, base_amount_cents=price.amount_cents
    )
    assert amount == price.amount_cents == 2990
    assert attribution is None


# --- Webhook counters: pagantes / ativos ------------------------------------


def test_mark_referral_paid_is_idempotent(db_session):
    user = _make_user(db_session)
    partner = ReferralPartner(user_id=user.id, enabled=True)
    db_session.add(partner)
    db_session.flush()
    campaign = ReferralCampaign(
        partner_id=partner.id, code="PAGOU1", commission_percent=Decimal("10")
    )
    db_session.add(campaign)
    db_session.flush()
    org = Organization(name="Org Pagou")
    db_session.add(org)
    db_session.flush()
    attribution = referral_svc.create_attribution_if_eligible(
        db_session, organization_id=org.id, raw_code="PAGOU1"
    )
    db_session.commit()
    assert attribution.ever_paid_at is None

    referral_svc.mark_referral_paid(db_session, org.id)
    db_session.commit()
    db_session.refresh(attribution)
    first_paid_at = attribution.ever_paid_at
    assert first_paid_at is not None

    referral_svc.mark_referral_paid(db_session, org.id)
    db_session.commit()
    db_session.refresh(attribution)
    assert attribution.ever_paid_at == first_paid_at


# --- Divulgador-facing endpoint: no financial data --------------------------


def test_my_referral_hidden_when_not_enabled(client, register_payload):
    _register(client, register_payload)
    resp = client.get("/api/v1/referrals/me")
    assert resp.status_code == 200
    assert resp.json() == {"enabled": False, "code": None, "discount_percent": None, "link": None}


def test_my_referral_shows_code_and_link_no_financials(client, db_session, register_payload):
    owner = _register(client, register_payload)
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)
    client.post(
        "/api/v1/platform/referrals",
        json={"user_id": owner["user"]["id"], "code": "MINHACAMP", "commission_percent": "20"},
    )
    client.post("/api/v1/platform/auth/logout")

    login = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert login.status_code == 200

    resp = client.get("/api/v1/referrals/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["code"] == "MINHACAMP"
    assert body["discount_percent"] == 10
    assert "MINHACAMP" in body["link"]
    assert "commission" not in body
    assert "comissao" not in str(body).lower()


# --- Tenant isolation ---------------------------------------------------


def test_org_owner_cannot_read_platform_referral_endpoints(client, register_payload):
    _register(client, register_payload)
    resp = client.get("/api/v1/platform/referrals")
    assert resp.status_code == 401
