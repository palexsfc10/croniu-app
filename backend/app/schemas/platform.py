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
    environment: str


class OverviewMetrics(BaseModel):
    organizations_total: int
    professionals_total: int
    registrations_last_24_hours: int = 0
    registrations_last_7_days: int
    organizations_active: int
    organizations_evaluating: int
    organizations_suspended: int
    organizations_in_trial: int = 0
    trials_ending_soon: int = 0
    subscriptions_active: int = 0
    subscriptions_past_due_or_expired: int = 0
    subscriptions_suspended_or_blocked: int = 0
    clients_active_total: int
    cycles_total: int = 0
    appointments_scheduled_total: int = 0
    receivables_total: int = 0
    assistant_threads_total: int = 0
    ai_proposals_generated: int = 0
    ai_proposals_confirmed: int = 0
    ai_failures_recent: int = 0
    feedbacks_new: int = 0
    errors_recent: int = 0
    cycle_agenda_critical: int = 0
    cycle_agenda_divergent: int = 0
    environment: str
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
    last_login_at: datetime | None = None
    clients_count: int
    cycles_count: int
    appointments_count: int = 0
    assistant_threads_count: int = 0
    subscription_status: str | None = None
    operational_status: str | None = None


class OrganizationDetail(OrganizationListItem):
    owner_email: str | None = None
    timezone: str = "America/Sao_Paulo"
    appointments_count: int = 0
    profession_label: str | None = None
    profession_specialty: str | None = None
    profession_onboarding_done: bool = False
    recommended_form_kind: str | None = None
    use_cases: list[str] | None = None
    plans_count: int = 0
    published_plans_count: int = 0
    overdue_occurrences_count: int = 0
    # Platform-admin account controls (trial extension / deactivation).
    trial_ends_at: datetime | None = None
    trial_ends_at_local: str | None = None
    disabled_at: datetime | None = None
    disabled_at_local: str | None = None
    disabled_reason: str | None = None


TRIAL_EXTENSION_MIN_DAYS = 1
TRIAL_EXTENSION_MAX_DAYS = 90
TRIAL_EXTENSION_QUICK_OPTIONS = (3, 7, 15, 30)


class TrialExtendIn(BaseModel):
    additional_days: int = Field(ge=TRIAL_EXTENSION_MIN_DAYS, le=TRIAL_EXTENSION_MAX_DAYS)
    reason: str = Field(min_length=3, max_length=500)


class TrialExtendOut(BaseModel):
    organization_id: uuid.UUID
    previous_trial_ends_at: datetime
    previous_trial_ends_at_local: str
    new_trial_ends_at: datetime
    new_trial_ends_at_local: str
    additional_days: int


class OrganizationDeactivateIn(BaseModel):
    confirmation_text: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=3, max_length=500)


class OrganizationReactivateIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class OrganizationDeletionPreviewOut(BaseModel):
    organization_id: uuid.UUID
    organization_name: str
    eligible_for_hard_delete: bool
    will_anonymize: bool
    blocking_reasons: list[str]
    data_to_remove: dict[str, int]


class OrganizationPermanentDeleteIn(BaseModel):
    confirmation_text: str = Field(min_length=1, max_length=200)
    confirmation_understood: bool
    reason: str = Field(min_length=3, max_length=500)


class OrganizationPermanentDeleteOut(BaseModel):
    organization_id: uuid.UUID
    mode: str
    backup_path: str


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
