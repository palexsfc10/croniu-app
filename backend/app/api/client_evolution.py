"""Acompanhamentos — read-only, additive. Route path kept stable
(already-delivered contract) even though the underlying signal is
honestly an avaliação-pendente one, not a dedicated accompaniment log —
see `app.services.client_evolution`'s module docstring for the full gate
correction note (2026-09-02) and the naming note on why this isn't called
`accompaniment.py` (already taken by the unrelated onboarding-checklist
module).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import client_evolution as evolution_svc
from app.services.auth import AuthContext, get_current_auth

router = APIRouter(prefix="/accompaniment", tags=["accompaniment"])


@router.get("/pending")
def list_pending(
    days_threshold: int = Query(default=evolution_svc.DEFAULT_DAYS_THRESHOLD, ge=0, le=365),
    limit: int = Query(default=evolution_svc.MAX_RESULTS, ge=1, le=evolution_svc.MAX_RESULTS),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    items = evolution_svc.list_pending(
        db,
        organization_id=auth.organization.id,
        days_threshold=days_threshold,
        limit=limit,
    )
    return {"days_threshold": days_threshold, "items": items}
