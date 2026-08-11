from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.auth import MessageResponse
from app.schemas.domain import HomeSummaryOut
from app.services import domain as domain_svc
from app.services.auth import AuthContext, get_current_auth

router = APIRouter(tags=["home"])


@router.get("/home/summary", response_model=HomeSummaryOut)
def home_summary(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> HomeSummaryOut:
    return domain_svc.build_home_summary(db, organization_id=auth.organization.id)


@router.get("/ping-auth", response_model=MessageResponse)
def ping_auth(auth: AuthContext = Depends(get_current_auth)) -> MessageResponse:
    return MessageResponse(message=f"Autenticado como {auth.user.email}")
