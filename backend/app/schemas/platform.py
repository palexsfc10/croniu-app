from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PlatformLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PlatformMeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str


class OverviewMetrics(BaseModel):
    organizations_total: int
    professionals_total: int
    registrations_last_7_days: int
    organizations_active: int
    organizations_evaluating: int
    organizations_suspended: int
    clients_active_total: int
    generated_at: datetime


class OrganizationListItem(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    plan_code: str
    owner_name: str | None
    owner_email_masked: str | None
    created_at: datetime
    last_activity_at: datetime | None
    clients_count: int
    cycles_count: int


class OrganizationDetail(OrganizationListItem):
    owner_email: str | None = None


class UserListItem(BaseModel):
    id: uuid.UUID
    full_name: str
    email_masked: str
    account_status: str
    email_verified: bool
    created_at: datetime
    last_login_at: datetime | None
    organization_id: uuid.UUID | None
    organization_name: str | None
    organization_role: str | None
    platform_roles: list[str]


class PaginatedOrganizations(BaseModel):
    items: list[OrganizationListItem]
    total: int
    page: int
    page_size: int


class PaginatedUsers(BaseModel):
    items: list[UserListItem]
    total: int
    page: int
    page_size: int


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    visible = local[:1] if local else "*"
    return f"{visible}***@{domain}"


def days_ago(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)
