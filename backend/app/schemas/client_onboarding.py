from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class OnboardingBoardItem(BaseModel):
    client_id: uuid.UUID
    client_name: str
    entry_type: str
    stage: str
    stage_label: str
    requires_professional_attention: bool
    attention_note: str | None = None
    days_since_update: int | None = None
    next_action: str | None = None
    next_action_label: str | None = None
    submission_id: uuid.UUID | None = None
    submission_status: str | None = None


class DraftEvaluationOut(BaseModel):
    evaluation_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    title: str
    updated_at: datetime


class OnboardingBoardOut(BaseModel):
    attention: list[OnboardingBoardItem]
    invite_pending: list[OnboardingBoardItem]
    in_progress: list[OnboardingBoardItem]
    completed: list[OnboardingBoardItem]
    draft_evaluations: list[DraftEvaluationOut]
