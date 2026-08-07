"""Persist and list user feedback (session-scoped create; platform admin list)."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.organization import Organization
from app.models.user import User
from app.models.user_feedback import UserFeedback
from app.schemas.feedback import (
    FeedbackAdminListOut,
    FeedbackAdminOut,
    FeedbackCreateIn,
    FeedbackCreateOut,
    FeedbackStatus,
)
from app.services.auth import AuthError

ALLOWED_TECH_KEYS = {
    "route",
    "app_version",
    "device_kind",
    "viewport",
    "client_mode",
    "client_timestamp",
    "request_id",
}

_SAFE_ROUTE = re.compile(r"^[\w\-./?#=&%]+$")
_SAFE_TOKEN = re.compile(r"^[\w.\-:+/ ]{1,64}$")


def sanitize_technical_context(raw: dict[str, Any] | None) -> dict[str, str] | None:
    if not raw:
        return None
    out: dict[str, str] = {}
    for key in ALLOWED_TECH_KEYS:
        value = raw.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        if key == "route":
            text = text[:200]
            if not _SAFE_ROUTE.match(text) or "://" in text:
                continue
        elif key == "viewport":
            text = text[:40]
            if not re.match(r"^\d{2,5}x\d{2,5}$", text):
                continue
        elif key == "client_mode":
            if text not in {"pwa", "browser"}:
                continue
        elif key == "device_kind":
            if text not in {"mobile", "tablet", "desktop", "unknown"}:
                continue
        else:
            text = text[:64]
            if not _SAFE_TOKEN.match(text):
                continue
        out[key] = text
    return out or None


def create_feedback(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: FeedbackCreateIn,
) -> FeedbackCreateOut:
    tech = None
    if payload.include_technical_context and payload.technical_context is not None:
        tech = sanitize_technical_context(payload.technical_context.model_dump(exclude_none=True))

    row = UserFeedback(
        organization_id=organization_id,
        user_id=user_id,
        category=payload.category,
        subject=payload.subject,
        message=payload.message,
        status="new",
        technical_context=tech,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return FeedbackCreateOut(id=row.id, status=row.status, created_at=row.created_at)  # type: ignore[arg-type]


def _to_admin_out(row: UserFeedback) -> FeedbackAdminOut:
    return FeedbackAdminOut(
        id=row.id,
        organization_id=row.organization_id,
        organization_name=row.organization.name if row.organization else None,
        user_id=row.user_id,
        user_name=row.user.full_name if row.user else None,
        user_email=row.user.email if row.user else None,
        category=row.category,  # type: ignore[arg-type]
        subject=row.subject,
        message=row.message,
        status=row.status,  # type: ignore[arg-type]
        technical_context=row.technical_context,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_feedbacks_admin(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    category: str | None = None,
    status: str | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
) -> FeedbackAdminListOut:
    query = select(UserFeedback).options(
        selectinload(UserFeedback.organization),
        selectinload(UserFeedback.user),
    )
    count_q = select(func.count()).select_from(UserFeedback)
    if category:
        query = query.where(UserFeedback.category == category)
        count_q = count_q.where(UserFeedback.category == category)
    if status:
        query = query.where(UserFeedback.status == status)
        count_q = count_q.where(UserFeedback.status == status)
    if created_from is not None:
        start = datetime.combine(created_from, time.min, tzinfo=ZoneInfo("UTC"))
        query = query.where(UserFeedback.created_at >= start)
        count_q = count_q.where(UserFeedback.created_at >= start)
    if created_to is not None:
        end = datetime.combine(created_to, time.max, tzinfo=ZoneInfo("UTC"))
        query = query.where(UserFeedback.created_at <= end)
        count_q = count_q.where(UserFeedback.created_at <= end)

    total = int(db.scalar(count_q) or 0)
    rows = list(
        db.scalars(
            query.order_by(UserFeedback.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return FeedbackAdminListOut(
        items=[_to_admin_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def update_feedback_status(
    db: Session, *, feedback_id: uuid.UUID, status: FeedbackStatus
) -> FeedbackAdminOut:
    row = db.scalar(
        select(UserFeedback)
        .where(UserFeedback.id == feedback_id)
        .options(selectinload(UserFeedback.organization), selectinload(UserFeedback.user))
    )
    if row is None:
        raise AuthError("not_found", "Feedback não encontrado.", 404)
    row.status = status
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_admin_out(row)
