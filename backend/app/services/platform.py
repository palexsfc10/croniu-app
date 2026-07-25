from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import Settings
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.platform_membership import PlatformMembership
from app.models.user import User
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


def get_overview_metrics(db: Session) -> OverviewMetrics:
    organizations_total = db.scalar(select(func.count()).select_from(Organization)) or 0
    professionals_total = db.scalar(select(func.count()).select_from(User)) or 0
    since = days_ago(7)
    registrations_last_7_days = (
        db.scalar(select(func.count()).select_from(User).where(User.created_at >= since)) or 0
    )
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
    clients_active_total = domain_svc.count_active_clients(db)

    return OverviewMetrics(
        organizations_total=organizations_total,
        professionals_total=professionals_total,
        registrations_last_7_days=registrations_last_7_days,
        organizations_active=organizations_active,
        organizations_evaluating=organizations_evaluating,
        organizations_suspended=organizations_suspended,
        clients_active_total=clients_active_total,
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


def list_organizations(
    db: Session,
    *,
    settings: Settings,
    page: int,
    page_size: int,
    search: str | None,
) -> PaginatedOrganizations:
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
                clients_count=domain_svc.count_active_clients(db, organization_id=org.id),
                cycles_count=domain_svc.count_cycles(db, organization_id=org.id),
            )
        )

    return PaginatedOrganizations(items=items, total=total, page=page, page_size=page_size)


def get_organization_detail(db: Session, organization_id: uuid.UUID) -> OrganizationDetail | None:
    org = db.get(Organization, organization_id)
    if org is None:
        return None
    owner = _owner_for_org(db, org.id)
    return OrganizationDetail(
        id=org.id,
        name=org.name,
        status=org.status,
        plan_code=org.plan_code,
        owner_name=owner.full_name if owner else None,
        owner_email_masked=mask_email(owner.email) if owner else None,
        owner_email=owner.email if owner else None,
        created_at=org.created_at,
        last_activity_at=org.last_activity_at,
        clients_count=domain_svc.count_active_clients(db, organization_id=org.id),
        cycles_count=domain_svc.count_cycles(db, organization_id=org.id),
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
