"""Client evaluations — professional CRUD + public published view."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.client_evaluation import ClientEvaluation, ClientEvaluationCriterion
from app.schemas.evaluations import (
    EvaluationCreate,
    EvaluationCriterionIn,
    EvaluationCriterionOut,
    EvaluationOut,
    EvaluationUpdate,
    PublicEvaluationCriterionOut,
    PublicEvaluationOut,
)
from app.services import domain as domain_svc
from app.services.auth import AuthError


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _criteria_out(rows: list[ClientEvaluationCriterion]) -> list[EvaluationCriterionOut]:
    return [
        EvaluationCriterionOut(
            id=row.id,
            name=row.name,
            score=row.score,
            scale_max=row.scale_max,
            comment=row.comment,
            sort_order=row.sort_order,
        )
        for row in sorted(rows, key=lambda r: r.sort_order)
    ]


def evaluation_to_out(row: ClientEvaluation) -> EvaluationOut:
    return EvaluationOut(
        id=row.id,
        client_id=row.client_id,
        author_user_id=row.author_user_id,
        title=row.title,
        evaluated_from=row.evaluated_from,
        evaluated_to=row.evaluated_to,
        summary=row.summary,
        achievements=row.achievements,
        attention_points=row.attention_points,
        next_goals=row.next_goals,
        client_message=row.client_message,
        private_notes=row.private_notes,
        status=row.status,
        published_at=row.published_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        criteria=_criteria_out(list(row.criteria or [])),
    )


def evaluation_to_public(row: ClientEvaluation) -> PublicEvaluationOut:
    return PublicEvaluationOut(
        title=row.title,
        evaluated_from=row.evaluated_from,
        evaluated_to=row.evaluated_to,
        summary=row.summary,
        achievements=row.achievements,
        attention_points=row.attention_points,
        next_goals=row.next_goals,
        client_message=row.client_message,
        published_at=row.published_at,
        criteria=[
            PublicEvaluationCriterionOut(
                name=c.name,
                score=c.score,
                scale_max=c.scale_max,
                comment=c.comment,
            )
            for c in sorted(row.criteria or [], key=lambda r: r.sort_order)
        ],
    )


def _replace_criteria(
    evaluation: ClientEvaluation, items: list[EvaluationCriterionIn]
) -> None:
    evaluation.criteria.clear()
    for index, item in enumerate(items):
        evaluation.criteria.append(
            ClientEvaluationCriterion(
                name=item.name,
                score=item.score,
                scale_max=item.scale_max,
                comment=_normalize_optional(item.comment),
                sort_order=item.sort_order if item.sort_order else index,
            )
        )


def get_evaluation(
    db: Session, *, organization_id: uuid.UUID, evaluation_id: uuid.UUID
) -> ClientEvaluation:
    row = db.scalar(
        select(ClientEvaluation)
        .where(
            ClientEvaluation.id == evaluation_id,
            ClientEvaluation.organization_id == organization_id,
            ClientEvaluation.status != "archived",
        )
        .options(selectinload(ClientEvaluation.criteria))
    )
    if row is None:
        raise AuthError("not_found", "Avaliação não encontrada.", 404)
    return row


def list_client_evaluations(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> list[ClientEvaluation]:
    domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)
    return list(
        db.scalars(
            select(ClientEvaluation)
            .where(
                ClientEvaluation.organization_id == organization_id,
                ClientEvaluation.client_id == client_id,
                ClientEvaluation.status != "archived",
            )
            .options(selectinload(ClientEvaluation.criteria))
            .order_by(
                ClientEvaluation.published_at.desc().nulls_last(),
                ClientEvaluation.created_at.desc(),
            )
        ).all()
    )


def list_published_for_client(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> list[ClientEvaluation]:
    return list(
        db.scalars(
            select(ClientEvaluation)
            .where(
                ClientEvaluation.organization_id == organization_id,
                ClientEvaluation.client_id == client_id,
                ClientEvaluation.status == "published",
            )
            .options(selectinload(ClientEvaluation.criteria))
            .order_by(ClientEvaluation.published_at.desc(), ClientEvaluation.created_at.desc())
        ).all()
    )


def create_evaluation(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    author_user_id: uuid.UUID,
    payload: EvaluationCreate,
) -> ClientEvaluation:
    domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)
    row = ClientEvaluation(
        organization_id=organization_id,
        client_id=client_id,
        author_user_id=author_user_id,
        title=payload.title,
        evaluated_from=payload.evaluated_from,
        evaluated_to=payload.evaluated_to,
        summary=_normalize_optional(payload.summary),
        achievements=_normalize_optional(payload.achievements),
        attention_points=_normalize_optional(payload.attention_points),
        next_goals=_normalize_optional(payload.next_goals),
        client_message=_normalize_optional(payload.client_message),
        private_notes=_normalize_optional(payload.private_notes),
        status="draft",
    )
    db.add(row)
    db.flush()
    _replace_criteria(row, payload.criteria)
    db.commit()
    return get_evaluation(db, organization_id=organization_id, evaluation_id=row.id)


def update_evaluation(
    db: Session,
    *,
    organization_id: uuid.UUID,
    evaluation_id: uuid.UUID,
    payload: EvaluationUpdate,
) -> ClientEvaluation:
    row = get_evaluation(db, organization_id=organization_id, evaluation_id=evaluation_id)
    data = payload.model_dump(exclude_unset=True)
    criteria = data.pop("criteria", None)
    for key, value in data.items():
        if key in {
            "summary",
            "achievements",
            "attention_points",
            "next_goals",
            "client_message",
            "private_notes",
        }:
            if isinstance(value, str) or value is None:
                setattr(row, key, _normalize_optional(value))
            else:
                setattr(row, key, value)
        else:
            setattr(row, key, value)
    if criteria is not None:
        _replace_criteria(row, [EvaluationCriterionIn.model_validate(c) for c in criteria])
    db.add(row)
    db.commit()
    return get_evaluation(db, organization_id=organization_id, evaluation_id=row.id)


def publish_evaluation(
    db: Session, *, organization_id: uuid.UUID, evaluation_id: uuid.UUID
) -> ClientEvaluation:
    row = get_evaluation(db, organization_id=organization_id, evaluation_id=evaluation_id)
    if row.status == "published":
        return row
    row.status = "published"
    row.published_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    return get_evaluation(db, organization_id=organization_id, evaluation_id=row.id)


def unpublish_evaluation(
    db: Session, *, organization_id: uuid.UUID, evaluation_id: uuid.UUID
) -> ClientEvaluation:
    row = get_evaluation(db, organization_id=organization_id, evaluation_id=evaluation_id)
    if row.status != "published":
        raise AuthError(
            "invalid_status",
            "Somente avaliações publicadas podem voltar a rascunho.",
            422,
        )
    row.status = "draft"
    # keep published_at as historical first-publish marker? Spec says published_at on publish.
    # Returning to draft should clear portal visibility; keep published_at for history or clear.
    # Clear so re-publish sets a fresh timestamp.
    row.published_at = None
    db.add(row)
    db.commit()
    return get_evaluation(db, organization_id=organization_id, evaluation_id=row.id)


def archive_evaluation(
    db: Session, *, organization_id: uuid.UUID, evaluation_id: uuid.UUID
) -> ClientEvaluation:
    row = get_evaluation(db, organization_id=organization_id, evaluation_id=evaluation_id)
    row.status = "archived"
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
