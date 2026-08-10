from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.evaluations import EvaluationCreate, EvaluationOut, EvaluationUpdate
from app.services import evaluations as eval_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["evaluations"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/clients/{client_id}/evaluations", response_model=list[EvaluationOut])
def list_evaluations(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[EvaluationOut]:
    try:
        rows = eval_svc.list_client_evaluations(
            db, organization_id=auth.organization.id, client_id=client_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return [eval_svc.evaluation_to_out(row) for row in rows]


@router.post(
    "/clients/{client_id}/evaluations",
    response_model=EvaluationOut,
    status_code=201,
)
def create_evaluation(
    client_id: UUID,
    payload: EvaluationCreate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    try:
        row = eval_svc.create_evaluation(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            author_user_id=auth.user.id,
            payload=payload,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return eval_svc.evaluation_to_out(row)


@router.get("/evaluations/{evaluation_id}", response_model=EvaluationOut)
def get_evaluation(
    evaluation_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    try:
        row = eval_svc.get_evaluation(
            db, organization_id=auth.organization.id, evaluation_id=evaluation_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return eval_svc.evaluation_to_out(row)


@router.patch("/evaluations/{evaluation_id}", response_model=EvaluationOut)
def update_evaluation(
    evaluation_id: UUID,
    payload: EvaluationUpdate,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    try:
        row = eval_svc.update_evaluation(
            db,
            organization_id=auth.organization.id,
            evaluation_id=evaluation_id,
            payload=payload,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return eval_svc.evaluation_to_out(row)


@router.post("/evaluations/{evaluation_id}/publish", response_model=EvaluationOut)
def publish_evaluation(
    evaluation_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    try:
        row = eval_svc.publish_evaluation(
            db, organization_id=auth.organization.id, evaluation_id=evaluation_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return eval_svc.evaluation_to_out(row)


@router.post("/evaluations/{evaluation_id}/unpublish", response_model=EvaluationOut)
def unpublish_evaluation(
    evaluation_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    try:
        row = eval_svc.unpublish_evaluation(
            db, organization_id=auth.organization.id, evaluation_id=evaluation_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return eval_svc.evaluation_to_out(row)


@router.post("/evaluations/{evaluation_id}/archive", response_model=EvaluationOut)
def archive_evaluation(
    evaluation_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> EvaluationOut:
    try:
        row = eval_svc.archive_evaluation(
            db, organization_id=auth.organization.id, evaluation_id=evaluation_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return eval_svc.evaluation_to_out(row)
