from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.referral import MyReferralOut, ReferralCodeCheckOut
from app.services import referral as referral_svc
from app.services.auth import AuthContext, get_current_auth

router = APIRouter(prefix="/referrals", tags=["referrals"])


@router.get("/validate", response_model=ReferralCodeCheckOut)
def validate_referral_code(
    code: str = Query(min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> ReferralCodeCheckOut:
    check = referral_svc.validate_public_code(db, code)
    return ReferralCodeCheckOut(
        valid=check.valid, code=check.code, discount_percent=check.discount_percent
    )


@router.get("/me", response_model=MyReferralOut)
def my_referral(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MyReferralOut:
    view = referral_svc.get_my_partner_view(db, auth.user.id)
    if view is None:
        return MyReferralOut(enabled=False)
    link = f"{settings.public_app_base_url.rstrip('/')}/register?ref={view['code']}"
    return MyReferralOut(
        enabled=True,
        code=view["code"],
        discount_percent=view["discount_percent"],
        link=link,
    )
