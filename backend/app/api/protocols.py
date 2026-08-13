"""Authenticated protocol APIs."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.intake import (
    ProtocolCreateIn,
    ProtocolDuplicateIn,
    ProtocolOut,
    ProtocolScheduleIn,
    ProtocolUpdateIn,
    ProtocolVersionOut,
)
from app.services import protocols as protocol_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/protocols", tags=["protocols"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _protocol_out(row) -> ProtocolOut:
    versions = sorted(row.versions or [], key=lambda v: v.version_number)
    return ProtocolOut(
        id=row.id,
        client_id=row.client_id,
        title=row.title,
        protocol_type=row.protocol_type,
        status=row.status,
        is_org_template=row.is_org_template,
        review_due_on=row.review_due_on,
        review_recurrence_days=row.review_recurrence_days,
        review_reason=row.review_reason,
        current_version_number=row.current_version_number,
        created_at=row.created_at,
        updated_at=row.updated_at,
        versions=[
            ProtocolVersionOut(
                id=v.id,
                version_number=v.version_number,
                status=v.status,
                content_json=v.content_json or {},
                private_notes=v.private_notes,
                published_at=v.published_at,
                created_at=v.created_at,
            )
            for v in versions
        ],
    )


@router.get("", response_model=list[ProtocolOut])
def list_protocols(
    client_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ProtocolOut]:
    rows = protocol_svc.list_protocols(
        db,
        organization_id=auth.organization.id,
        client_id=client_id,
        status=status,
    )
    return [
        _protocol_out(
            protocol_svc.get_protocol(
                db, organization_id=auth.organization.id, protocol_id=r.id
            )
        )
        for r in rows
    ]


@router.post("", response_model=ProtocolOut, status_code=201)
def create_protocol(
    payload: ProtocolCreateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    try:
        row = protocol_svc.create_protocol(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            title=payload.title,
            protocol_type=payload.protocol_type,
            client_id=payload.client_id,
            content_json=payload.content_json,
            private_notes=payload.private_notes,
            is_org_template=payload.is_org_template,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)


@router.get("/{protocol_id}", response_model=ProtocolOut)
def get_protocol(
    protocol_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    try:
        row = protocol_svc.get_protocol(
            db, organization_id=auth.organization.id, protocol_id=protocol_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)


@router.patch("/{protocol_id}", response_model=ProtocolOut)
def update_protocol(
    protocol_id: UUID,
    payload: ProtocolUpdateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    try:
        row = protocol_svc.update_protocol_draft(
            db,
            organization_id=auth.organization.id,
            protocol_id=protocol_id,
            title=payload.title,
            content_json=payload.content_json,
            private_notes=payload.private_notes,
            protocol_type=payload.protocol_type,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)


@router.post("/{protocol_id}/publish", response_model=ProtocolOut)
def publish_protocol(
    protocol_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    try:
        row = protocol_svc.publish_protocol(
            db,
            organization_id=auth.organization.id,
            protocol_id=protocol_id,
            user_id=auth.user.id,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)


@router.post("/{protocol_id}/duplicate", response_model=ProtocolOut, status_code=201)
def duplicate_protocol(
    protocol_id: UUID,
    payload: ProtocolDuplicateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    try:
        row = protocol_svc.duplicate_protocol(
            db,
            organization_id=auth.organization.id,
            protocol_id=protocol_id,
            user_id=auth.user.id,
            client_id=payload.client_id,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)


@router.post("/{protocol_id}/schedule-review", response_model=ProtocolOut)
def schedule_review(
    protocol_id: UUID,
    payload: ProtocolScheduleIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    try:
        row = protocol_svc.schedule_review(
            db,
            organization_id=auth.organization.id,
            protocol_id=protocol_id,
            review_due_on=payload.review_due_on,
            review_recurrence_days=payload.review_recurrence_days,
            review_reason=payload.review_reason,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)


@router.get("/{protocol_id}/versions", response_model=list[ProtocolVersionOut])
def list_versions(
    protocol_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[ProtocolVersionOut]:
    try:
        rows = protocol_svc.list_versions(
            db, organization_id=auth.organization.id, protocol_id=protocol_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return [
        ProtocolVersionOut(
            id=v.id,
            version_number=v.version_number,
            status=v.status,
            content_json=v.content_json or {},
            private_notes=v.private_notes,
            published_at=v.published_at,
            created_at=v.created_at,
        )
        for v in rows
    ]
