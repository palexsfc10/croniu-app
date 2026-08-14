from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.models.agent import AgentPendingAction, AgentRun, AgentThread
from app.models.billing import Subscription, SubscriptionStatus
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.platform_membership import PlatformMembership
from app.models.receivable import Receivable
from app.models.intake import OperationalOccurrence, Protocol
from app.models.user import User
from app.models.user_feedback import UserFeedback
from app.schemas.platform import (
    OrganizationDetail,
    OrganizationListItem,
    OverviewMetrics,
    PaginatedOrganizations,
    PaginatedUsers,
    UserListItem,
    days_ago,
    mask_email,
)
from app.services import domain as domain_svc
from app.services.environment_label import normalize_croniu_env
from app.services.profession import PROFESSION_OPTIONS
from app.services.platform_pilot_ops import list_cycle_agenda_integrity

_PROFESSION_LABEL = {item["code"]: item["label"] for item in PROFESSION_OPTIONS}


def _plan_ops_counts(db: Session, organization_id: uuid.UUID) -> tuple[int, int, int]:
    plans = (
        db.scalar(
            select(func.count())
            .select_from(Protocol)
            .where(
                Protocol.organization_id == organization_id,
                Protocol.is_org_template.is_(False),
            )
        )
        or 0
    )
    published = (
        db.scalar(
            select(func.count())
            .select_from(Protocol)
            .where(
                Protocol.organization_id == organization_id,
                Protocol.status == "published",
                Protocol.is_org_template.is_(False),
            )
        )
        or 0
    )
    overdue = (
        db.scalar(
            select(func.count())
            .select_from(OperationalOccurrence)
            .where(
                OperationalOccurrence.organization_id == organization_id,
                OperationalOccurrence.status == "open",
                OperationalOccurrence.due_on < date.today(),
            )
        )
        or 0
    )
    return int(plans), int(published), int(overdue)


def _count_professionals(db: Session) -> int:
    """Distinct active users with at least one organizational membership."""
    return (
        db.scalar(
            select(func.count(func.distinct(Membership.user_id)))
            .select_from(Membership)
            .join(User, User.id == Membership.user_id)
            .where(User.account_status == "active")
        )
        or 0
    )


def _count_professional_registrations_since(db: Session, since: datetime) -> int:
    """Distinct professionals whose first org membership was created at/after ``since`` (UTC).

    Platform-only admins (no org membership) are excluded. Multiple orgs do not duplicate.
    """
    first_membership = (
        select(
            Membership.user_id.label("user_id"),
            func.min(Membership.created_at).label("first_at"),
        )
        .group_by(Membership.user_id)
        .subquery()
    )
    return (
        db.scalar(
            select(func.count())
            .select_from(first_membership)
            .join(User, User.id == first_membership.c.user_id)
            .where(
                User.account_status == "active",
                first_membership.c.first_at >= since,
            )
        )
        or 0
    )


