from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AgentChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=8000)
    # Future voice transcription can populate the same field
    input_modality: str = Field(default="text", pattern="^(text|voice_transcript)$")


class PendingActionOut(BaseModel):
    id: UUID
    thread_id: UUID | None = None
    tool_name: str
    risk_class: str = "write_common"
    summary: str
    summary_fields: dict[str, Any] | None = None
    arguments: dict[str, Any]
    expires_at: datetime | str


class AgentChatOut(BaseModel):
    reply: str
    status: str
    thread_id: UUID | None = None
    pending_action: PendingActionOut | None = None
    tool_trace: list[str] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)


class AgentConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Optional echo of arguments to prevent silent mutation
    arguments: dict[str, Any] | None = None


class AgentLimitsOut(BaseModel):
    user_requests_per_minute: int
    org_daily_request_limit: int
    confirmation_ttl_seconds: int


class AgentStatusOut(BaseModel):
    enabled: bool
    provider: str
    model: str
    prompt_version: str
    max_tool_steps: int
    tools: list[str]
    entitlement_ok: bool = True
    limits: AgentLimitsOut | None = None


class AgentHealthOut(BaseModel):
    status: str
    ai_enabled: bool
    provider: str
    database: bool


class ThreadCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=200)


class ThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None


class ThreadListOut(BaseModel):
    items: list[ThreadOut] = Field(default_factory=list)


class AgentMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    content: str
    message_type: str
    status: str
    created_at: datetime
    metadata_safe: dict[str, Any] | None = None


class ThreadDetailOut(BaseModel):
    thread: ThreadOut
    messages: list[AgentMessageOut] = Field(default_factory=list)


class PendingActionListOut(BaseModel):
    items: list[PendingActionOut] = Field(default_factory=list)
