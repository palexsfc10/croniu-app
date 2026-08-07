"""Schemas for authenticated user feedback."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

FeedbackCategory = Literal["suggestion", "problem", "question", "praise", "other"]
FeedbackStatus = Literal["new", "reviewing", "resolved", "archived"]


class FeedbackTechnicalContextIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route: str | None = Field(default=None, max_length=200)
    app_version: str | None = Field(default=None, max_length=64)
    device_kind: str | None = Field(default=None, max_length=40)
    viewport: str | None = Field(default=None, max_length=40)
    client_mode: str | None = Field(default=None, max_length=20)  # pwa | browser
    client_timestamp: str | None = Field(default=None, max_length=40)
    request_id: str | None = Field(default=None, max_length=64)


class FeedbackCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: FeedbackCategory
    subject: str | None = Field(default=None, max_length=120)
    message: str = Field(min_length=10, max_length=2000)
    include_technical_context: bool = False
    technical_context: FeedbackTechnicalContextIn | None = None

    @field_validator("subject")
    @classmethod
    def strip_subject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        return value.strip()


class FeedbackCreateOut(BaseModel):
    id: UUID
    status: FeedbackStatus
    created_at: datetime


class FeedbackAdminOut(BaseModel):
    id: UUID
    organization_id: UUID
    organization_name: str | None = None
    user_id: UUID
    user_name: str | None = None
    user_email_masked: str | None = None
    category: FeedbackCategory
    subject: str | None
    message: str
    status: FeedbackStatus
    technical_context: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    status_changed_at: datetime | None = None
    status_changed_by_name: str | None = None


class FeedbackAdminListOut(BaseModel):
    items: list[FeedbackAdminOut]
    total: int
    page: int
    page_size: int


class FeedbackStatusUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: FeedbackStatus
