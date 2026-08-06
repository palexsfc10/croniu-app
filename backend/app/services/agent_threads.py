"""Assistant conversation threads — always scoped to organization + user."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agent import AgentMessage, AgentThread
from app.services.auth import AuthError

DEFAULT_HISTORY_LIMIT = 20
TITLE_MAX_LEN = 80


def _title_from_message(text: str) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= TITLE_MAX_LEN:
        return cleaned or "Nova conversa"
    return cleaned[: TITLE_MAX_LEN - 1].rstrip() + "…"


def create_thread(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str | None = None,
) -> AgentThread:
    row = AgentThread(
        organization_id=organization_id,
        user_id=user_id,
        title=(title or "Nova conversa").strip()[:200] or "Nova conversa",
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_thread(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
) -> AgentThread:
    row = db.scalar(
        select(AgentThread).where(
            AgentThread.id == thread_id,
            AgentThread.organization_id == organization_id,
            AgentThread.user_id == user_id,
        )
    )
    if row is None:
        raise AuthError("not_found", "Conversa não encontrada.", 404)
    return row


def list_threads(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str | None = "active",
    limit: int = 50,
) -> list[AgentThread]:
    query = select(AgentThread).where(
        AgentThread.organization_id == organization_id,
        AgentThread.user_id == user_id,
    )
    if status:
        query = query.where(AgentThread.status == status)
    query = query.order_by(AgentThread.updated_at.desc()).limit(limit)
    return list(db.scalars(query).all())


def get_latest_active_thread(
    db: Session, *, organization_id: uuid.UUID, user_id: uuid.UUID
) -> AgentThread | None:
    return db.scalar(
        select(AgentThread)
        .where(
            AgentThread.organization_id == organization_id,
            AgentThread.user_id == user_id,
            AgentThread.status == "active",
        )
        .order_by(AgentThread.updated_at.desc())
        .limit(1)
    )


def get_or_create_thread(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    thread_id: uuid.UUID | None = None,
    title_hint: str | None = None,
) -> AgentThread:
    if thread_id is not None:
        return get_thread(
            db, organization_id=organization_id, user_id=user_id, thread_id=thread_id
        )
    return create_thread(
        db,
        organization_id=organization_id,
        user_id=user_id,
        title=_title_from_message(title_hint or ""),
    )


def get_or_create_latest_thread(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    title_hint: str | None = None,
) -> AgentThread:
    """Convenience path (`/agent/chat`): reuse the latest active thread or start one."""
    existing = get_latest_active_thread(db, organization_id=organization_id, user_id=user_id)
    if existing is not None:
        return existing
    return create_thread(
        db,
        organization_id=organization_id,
        user_id=user_id,
        title=_title_from_message(title_hint or ""),
    )


def archive_thread(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
) -> AgentThread:
    row = get_thread(
        db, organization_id=organization_id, user_id=user_id, thread_id=thread_id
    )
    if row.status != "archived":
        row.status = "archived"
        row.archived_at = datetime.now(UTC)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def touch_thread(db: Session, thread: AgentThread) -> None:
    thread.updated_at = datetime.now(UTC)
    db.add(thread)
    db.commit()


def append_message(
    db: Session,
    *,
    thread: AgentThread,
    role: str,
    content: str,
    message_type: str = "text",
    status: str = "ok",
    user_id: uuid.UUID | None = None,
    metadata_safe: dict | None = None,
) -> AgentMessage:
    row = AgentMessage(
        thread_id=thread.id,
        organization_id=thread.organization_id,
        user_id=user_id,
        role=role,
        content=content,
        message_type=message_type,
        status=status,
        metadata_safe=metadata_safe,
    )
    db.add(row)
    thread.updated_at = datetime.now(UTC)
    db.add(thread)
    db.commit()
    db.refresh(row)
    return row


def list_recent_messages(
    db: Session, *, thread_id: uuid.UUID, limit: int = DEFAULT_HISTORY_LIMIT
) -> list[AgentMessage]:
    rows = list(
        db.scalars(
            select(AgentMessage)
            .where(AgentMessage.thread_id == thread_id)
            .order_by(AgentMessage.created_at.desc())
            .limit(limit)
        ).all()
    )
    rows.reverse()
    return rows
