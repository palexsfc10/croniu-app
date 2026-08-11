from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EvaluationCriterionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    score: int | None = Field(default=None, ge=1, le=10)
    scale_max: int = Field(default=5, ge=2, le=10)
    comment: str | None = Field(default=None, max_length=2000)
    sort_order: int = Field(default=0, ge=0, le=1000)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Informe o nome do critério.")
        return cleaned

    @model_validator(mode="after")
    def score_within_scale(self) -> EvaluationCriterionIn:
        if self.score is not None and self.score > self.scale_max:
            raise ValueError("A pontuação não pode exceder a escala.")
        return self


class EvaluationCriterionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    score: int | None
    scale_max: int
    comment: str | None
    sort_order: int


class EvaluationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=2, max_length=200)
    evaluated_from: date | None = None
    evaluated_to: date | None = None
    summary: str | None = Field(default=None, max_length=5000)
    achievements: str | None = Field(default=None, max_length=5000)
    attention_points: str | None = Field(default=None, max_length=5000)
    next_goals: str | None = Field(default=None, max_length=5000)
    client_message: str | None = Field(default=None, max_length=5000)
    private_notes: str | None = Field(default=None, max_length=5000)
    criteria: list[EvaluationCriterionIn] = Field(default_factory=list, max_length=20)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Informe um título.")
        return cleaned

    @model_validator(mode="after")
    def validate_period(self) -> EvaluationCreate:
        if (
            self.evaluated_from is not None
            and self.evaluated_to is not None
            and self.evaluated_to < self.evaluated_from
        ):
            raise ValueError("A data final do período deve ser igual ou posterior ao início.")
        return self


class EvaluationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=2, max_length=200)
    evaluated_from: date | None = None
    evaluated_to: date | None = None
    summary: str | None = Field(default=None, max_length=5000)
    achievements: str | None = Field(default=None, max_length=5000)
    attention_points: str | None = Field(default=None, max_length=5000)
    next_goals: str | None = Field(default=None, max_length=5000)
    client_message: str | None = Field(default=None, max_length=5000)
    private_notes: str | None = Field(default=None, max_length=5000)
    criteria: list[EvaluationCriterionIn] | None = Field(default=None, max_length=20)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Informe um título.")
        return cleaned

    @model_validator(mode="after")
    def validate_period(self) -> EvaluationUpdate:
        if (
            self.evaluated_from is not None
            and self.evaluated_to is not None
            and self.evaluated_to < self.evaluated_from
        ):
            raise ValueError("A data final do período deve ser igual ou posterior ao início.")
        return self


class EvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    author_user_id: UUID
    title: str
    evaluated_from: date | None
    evaluated_to: date | None
    summary: str | None
    achievements: str | None
    attention_points: str | None
    next_goals: str | None
    client_message: str | None
    private_notes: str | None
    status: str
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    criteria: list[EvaluationCriterionOut] = Field(default_factory=list)


class PublicEvaluationCriterionOut(BaseModel):
    name: str
    score: int | None = None
    scale_max: int
    comment: str | None = None


class PublicEvaluationOut(BaseModel):
    """Portal-safe evaluation — never includes private_notes."""

    title: str
    evaluated_from: date | None = None
    evaluated_to: date | None = None
    summary: str | None = None
    achievements: str | None = None
    attention_points: str | None = None
    next_goals: str | None = None
    client_message: str | None = None
    published_at: datetime | None = None
    criteria: list[PublicEvaluationCriterionOut] = Field(default_factory=list)
