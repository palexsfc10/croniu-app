"""Client journey state machine."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.intake import ClientJourney
from app.services import status_labels
from app.services.auth import AuthError

JOURNEY_LABELS_PT: dict[str, str] = {
    "pending_registration": "Cadastro incompleto",
    "pending_anamnesis": "Anamnese pendente",
    "pending_review": "Aguardando análise",
    "approved": "Cadastro aprovado",
    "evaluation_pending": "Avaliação pendente",
    "protocol_pending": "Protocolo pendente",
    "ready_to_start": "Pronto para iniciar",
    "active": "Em acompanhamento",
    "review_due": "Revisão necessária",
    "paused": "Pausado",
    "rejected": "Cadastro recusado",
    "archived": "Arquivado",
}

VALID_TRANSITIONS: dict[str, set[str]] = {
    "pending_registration": {"pending_anamnesis", "pending_review", "archived"},
    "pending_anamnesis": {"pending_review", "archived"},
    "pending_review": {
        "approved",
        "rejected",
        "pending_anamnesis",
        "archived",
    },
    "approved": {
        "evaluation_pending",
        "protocol_pending",
        "ready_to_start",
        "paused",
        "archived",
    },
    "evaluation_pending": {
        "protocol_pending",
        "ready_to_start",
        "paused",
        "archived",
    },
    "protocol_pending": {"ready_to_start", "paused", "archived"},
    "ready_to_start": {"active", "paused", "archived"},
    "active": {"review_due", "paused", "archived"},
    "review_due": {"active", "protocol_pending", "paused", "archived"},
    "paused": {"active", "archived"},
    "rejected": {"pending_review", "archived"},
    "archived": set(),
}


def stage_label(stage: str) -> str:
    return status_labels.journey_stage_label(stage)


def get_journey(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> ClientJourney | None:
    return db.scalar(
        select(ClientJourney).where(
            ClientJourney.organization_id == organization_id,
            ClientJourney.client_id == client_id,
        )
    )


def ensure_legacy_active_journey(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> ClientJourney:
    """Lazily create journey=active for existing clients opened by the professional."""
    existing = get_journey(db, organization_id=organization_id, client_id=client_id)
    if existing is not None:
        return existing
    client = db.scalar(
        select(Client).where(
            Client.id == client_id, Client.organization_id == organization_id
        )
    )
    if client is None:
        raise AuthError("client_not_found", "Cliente não encontrado.", 404)
    row = ClientJourney(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=client_id,
        stage="active",
        next_action=None,
        activated_at=datetime.now(UTC),
    )
    db.add(row)
    db.flush()
    return row


def create_journey(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    stage: str,
    requires_professional_attention: bool = False,
    next_action: str | None = None,
) -> ClientJourney:
    if stage not in JOURNEY_LABELS_PT:
        raise AuthError("invalid_stage", "Etapa de jornada inválida.", 422)
    existing = get_journey(db, organization_id=organization_id, client_id=client_id)
    if existing is not None:
        raise AuthError(
            "journey_exists",
            "Este cliente já possui uma jornada.",
            409,
        )
    row = ClientJourney(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=client_id,
        stage=stage,
        requires_professional_attention=requires_professional_attention,
        next_action=next_action,
    )
    db.add(row)
    db.flush()
    return row


def transition_journey(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    to_stage: str,
    next_action: str | None = None,
    attention_note: str | None = None,
    requires_professional_attention: bool | None = None,
    evaluation_decision: str | None = None,
    protocol_decision: str | None = None,
) -> ClientJourney:
    if to_stage not in JOURNEY_LABELS_PT:
        raise AuthError("invalid_stage", "Etapa de jornada inválida.", 422)
    journey = get_journey(db, organization_id=organization_id, client_id=client_id)
    if journey is None:
        raise AuthError("journey_not_found", "Jornada do cliente não encontrada.", 404)
    allowed = VALID_TRANSITIONS.get(journey.stage, set())
    if to_stage not in allowed:
        raise AuthError(
            "invalid_transition",
            f"Não é possível alterar de «{stage_label(journey.stage)}» "
            f"para «{stage_label(to_stage)}».",
            422,
        )
    now = datetime.now(UTC)
    journey.stage = to_stage
    if next_action is not None:
        journey.next_action = next_action
    if attention_note is not None:
        journey.attention_note = attention_note
    if requires_professional_attention is not None:
        journey.requires_professional_attention = requires_professional_attention
    if evaluation_decision is not None:
        journey.evaluation_decision = evaluation_decision
    if protocol_decision is not None:
        journey.protocol_decision = protocol_decision
    if to_stage == "approved":
        journey.approved_at = now
        journey.rejected_at = None
    if to_stage == "rejected":
        journey.rejected_at = now
    if to_stage == "active":
        journey.activated_at = now
    db.add(journey)
    db.flush()
    return journey


def compute_stage_after_decisions(
    *,
    evaluation_decision: str | None,
    protocol_decision: str | None,
) -> str:
    """Map professional decisions to the next journey stage after approval."""
    if evaluation_decision == "needed":
        return "evaluation_pending"
    if protocol_decision == "needed":
        return "protocol_pending"
    if evaluation_decision in {"waived", "external", "completed"} and protocol_decision in {
        "waived",
        "published",
    }:
        return "ready_to_start"
    if evaluation_decision in {"waived", "external", "completed"} and protocol_decision is None:
        return "protocol_pending"
    if protocol_decision in {"waived", "published"} and evaluation_decision is None:
        return "evaluation_pending"
    return "approved"
