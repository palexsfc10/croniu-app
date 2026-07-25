from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas.my_cycle import PublicMyCycleOut, PublicPaymentReportOut, PublicRenewalOut
from app.security.rate_limit import public_rate_limiter
from app.services import my_cycle as my_cycle_svc
from app.services.auth import AuthError

router = APIRouter(prefix="/public/my-cycle", tags=["public-my-cycle"])


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
    key = f"{ip}:{token[:12]}"
    if not public_rate_limiter.allow(key, limit=settings.public_rate_limit_per_minute):
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": "Muitas tentativas. Tente novamente em instantes.",
            },
        )


@router.get("/{token}", response_model=PublicMyCycleOut)
def get_my_cycle(token: str, request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    _rate_limit(request, token)
    try:
        data = my_cycle_svc.build_public_view(db, raw_token=token)
    except AuthError as exc:
        raise _http(exc) from exc
    return _public_headers(JSONResponse(content=data.model_dump(mode="json")))


@router.post("/{token}/renewal", response_model=PublicRenewalOut)
def post_renewal(token: str, request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    _rate_limit(request, token)
    try:
        data = my_cycle_svc.request_renewal(db, raw_token=token)
    except AuthError as exc:
        raise _http(exc) from exc
    return _public_headers(JSONResponse(content=data.model_dump(mode="json")))


@router.post("/{token}/payment-report", response_model=PublicPaymentReportOut)
async def post_payment_report(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
    method_note: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    proof: UploadFile | None = File(default=None),
) -> JSONResponse:
    _rate_limit(request, token)
    proof_bytes = None
    content_type = None
    if proof is not None and proof.filename:
        content_type = proof.content_type
        proof_bytes = await proof.read()
    try:
        data = my_cycle_svc.report_payment(
            db,
            raw_token=token,
            method_note=method_note,
            notes=notes,
            proof_bytes=proof_bytes,
            proof_content_type=content_type,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _public_headers(JSONResponse(content=data.model_dump(mode="json")))
