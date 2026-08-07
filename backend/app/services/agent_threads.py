"""Assistant conversation threads — always scoped to organization + user."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.agent import AgentMessage, AgentThread
from app.services.auth import AuthError

DEFAULT_HISTORY_LIMIT = 20
TITLE_MAX_LEN = 80
MAX_THREADS_PER_ORGANIZATION = 5


def _title_from_message(text: str) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= TITLE_MAX_LEN:
        return cleaned or "Nova conversa"
    return cleaned[: TITLE_MAX_LEN - 1].rstrip() + "…"


def _thread_order():
    return (
        AgentThread.updated_at.desc(),
        AgentThread.created_at.desc(),
        AgentThread.id.desc(),
    )


def _find_empty_active_thread(
    db: Session, *, organization_id: uuid.UUID, user_id: uuid.UUID
) -> AgentThread | None:
    """Reuse a persisted empty draft instead of creating duplicates."""
    candidates = list(
        db.scalars(
            select(AgentThread)
            .where(
                AgentThread.organization_id == organization_id,
                AgentThread.user_id == user_id,
                AgentThread.status == "active",
            )
            .order_by(*_thread_order())
        ).all()
    )
    if not candidates:
        return None
    counts = _message_counts_by_thread(db, organization_id=organization_id)
    for thread in candidates:
        if counts.get(thread.id, 0) == 0:
            return thread
    return None


def create_thread(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str | None = None,
) -> AgentThread:
    resolved_title = (title or "Nova conversa").strip()[:200] or "Nova conversa"
    # Idempotency: repeated create-before-first-message reuses the empty draft.
    existing_empty = _find_empty_active_thread(
        db, organization_id=organization_id, user_id=user_id
    )
    if existing_empty is not None:
        existing_empty.title = resolved_title
        existing_empty.updated_at = datetime.now(UTC)
        db.add(existing_empty)
        db.commit()
        db.refresh(existing_empty)
        return existing_empty

    row = AgentThread(
        organization_id=organization_id,
        user_id=user_id,
        title=resolved_title,
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
    limit: int = MAX_THREADS_PER_ORGANIZATION,
) -> list[AgentThread]:
    capped = max(1, min(limit, MAX_THREADS_PER_ORGANIZATION))
    query = select(AgentThread).where(
        AgentThread.organization_id == organization_id,
        AgentThread.user_id == user_id,
    )
    if status:
        query = query.where(AgentThread.status == status)
    query = query.order_by(*_thread_order()).limit(capped)
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
        .order_by(*_thread_order())
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
    # Retention applies when a conversation becomes (or stays) non-empty — never on
    # empty draft creation alone, which would risk deleting a real thread.
    enforce_organization_thread_limit(
        db, organization_id=thread.organization_id, protect_thread_id=thread.id
    )
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


def _message_counts_by_thread(
    db: Session, *, organization_id: uuid.UUID
) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(AgentMessage.thread_id, func.count())
        .where(AgentMessage.organization_id == organization_id)
        .group_by(AgentMessage.thread_id)
    ).all()
    return {thread_id: int(count) for thread_id, count in rows}


def enforce_organization_thread_limit(
    db: Session,
    *,
    organization_id: uuid.UUID,
    protect_thread_id: uuid.UUID | None = None,
) -> dict[str, int]:
    """Keep at most MAX threads per organization. Hard-delete excess (FK CASCADE).

    Empty threads are removed first (except the protected current thread).
    Ordering: updated_at DESC, created_at DESC, id DESC.
    """
    threads = list(
        db.scalars(
            select(AgentThread)
            .where(AgentThread.organization_id == organization_id)
            .order_by(*_thread_order())
        ).all()
    )
    if not threads:
        return {"deleted_empty": 0, "deleted_excess": 0, "remaining": 0}

    counts = _message_counts_by_thread(db, organization_id=organization_id)
    deleted_empty = 0
    survivors: list[AgentThread] = []
    for thread in threads:
        is_protected = protect_thread_id is not None and thread.id == protect_thread_id
        if counts.get(thread.id, 0) == 0 and not is_protected:
            db.delete(thread)
            deleted_empty += 1
        else:
            survivors.append(thread)

    if deleted_empty:
        db.flush()

    keep_ids: set[uuid.UUID] = set()
    if protect_thread_id is not None:
        for thread in survivors:
            if thread.id == protect_thread_id:
                keep_ids.add(thread.id)
                break

    for thread in survivors:
        if len(keep_ids) >= MAX_THREADS_PER_ORGANIZATION:
            break
        keep_ids.add(thread.id)

    deleted_excess = 0
    for thread in survivors:
        if thread.id in keep_ids:
            continue
        db.delete(thread)
        deleted_excess += 1

    db.commit()
    remaining = (
        db.scalar(
            select(func.count())
            .select_from(AgentThread)
            .where(AgentThread.organization_id == organization_id)
        )
        or 0
    )
    return {
        "deleted_empty": deleted_empty,
        "deleted_excess": deleted_excess,
        "remaining": int(remaining),
    }
