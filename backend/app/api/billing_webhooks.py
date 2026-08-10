"""Public Asaas webhook endpoint (no session auth)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.billing.webhooks import BillingWebhookService
from app.db import get_db
from app.services.auth import AuthError

router = APIRouter(prefix="/billing/webhooks", tags=["billing-webhooks"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.post("/asaas")
async def asaas_webhook(
    request: Request,
    db: Session = Depends(get_db),
    asaas_access_token: str | None = Header(default=None, alias="asaas-access-token"),
) -> dict[str, Any]:
    body = await request.json()
    payload: dict[str, Any] = body if isinstance(body, dict) else {"raw": body}
    try:
        result = BillingWebhookService(db).handle_asaas(
            payload=payload,
            access_token=asaas_access_token,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return result
