"""Authenticated feedback submission API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.feedback import FeedbackCreateIn, FeedbackCreateOut
from app.security.rate_limit import public_rate_limiter
from app.services import feedback as feedback_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Per-user soft limits (in-process; sufficient for HML / single-node MVP)
_USER_PER_HOUR = 8
_ORG_PER_HOUR = 40


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.post("", response_model=FeedbackCreateOut, status_code=status.HTTP_201_CREATED)
def submit_feedback(
    payload: FeedbackCreateIn,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> FeedbackCreateOut:
    user_key = f"feedback:user:{auth.user.id}"
    org_key = f"feedback:org:{auth.organization.id}"
    if not public_rate_limiter.allow(user_key, limit=_USER_PER_HOUR, window_seconds=3600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Você enviou vários feedbacks recentemente. Tente novamente mais tarde.",
            },
        )
    if not public_rate_limiter.allow(org_key, limit=_ORG_PER_HOUR, window_seconds=3600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Limite de envios atingido. Tente novamente mais tarde.",
            },
        )
    # Ignore any tenant fields the client may invent
    _ = request
    try:
        return feedback_svc.create_feedback(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            payload=payload,
        )
    except AuthError as exc:
        raise _http(exc) from exc
