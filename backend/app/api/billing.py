"""Authenticated billing endpoints for the current organization."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.billing.service import BillingService
from app.db import get_db
from app.schemas.billing import (
    CheckoutOut,
    CreateHostedCheckoutRequest,
    EntitlementOut,
)
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/billing", tags=["billing"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("/entitlement", response_model=EntitlementOut)
def get_entitlement(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    return BillingService(db).get_entitlement(auth.organization.id)


@router.get("/status")
def billing_status(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    return BillingService(db).get_status(auth.organization.id)


@router.get("/checkout")
def get_latest_checkout(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    data = BillingService(db).get_latest_checkout(auth.organization.id)
    return {"checkout": data}


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
def create_hosted_checkout(
    payload: CreateHostedCheckoutRequest,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return BillingService(db).create_hosted_checkout(
            organization_id=auth.organization.id,
            user=auth.user,
            price_id=payload.price_id,
            billing_method=payload.billing_method,
            customer=payload.customer.model_dump(),
            remote_ip=request.client.host if request.client else None,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/checkout/{checkout_id}", response_model=CheckoutOut)
def get_checkout(
    checkout_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return BillingService(db).get_checkout(
            organization_id=auth.organization.id,
            checkout_id=checkout_id,
        )
    except AuthError as exc:
        raise _http(exc) from exc
