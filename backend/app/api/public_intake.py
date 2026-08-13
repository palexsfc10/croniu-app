"""Public intake (permanent professional link) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas.intake import (
    IntakeSubmitIn,
    IntakeSubmitOut,
    PortalIntakeStatusOut,
    PublicIntakeContextOut,
)
from app.security.rate_limit import public_rate_limiter
from app.services import intake as intake_svc
from app.services.auth import AuthError

router = APIRouter(prefix="/public/intake", tags=["public-intake"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _public_headers(response: JSONResponse) -> JSONResponse:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def _rate_limit(request: Request, token: str) -> None:
    settings = get_settings()
    ip = request.client.host if request.client else "unknown"
    key = f"intake:{ip}:{token[:12]}"
    if not public_rate_limiter.allow(key, limit=settings.public_rate_limit_per_minute):
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": "Muitas tentativas. Tente novamente em instantes.",
            },
        )


@router.get("/{token}", response_model=PublicIntakeContextOut)
def get_intake_context(
    token: str, request: Request, db: Session = Depends(get_db)
) -> JSONResponse:
    _rate_limit(request, token)
    try:
        data = intake_svc.get_public_intake_context(db, raw_token=token)
    except AuthError as exc:
        raise _http(exc) from exc
    return _public_headers(
        JSONResponse(content=PublicIntakeContextOut.model_validate(data).model_dump(mode="json"))
    )


@router.post("/{token}/submit", response_model=IntakeSubmitOut)
def submit_intake(
    token: str,
    payload: IntakeSubmitIn,
    request: Request,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> JSONResponse:
    _rate_limit(request, token)
    key = (payload.idempotency_key or idempotency_key or "").strip()
    body = payload.model_dump(mode="python")
    body.pop("idempotency_key", None)
    try:
        data = intake_svc.submit_intake(
            db,
            raw_token=token,
            payload=body,
            idempotency_key=key,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _public_headers(
        JSONResponse(
            status_code=201,
            content=IntakeSubmitOut.model_validate(data).model_dump(mode="json"),
        )
    )


@router.get("/portal/{portal_token}/status", response_model=PortalIntakeStatusOut)
def portal_status(
    portal_token: str, request: Request, db: Session = Depends(get_db)
) -> JSONResponse:
    _rate_limit(request, portal_token)
    try:
        data = intake_svc.get_portal_intake_status(db, portal_token=portal_token)
    except AuthError as exc:
        raise _http(exc) from exc
    return _public_headers(
        JSONResponse(
            content=PortalIntakeStatusOut.model_validate(data).model_dump(mode="json")
        )
    )
