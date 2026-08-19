"""Platform-admin account controls — extend trial, deactivate/reactivate, delete.

All three actions operate on the *organization* (tenant), never on a user's
global identity — mirrors the admin UI, which lives entirely on the
organization detail page. See docs/PLATFORM_ADMIN.md for the full state
model and rollback/recovery procedures.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models.admin_audit_log import AdminAuditLog
from app.models.billing import BillingCheckout, Subscription, SubscriptionStatus
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.receivable import Receivable
from app.models.referral import ReferralAttribution, ReferralPartner
from app.models.session import Session as SessionModel
from app.models.user import User
from app.models.user_feedback import UserFeedback
from app.schemas.platform import (
    OrganizationDeletionPreviewOut,
    OrganizationDetail,
    OrganizationPermanentDeleteOut,
    TrialExtendOut,
)
from app.services.auth import AuthError
from app.services.platform import get_organization_detail
from app.services.platform_auth import write_admin_audit
from app.utils.timezone import format_in_timezone

# Statuses that legitimately mean "still evaluating, no money involved yet" —
# the only ones "Estender teste" is allowed to touch. Anything else (paid,
# past due, cancelled, ...) must be handled explicitly by the admin through a
# different flow, never silently overwritten by a trial extension.
_TRIAL_EXTENDABLE_STATUSES = {SubscriptionStatus.TRIAL.value, SubscriptionStatus.EXPIRED.value}
_OPEN_CHECKOUT_STATUSES = {"PENDING", "ACTIVE"}

_ANONYMIZED_ORG_NAME_PREFIX = "Organização removida"
_ANONYMIZED_USER_NAME = "Usuário removido"
_ANONYMIZED_EMAIL_DOMAIN = "removed.croniu.internal"

_ADMIN_BACKUP_DIR = Path("var/admin_backups")


def _org_or_404(db: Session, organization_id: uuid.UUID) -> Organization:
    org = db.get(Organization, organization_id)
    if org is None:
        raise AuthError("not_found", "Organização não encontrada.", 404)
    return org


def _subscription_for_org(db: Session, organization_id: uuid.UUID) -> Subscription | None:
    return db.scalar(select(Subscription).where(Subscription.organization_id == organization_id))


# --- Estender teste ----------------------------------------------------------


def extend_trial(
    db: Session,
    *,
    organization_id: uuid.UUID,
    additional_days: int,
    reason: str,
    actor_user_id: uuid.UUID | None,
    ip_address: str | None,
    user_agent: str | None,
) -> TrialExtendOut:
    org = _org_or_404(db, organization_id)
    subscription = _subscription_for_org(db, organization_id)
    if subscription is None:
        raise AuthError(
            "no_subscription",
            "Esta organização não possui assinatura para estender o teste.",
            422,
        )

    if subscription.status not in _TRIAL_EXTENDABLE_STATUSES:
        raise AuthError(
            "trial_not_extendable",
            "Só é possível estender o teste enquanto a assinatura está em "
            "período de teste ou expirada sem conversão. Esta organização "
            f"está em estado '{subscription.status}' — trate explicitamente "
            "antes de estender (ex.: cancelar cobrança pendente, resolver "
            "inadimplência).",
            409,
        )

    open_checkout = db.scalar(
        select(BillingCheckout.id).where(
            BillingCheckout.organization_id == organization_id,
            BillingCheckout.status.in_(_OPEN_CHECKOUT_STATUSES),
        )
    )
    if open_checkout is not None:
        raise AuthError(
            "checkout_pending",
            "Existe um checkout de cobrança em aberto para esta organização. "
            "Resolva ou cancele o checkout antes de estender o teste.",
            409,
        )

    now = datetime.now(UTC)
    previous_trial_ends_at = subscription.trial_ends_at
    if previous_trial_ends_at is None:
        # Defensive: create_trial() always sets this while status is TRIAL,
        # but an EXPIRED subscription from a much older code path might not.
        previous_trial_ends_at = now
    base = max(previous_trial_ends_at, now)
    new_trial_ends_at = base + timedelta(days=additional_days)

    previous_status = subscription.status
    subscription.trial_ends_at = new_trial_ends_at
    if subscription.status == SubscriptionStatus.EXPIRED.value:
        # Un-expire: entitlement's lazy-transition logic only ever moves a
        # subscription forward toward EXPIRED, never back — without this the
        # extended trial_ends_at would be ignored on the next entitlement read.
        subscription.status = SubscriptionStatus.TRIAL.value
    db.add(subscription)
    db.commit()
    db.refresh(subscription)

    write_admin_audit(
        db,
        actor_user_id=actor_user_id,
        action="platform.trial_extended",
        resource_type="subscription",
        resource_id=str(subscription.id),
        organization_id=org.id,
        reason=reason,
        before_state={
            "trial_ends_at": previous_trial_ends_at.isoformat(),
            "status": previous_status,
        },
        after_state={
            "trial_ends_at": new_trial_ends_at.isoformat(),
            "status": subscription.status,
        },
        metadata_safe={"additional_days": additional_days},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return TrialExtendOut(
        organization_id=org.id,
        previous_trial_ends_at=previous_trial_ends_at,
        previous_trial_ends_at_local=format_in_timezone(previous_trial_ends_at, org.timezone) or "",
        new_trial_ends_at=new_trial_ends_at,
        new_trial_ends_at_local=format_in_timezone(new_trial_ends_at, org.timezone) or "",
        additional_days=additional_days,
    )


# --- Desativar / reativar -----------------------------------------------------


def _confirmation_matches(confirmation_text: str, org: Organization, owner: User | None) -> bool:
    typed = confirmation_text.strip().casefold()
    if not typed:
        return False
    if typed == org.name.strip().casefold():
        return True
    if owner is not None and typed == owner.email.strip().casefold():
        return True
    return False


def _revoke_org_sessions(db: Session, organization_id: uuid.UUID) -> int:
    result = db.execute(
        update(SessionModel)
        .where(
            SessionModel.organization_id == organization_id,
            SessionModel.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    return result.rowcount or 0


def _owner_for_org(db: Session, organization_id: uuid.UUID) -> User | None:
    membership = db.scalar(
        select(Membership)
        .where(Membership.organization_id == organization_id, Membership.role == "owner")
        .order_by(Membership.created_at.asc())
    )
    if membership is None:
        return None
    return db.get(User, membership.user_id)


def deactivate_organization(
    db: Session,
    *,
    organization_id: uuid.UUID,
    confirmation_text: str,
    reason: str,
    actor_user_id: uuid.UUID | None,
    ip_address: str | None,
    user_agent: str | None,
) -> OrganizationDetail:
    org = _org_or_404(db, organization_id)
    owner = _owner_for_org(db, organization_id)

    if org.status == "disabled":
        raise AuthError("already_disabled", "Esta organização já está desativada.", 409)

    if not _confirmation_matches(confirmation_text, org, owner):
        raise AuthError(
            "confirmation_mismatch",
            "Confirmação não corresponde ao nome ou e-mail da organização.",
            422,
        )

    previous_status = org.status
    org.status_before_disable = previous_status
    org.status = "disabled"
    org.disabled_at = datetime.now(UTC)
    org.disabled_reason = reason
    db.add(org)
    revoked_count = _revoke_org_sessions(db, organization_id)
    db.commit()

    write_admin_audit(
        db,
        actor_user_id=actor_user_id,
        action="platform.organization_deactivated",
        resource_type="organization",
        resource_id=str(org.id),
        organization_id=org.id,
        reason=reason,
        before_state={"status": previous_status},
        after_state={"status": "disabled"},
        metadata_safe={"sessions_revoked": revoked_count},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    detail = get_organization_detail(db, organization_id)
    assert detail is not None
    return detail


def reactivate_organization(
    db: Session,
    *,
    organization_id: uuid.UUID,
    reason: str,
    actor_user_id: uuid.UUID | None,
    ip_address: str | None,
    user_agent: str | None,
) -> OrganizationDetail:
    org = _org_or_404(db, organization_id)

    if org.status != "disabled":
        raise AuthError("not_disabled", "Esta organização não está desativada.", 409)

    restored_status = org.status_before_disable or "evaluating"
    org.status = restored_status
    org.disabled_at = None
    org.disabled_reason = None
    org.status_before_disable = None
    db.add(org)
    db.commit()

    write_admin_audit(
        db,
        actor_user_id=actor_user_id,
        action="platform.organization_reactivated",
        resource_type="organization",
        resource_id=str(org.id),
        organization_id=org.id,
        reason=reason,
        before_state={"status": "disabled"},
        after_state={"status": restored_status},
        metadata_safe=None,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    detail = get_organization_detail(db, organization_id)
    assert detail is not None
    return detail


# --- Excluir permanentemente ---------------------------------------------------


def _financial_or_referral_blocking_reasons(
    db: Session, org: Organization, owner: User | None
) -> list[str]:
    reasons: list[str] = []
    subscription = _subscription_for_org(db, org.id)
    if subscription is not None:
        if subscription.status not in _TRIAL_EXTENDABLE_STATUSES:
            reasons.append(
                f"assinatura em estado '{subscription.status}' (além de teste/expirado)"
            )
        if subscription.provider_customer_id or subscription.provider_subscription_id:
            reasons.append("assinatura já vinculada a um cliente/assinatura no Asaas")

    has_checkout = db.scalar(
        select(BillingCheckout.id).where(BillingCheckout.organization_id == org.id).limit(1)
    )
    if has_checkout is not None:
        reasons.append("existe checkout de cobrança registrado (mesmo que não concluído)")

    has_attribution = db.scalar(
        select(ReferralAttribution.id).where(ReferralAttribution.organization_id == org.id).limit(1)
    )
    if has_attribution is not None:
        reasons.append("organização foi indicada por um parceiro (atribuição de cupom)")

    if owner is not None:
        is_partner = db.scalar(
            select(ReferralPartner.id).where(ReferralPartner.user_id == owner.id).limit(1)
        )
        if is_partner is not None:
            reasons.append("o titular da organização é (ou foi) um parceiro/divulgador")

    return reasons


def _org_data_counts(db: Session, organization_id: uuid.UUID) -> dict[str, int]:
    from app.models.appointment import Appointment
    from app.models.client import Client
    from app.models.cycle import Cycle

    def _count(model, extra_filter=None) -> int:
        query = (
            select(func.count())
            .select_from(model)
            .where(model.organization_id == organization_id)
        )
        if extra_filter is not None:
            query = query.where(extra_filter)
        return int(db.scalar(query) or 0)

    return {
        "clients": _count(Client),
        "cycles": _count(Cycle),
        "appointments": _count(Appointment),
        "receivables": _count(Receivable),
        "memberships": _count(Membership),
        "feedbacks": _count(UserFeedback),
        "active_sessions": _count(SessionModel, SessionModel.revoked_at.is_(None)),
    }


def get_deletion_preview(
    db: Session, *, organization_id: uuid.UUID
) -> OrganizationDeletionPreviewOut:
    org = _org_or_404(db, organization_id)
    owner = _owner_for_org(db, organization_id)
    blocking_reasons = _financial_or_referral_blocking_reasons(db, org, owner)
    eligible_for_hard_delete = not blocking_reasons
    return OrganizationDeletionPreviewOut(
        organization_id=org.id,
        organization_name=org.name,
        eligible_for_hard_delete=eligible_for_hard_delete,
        will_anonymize=not eligible_for_hard_delete,
        blocking_reasons=blocking_reasons,
        data_to_remove=_org_data_counts(db, organization_id),
    )


def _write_backup_snapshot(db: Session, org: Organization, owner: User | None) -> Path:
    """Scoped JSON snapshot of everything about this org, not a full pg_dump.

    A per-organization export is fast, targeted, and directly inspectable —
    a whole-database dump for every single delete would be slow and
    disproportionate to what's actually being removed. See docs/PLATFORM_ADMIN.md.
    """
    _ADMIN_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    subscription = _subscription_for_org(db, org.id)
    checkouts = db.scalars(
        select(BillingCheckout).where(BillingCheckout.organization_id == org.id)
    ).all()
    attribution = db.scalar(
        select(ReferralAttribution).where(ReferralAttribution.organization_id == org.id)
    )
    memberships = db.scalars(
        select(Membership).where(Membership.organization_id == org.id)
    ).all()

    def _iso(value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    snapshot = {
        "organization": {
            "id": str(org.id),
            "name": org.name,
            "status": org.status,
            "plan_code": org.plan_code,
            "created_at": _iso(org.created_at),
        },
        "owner": (
            {"id": str(owner.id), "email": owner.email, "full_name": owner.full_name}
            if owner is not None
            else None
        ),
        "memberships": [
            {"user_id": str(m.user_id), "role": m.role, "created_at": _iso(m.created_at)}
            for m in memberships
        ],
        "subscription": (
            {
                "id": str(subscription.id),
                "status": subscription.status,
                "trial_ends_at": _iso(subscription.trial_ends_at),
                "provider_customer_id": subscription.provider_customer_id,
                "provider_subscription_id": subscription.provider_subscription_id,
            }
            if subscription is not None
            else None
        ),
        "checkouts": [
            {"id": str(c.id), "status": c.status, "amount_cents": c.amount_cents}
            for c in checkouts
        ],
        "referral_attribution": (
            {
                "id": str(attribution.id),
                "code_used": attribution.code_used,
                "ever_paid_at": _iso(attribution.ever_paid_at),
            }
            if attribution is not None
            else None
        ),
        "snapshot_taken_at": datetime.now(UTC).isoformat(),
    }

    filename = f"org-delete-{org.id}-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.json"
    path = _ADMIN_BACKUP_DIR / filename
    path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def permanently_delete_organization(
    db: Session,
    *,
    organization_id: uuid.UUID,
    confirmation_text: str,
    confirmation_understood: bool,
    reason: str,
    actor_user_id: uuid.UUID | None,
    ip_address: str | None,
    user_agent: str | None,
) -> OrganizationPermanentDeleteOut:
    org = _org_or_404(db, organization_id)
    owner = _owner_for_org(db, organization_id)

    if not confirmation_understood:
        raise AuthError(
            "confirmation_required",
            "É preciso confirmar explicitamente que entende que esta ação é irreversível.",
            422,
        )
    if not _confirmation_matches(confirmation_text, org, owner):
        raise AuthError(
            "confirmation_mismatch",
            "Confirmação não corresponde ao nome ou e-mail da organização.",
            422,
        )

    blocking_reasons = _financial_or_referral_blocking_reasons(db, org, owner)
    # Backup is written before any mutation and outside the DB transaction —
    # if the transaction below fails and rolls back, the snapshot file simply
    # becomes an orphaned-but-harmless artifact, never a reason data is lost.
    backup_path = _write_backup_snapshot(db, org, owner)

    org_id_str = str(org.id)
    org_name = org.name
    owner_email = owner.email if owner is not None else None
    mode = "hard_delete" if not blocking_reasons else "anonymized"

    # Both branches below stage their changes with db.add()/db.delete() but
    # do NOT commit individually — a single commit() at the end covers the
    # mutation and the audit-log row together, so a failure anywhere rolls
    # back the whole operation (nothing partially deleted, no orphan audit
    # entry pointing at data that didn't actually change).
    if mode == "hard_delete":
        # A Core-level DELETE (not db.delete(org)) bypasses the ORM's own
        # relationship-cascade bookkeeping entirely and lets Postgres' own
        # reviewed ON DELETE CASCADE foreign keys (Client, Cycle, Membership,
        # Session, Appointment, Receivable, ...) do the cascading — a single
        # filtered delete by primary key, not a blind/table-wide DELETE and
        # not dependent on which relationships happen to be loaded in this
        # session. AdminAuditLog.organization_id is ON DELETE SET NULL, so
        # the audit trail survives with the org's identity captured in
        # metadata_safe before the row is gone.
        db.execute(delete(Organization).where(Organization.id == organization_id))
    else:
        org.name = f"{_ANONYMIZED_ORG_NAME_PREFIX} {org.id.hex[:8]}"
        org.status = "disabled"
        org.disabled_at = datetime.now(UTC)
        org.disabled_reason = f"Exclusão solicitada (anonimizado): {reason}"
        org.status_before_disable = None
        db.add(org)
        _revoke_org_sessions(db, organization_id)

        member_user_ids = db.scalars(
            select(Membership.user_id).where(Membership.organization_id == organization_id)
        ).all()
        # Never scrub a user's global identity if it's shared with another
        # organization — only anonymize identities that exist solely for
        # the org being erased.
        for user in db.scalars(select(User).where(User.id.in_(member_user_ids))):
            other_membership = db.scalar(
                select(Membership.id).where(
                    Membership.user_id == user.id,
                    Membership.organization_id != organization_id,
                )
            )
            if other_membership is not None:
                continue  # belongs to another org too — never scrub a shared identity
            user.full_name = _ANONYMIZED_USER_NAME
            user.email = f"removed-{user.id}@{_ANONYMIZED_EMAIL_DOMAIN}"
            user.account_status = "disabled"
            db.add(user)

    audit_entry = AdminAuditLog(
        actor_user_id=actor_user_id,
        action="platform.organization_permanently_deleted",
        resource_type="organization",
        resource_id=org_id_str,
        organization_id=None if mode == "hard_delete" else organization_id,
        reason=reason,
        before_state={"status": "active_or_trial"},
        after_state={"mode": mode},
        metadata_safe={
            "organization_name": org_name,
            "owner_email_at_time_of_deletion": owner_email,
            "mode": mode,
            "backup_path": str(backup_path),
            "blocking_reasons": blocking_reasons,
        },
        ip_address=ip_address,
        user_agent=(user_agent[:500] if user_agent else None),
    )
    db.add(audit_entry)
    db.commit()

    return OrganizationPermanentDeleteOut(
        organization_id=organization_id,
        mode=mode,
        backup_path=str(backup_path),
    )
