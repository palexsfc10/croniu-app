"""Meu Ciclo — public portal, renewal requests, payment reports (Sprint 2D)."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, date, datetime
from urllib.parse import quote, urlparse

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models.client import Client
from app.models.client_public_access import ClientPublicAccess
from app.models.cycle import Cycle
from app.models.organization_payment_settings import OrganizationPaymentSettings
from app.models.payment_proof import PaymentProof
from app.models.payment_report import PaymentReport
from app.models.receivable import Receivable
from app.models.renewal_request import RenewalRequest
from app.schemas.my_cycle import (
    ClientAccessOut,
    PaymentReportOut,
    PaymentSettingsIn,
    PaymentSettingsOut,
    PublicCycleBlock,
    PublicMyCycleOut,
    PublicPaymentInstructions,
    PublicPaymentReportOut,
    PublicRenewalOut,
    PublicRenewalWhatsApp,
    RenewalPrepareOut,
    RenewalRequestOut,
)
from app.security.passwords import generate_session_token, hash_session_token
from app.services import agenda as agenda_svc
from app.services import cycle_period as cycle_period_svc
from app.services import domain as domain_svc
from app.services import evaluations as eval_svc
from app.services import proof_storage
from app.services.auth import AuthError
from app.services.cycle_calc import compute_renewal_on

logger = logging.getLogger("croniu.my_cycle")

ACTIVE_RENEWAL = {"requested", "acknowledged", "payment_reported"}
UNIFORM_TOKEN_ERROR = AuthError(
    "access_unavailable",
    "Este acesso não está disponível.",
    404,
)


def _first_name(full_name: str) -> str:
    parts = (full_name or "").strip().split()
    return parts[0] if parts else "Olá"


def _normalize_optional(value: str | None, *, max_len: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:max_len]


def _validate_https_url(url: str | None) -> str | None:
    if url is None or not url.strip():
        return None
    cleaned = url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise AuthError(
            "invalid_payment_url",
            "O link de pagamento deve ser uma URL https válida.",
            422,
        )
    if parsed.username or parsed.password:
        raise AuthError("invalid_payment_url", "URL de pagamento inválida.", 422)
    return cleaned


def _normalize_whatsapp_e164(raw: str | None) -> str | None:
    """Normalize to digits-only international form (e.g. 5511999999999)."""
    if raw is None or not str(raw).strip():
        return None
    digits = re.sub(r"\D", "", raw.strip())
    if digits.startswith("00"):
        digits = digits[2:]
    # BR local with leading 0 → drop trunk zero after country guess
    if len(digits) == 10 or len(digits) == 11:
        digits = f"55{digits}"
    if not digits.isdigit() or len(digits) < 12 or len(digits) > 15:
        raise AuthError(
            "invalid_whatsapp",
            "Informe o WhatsApp com DDI e DDD (ex.: 5511999999999).",
            422,
        )
    if digits.startswith("55") and len(digits) not in {12, 13}:
        raise AuthError(
            "invalid_whatsapp",
            "WhatsApp brasileiro inválido. Use DDI 55 + DDD + número.",
            422,
        )
    return digits


def _format_brl_cents(cents: int | None) -> str:
    value = (cents or 0) / 100
    return (
        f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    )


def build_renewal_whatsapp_url(
    *,
    e164: str,
    professional_first_name: str,
    client_full_name: str,
    amount_cents: int | None,
) -> str:
    amount = _format_brl_cents(amount_cents)
    message = (
        f"Olá, {professional_first_name}. Sou {client_full_name}. "
        f"Realizei o Pix de {amount} referente à renovação do meu acompanhamento. "
        "Estou enviando o comprovante para sua conferência."
    )
    return f"https://wa.me/{e164}?text={quote(message)}"


def _normalize_pix_key(key_type: str | None, key: str | None) -> str | None:
    if key is None or not str(key).strip():
        return None
    raw = key.strip()
    if key_type in {"cpf", "cnpj"}:
        digits = re.sub(r"\D", "", raw)
        if key_type == "cpf" and len(digits) != 11:
            raise AuthError("invalid_pix_key", "CPF inválido.", 422)
        if key_type == "cnpj" and len(digits) != 14:
            raise AuthError("invalid_pix_key", "CNPJ inválido.", 422)
        return digits
    if key_type == "phone":
        digits = re.sub(r"\D", "", raw)
        if len(digits) < 10 or len(digits) > 13:
            raise AuthError("invalid_pix_key", "Telefone inválido.", 422)
        return digits
    if key_type == "email":
        cleaned = raw.lower()
        if "@" not in cleaned or len(cleaned) < 5:
            raise AuthError("invalid_pix_key", "E-mail inválido.", 422)
        return cleaned
    return raw[:320]


def _public_url(token: str) -> tuple[str, str]:
    settings = get_settings()
    path = f"/c/{token}"
    base = settings.public_app_base_url.rstrip("/")
    return path, f"{base}{path}"


def _wa_template(client: Client, public_url: str) -> str:
    return (
        f"Olá, {_first_name(client.full_name)}. Aqui está seu acesso ao Croniu "
        f"para acompanhar seu ciclo, renovação e pagamento: {public_url}"
    )


def get_access_status(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> ClientAccessOut:
    domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)
    row = db.scalar(
        select(ClientPublicAccess).where(
            ClientPublicAccess.organization_id == organization_id,
            ClientPublicAccess.client_id == client_id,
            ClientPublicAccess.revoked_at.is_(None),
        )
    )
    if row is None:
        return ClientAccessOut(has_active_link=False)
    return ClientAccessOut(
        has_active_link=True,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
    )


def create_or_rotate_access(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> ClientAccessOut:
    client = domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)
    now = datetime.now(UTC)
    existing = db.scalar(
        select(ClientPublicAccess).where(
            ClientPublicAccess.organization_id == organization_id,
            ClientPublicAccess.client_id == client_id,
            ClientPublicAccess.revoked_at.is_(None),
        )
    )
    if existing is not None:
        existing.revoked_at = now
        db.add(existing)

    raw = generate_session_token()
    row = ClientPublicAccess(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=client_id,
        token_hash=hash_session_token(raw),
        created_by_user_id=user_id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AuthError(
            "access_conflict",
            "Não foi possível gerar o link. Tente novamente.",
            409,
        ) from exc

    path, url = _public_url(raw)
    logger.info(
        "client_public_access created org=%s client=%s",
        organization_id,
        client_id,
    )
    return ClientAccessOut(
        has_active_link=True,
        created_at=row.created_at,
        last_used_at=None,
        token=raw,
        public_path=path,
        public_url=url,
        wa_message_template=_wa_template(client, url),
    )


def revoke_access(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> ClientAccessOut:
    domain_svc.get_client(db, organization_id=organization_id, client_id=client_id)
    row = db.scalar(
        select(ClientPublicAccess).where(
            ClientPublicAccess.organization_id == organization_id,
            ClientPublicAccess.client_id == client_id,
            ClientPublicAccess.revoked_at.is_(None),
        )
    )
    if row is None:
        return ClientAccessOut(has_active_link=False)
    row.revoked_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    logger.info("client_public_access revoked org=%s client=%s", organization_id, client_id)
    return ClientAccessOut(has_active_link=False)


def get_payment_settings(
    db: Session, *, organization_id: uuid.UUID
) -> PaymentSettingsOut:
    row = db.scalar(
        select(OrganizationPaymentSettings).where(
            OrganizationPaymentSettings.organization_id == organization_id
        )
    )
    if row is None:
        return PaymentSettingsOut()
    return PaymentSettingsOut(
        holder_name=row.holder_name,
        pix_key_type=row.pix_key_type,
        pix_key=row.pix_key,
        instructions=row.instructions,
        external_payment_url=row.external_payment_url,
        institution=row.institution,
        show_on_my_cycle=row.show_on_my_cycle,
        whatsapp_e164=row.whatsapp_e164,
        whatsapp_enabled=bool(row.whatsapp_enabled),
    )


def upsert_payment_settings(
    db: Session, *, organization_id: uuid.UUID, payload: PaymentSettingsIn
) -> PaymentSettingsOut:
    pix_key = _normalize_pix_key(payload.pix_key_type, payload.pix_key)
    url = _validate_https_url(payload.external_payment_url)
    wa = _normalize_whatsapp_e164(payload.whatsapp_e164)
    if payload.whatsapp_enabled and not wa:
        raise AuthError(
            "whatsapp_required",
            "Informe um WhatsApp válido para disponibilizar o envio de comprovante.",
            422,
        )
    row = db.scalar(
        select(OrganizationPaymentSettings).where(
            OrganizationPaymentSettings.organization_id == organization_id
        )
    )
    if row is None:
        row = OrganizationPaymentSettings(id=uuid.uuid4(), organization_id=organization_id)
        db.add(row)
    row.holder_name = _normalize_optional(payload.holder_name, max_len=200)
    row.pix_key_type = payload.pix_key_type
    row.pix_key = pix_key
    row.instructions = _normalize_optional(payload.instructions, max_len=2000)
    row.external_payment_url = url
    row.institution = _normalize_optional(payload.institution, max_len=120)
    row.show_on_my_cycle = payload.show_on_my_cycle
    row.whatsapp_e164 = wa
    row.whatsapp_enabled = bool(payload.whatsapp_enabled and wa)
    db.add(row)
    db.commit()
    return get_payment_settings(db, organization_id=organization_id)


def select_relevant_cycle(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID, today: date
) -> Cycle | None:
    """Deterministic portal cycle: upcoming active → current → latest ended."""
    cycles = list(
        db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == organization_id,
                Cycle.client_id == client_id,
                Cycle.status.in_(["active", "ended"]),
            )
            .options(selectinload(Cycle.service), selectinload(Cycle.receivables))
            .order_by(Cycle.starts_on.desc())
        ).all()
    )
    current = [
        c
        for c in cycles
        if c.status == "active"
        and cycle_period_svc.is_current(starts_on=c.starts_on, ends_on=c.ends_on, today=today)
    ]
    if current:
        return min(current, key=lambda c: c.starts_on)

    upcoming = [
        c
        for c in cycles
        if c.status == "active" and cycle_period_svc.is_upcoming(starts_on=c.starts_on, today=today)
    ]
    if upcoming:
        return min(upcoming, key=lambda c: c.starts_on)

    ended = [c for c in cycles if c.ends_on <= today or c.status == "ended"]
    if ended:
        return max(ended, key=lambda c: c.ends_on)
    return None


def remaining_planned_lessons(
    db: Session,
    cycle: Cycle,
    *,
    organization_id: uuid.UUID,
) -> int | None:
    """Aulas restantes = total do ciclo − aulas encerradas (realizado ou falta)."""
    if cycle.lesson_count is None:
        return None
    done = domain_svc.count_lessons_completed(
        db, organization_id=organization_id, cycle_id=cycle.id
    )
    return max(0, int(cycle.lesson_count) - int(done))


def lessons_completed_for_cycle(
    db: Session,
    cycle: Cycle,
    *,
    organization_id: uuid.UUID,
) -> int:
    return domain_svc.count_lessons_completed(
        db, organization_id=organization_id, cycle_id=cycle.id
    )


def lessons_no_show_for_cycle(
    db: Session,
    cycle: Cycle,
    *,
    organization_id: uuid.UUID,
) -> int:
    return domain_svc.count_lessons_no_show(
        db, organization_id=organization_id, cycle_id=cycle.id
    )


def _cycle_is_near_end_for_portal(db: Session, *, cycle: Cycle, today: date) -> bool:
    """Renewal CTA/API only when the cycle is ending (date or lesson balance)."""
    if cycle.status == "ended" or cycle.ends_on <= today:
        return True
    if cycle.starts_on > today:
        return False
    if 0 <= (cycle.ends_on - today).days <= domain_svc.PORTAL_NEARING_DAYS:
        return True
    remaining = remaining_planned_lessons(
        db, cycle, organization_id=cycle.organization_id
    )
    if remaining is not None and remaining <= domain_svc.LESSONS_NEARING_REMAINING:
        return True
    return False


def _payment_status_label(cycle: Cycle) -> str:
    recs = list(cycle.receivables or [])
    if not recs:
        return "sem_cobranca"
    if any(r.status in {"received", "paid"} for r in recs):
        return "confirmado"
    if any(r.status in {"pending", "expected"} for r in recs):
        return "pendente"
    return "outro"


def _pending_receivable(cycle: Cycle) -> Receivable | None:
    pending = [r for r in (cycle.receivables or []) if r.status in {"pending", "expected"}]
    return pending[0] if len(pending) == 1 else (pending[0] if pending else None)


def _active_renewal(
    db: Session, *, client_id: uuid.UUID, cycle_id: uuid.UUID
) -> RenewalRequest | None:
    return db.scalar(
        select(RenewalRequest).where(
            RenewalRequest.client_id == client_id,
            RenewalRequest.source_cycle_id == cycle_id,
            RenewalRequest.status.in_(tuple(ACTIVE_RENEWAL)),
        )
    )


def _active_payment_report(
    db: Session, *, receivable_id: uuid.UUID
) -> PaymentReport | None:
    return db.scalar(
        select(PaymentReport).where(
            PaymentReport.receivable_id == receivable_id,
            PaymentReport.status == "pending_review",
        )
    )


def _resolve_access(db: Session, raw_token: str) -> ClientPublicAccess:
    token = (raw_token or "").strip()
    if len(token) < 20:
        raise UNIFORM_TOKEN_ERROR
    digest = hash_session_token(token)
    row = db.scalar(
        select(ClientPublicAccess).where(ClientPublicAccess.token_hash == digest)
    )
    if row is None or row.revoked_at is not None:
        raise UNIFORM_TOKEN_ERROR
    row.last_used_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    return row


def build_public_view(db: Session, *, raw_token: str) -> PublicMyCycleOut:
    access = _resolve_access(db, raw_token)
    org = agenda_svc.get_organization(db, access.organization_id)
    client = domain_svc.get_client(
        db, organization_id=access.organization_id, client_id=access.client_id
    )
    today = agenda_svc.org_local_today(org)
    cycle = select_relevant_cycle(
        db,
        organization_id=access.organization_id,
        client_id=access.client_id,
        today=today,
    )
    settings = get_payment_settings(db, organization_id=access.organization_id)
    # Pix is not shown on the general portal surface — only during renewal step.
    instructions = PublicPaymentInstructions(configured=False)
    renewal_instructions = PublicPaymentInstructions(configured=False)
    renewal_whatsapp = PublicRenewalWhatsApp(available=False)
    if settings.show_on_my_cycle and (
        settings.pix_key or settings.external_payment_url or settings.instructions
    ):
        renewal_instructions = PublicPaymentInstructions(
            holder_name=settings.holder_name,
            pix_key_type=settings.pix_key_type,
            pix_key=settings.pix_key,
            instructions=settings.instructions,
            external_payment_url=settings.external_payment_url,
            institution=settings.institution,
            configured=True,
        )

    published_evals = [
        eval_svc.evaluation_to_public(row)
        for row in eval_svc.list_published_for_client(
            db,
            organization_id=access.organization_id,
            client_id=access.client_id,
        )
    ]

    if cycle is None:
        return PublicMyCycleOut(
            professional_display_name=org.name,
            client_first_name=_first_name(client.full_name),
            cycle=None,
            empty_message="Seu profissional ainda não disponibilizou um ciclo para acompanhamento.",
            payment_instructions=instructions,
            renewal_payment_instructions=renewal_instructions,
            renewal_whatsapp=renewal_whatsapp,
            can_request_renewal=False,
            can_report_payment=False,
            can_declare_renewal_payment=False,
            evaluations=published_evals,
        )

    renewal = _active_renewal(db, client_id=client.id, cycle_id=cycle.id)
    pending_recv = _pending_receivable(cycle)
    report = (
        _active_payment_report(db, receivable_id=pending_recv.id) if pending_recv else None
    )
    latest_report = None
    if pending_recv is None:
        latest_report = db.scalar(
            select(PaymentReport)
            .where(PaymentReport.cycle_id == cycle.id)
            .order_by(PaymentReport.reported_at.desc())
            .limit(1)
        )

    lessons_completed = lessons_completed_for_cycle(
        db, cycle, organization_id=access.organization_id
    )
    lessons_no_show = lessons_no_show_for_cycle(
        db, cycle, organization_id=access.organization_id
    )
    remaining = remaining_planned_lessons(
        db, cycle, organization_id=access.organization_id
    )
    if remaining is None and cycle.lesson_count is not None:
        remaining = max(0, int(cycle.lesson_count) - int(lessons_completed))

    status_summary = "vigente"
    if cycle.starts_on > today:
        status_summary = "proximo"
    elif cycle.ends_on <= today or cycle.status == "ended":
        status_summary = "encerrado"
    elif (cycle.ends_on - today).days <= domain_svc.PORTAL_NEARING_DAYS:
        status_summary = "encerrando"
    elif remaining is not None and remaining <= domain_svc.LESSONS_NEARING_REMAINING:
        # Saldo esgotado ou última aula — mesmo com data ainda longe.
        status_summary = "encerrando"

    renewal_on = None
    if cycle.duration_type and cycle.duration_value:
        try:
            renewal_on = compute_renewal_on(
                starts_on=cycle.starts_on,
                duration_type=cycle.duration_type,
                duration_value=cycle.duration_value,
            )
        except ValueError:
            renewal_on = cycle.ends_on

    pay_status = _payment_status_label(cycle)
    if report is not None:
        pay_status = "aguardando_confirmacao"
    elif latest_report and latest_report.status == "confirmed":
        pay_status = "confirmado"
    elif latest_report and latest_report.status == "rejected":
        pay_status = "nao_confirmado"

    block = PublicCycleBlock(
        service_name=cycle.service.name if cycle.service else "Serviço",
        status_summary=status_summary,
        starts_on=cycle.starts_on,
        ends_on=cycle.ends_on,
        renewal_on=renewal_on,
        lesson_count=cycle.lesson_count,
        lessons_completed=lessons_completed,
        lessons_no_show=lessons_no_show,
        remaining_planned_lessons=remaining,
        value_cents=cycle.value_cents,
        payment_status=pay_status,
        renewal_request_status=renewal.status if renewal else None,
        payment_report_status=(
            report.status
            if report
            else (latest_report.status if latest_report else None)
        ),
    )

    # Cliente só renova no fim do ciclo — nunca no início / "próximo".
    can_renew = status_summary in {"encerrando", "encerrado"}
    can_pay = pending_recv is not None and report is None and pay_status != "confirmado"
    can_declare = renewal is not None and renewal.status in {"requested", "acknowledged"}

    if settings.whatsapp_enabled and settings.whatsapp_e164:
        pro_name = _first_name(settings.holder_name or org.name)
        renewal_whatsapp = PublicRenewalWhatsApp(
            available=True,
            whatsapp_url=build_renewal_whatsapp_url(
                e164=settings.whatsapp_e164,
                professional_first_name=pro_name,
                client_full_name=client.full_name,
                amount_cents=cycle.value_cents,
            ),
        )

    return PublicMyCycleOut(
        professional_display_name=org.name,
        client_first_name=_first_name(client.full_name),
        cycle=block,
        empty_message=None,
        payment_instructions=instructions,
        renewal_payment_instructions=renewal_instructions,
        renewal_whatsapp=renewal_whatsapp,
        can_request_renewal=can_renew and renewal is None,
        can_report_payment=can_pay,
        can_declare_renewal_payment=can_declare,
        evaluations=published_evals,
    )


def declare_renewal_payment(db: Session, *, raw_token: str) -> PublicRenewalOut:
    """Client declares payment was made — does not confirm financially or create a cycle."""
    access = _resolve_access(db, raw_token)
    org = agenda_svc.get_organization(db, access.organization_id)
    today = agenda_svc.org_local_today(org)
    cycle = select_relevant_cycle(
        db,
        organization_id=access.organization_id,
        client_id=access.client_id,
        today=today,
    )
    if cycle is None:
        raise AuthError("no_cycle", "Não há ciclo disponível.", 422)
    renewal = _active_renewal(db, client_id=access.client_id, cycle_id=cycle.id)
    if renewal is None:
        raise AuthError(
            "no_renewal",
            "Envie o interesse de renovação antes de informar o pagamento.",
            422,
        )
    if renewal.status == "payment_reported":
        return PublicRenewalOut(
            status=renewal.status,
            message=(
                f"Pagamento informado. Agora é só aguardar a conferência de {org.name}. "
                "Seu novo ciclo ainda não foi iniciado."
            ),
        )
    if renewal.status not in {"requested", "acknowledged"}:
        raise AuthError("renewal_closed", "Esta renovação não aceita nova declaração.", 422)
    renewal.status = "payment_reported"
    db.add(renewal)
    db.commit()
    return PublicRenewalOut(
        status="payment_reported",
        message=(
            f"Pagamento informado. Agora é só aguardar a conferência de {org.name}. "
            "Seu novo ciclo ainda não foi iniciado."
        ),
    )


def request_renewal(db: Session, *, raw_token: str) -> PublicRenewalOut:
    access = _resolve_access(db, raw_token)
    org = agenda_svc.get_organization(db, access.organization_id)
    today = agenda_svc.org_local_today(org)
    cycle = select_relevant_cycle(
        db,
        organization_id=access.organization_id,
        client_id=access.client_id,
        today=today,
    )
    if cycle is None:
        raise AuthError("no_cycle", "Não há ciclo disponível para renovação.", 422)

    if not _cycle_is_near_end_for_portal(db, cycle=cycle, today=today):
        raise AuthError(
            "renewal_not_available",
            "A renovação fica disponível quando o ciclo estiver perto do fim.",
            422,
        )

    existing = _active_renewal(db, client_id=access.client_id, cycle_id=cycle.id)
    if existing is not None:
        return PublicRenewalOut(
            status=existing.status,
            message=(
                "Interesse enviado. Seu profissional confirmará as próximas datas "
                "e o valor antes de criar o novo ciclo."
            ),
        )

    row = RenewalRequest(
        id=uuid.uuid4(),
        organization_id=access.organization_id,
        client_id=access.client_id,
        source_cycle_id=cycle.id,
        status="requested",
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _active_renewal(db, client_id=access.client_id, cycle_id=cycle.id)
        if existing:
            return PublicRenewalOut(
                status=existing.status,
                message=(
                    "Interesse enviado. Seu profissional confirmará as próximas datas "
                    "e o valor antes de criar o novo ciclo."
                ),
            )
        raise
    return PublicRenewalOut(
        status="requested",
        message=(
            "Interesse enviado. Seu profissional confirmará as próximas datas "
            "e o valor antes de criar o novo ciclo."
        ),
    )


def report_payment(
    db: Session,
    *,
    raw_token: str,
    method_note: str | None,
    notes: str | None,
    proof_bytes: bytes | None,
    proof_content_type: str | None,
) -> PublicPaymentReportOut:
    access = _resolve_access(db, raw_token)
    org = agenda_svc.get_organization(db, access.organization_id)
    today = agenda_svc.org_local_today(org)
    cycle = select_relevant_cycle(
        db,
        organization_id=access.organization_id,
        client_id=access.client_id,
        today=today,
    )
    if cycle is None:
        raise AuthError("no_cycle", "Não há ciclo disponível.", 422)
    # Reload with receivables
    cycle = domain_svc.get_cycle(
        db, organization_id=access.organization_id, cycle_id=cycle.id
    )
    recv = _pending_receivable(cycle)
    if recv is None:
        raise AuthError(
            "no_pending_receivable",
            "Não há pagamento pendente para informar.",
            422,
        )
    if recv.status in {"received", "paid"}:
        raise AuthError(
            "already_paid",
            "Este pagamento já foi confirmado.",
            409,
        )

    existing = _active_payment_report(db, receivable_id=recv.id)
    if existing is not None:
        return PublicPaymentReportOut(
            status=existing.status,
            message="Pagamento informado. Aguardando confirmação do profissional.",
            amount_cents=existing.amount_cents,
        )

    storage_key = None
    try:
        row = PaymentReport(
            id=uuid.uuid4(),
            organization_id=access.organization_id,
            client_id=access.client_id,
            cycle_id=cycle.id,
            receivable_id=recv.id,
            status="pending_review",
            amount_cents=recv.amount_cents,
            method_note=_normalize_optional(method_note, max_len=120),
            notes=_normalize_optional(notes, max_len=500),
        )
        db.add(row)
        db.flush()

        if proof_bytes:
            key, mime, size, digest = proof_storage.store_proof_bytes(
                organization_id=access.organization_id,
                data=proof_bytes,
                declared_mime=proof_content_type,
            )
            storage_key = key
            db.add(
                PaymentProof(
                    id=uuid.uuid4(),
                    organization_id=access.organization_id,
                    payment_report_id=row.id,
                    storage_key=key,
                    content_sha256=digest,
                    mime_type=mime,
                    size_bytes=size,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        if storage_key:
            proof_storage.delete_proof_file(storage_key)
        existing = _active_payment_report(db, receivable_id=recv.id)
        if existing:
            return PublicPaymentReportOut(
                status=existing.status,
                message="Pagamento informado. Aguardando confirmação do profissional.",
                amount_cents=existing.amount_cents,
            )
        raise
    except Exception:
        db.rollback()
        if storage_key:
            proof_storage.delete_proof_file(storage_key)
        raise

    # Receivable stays pending — never auto-mark paid
    return PublicPaymentReportOut(
        status="pending_review",
        message="Pagamento informado. Aguardando confirmação do profissional.",
        amount_cents=recv.amount_cents,
    )


def list_renewal_requests(
    db: Session, *, organization_id: uuid.UUID, status: str | None = None
) -> list[RenewalRequestOut]:
    stmt = (
        select(RenewalRequest)
        .where(RenewalRequest.organization_id == organization_id)
        .options(
            selectinload(RenewalRequest.client),
            selectinload(RenewalRequest.source_cycle).selectinload(Cycle.service),
        )
        .order_by(RenewalRequest.requested_at.desc())
    )
    if status:
        stmt = stmt.where(RenewalRequest.status == status)
    else:
        stmt = stmt.where(RenewalRequest.status.in_(tuple(ACTIVE_RENEWAL)))
    rows = list(db.scalars(stmt).all())
    return [
        RenewalRequestOut(
            id=r.id,
            client_id=r.client_id,
            source_cycle_id=r.source_cycle_id,
            status=r.status,
            requested_at=r.requested_at,
            acknowledged_at=r.acknowledged_at,
            resolved_at=r.resolved_at,
            client_name=r.client.full_name if r.client else None,
            service_name=r.source_cycle.service.name
            if r.source_cycle and r.source_cycle.service
            else None,
        )
        for r in rows
    ]


def acknowledge_renewal(
    db: Session, *, organization_id: uuid.UUID, request_id: uuid.UUID
) -> RenewalRequestOut:
    row = db.scalar(
        select(RenewalRequest)
        .where(
            RenewalRequest.organization_id == organization_id,
            RenewalRequest.id == request_id,
        )
        .options(
            selectinload(RenewalRequest.client),
            selectinload(RenewalRequest.source_cycle).selectinload(Cycle.service),
        )
    )
    if row is None:
        raise AuthError("not_found", "Solicitação não encontrada.", 404)
    if row.status == "requested":
        row.status = "acknowledged"
        row.acknowledged_at = datetime.now(UTC)
        db.add(row)
        db.commit()
        db.refresh(row)
    return RenewalRequestOut(
        id=row.id,
        client_id=row.client_id,
        source_cycle_id=row.source_cycle_id,
        status=row.status,
        requested_at=row.requested_at,
        acknowledged_at=row.acknowledged_at,
        resolved_at=row.resolved_at,
        client_name=row.client.full_name if row.client else None,
        service_name=row.source_cycle.service.name
        if row.source_cycle and row.source_cycle.service
        else None,
    )


def resolve_or_dismiss_renewal(
    db: Session,
    *,
    organization_id: uuid.UUID,
    request_id: uuid.UUID,
    dismiss: bool,
) -> RenewalRequestOut:
    row = db.scalar(
        select(RenewalRequest)
        .where(
            RenewalRequest.organization_id == organization_id,
            RenewalRequest.id == request_id,
        )
        .options(
            selectinload(RenewalRequest.client),
            selectinload(RenewalRequest.source_cycle).selectinload(Cycle.service),
        )
    )
    if row is None:
        raise AuthError("not_found", "Solicitação não encontrada.", 404)
    if row.status in {"resolved", "dismissed"}:
        pass
    else:
        row.status = "dismissed" if dismiss else "resolved"
        row.resolved_at = datetime.now(UTC)
        db.add(row)
        db.commit()
        db.refresh(row)
    return RenewalRequestOut(
        id=row.id,
        client_id=row.client_id,
        source_cycle_id=row.source_cycle_id,
        status=row.status,
        requested_at=row.requested_at,
        acknowledged_at=row.acknowledged_at,
        resolved_at=row.resolved_at,
        client_name=row.client.full_name if row.client else None,
        service_name=row.source_cycle.service.name
        if row.source_cycle and row.source_cycle.service
        else None,
    )


def prepare_renewal(
    db: Session, *, organization_id: uuid.UUID, request_id: uuid.UUID
) -> RenewalPrepareOut:
    row = db.scalar(
        select(RenewalRequest)
        .where(
            RenewalRequest.organization_id == organization_id,
            RenewalRequest.id == request_id,
        )
        .options(selectinload(RenewalRequest.source_cycle).selectinload(Cycle.service))
    )
    if row is None:
        raise AuthError("not_found", "Solicitação não encontrada.", 404)
    if row.status not in ACTIVE_RENEWAL:
        raise AuthError("renewal_closed", "Esta solicitação já foi encerrada.", 409)
    cycle = row.source_cycle
    service = cycle.service if cycle else None
    price = service.default_price_cents if service else None
    if row.status == "requested":
        row.status = "acknowledged"
        row.acknowledged_at = datetime.now(UTC)
        db.add(row)
        db.commit()
    return RenewalPrepareOut(
        client_id=row.client_id,
        service_id=cycle.service_id if cycle else None,
        cycle_template_id=cycle.cycle_template_id if cycle else None,
        weekdays=list(cycle.weekdays) if cycle and cycle.weekdays else None,
        duration_type=cycle.duration_type if cycle else None,
        duration_value=cycle.duration_value if cycle else None,
        suggested_unit_price_cents=price,
        renewal_request_id=row.id,
    )


def list_payment_reports(
    db: Session, *, organization_id: uuid.UUID, status: str | None = "pending_review"
) -> list[PaymentReportOut]:
    stmt = (
        select(PaymentReport)
        .where(PaymentReport.organization_id == organization_id)
        .options(
            selectinload(PaymentReport.client),
            selectinload(PaymentReport.proof),
        )
        .order_by(PaymentReport.reported_at.desc())
    )
    if status:
        stmt = stmt.where(PaymentReport.status == status)
    rows = list(db.scalars(stmt).all())
    return [
        PaymentReportOut(
            id=r.id,
            client_id=r.client_id,
            cycle_id=r.cycle_id,
            receivable_id=r.receivable_id,
            status=r.status,
            amount_cents=r.amount_cents,
            method_note=r.method_note,
            notes=r.notes,
            rejection_reason=r.rejection_reason,
            reported_at=r.reported_at,
            confirmed_at=r.confirmed_at,
            rejected_at=r.rejected_at,
            client_name=r.client.full_name if r.client else None,
            has_proof=r.proof is not None,
        )
        for r in rows
    ]


def confirm_payment_report(
    db: Session, *, organization_id: uuid.UUID, report_id: uuid.UUID
) -> PaymentReportOut:
    row = db.scalar(
        select(PaymentReport)
        .where(
            PaymentReport.organization_id == organization_id,
            PaymentReport.id == report_id,
        )
        .options(
            selectinload(PaymentReport.client),
            selectinload(PaymentReport.proof),
        )
    )
    if row is None:
        raise AuthError("not_found", "Informe não encontrado.", 404)
    if row.status == "confirmed":
        return PaymentReportOut(
            id=row.id,
            client_id=row.client_id,
            cycle_id=row.cycle_id,
            receivable_id=row.receivable_id,
            status=row.status,
            amount_cents=row.amount_cents,
            method_note=row.method_note,
            notes=row.notes,
            rejection_reason=row.rejection_reason,
            reported_at=row.reported_at,
            confirmed_at=row.confirmed_at,
            rejected_at=row.rejected_at,
            client_name=row.client.full_name if row.client else None,
            has_proof=row.proof is not None,
        )
    if row.status != "pending_review":
        raise AuthError("report_closed", "Este informe não pode ser confirmado.", 409)

    recv = domain_svc.get_receivable(
        db, organization_id=organization_id, receivable_id=row.receivable_id
    )
    if recv.status not in {"received", "paid"}:
        recv.status = "received"
        recv.paid_at = datetime.now(UTC)
        recv.payment_method = row.method_note or "client_report"
        if not recv.notes:
            recv.notes = "Confirmado via informe Meu Ciclo"
        db.add(recv)

    row.status = "confirmed"
    row.confirmed_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    db.refresh(row)
    return PaymentReportOut(
        id=row.id,
        client_id=row.client_id,
        cycle_id=row.cycle_id,
        receivable_id=row.receivable_id,
        status=row.status,
        amount_cents=row.amount_cents,
        method_note=row.method_note,
        notes=row.notes,
        rejection_reason=row.rejection_reason,
        reported_at=row.reported_at,
        confirmed_at=row.confirmed_at,
        rejected_at=row.rejected_at,
        client_name=row.client.full_name if row.client else None,
        has_proof=row.proof is not None,
    )


def reject_payment_report(
    db: Session,
    *,
    organization_id: uuid.UUID,
    report_id: uuid.UUID,
    reason: str | None,
) -> PaymentReportOut:
    row = db.scalar(
        select(PaymentReport)
        .where(
            PaymentReport.organization_id == organization_id,
            PaymentReport.id == report_id,
        )
        .options(selectinload(PaymentReport.client), selectinload(PaymentReport.proof))
    )
    if row is None:
        raise AuthError("not_found", "Informe não encontrado.", 404)
    if row.status != "pending_review":
        raise AuthError("report_closed", "Este informe não pode ser rejeitado.", 409)
    row.status = "rejected"
    row.rejected_at = datetime.now(UTC)
    row.rejection_reason = _normalize_optional(reason, max_len=500)
    db.add(row)
    db.commit()
    db.refresh(row)
    return PaymentReportOut(
        id=row.id,
        client_id=row.client_id,
        cycle_id=row.cycle_id,
        receivable_id=row.receivable_id,
        status=row.status,
        amount_cents=row.amount_cents,
        method_note=row.method_note,
        notes=row.notes,
        rejection_reason=row.rejection_reason,
        reported_at=row.reported_at,
        confirmed_at=row.confirmed_at,
        rejected_at=row.rejected_at,
        client_name=row.client.full_name if row.client else None,
        has_proof=row.proof is not None,
    )


def get_proof_for_download(
    db: Session, *, organization_id: uuid.UUID, report_id: uuid.UUID
) -> tuple[bytes, str]:
    row = db.scalar(
        select(PaymentReport)
        .where(
            PaymentReport.organization_id == organization_id,
            PaymentReport.id == report_id,
        )
        .options(selectinload(PaymentReport.proof))
    )
    if row is None or row.proof is None:
        raise AuthError("proof_not_found", "Comprovante não encontrado.", 404)
    data = proof_storage.read_proof_bytes(row.proof.storage_key)
    return data, row.proof.mime_type
