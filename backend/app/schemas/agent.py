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
    tool_name: str
    summary: str
    arguments: dict[str, Any]
    expires_at: datetime | str


class AgentChatOut(BaseModel):
    reply: str
    status: str
    pending_action: PendingActionOut | None = None
    tool_trace: list[str] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)


class AgentConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Optional echo of arguments to prevent silent mutation
    arguments: dict[str, Any] | None = None


class AgentStatusOut(BaseModel):
    enabled: bool
    provider: str
    model: str
    prompt_version: str
    max_tool_steps: int
    tools: list[str]
