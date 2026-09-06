"""Contact WhatsApp + marketing consent for the authenticated user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.auth import WhatsAppConsentOut, WhatsAppConsentUpdateIn
from app.services.auth import AuthContext, AuthError, get_current_auth
from app.services.user_contact import update_whatsapp_consent

router = APIRouter(prefix="/users", tags=["users"])


def _out(user) -> WhatsAppConsentOut:
    return WhatsAppConsentOut(
        contact_whatsapp_e164=user.contact_whatsapp_e164,
        whatsapp_marketing_consent_at=user.whatsapp_marketing_consent_at,
    )


@router.get("/me/whatsapp-consent", response_model=WhatsAppConsentOut)
def get_whatsapp_consent(auth: AuthContext = Depends(get_current_auth)) -> WhatsAppConsentOut:
    return _out(auth.user)


@router.patch("/me/whatsapp-consent", response_model=WhatsAppConsentOut)
def update_whatsapp_consent_route(
    payload: WhatsAppConsentUpdateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> WhatsAppConsentOut:
    try:
        user = update_whatsapp_consent(
            auth.user,
            contact_whatsapp_e164=payload.contact_whatsapp_e164 or None,
            clear_number=payload.contact_whatsapp_e164 == "",
            consent_granted=payload.consent_granted,
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}
        ) from exc

    db.add(user)
    db.commit()
    db.refresh(user)
    return _out(user)
