"""Platform-admin account controls — extend trial, deactivate/reactivate, delete.

See docs/PLATFORM_ADMIN.md for the state model these tests pin down.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.billing.service import ensure_billing_catalog
from app.models.admin_audit_log import AdminAuditLog
from app.models.billing import BillingCheckout, Subscription, SubscriptionStatus
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.platform_membership import PlatformMembership
from app.models.referral import ReferralAttribution, ReferralCampaign, ReferralPartner
from app.models.session import Session as SessionModel
from app.models.user import User
from app.security.passwords import hash_password
from app.services import platform_admin_ops
from sqlalchemy import select

# --- fixtures / helpers ------------------------------------------------------


def _register(client, payload) -> dict:
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


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


def _subscription_for(db, organization_id) -> Subscription:
    sub = db.scalar(select(Subscription).where(Subscription.organization_id == organization_id))
    assert sub is not None
    return sub


def _make_pending_checkout(db, *, organization_id, subscription_id) -> BillingCheckout:
    _, price = ensure_billing_catalog(db)
    checkout = BillingCheckout(
        organization_id=organization_id,
        subscription_id=subscription_id,
        price_id=price.id,
        provider="asaas",
        external_reference=f"test-{uuid.uuid4().hex[:12]}",
        status="PENDING",
        amount_cents=2990,
        currency="BRL",
        billing_type="UNDEFINED",
        charge_type="DETACHED",
    )
    db.add(checkout)
    db.commit()
    return checkout


# --- Estender teste ------------------------------------------------------------


def test_extend_trial_happy_path_stacks_on_current_end(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    sub = _subscription_for(db_session, org_id)
    previous_end = sub.trial_ends_at

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 7, "reason": "Cliente pediu mais tempo para avaliar."},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["additional_days"] == 7
    assert body["new_trial_ends_at"] > body["previous_trial_ends_at"]

    db_session.expire_all()
    sub = _subscription_for(db_session, org_id)
    assert sub.trial_ends_at == previous_end + timedelta(days=7)
    assert sub.status == SubscriptionStatus.TRIAL.value


def test_extend_trial_multiple_times_stacks_each_time(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    original_end = _subscription_for(db_session, org_id).trial_ends_at

    client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 3, "reason": "Primeira extensão de teste."},
    )
    client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 15, "reason": "Segunda extensão de teste."},
    )

    db_session.expire_all()
    sub = _subscription_for(db_session, org_id)
    assert sub.trial_ends_at == original_end + timedelta(days=18)

    audit_rows = db_session.scalars(
        select(AdminAuditLog)
        .where(
            AdminAuditLog.action == "platform.trial_extended",
            AdminAuditLog.organization_id == org_id,
        )
        .order_by(AdminAuditLog.created_at.asc())
    ).all()
    assert len(audit_rows) == 2
    assert audit_rows[0].metadata_safe == {"additional_days": 3}
    assert audit_rows[1].metadata_safe == {"additional_days": 15}


def test_extend_trial_on_already_expired_trial_extends_from_now_and_unexpires(
    client, db_session, register_payload
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    sub = _subscription_for(db_session, org_id)
    sub.trial_ends_at = datetime.now(UTC) - timedelta(days=10)
    sub.status = SubscriptionStatus.EXPIRED.value
    db_session.add(sub)
    db_session.commit()

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 7, "reason": "Reabrindo teste vencido a pedido do cliente."},
    )
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    sub = _subscription_for(db_session, org_id)
    # Extending from "now", not from the long-past expiry — never land in the past.
    assert sub.trial_ends_at > datetime.now(UTC) + timedelta(days=6)
    assert sub.status == SubscriptionStatus.TRIAL.value


def test_extend_trial_respects_organization_timezone_in_response(
    client, db_session, register_payload
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_row = db_session.get(Organization, uuid.UUID(org_id))
    org_row.timezone = "America/Sao_Paulo"
    db_session.add(org_row)
    db_session.commit()

    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 3, "reason": "Checando exibição em fuso horário local."},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # America/Sao_Paulo is always behind UTC — the local-time string's offset
    # must reflect that, proving the value isn't just the raw UTC ISO string.
    local_value = body["new_trial_ends_at_local"]
    assert local_value != body["new_trial_ends_at"]
    assert "-03:00" in local_value or "-02:00" in local_value


@pytest.mark.parametrize(
    "status_value",
    [
        SubscriptionStatus.ACTIVE.value,
        SubscriptionStatus.PAST_DUE.value,
        SubscriptionStatus.GRACE_PERIOD.value,
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.SUSPENDED.value,
    ],
)
def test_extend_trial_blocked_for_non_trial_states(
    client, db_session, register_payload, status_value
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    sub = _subscription_for(db_session, org_id)
    sub.status = status_value
    db_session.add(sub)
    db_session.commit()

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 7, "reason": "Tentativa em estado não elegível."},
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["code"] == "trial_not_extendable"


def test_extend_trial_blocked_by_pending_checkout(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    sub = _subscription_for(db_session, org_id)
    _make_pending_checkout(db_session, organization_id=uuid.UUID(org_id), subscription_id=sub.id)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 7, "reason": "Tentativa com checkout em aberto."},
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["code"] == "checkout_pending"


def test_extend_trial_custom_days_respects_safe_limit(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 91, "reason": "Tentando exceder o limite seguro."},
    )
    assert resp.status_code == 422, resp.text


def test_extend_trial_requires_platform_admin_not_viewer(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    viewer, password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/trial/extend",
        json={"additional_days": 7, "reason": "Viewer tentando estender."},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"


# --- Desativar / reativar ------------------------------------------------------


def test_deactivate_revokes_sessions_blocks_login_and_reactivate_restores(
    client, db_session, register_payload
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    active_sessions_before = db_session.scalars(
        select(SessionModel).where(
            SessionModel.organization_id == uuid.UUID(org_id), SessionModel.revoked_at.is_(None)
        )
    ).all()
    assert len(active_sessions_before) >= 1

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/deactivate",
        json={"confirmation_text": org_name, "reason": "Solicitação de suporte via ticket #123."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "disabled"

    db_session.expire_all()
    remaining_active = db_session.scalars(
        select(SessionModel).where(
            SessionModel.organization_id == uuid.UUID(org_id), SessionModel.revoked_at.is_(None)
        )
    ).all()
    assert remaining_active == []

    login_attempt = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert login_attempt.status_code == 403
    assert login_attempt.json()["code"] == "organization_disabled"

    reactivate = client.post(
        f"/api/v1/platform/organizations/{org_id}/reactivate",
        json={"reason": "Ticket resolvido, cliente confirmou pagamento pendente."},
    )
    assert reactivate.status_code == 200, reactivate.text
    assert reactivate.json()["status"] == "evaluating"

    login_after_reactivate = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert login_after_reactivate.status_code == 200


def test_deactivate_requires_correct_confirmation_text(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/deactivate",
        json={"confirmation_text": "nome errado", "reason": "Teste de confirmação incorreta."},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "confirmation_mismatch"

    db_session.expire_all()
    org_row = db_session.get(Organization, uuid.UUID(org_id))
    assert org_row.status != "disabled"


def test_deactivate_preserves_billing_and_referral_data(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    sub_before = _subscription_for(db_session, org_id)
    sub_id = sub_before.id
    trial_ends_before = sub_before.trial_ends_at

    client.post(
        f"/api/v1/platform/organizations/{org_id}/deactivate",
        json={"confirmation_text": org_name, "reason": "Preservação de dados durante desativação."},
    )

    db_session.expire_all()
    sub_after = db_session.get(Subscription, sub_id)
    assert sub_after is not None
    assert sub_after.trial_ends_at == trial_ends_before
    assert sub_after.status == SubscriptionStatus.TRIAL.value


def test_deactivate_requires_platform_admin_not_viewer(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    viewer, password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/deactivate",
        json={"confirmation_text": org_name, "reason": "Viewer tentando desativar."},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"

    db_session.expire_all()
    org_row = db_session.get(Organization, uuid.UUID(org_id))
    assert org_row.status != "disabled"


def test_reactivate_requires_platform_admin_not_viewer(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    admin, admin_password = _create_platform_user(db_session)
    _login_platform(client, admin.email, admin_password)
    client.post(
        f"/api/v1/platform/organizations/{org_id}/deactivate",
        json={
            "confirmation_text": org_name,
            "reason": "Preparando teste de reativação por viewer.",
        },
    )
    client.post("/api/v1/platform/auth/logout")

    viewer, viewer_password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, viewer_password)
    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/reactivate",
        json={"reason": "Viewer tentando reativar."},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"


def test_reactivate_blocked_when_not_disabled(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/reactivate",
        json={"reason": "Organização nunca foi desativada."},
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "not_disabled"


# --- Exclusão permanente / anonimização ----------------------------------------


def test_deletion_preview_blocked_when_referral_attribution_exists(
    client, db_session, register_payload
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]

    partner_user = User(
        email=f"partner_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Parceiro Teste",
        password_hash=hash_password("SenhaForte1!"),
        account_status="active",
    )
    db_session.add(partner_user)
    db_session.flush()
    partner = ReferralPartner(user_id=partner_user.id, enabled=True)
    db_session.add(partner)
    db_session.flush()
    campaign = ReferralCampaign(
        partner_id=partner.id, code=f"PARC{uuid.uuid4().hex[:6].upper()}", commission_percent=10
    )
    db_session.add(campaign)
    db_session.flush()
    attribution = ReferralAttribution(
        organization_id=uuid.UUID(org_id),
        campaign_id=campaign.id,
        partner_id=partner.id,
        code_used=campaign.code,
        discount_percent_snapshot=10,
        commission_percent_snapshot=10,
        base_amount_cents_snapshot=2990,
        final_amount_cents_snapshot=2691,
    )
    db_session.add(attribution)
    db_session.commit()

    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.get(f"/api/v1/platform/organizations/{org_id}/deletion-preview")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["eligible_for_hard_delete"] is False
    assert body["will_anonymize"] is True
    assert any("indicad" in reason for reason in body["blocking_reasons"])


def test_deletion_preview_requires_platform_admin_not_viewer(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    viewer, password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, password)

    resp = client.get(f"/api/v1/platform/organizations/{org_id}/deletion-preview")
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"


def test_deletion_preview_eligible_for_hard_delete_when_pristine(
    client, db_session, register_payload
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.get(f"/api/v1/platform/organizations/{org_id}/deletion-preview")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["eligible_for_hard_delete"] is True
    assert body["will_anonymize"] is False
    assert body["blocking_reasons"] == []


def test_permanent_delete_pristine_org_hard_deletes(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/permanent-delete",
        json={
            "confirmation_text": org_name,
            "confirmation_understood": True,
            "reason": "Organização de teste sem histórico financeiro.",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["mode"] == "hard_delete"

    db_session.expire_all()
    assert db_session.get(Organization, uuid.UUID(org_id)) is None

    audit = db_session.scalar(
        select(AdminAuditLog).where(
            AdminAuditLog.action == "platform.organization_permanently_deleted",
            AdminAuditLog.resource_id == org_id,
        )
    )
    assert audit is not None
    assert audit.organization_id is None  # FK nulled by ON DELETE SET NULL
    assert audit.metadata_safe["organization_name"] == org_name


def test_permanent_delete_org_with_history_anonymizes_and_preserves_financials(
    client, db_session, register_payload
):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    owner_email = register_payload["email"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    sub = _subscription_for(db_session, org_id)
    sub.status = SubscriptionStatus.ACTIVE.value
    sub.provider_customer_id = "cus_test_123"
    db_session.add(sub)
    db_session.commit()
    sub_id = sub.id

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/permanent-delete",
        json={
            "confirmation_text": org_name,
            "confirmation_understood": True,
            "reason": "Cliente pediu exclusão, mas há assinatura ativa.",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["mode"] == "anonymized"

    db_session.expire_all()
    org_row = db_session.get(Organization, uuid.UUID(org_id))
    assert org_row is not None
    assert org_row.status == "disabled"
    assert org_name not in org_row.name

    sub_after = db_session.get(Subscription, sub_id)
    assert sub_after is not None
    assert sub_after.status == SubscriptionStatus.ACTIVE.value
    assert sub_after.provider_customer_id == "cus_test_123"

    owner_row = db_session.scalar(select(User).where(User.email == owner_email.lower()))
    assert owner_row is None  # anonymized away — email changed


def test_permanent_delete_requires_both_confirmations(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    admin, password = _create_platform_user(db_session)
    _login_platform(client, admin.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/permanent-delete",
        json={
            "confirmation_text": org_name,
            "confirmation_understood": False,
            "reason": "Faltando confirmação explícita.",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "confirmation_required"

    db_session.expire_all()
    assert db_session.get(Organization, uuid.UUID(org_id)) is not None


def test_permanent_delete_requires_platform_admin_not_viewer(client, db_session, register_payload):
    org = _register(client, register_payload)
    org_id = org["organization"]["id"]
    org_name = org["organization"]["name"]
    viewer, password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, password)

    resp = client.post(
        f"/api/v1/platform/organizations/{org_id}/permanent-delete",
        json={
            "confirmation_text": org_name,
            "confirmation_understood": True,
            "reason": "Viewer tentando excluir.",
        },
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"


def test_permanent_delete_rolls_back_completely_on_failure(
    monkeypatch, db_session, register_payload
):
    """Simulate a failure staged between the destructive mutation and the
    final commit — nothing should be persisted (single-commit design)."""
    org_row = Organization(name=register_payload["organization_name"], status="evaluating")
    db_session.add(org_row)
    db_session.flush()
    owner = User(
        email=register_payload["email"],
        full_name="Titular Teste",
        password_hash=hash_password(register_payload["password"]),
        account_status="active",
    )
    db_session.add(owner)
    db_session.flush()
    db_session.add(Membership(user_id=owner.id, organization_id=org_row.id, role="owner"))
    from app.billing.service import BillingService

    BillingService(db_session).create_trial(organization_id=org_row.id)
    db_session.commit()

    original_name = org_row.name

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated failure before commit")

    monkeypatch.setattr(platform_admin_ops, "AdminAuditLog", _boom)

    with pytest.raises(RuntimeError):
        platform_admin_ops.permanently_delete_organization(
            db_session,
            organization_id=org_row.id,
            confirmation_text=original_name,
            confirmation_understood=True,
            reason="Forçando falha para validar rollback.",
            actor_user_id=None,
            ip_address=None,
            user_agent=None,
        )
    db_session.rollback()

    db_session.expire_all()
    org_after = db_session.get(Organization, org_row.id)
    assert org_after is not None
    assert org_after.name == original_name
    assert org_after.status == "evaluating"
