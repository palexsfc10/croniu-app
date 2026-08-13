"""Organization profession profile and adaptive nomenclature."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.intake import ProfessionOut, ProfessionUpdateIn
from app.services import profession as profession_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["profession"])


def _http(exc: AuthError | ValueError) -> HTTPException:
    if isinstance(exc, AuthError):
        return HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        )
    return HTTPException(
        status_code=422,
        detail={"code": "invalid_profession", "message": str(exc)},
    )


def _out(org) -> ProfessionOut:
    code = org.profession_code
    use_cases = org.use_cases if isinstance(org.use_cases, list) else None
    return ProfessionOut(
        profession_code=code,
        profession_specialty=org.profession_specialty,
        profession_other=org.profession_other,
        use_cases=use_cases,
        profession_onboarding_done=bool(org.profession_onboarding_done),
        recommended_form_kind=profession_svc.recommended_form_kind(code),
        nomenclature=profession_svc.nomenclature_for(code),
        catalog=profession_svc.profession_catalog(),
    )


@router.get("/organization/profession", response_model=ProfessionOut)
def get_profession(
    auth: AuthContext = Depends(get_current_auth),
) -> ProfessionOut:
    return _out(auth.organization)


@router.patch("/organization/profession", response_model=ProfessionOut)
def update_profession(
    payload: ProfessionUpdateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ProfessionOut:
    org = auth.organization
    try:
        cleaned = profession_svc.validate_profession_payload(
            profession_code=payload.profession_code
            if payload.profession_code is not None
            else org.profession_code,
            profession_specialty=payload.profession_specialty
            if payload.profession_specialty is not None
            else org.profession_specialty,
            profession_other=payload.profession_other
            if payload.profession_other is not None
            else org.profession_other,
            use_cases=payload.use_cases
            if payload.use_cases is not None
            else (org.use_cases if isinstance(org.use_cases, list) else None),
        )
    except ValueError as exc:
        raise _http(exc) from exc

    org.profession_code = cleaned["profession_code"]
    org.profession_specialty = cleaned["profession_specialty"]
    org.profession_other = cleaned["profession_other"]
    org.use_cases = cleaned["use_cases"]
    if payload.profession_onboarding_done is not None:
        org.profession_onboarding_done = payload.profession_onboarding_done
    elif cleaned["profession_code"]:
        org.profession_onboarding_done = True
    db.add(org)
    db.commit()
    db.refresh(org)
    return _out(org)
