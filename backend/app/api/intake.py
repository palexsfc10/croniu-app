"""Authenticated APIs for intake links, submissions, and client journey."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.intake import (
    AccompanimentStepIn,
    ApproveSubmissionIn,
    ClientIntakeLinkOut,
    DuplicateCandidateOut,
    EvaluationDecisionIn,
    IntakeLinkCreateIn,
    IntakeLinkOut,
    IntakeSubmissionDetailOut,
    IntakeSubmissionListItem,
    JourneyOut,
    LinkToClientIn,
    PrepareStartOut,
    ProtocolDecisionIn,
    RejectSubmissionIn,
    RequestChangesIn,
    AnamnesisOut,
    AnamnesisQuestionSnapshot,
    ConsentOut,
)
from app.services import accompaniment as accomp_svc
from app.services import intake as intake_svc
from app.services import journey as journey_svc
from app.services import status_labels
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["intake"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _journey_out(row, db: Session | None = None, organization_id=None) -> JourneyOut | None:
    if row is None:
        return None
    resolved = None
    if db is not None and organization_id is not None:
        resolved = accomp_svc.resolve_accompaniment(
            db,
            organization_id=organization_id,
            client_id=row.client_id,
            journey=row,
        )
    # `resolved` is the live, authoritative computation — when present, its
    # next_action is trusted as-is, including None (nothing pending). Only
    # fall back to the persisted row.next_action when no live resolution ran
    # (call sites that don't pass db/organization_id); never let a stale
    # persisted value override a fresh "nothing left to do" signal.
    next_action = resolved["next_action"] if resolved is not None else row.next_action
    return JourneyOut(
        id=row.id,
        client_id=row.client_id,
        stage=row.stage,
        stage_label=journey_svc.stage_label(row.stage),
        evaluation_decision=row.evaluation_decision,
        protocol_decision=row.protocol_decision,
        requires_professional_attention=row.requires_professional_attention,
        attention_note=row.attention_note,
        next_action=next_action,
        next_action_label=status_labels.next_action_label(next_action),
        preparation_status=getattr(row, "preparation_status", None),
        accompaniment_checklist=(resolved["checklist"] if resolved else None)
        or getattr(row, "accompaniment_checklist", None),
        accompaniment_summaries=resolved["summaries"] if resolved else None,
        progress_defined=resolved["progress_defined"] if resolved else None,
        progress_total=resolved["progress_total"] if resolved else None,
        anamnesis_reviewed_at=getattr(row, "anamnesis_reviewed_at", None),
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
                questions_snapshot=[
                    AnamnesisQuestionSnapshot.model_validate(q)
                    for q in (data.get("questions_snapshot") or [])
                ],
                form_name=data.get("form_name"),
                template_version_number=data.get("template_version_number"),
                summary=data.get("anamnesis_summary"),
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


@router.get("/intake-links", response_model=list[IntakeLinkOut])
def list_links(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[IntakeLinkOut]:
    return [
        IntakeLinkOut.model_validate(item)
        for item in intake_svc.list_intake_links(
            db, organization_id=auth.organization.id
        )
    ]


@router.post("/intake-link", response_model=IntakeLinkOut)
def create_link(
    payload: IntakeLinkCreateIn = Body(default_factory=IntakeLinkCreateIn),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    try:
        data = intake_svc.create_intake_link(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            name=payload.name,
            purpose=payload.purpose,
            form_kind=payload.form_kind,
            set_primary=payload.set_primary,
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


@router.post("/intake-links/{link_id}/rotate", response_model=IntakeLinkOut)
def rotate_link_by_id(
    link_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    try:
        data = intake_svc.rotate_intake_link(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            link_id=link_id,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return IntakeLinkOut.model_validate(data)


@router.post("/intake-links/{link_id}/primary", response_model=IntakeLinkOut)
def set_primary_link(
    link_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    try:
        data = intake_svc.set_primary_intake_link(
            db, organization_id=auth.organization.id, link_id=link_id
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


@router.post("/intake-links/{link_id}/disable", response_model=IntakeLinkOut)
def disable_link_by_id(
    link_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeLinkOut:
    data = intake_svc.disable_intake_link(
        db, organization_id=auth.organization.id, link_id=link_id
    )
    return IntakeLinkOut.model_validate(data)


@router.post("/clients/{client_id}/intake-link", response_model=ClientIntakeLinkOut)
def create_client_intake_link(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientIntakeLinkOut:
    try:
        data = intake_svc.create_client_intake_link(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            user_id=auth.user.id,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ClientIntakeLinkOut.model_validate(data)


@router.get("/intake-submissions", response_model=list[IntakeSubmissionListItem])
def list_submissions(
    status: str | None = Query(default=None),
    client_id: UUID | None = Query(default=None),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[IntakeSubmissionListItem]:
    rows = intake_svc.list_submissions(
        db, organization_id=auth.organization.id, status=status, client_id=client_id
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


@router.get(
    "/intake-submissions/{submission_id}/duplicate-candidates",
    response_model=list[DuplicateCandidateOut],
)
def get_duplicate_candidates(
    submission_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[DuplicateCandidateOut]:
    try:
        rows = intake_svc.list_duplicate_candidates(
            db, organization_id=auth.organization.id, submission_id=submission_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return [DuplicateCandidateOut.model_validate(r, from_attributes=True) for r in rows]


@router.post(
    "/intake-submissions/{submission_id}/link-to-client",
    response_model=IntakeSubmissionDetailOut,
)
def link_submission_to_client(
    submission_id: UUID,
    payload: LinkToClientIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> IntakeSubmissionDetailOut:
    try:
        intake_svc.link_submission_to_client(
            db,
            organization_id=auth.organization.id,
            submission_id=submission_id,
            target_client_id=payload.client_id,
        )
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
    out = _journey_out(row, db, auth.organization.id)
    assert out is not None
    return out


@router.patch("/clients/{client_id}/journey/accompaniment-step", response_model=JourneyOut)
def patch_accompaniment_step(
    client_id: UUID,
    payload: AccompanimentStepIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> JourneyOut:
    try:
        row = accomp_svc.apply_step(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            step=payload.step,
            status=payload.status,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    out = _journey_out(row, db, auth.organization.id)
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
    out = _journey_out(row, db, auth.organization.id)
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
    out = _journey_out(row, db, auth.organization.id)
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
