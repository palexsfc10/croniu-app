from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ClientEvaluation(Base):
    """Periodic client progress evaluation (draft/published). Private notes never go public."""

    __tablename__ = "client_evaluations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_client_evaluations_status",
        ),
        Index("ix_client_evaluations_org_client_status", "organization_id", "client_id", "status"),
        Index("ix_client_evaluations_published_at", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    evaluated_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    evaluated_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    achievements: Mapped[str | None] = mapped_column(Text, nullable=True)
    attention_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_goals: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    private_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    criteria: Mapped[list[ClientEvaluationCriterion]] = relationship(
        "ClientEvaluationCriterion",
        back_populates="evaluation",
        cascade="all, delete-orphan",
        order_by="ClientEvaluationCriterion.sort_order",
    )


class ClientEvaluationCriterion(Base):
    __tablename__ = "client_evaluation_criteria"
    __table_args__ = (
        CheckConstraint(
            "score IS NULL OR (score >= 1 AND score <= scale_max)",
            name="ck_client_evaluation_criteria_score",
        ),
        CheckConstraint(
            "scale_max >= 2 AND scale_max <= 10",
            name="ck_client_evaluation_criteria_scale",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_evaluations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scale_max: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    evaluation: Mapped[ClientEvaluation] = relationship(
        "ClientEvaluation", back_populates="criteria"
    )