def get_overview_metrics(db: Session) -> OverviewMetrics:
    from app.services import agenda as agenda_svc

    organizations_total = db.scalar(select(func.count()).select_from(Organization)) or 0
    professionals_total = _count_professionals(db)
    since_7d = days_ago(7)
    since_24h = datetime.now(UTC) - timedelta(hours=24)
    registrations_last_7_days = _count_professional_registrations_since(db, since_7d)
    registrations_last_24_hours = _count_professional_registrations_since(db, since_24h)
    organizations_active = (
        db.scalar(
            select(func.count()).select_from(Organization).where(Organization.status == "active")
        )
        or 0
    )
    organizations_evaluating = (
        db.scalar(
            select(func.count())
            .select_from(Organization)
            .where(Organization.status == "evaluating")
        )
        or 0
    )
    organizations_suspended = (
        db.scalar(
            select(func.count()).select_from(Organization).where(Organization.status == "suspended")
        )
        or 0
    )

    trial_ends_soon = datetime.now(UTC) + timedelta(days=3)
    organizations_in_trial = (
        db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(Subscription.status == SubscriptionStatus.TRIAL.value)
        )
        or 0
    )
    trials_ending_soon = (
        db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(
                Subscription.status == SubscriptionStatus.TRIAL.value,
                Subscription.trial_ends_at.is_not(None),
                Subscription.trial_ends_at <= trial_ends_soon,
                Subscription.trial_ends_at >= datetime.now(UTC),
            )
        )
        or 0
    )
    subscriptions_active = (
        db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(Subscription.status == SubscriptionStatus.ACTIVE.value)
        )
        or 0
    )
    subscriptions_past_due_or_expired = (
        db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(
                Subscription.status.in_(
                    (
                        SubscriptionStatus.PAST_DUE.value,
                        SubscriptionStatus.EXPIRED.value,
                        SubscriptionStatus.GRACE_PERIOD.value,
                        SubscriptionStatus.PAYMENT_PENDING.value,
                    )
                )
            )
        )
        or 0
    )
    subscriptions_suspended_or_blocked = (
        db.scalar(
            select(func.count())
            .select_from(Subscription)
            .where(
                Subscription.status.in_(
                    (
                        SubscriptionStatus.SUSPENDED.value,
                        SubscriptionStatus.CANCELLED.value,
                    )
                )
            )
        )
        or 0
    )

    clients_active_total = domain_svc.count_active_clients(db)
    cycles_total = domain_svc.count_cycles(db)
    appointments_scheduled_total = agenda_svc.count_appointments(db)
    receivables_total = db.scalar(select(func.count()).select_from(Receivable)) or 0
    assistant_threads_total = db.scalar(select(func.count()).select_from(AgentThread)) or 0
    ai_proposals_generated = db.scalar(select(func.count()).select_from(AgentPendingAction)) or 0
    ai_proposals_confirmed = (
        db.scalar(
            select(func.count())
            .select_from(AgentPendingAction)
            .where(AgentPendingAction.status == "executed")
        )
        or 0
    )
    ai_failures_recent = (
        db.scalar(
            select(func.count())
            .select_from(AgentRun)
            .where(
                AgentRun.started_at >= since_7d,
                or_(
                    AgentRun.status.in_(("error", "failed")),
                    AgentRun.error_code.is_not(None),
                ),
            )
        )
        or 0
    )
    feedbacks_new = (
        db.scalar(
            select(func.count()).select_from(UserFeedback).where(UserFeedback.status == "new")
        )
        or 0
    )
    errors_recent = ai_failures_recent
    integrity = list_cycle_agenda_integrity(db, page=1, page_size=1)
    summary = integrity.get("summary") or {}

    return OverviewMetrics(
        organizations_total=organizations_total,
        professionals_total=professionals_total,
        registrations_last_24_hours=registrations_last_24_hours,
        registrations_last_7_days=registrations_last_7_days,
        organizations_active=organizations_active,
        organizations_evaluating=organizations_evaluating,
        organizations_suspended=organizations_suspended,
        organizations_in_trial=organizations_in_trial,
        trials_ending_soon=trials_ending_soon,
        subscriptions_active=subscriptions_active,
        subscriptions_past_due_or_expired=subscriptions_past_due_or_expired,
        subscriptions_suspended_or_blocked=subscriptions_suspended_or_blocked,
        clients_active_total=clients_active_total,
        cycles_total=cycles_total,
        appointments_scheduled_total=appointments_scheduled_total,
        receivables_total=receivables_total,
        assistant_threads_total=assistant_threads_total,
        ai_proposals_generated=ai_proposals_generated,
        ai_proposals_confirmed=ai_proposals_confirmed,
        ai_failures_recent=ai_failures_recent,
        feedbacks_new=feedbacks_new,
        errors_recent=errors_recent,
        cycle_agenda_critical=int(summary.get("critical") or 0),
        cycle_agenda_divergent=int(summary.get("divergent") or 0),
        environment=normalize_croniu_env(get_settings().croniu_env),
        generated_at=datetime.now(UTC),
    )


def _owner_for_org(db: Session, organization_id: uuid.UUID) -> User | None:
    membership = db.scalar(
        select(Membership)
        .where(
            Membership.organization_id == organization_id,
            Membership.role == "owner",
        )
        .order_by(Membership.created_at.asc())
    )
    if membership is None:
        return None
    return db.get(User, membership.user_id)


def _subscription_status(db: Session, organization_id: uuid.UUID) -> str | None:
    sub = db.scalar(select(Subscription).where(Subscription.organization_id == organization_id))
    return sub.status if sub else None


def _operational_status(org_status: str, subscription_status: str | None) -> str:
    if org_status == "suspended" or subscription_status in {
        SubscriptionStatus.SUSPENDED.value,
        SubscriptionStatus.CANCELLED.value,
    }:
        return "blocked"
    if subscription_status == SubscriptionStatus.TRIAL.value:
        return "trial"
    if subscription_status == SubscriptionStatus.ACTIVE.value:
        return "active"
    if subscription_status in {
        SubscriptionStatus.PAST_DUE.value,
        SubscriptionStatus.EXPIRED.value,
        SubscriptionStatus.GRACE_PERIOD.value,
    }:
        return "billing_attention"
    return org_status or "unknown"


