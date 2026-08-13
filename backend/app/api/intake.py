"""Authenticated APIs for intake links, submissions, and client journey."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.intake import (
    ApproveSubmissionIn,
    EvaluationDecisionIn,
    IntakeLinkOut,
    IntakeSubmissionDetailOut,
    IntakeSubmissionListItem,
    JourneyOut,
    PrepareStartOut,
    ProtocolDecisionIn,
    RejectSubmissionIn,
    RequestChangesIn,
    AnamnesisOut,
    ConsentOut,
)
from app.services import intake as intake_svc
from app.services import journey as journey_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["intake"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _journey_out(row) -> JourneyOut | None:
    if row is None:
        return None
    return JourneyOut(
        id=row.id,
        client_id=row.client_id,
        stage=row.stage,
        stage_label=journey_svc.stage_label(row.stage),
        evaluation_decision=row.evaluation_decision,
        protocol_decision=row.protocol_decision,
        requires_professional_attention=row.requires_professional_attention,
        attention_note=row.attention_note,
        next_action=row.next_action,
        approved_at=row.approved_at,
        rejected_at=row.rejected_at,
        activated_at=row.activated_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _submission_detail(data: dict) -> IntakeSubmissionDetailOut:
    row = data["submission"]
    anam = data.get("anamnesis")
    consents = data.get("consents") or []
    return IntakeSubmissionDetailOut(
        id=row.id,
        client_id=row.client_id,
        status=row.status,
        full_name=row.full_name,
        phone_normalized=row.phone_normalized,
        email=row.email,
        birth_date=row.birth_date,
        primary_goal=row.primary_goal,
        occupation=row.occupation,
        emergency_contact=row.emergency_contact,
        initial_notes=row.initial_notes,
        duplicate_client_id=row.duplicate_client_id,
        duplicate_alert=row.duplicate_alert,
        archived_match=row.archived_match,
        requires_professional_attention=row.requires_professional_attention,
        rejection_internal_reason=row.rejection_internal_reason,
        message_to_client=row.message_to_client,
        submitted_at=row.submitted_at,
        reviewed_at=row.reviewed_at,
        anamnesis=(
            AnamnesisOut(
                id=anam.id,
                template_version_id=anam.template_version_id,
                answers_json=anam.answers_json,
                requires_professional_attention=anam.requires_professional_attention,
                created_at=anam.created_at,
            )
            if anam
            else None
        ),
        consents=[
            ConsentOut(
                consent_key=c.consent_key,
                text_version=c.text_version,
                accepted=c.accepted,
                purpose=c.purpose,
                legal_basis=c.legal_basis,
                accepted_at=c.accepted_at,
            )
            for c in consents
        ],
        journey=_journey_out(data.get("journey")),
    )


@router.get("/intake-link", response_model=IntakeLinkOut)
def get_link(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    return IntakeLinkOut.model_validate(
        intake_svc.get_intake_link(db, organization_id=auth.organization.id)
    )


@router.post("/intake-link", response_model=IntakeLinkOut)
def create_link(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    try:
        data = intake_svc.create_intake_link(
            db, organization_id=auth.organization.id, user_id=auth.user.id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return IntakeLinkOut.model_validate(data)


@router.post("/intake-link/rotate", response_model=IntakeLinkOut)
def rotate_link(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    try:
        data = intake_svc.rotate_intake_link(
            db, organization_id=auth.organization.id, user_id=auth.user.id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return IntakeLinkOut.model_validate(data)


@router.post("/intake-link/disable", response_model=IntakeLinkOut)
def disable_link(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    data = intake_svc.disable_intake_link(db, organization_id=auth.organization.id)
    return IntakeLinkOut.model_validate(data)


@router.get("/intake-submissions", response_model=list[IntakeSubmissionListItem])
def list_submissions(
    status: str | None = Query(default=None),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[IntakeSubmissionListItem]:
    rows = intake_svc.list_submissions(
        db, organization_id=auth.organization.id, status=status
    )
    return [
        IntakeSubmissionListItem(
            id=r.id,
            client_id=r.client_id,
            status=r.status,
            full_name=r.full_name,
            submitted_at=r.submitted_at,
            requires_professional_attention=r.requires_professional_attention,
            duplicate_alert=r.duplicate_alert,
            archived_match=r.archived_match,
            primary_goal=r.primary_goal,
        )
        for r in rows
    ]


@router.get("/intake-submissions/{submission_id}", response_model=IntakeSubmissionDetailOut)
def get_submission(
    submission_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeSubmissionDetailOut:
    try:
        data = intake_svc.get_submission(
            db, organization_id=auth.organization.id, submission_id=submission_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _submission_detail(data)


@router.post(
    "/intake-submissions/{submission_id}/approve",
    response_model=IntakeSubmissionDetailOut,
)
def approve_submission(
    submission_id: UUID,
    payload: ApproveSubmissionIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeSubmissionDetailOut:
    try:
        intake_svc.approve_submission(
            db,
            organization_id=auth.organization.id,
            submission_id=submission_id,
            user_id=auth.user.id,
            message_to_client=payload.message_to_client,
            evaluation_decision=payload.evaluation_decision,
            protocol_decision=payload.protocol_decision,
        )
        data = intake_svc.get_submission(
            db, organization_id=auth.organization.id, submission_id=submission_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _submission_detail(data)


@router.post(
    "/intake-submissions/{submission_id}/request-changes",
    response_model=IntakeSubmissionDetailOut,
)
def request_changes(
    submission_id: UUID,
    payload: RequestChangesIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeSubmissionDetailOut:
    try:
        intake_svc.request_changes_submission(
            db,
            organization_id=auth.organization.id,
            submission_id=submission_id,
            user_id=auth.user.id,
            message_to_client=payload.message_to_client,
        )
        data = intake_svc.get_submission(
            db, organization_id=auth.organization.id, submission_id=submission_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _submission_detail(data)


@router.post(
    "/intake-submissions/{submission_id}/reject",
    response_model=IntakeSubmissionDetailOut,
)
def reject_submission(
    submission_id: UUID,
    payload: RejectSubmissionIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeSubmissionDetailOut:
    try:
        intake_svc.reject_submission(
            db,
            organization_id=auth.organization.id,
            submission_id=submission_id,
            user_id=auth.user.id,
            rejection_internal_reason=payload.rejection_internal_reason,
            message_to_client=payload.message_to_client,
        )
        data = intake_svc.get_submission(
            db, organization_id=auth.organization.id, submission_id=submission_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _submission_detail(data)


@router.get("/clients/{client_id}/journey", response_model=JourneyOut)
def get_client_journey(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> JourneyOut:
    try:
        row = journey_svc.ensure_legacy_active_journey(
            db, organization_id=auth.organization.id, client_id=client_id
        )
        db.commit()
    except AuthError as exc:
        raise _http(exc) from exc
    out = _journey_out(row)
    assert out is not None
    return out


@router.post("/clients/{client_id}/journey/evaluation-decision", response_model=JourneyOut)
def set_evaluation_decision(
    client_id: UUID,
    payload: EvaluationDecisionIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> JourneyOut:
    try:
        row = intake_svc.set_evaluation_decision(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            decision=payload.decision,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    out = _journey_out(row)
    assert out is not None
    return out


@router.post("/clients/{client_id}/journey/protocol-decision", response_model=JourneyOut)
def set_protocol_decision(
    client_id: UUID,
    payload: ProtocolDecisionIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> JourneyOut:
    try:
        row = intake_svc.set_protocol_decision(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            decision=payload.decision,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    out = _journey_out(row)
    assert out is not None
    return out


@router.post("/clients/{client_id}/prepare-start", response_model=PrepareStartOut)
def prepare_start(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> PrepareStartOut:
    try:
        data = intake_svc.prepare_start_checklist(
            db, organization_id=auth.organization.id, client_id=client_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return PrepareStartOut.model_validate(data)
