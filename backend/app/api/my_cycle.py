from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.my_cycle import (
    ClientAccessOut,
    PaymentReportOut,
    PaymentReportRejectIn,
    PaymentSettingsIn,
    PaymentSettingsOut,
    RenewalPrepareOut,
    RenewalRequestOut,
)
from app.services import my_cycle as my_cycle_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(tags=["my-cycle"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


@router.get("/clients/{client_id}/public-access", response_model=ClientAccessOut)
def get_client_access(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientAccessOut:
    try:
        return my_cycle_svc.get_access_status(
            db, organization_id=auth.organization.id, client_id=client_id
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.post("/clients/{client_id}/public-access", response_model=ClientAccessOut)
def create_client_access(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientAccessOut:
    try:
        return my_cycle_svc.create_or_rotate_access(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            user_id=auth.user.id,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.post("/clients/{client_id}/public-access/rotate", response_model=ClientAccessOut)
def rotate_client_access(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientAccessOut:
    try:
        return my_cycle_svc.create_or_rotate_access(
            db,
            organization_id=auth.organization.id,
            client_id=client_id,
            user_id=auth.user.id,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.delete("/clients/{client_id}/public-access", response_model=ClientAccessOut)
def revoke_client_access(
    client_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ClientAccessOut:
    try:
        return my_cycle_svc.revoke_access(
            db, organization_id=auth.organization.id, client_id=client_id
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/organization/payment-settings", response_model=PaymentSettingsOut)
def get_payment_settings(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> PaymentSettingsOut:
    return my_cycle_svc.get_payment_settings(db, organization_id=auth.organization.id)


@router.put("/organization/payment-settings", response_model=PaymentSettingsOut)
def put_payment_settings(
    payload: PaymentSettingsIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> PaymentSettingsOut:
    try:
        return my_cycle_svc.upsert_payment_settings(
            db, organization_id=auth.organization.id, payload=payload
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/renewal-requests", response_model=list[RenewalRequestOut])
def list_renewals(
    status: str | None = Query(default=None),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[RenewalRequestOut]:
    return my_cycle_svc.list_renewal_requests(
        db, organization_id=auth.organization.id, status=status
    )


@router.post("/renewal-requests/{request_id}/acknowledge", response_model=RenewalRequestOut)
def acknowledge_renewal(
    request_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RenewalRequestOut:
    try:
        return my_cycle_svc.acknowledge_renewal(
            db, organization_id=auth.organization.id, request_id=request_id
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.post("/renewal-requests/{request_id}/resolve", response_model=RenewalRequestOut)
def resolve_renewal(
    request_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RenewalRequestOut:
    try:
        return my_cycle_svc.resolve_or_dismiss_renewal(
            db,
            organization_id=auth.organization.id,
            request_id=request_id,
            dismiss=False,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.post("/renewal-requests/{request_id}/dismiss", response_model=RenewalRequestOut)
def dismiss_renewal(
    request_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RenewalRequestOut:
    try:
        return my_cycle_svc.resolve_or_dismiss_renewal(
            db,
            organization_id=auth.organization.id,
            request_id=request_id,
            dismiss=True,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/renewal-requests/{request_id}/prepare", response_model=RenewalPrepareOut)
def prepare_renewal(
    request_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> RenewalPrepareOut:
    try:
        return my_cycle_svc.prepare_renewal(
            db, organization_id=auth.organization.id, request_id=request_id
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/payment-reports", response_model=list[PaymentReportOut])
def list_reports(
    status: str | None = Query(default="pending_review"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> list[PaymentReportOut]:
    return my_cycle_svc.list_payment_reports(
        db, organization_id=auth.organization.id, status=status
    )


@router.post("/payment-reports/{report_id}/confirm", response_model=PaymentReportOut)
def confirm_report(
    report_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> PaymentReportOut:
    try:
        return my_cycle_svc.confirm_payment_report(
            db, organization_id=auth.organization.id, report_id=report_id
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.post("/payment-reports/{report_id}/reject", response_model=PaymentReportOut)
def reject_report(
    report_id: UUID,
    payload: PaymentReportRejectIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> PaymentReportOut:
    try:
        return my_cycle_svc.reject_payment_report(
            db,
            organization_id=auth.organization.id,
            report_id=report_id,
            reason=payload.reason,
        )
    except AuthError as exc:
        raise _http(exc) from exc


@router.get("/payment-reports/{report_id}/proof")
def download_proof(
    report_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> FastAPIResponse:
    try:
        data, mime = my_cycle_svc.get_proof_for_download(
            db, organization_id=auth.organization.id, report_id=report_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return FastAPIResponse(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": 'attachment; filename="comprovante"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
