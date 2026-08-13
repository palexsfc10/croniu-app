"""Client protocol CRUD with immutable published versions."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.intake import Protocol, ProtocolVersion
from app.services import domain as domain_svc
from app.services import journey as journey_svc
from app.services.auth import AuthError


def list_protocols(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID | None = None,
    status: str | None = None,
) -> list[Protocol]:
    q = select(Protocol).where(Protocol.organization_id == organization_id)
    if client_id is not None:
        q = q.where(Protocol.client_id == client_id)
    if status:
        q = q.where(Protocol.status == status)
    return list(db.scalars(q.order_by(Protocol.updated_at.desc())).all())


def get_protocol(
    db: Session, *, organization_id: uuid.UUID, protocol_id: uuid.UUID
) -> Protocol:
    row = db.scalar(
        select(Protocol)
        .where(Protocol.id == protocol_id, Protocol.organization_id == organization_id)
        .options(selectinload(Protocol.versions))
    )
    if row is None:
        raise AuthError("protocol_not_found", "Protocolo não encontrado.", 404)
    return row


def create_protocol(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    title: str,
    protocol_type: str = "free",
    client_id: uuid.UUID | None = None,
    content_json: dict[str, Any] | None = None,
    private_notes: str | None = None,
    is_org_template: bool = False,
) -> Protocol:
    title = (title or "").strip()
    if not title:
        raise AuthError("invalid_title", "Informe o título do protocolo.", 422)
    if protocol_type not in {"free", "structured", "phased", "blank", "template"}:
        raise AuthError("invalid_type", "Tipo de protocolo inválido.", 422)
    if client_id is not None:
        domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)

    protocol = Protocol(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=client_id,
        title=title[:200],
        protocol_type=protocol_type,
        status="draft",
        is_org_template=is_org_template,
        current_version_number=0,
        created_by_user_id=user_id,
    )
    db.add(protocol)
    db.flush()
    version = ProtocolVersion(
        id=uuid.uuid4(),
        protocol_id=protocol.id,
        organization_id=organization_id,
        version_number=1,
        status="draft",
        content_json=content_json or {},
        private_notes=private_notes,
        created_by_user_id=user_id,
    )
    db.add(version)
    protocol.current_version_number = 1
    db.add(protocol)
    db.commit()
    db.refresh(protocol)
    return get_protocol(db, organization_id=organization_id, protocol_id=protocol.id)


def _current_draft(protocol: Protocol) -> ProtocolVersion | None:
    drafts = [v for v in protocol.versions if v.status == "draft"]
    if not drafts:
        return None
    return max(drafts, key=lambda v: v.version_number)


def update_protocol_draft(
    db: Session,
    *,
    organization_id: uuid.UUID,
    protocol_id: uuid.UUID,
    title: str | None = None,
    content_json: dict[str, Any] | None = None,
    private_notes: str | None = None,
    protocol_type: str | None = None,
) -> Protocol:
    protocol = get_protocol(
        db, organization_id=organization_id, protocol_id=protocol_id
    )
    if protocol.status in {"archived", "superseded"}:
        raise AuthError(
            "protocol_immutable",
            "Este protocolo não pode ser editado.",
            422,
        )
    if title is not None:
        protocol.title = title.strip()[:200]
    if protocol_type is not None:
        if protocol_type not in {"free", "structured", "phased", "blank", "template"}:
            raise AuthError("invalid_type", "Tipo de protocolo inválido.", 422)
        protocol.protocol_type = protocol_type

    draft = _current_draft(protocol)
    if draft is None:
        next_num = protocol.current_version_number + 1
        draft = ProtocolVersion(
            id=uuid.uuid4(),
            protocol_id=protocol.id,
            organization_id=organization_id,
            version_number=next_num,
            status="draft",
            content_json=content_json or {},
            private_notes=private_notes,
        )
        protocol.current_version_number = next_num
        db.add(draft)
    else:
        if content_json is not None:
            draft.content_json = content_json
        if private_notes is not None:
            draft.private_notes = private_notes
        db.add(draft)

    if protocol.status == "published":
        protocol.status = "draft"
    db.add(protocol)
    db.commit()
    return get_protocol(db, organization_id=organization_id, protocol_id=protocol.id)


def publish_protocol(
    db: Session,
    *,
    organization_id: uuid.UUID,
    protocol_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
) -> Protocol:
    protocol = get_protocol(
        db, organization_id=organization_id, protocol_id=protocol_id
    )
    draft = _current_draft(protocol)
    if draft is None:
        raise AuthError(
            "no_draft",
            "Não há rascunho para publicar.",
            422,
        )
    now = datetime.now(UTC)
    for ver in protocol.versions:
        if ver.status == "published":
            ver.status = "superseded"
            db.add(ver)
    draft.status = "published"
    draft.published_at = now
    if user_id is not None:
        draft.created_by_user_id = user_id
    db.add(draft)
    protocol.status = "published"
    protocol.current_version_number = draft.version_number
    db.add(protocol)

    if protocol.client_id is not None:
        journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=protocol.client_id
        )
        if journey is not None:
            journey.protocol_decision = "published"
            db.add(journey)
            if journey.stage == "protocol_pending":
                try:
                    journey_svc.transition_journey(
                        db,
                        organization_id=organization_id,
                        client_id=protocol.client_id,
                        to_stage="ready_to_start",
                        protocol_decision="published",
                    )
                except AuthError:
                    pass

    db.commit()
    return get_protocol(db, organization_id=organization_id, protocol_id=protocol.id)


def duplicate_protocol(
    db: Session,
    *,
    organization_id: uuid.UUID,
    protocol_id: uuid.UUID,
    user_id: uuid.UUID | None,
    client_id: uuid.UUID | None = None,
) -> Protocol:
    source = get_protocol(
        db, organization_id=organization_id, protocol_id=protocol_id
    )
    published = [
        v for v in source.versions if v.status == "published"
    ]
    content: dict[str, Any] = {}
    notes = None
    if published:
        latest = max(published, key=lambda v: v.version_number)
        content = dict(latest.content_json or {})
        notes = latest.private_notes
    elif source.versions:
        latest = max(source.versions, key=lambda v: v.version_number)
        content = dict(latest.content_json or {})
        notes = latest.private_notes
    return create_protocol(
        db,
        organization_id=organization_id,
        user_id=user_id,
        title=f"Cópia de {source.title}"[:200],
        protocol_type=source.protocol_type,
        client_id=client_id if client_id is not None else source.client_id,
        content_json=content,
        private_notes=notes,
        is_org_template=False,
    )


def schedule_review(
    db: Session,
    *,
    organization_id: uuid.UUID,
    protocol_id: uuid.UUID,
    review_due_on: date | None = None,
    review_recurrence_days: int | None = None,
    review_reason: str | None = None,
) -> Protocol:
    protocol = get_protocol(
        db, organization_id=organization_id, protocol_id=protocol_id
    )
    if review_due_on is not None:
        protocol.review_due_on = review_due_on
    elif review_recurrence_days is not None and review_recurrence_days > 0:
        protocol.review_recurrence_days = review_recurrence_days
        protocol.review_due_on = date.today() + timedelta(days=review_recurrence_days)
    if review_recurrence_days is not None:
        protocol.review_recurrence_days = review_recurrence_days
    if review_reason is not None:
        protocol.review_reason = review_reason
    db.add(protocol)
    db.commit()
    return get_protocol(db, organization_id=organization_id, protocol_id=protocol.id)


def list_versions(
    db: Session, *, organization_id: uuid.UUID, protocol_id: uuid.UUID
) -> list[ProtocolVersion]:
    protocol = get_protocol(
        db, organization_id=organization_id, protocol_id=protocol_id
    )
    return sorted(protocol.versions, key=lambda v: v.version_number)
