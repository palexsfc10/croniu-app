"""Authenticated protocol APIs."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.intake import (
    ProtocolCreateIn,
    ProtocolDuplicateIn,
    ProtocolExtendIn,
    ProtocolOut,
    ProtocolScheduleIn,
    ProtocolUpdateIn,
    ProtocolVersionOut,
)
from app.services import plan_cadence as cadence
from app.services import protocols as protocol_svc
from app.services import status_labels
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/protocols", tags=["protocols"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _protocol_out(row) -> ProtocolOut:
    versions = sorted(row.versions or [], key=lambda v: v.version_number)
    start = row.starts_on or row.effective_from
    marks = []
    if start:
        marks = [
            {"kind": m.kind, "due_on": m.due_on.isoformat(), "index": m.index}
            for m in cadence.plan_milestones(
                starts_on=start,
                duration_value=row.duration_value,
                duration_unit=row.duration_unit,
                ends_on=row.ends_on,
                review_interval_days=row.review_recurrence_days,
                feedback_interval_days=row.feedback_interval_days,
            )
        ]
    return ProtocolOut(
        id=row.id,
        client_id=row.client_id,
        title=row.title,
        protocol_type=row.protocol_type,
        status=row.status,
        status_label=status_labels.protocol_status_label(row.status),
        is_org_template=row.is_org_template,
        review_due_on=row.review_due_on,
        review_recurrence_days=row.review_recurrence_days,
        review_reason=row.review_reason,
        cycle_id=getattr(row, "cycle_id", None),
        effective_from=getattr(row, "effective_from", None),
        activation_mode=getattr(row, "activation_mode", None),
        objective=getattr(row, "objective", None),
        duration_value=getattr(row, "duration_value", None),
        duration_unit=getattr(row, "duration_unit", None),
        starts_on=getattr(row, "starts_on", None),
        ends_on=getattr(row, "ends_on", None),
        feedback_interval_days=getattr(row, "feedback_interval_days", None),
        next_feedback_on=getattr(row, "next_feedback_on", None),
        last_review_on=getattr(row, "last_review_on", None),
        last_feedback_on=getattr(row, "last_feedback_on", None),
        current_version_number=row.current_version_number,
        created_at=row.created_at,
        updated_at=row.updated_at,
        versions=[
            ProtocolVersionOut(
                id=v.id,
                version_number=v.version_number,
                status=v.status,
                status_label=status_labels.version_status_label(v.status),
                content_json=v.content_json or {},
                private_notes=v.private_notes,
                published_at=v.published_at,
                created_at=v.created_at,
            )
            for v in versions
        ],
        milestones=marks,
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
            cycle_id=payload.cycle_id,
            effective_from=payload.effective_from,
            activation_mode=payload.activation_mode,
            objective=payload.objective,
            duration_value=payload.duration_value,
            duration_unit=payload.duration_unit,
            starts_on=payload.starts_on,
            ends_on=payload.ends_on,
            review_recurrence_days=payload.review_recurrence_days,
            feedback_interval_days=payload.feedback_interval_days,
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
            **payload.model_dump(
                exclude_unset=True,
                exclude={"title", "content_json", "private_notes", "protocol_type"},
            ),
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
    from app.services import pendencies as pendency_svc

    try:
        pendency_svc.materialize_org(db, organization_id=auth.organization.id)
    except AuthError:
        pass
    return _protocol_out(row)


@router.post("/{protocol_id}/extend", response_model=ProtocolOut)
def extend_protocol(
    protocol_id: UUID,
    payload: ProtocolExtendIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProtocolOut:
    from app.services import pendencies as pendency_svc

    try:
        row = pendency_svc.extend_plan(
            db,
            organization_id=auth.organization.id,
            protocol_id=protocol_id,
            extra_value=payload.extra_value,
            extra_unit=payload.extra_unit,
            note=payload.note,
        )
        row = protocol_svc.get_protocol(
            db, organization_id=auth.organization.id, protocol_id=row.id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _protocol_out(row)
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
            status_label=status_labels.version_status_label(v.status),
            content_json=v.content_json or {},
            private_notes=v.private_notes,
            published_at=v.published_at,
            created_at=v.created_at,
        )
        for v in rows
    ]