def list_organizations(
    db: Session,
    *,
    settings: Settings,
    page: int,
    page_size: int,
    search: str | None,
) -> PaginatedOrganizations:
    from app.services import agenda as agenda_svc

    page = max(page, 1)
    page_size = min(max(page_size, 1), settings.platform_list_max_limit)
    query = select(Organization)
    count_query = select(func.count()).select_from(Organization)

    if search and len(search.strip()) >= settings.platform_search_min_chars:
        term = f"%{search.strip().lower()}%"
        owner_ids = (
            select(Membership.organization_id)
            .join(User, User.id == Membership.user_id)
            .where(
                or_(
                    func.lower(User.full_name).like(term),
                    func.lower(User.email).like(term),
                )
            )
        )
        filter_expr = or_(func.lower(Organization.name).like(term), Organization.id.in_(owner_ids))
        query = query.where(filter_expr)
        count_query = count_query.where(filter_expr)

    total = db.scalar(count_query) or 0
    rows = db.scalars(
        query.order_by(Organization.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items: list[OrganizationListItem] = []
    for org in rows:
        owner = _owner_for_org(db, org.id)
        sub_status = _subscription_status(db, org.id)
        threads = (
            db.scalar(
                select(func.count())
                .select_from(AgentThread)
                .where(AgentThread.organization_id == org.id)
            )
            or 0
        )
        items.append(
            OrganizationListItem(
                id=org.id,
                name=org.name,
                status=org.status,
                plan_code=org.plan_code,
                owner_name=owner.full_name if owner else None,
                owner_email_masked=mask_email(owner.email) if owner else None,
                created_at=org.created_at,
                last_activity_at=org.last_activity_at,
                last_login_at=owner.last_login_at if owner else None,
                clients_count=domain_svc.count_active_clients(db, organization_id=org.id),
                cycles_count=domain_svc.count_cycles(db, organization_id=org.id),
                appointments_count=agenda_svc.count_appointments(db, organization_id=org.id),
                assistant_threads_count=int(threads),
                subscription_status=sub_status,
                operational_status=_operational_status(org.status, sub_status),
            )
        )

    return PaginatedOrganizations(items=items, total=total, page=page, page_size=page_size)


def get_organization_detail(db: Session, organization_id: uuid.UUID) -> OrganizationDetail | None:
    from app.services import agenda as agenda_svc

    org = db.get(Organization, organization_id)
    if org is None:
        return None
    owner = _owner_for_org(db, org.id)
    sub_status = _subscription_status(db, org.id)
    threads = (
        db.scalar(
            select(func.count())
            .select_from(AgentThread)
            .where(AgentThread.organization_id == org.id)
        )
        or 0
    )
    plans_count, published_plans, overdue = _plan_ops_counts(db, org.id)
    return OrganizationDetail(
        id=org.id,
        name=org.name,
        status=org.status,
        plan_code=org.plan_code,
        owner_name=owner.full_name if owner else None,
        owner_email_masked=mask_email(owner.email) if owner else None,
        owner_email=None,  # never expose full email in detail by default
        created_at=org.created_at,
        last_activity_at=org.last_activity_at,
        last_login_at=owner.last_login_at if owner else None,
        clients_count=domain_svc.count_active_clients(db, organization_id=org.id),
        cycles_count=domain_svc.count_cycles(db, organization_id=org.id),
        timezone=org.timezone or "America/Sao_Paulo",
        appointments_count=agenda_svc.count_appointments(db, organization_id=org.id),
        assistant_threads_count=int(threads),
        subscription_status=sub_status,
        operational_status=_operational_status(org.status, sub_status),
        profession_label=_PROFESSION_LABEL.get(org.profession_code or "") or None,
        plans_count=plans_count,
        published_plans_count=published_plans,
        overdue_occurrences_count=overdue,
    )


def list_users(
    db: Session,
    *,
    settings: Settings,
    page: int,
    page_size: int,
    search: str | None,
) -> PaginatedUsers:
    page = max(page, 1)
    page_size = min(max(page_size, 1), settings.platform_list_max_limit)
    query = select(User)
    count_query = select(func.count()).select_from(User)

    if search and len(search.strip()) >= settings.platform_search_min_chars:
        term = f"%{search.strip().lower()}%"
        filter_expr = or_(
            func.lower(User.full_name).like(term),
            func.lower(User.email).like(term),
        )
        query = query.where(filter_expr)
        count_query = count_query.where(filter_expr)

    total = db.scalar(count_query) or 0
    users = db.scalars(
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    items: list[UserListItem] = []
    for user in users:
        membership = db.scalar(
            select(Membership)
            .where(Membership.user_id == user.id)
            .options(selectinload(Membership.organization))
            .order_by(Membership.created_at.asc())
        )
        platform_roles = [
            m.role
            for m in db.scalars(
                select(PlatformMembership).where(PlatformMembership.user_id == user.id)
            ).all()
        ]
        items.append(
            UserListItem(
                id=user.id,
                full_name=user.full_name,
                email_masked=mask_email(user.email),
                account_status=user.account_status,
                email_verified=user.email_verified_at is not None,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
                organization_id=membership.organization_id if membership else None,
                organization_name=membership.organization.name if membership else None,
                organization_role=membership.role if membership else None,
                platform_roles=platform_roles,
            )
        )

    return PaginatedUsers(items=items, total=total, page=page, page_size=page_size)
