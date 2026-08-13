"""Organization intake links, public submit, and professional review queue."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models.client import Client
from app.models.client_public_access import ClientPublicAccess
from app.models.intake import (
    ClientAnamnesisResponse,
    ClientIntakeSubmission,
    ClientJourney,
    ConsentRecord,
    OrganizationIntakeLink,
    Protocol,
    ProtocolVersion,
)
from app.models.organization import Organization
from app.security.passwords import generate_session_token, hash_session_token
from app.services import anamnesis_template as anam_svc
from app.services import journey as journey_svc
from app.services.auth import AuthError

logger = logging.getLogger("croniu.intake")

GENERIC_TOKEN_ERROR = AuthError(
    "intake_link_invalid",
    "Link inválido ou indisponível.",
    404,
)

ATTENTION_SAFE_MESSAGE = (
    "Suas respostas indicam que alguns pontos precisam ser analisados "
    "pelo profissional antes do início das atividades."
)


def _normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", (raw or "").strip())
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) in {10, 11}:
        digits = f"55{digits}"
    if not digits.isdigit() or len(digits) < 12 or len(digits) > 15:
        raise AuthError(
            "invalid_phone",
            "Informe um telefone válido com DDD (ex.: 11999999999).",
            422,
        )
    if digits.startswith("55") and len(digits) not in {12, 13}:
        raise AuthError(
            "invalid_phone",
            "Telefone brasileiro inválido. Use DDD + número.",
            422,
        )
    return digits


def _normalize_email(value: str | None) -> str | None:
    if value is None or not str(value).strip():
        return None
    return str(value).strip().lower()


def _age_years(birth: date, *, today: date | None = None) -> int:
    ref = today or date.today()
    years = ref.year - birth.year
    if (ref.month, ref.day) < (birth.month, birth.day):
        years -= 1
    return years


def _public_intake_path(token: str) -> str:
    return f"/entrar/{token}"


def _public_intake_url(token: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}{_public_intake_path(token)}"


def _portal_path(token: str) -> str:
    return f"/c/{token}"


def _portal_url(token: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}{_portal_path(token)}"


def _wa_invite(url: str) -> str:
    msg = (
        "Olá! Para iniciar seu acompanhamento, preencha seu cadastro "
        f"e sua anamnese pelo link: {url}"
    )
    return f"https://wa.me/?text={quote(msg)}"


def _active_link(db: Session, organization_id: uuid.UUID) -> OrganizationIntakeLink | None:
    return db.scalar(
        select(OrganizationIntakeLink).where(
            OrganizationIntakeLink.organization_id == organization_id,
            OrganizationIntakeLink.status == "active",
        )
    )


def get_intake_link(
    db: Session, *, organization_id: uuid.UUID
) -> dict[str, Any]:
    row = _active_link(db, organization_id)
    if row is None:
        return {
            "has_active_link": False,
            "status": None,
            "created_at": None,
            "rotated_at": None,
            "last_used_at": None,
            "token": None,
            "public_path": None,
            "public_url": None,
            "wa_message_url": None,
        }
    return {
        "has_active_link": True,
        "id": str(row.id),
        "status": row.status,
        "created_at": row.created_at,
        "rotated_at": row.rotated_at,
        "last_used_at": row.last_used_at,
        "token": None,
        "public_path": None,
        "public_url": None,
        "wa_message_url": None,
    }


def create_intake_link(
    db: Session, *, organization_id: uuid.UUID, user_id: uuid.UUID | None
) -> dict[str, Any]:
    existing = _active_link(db, organization_id)
    if existing is not None:
        raise AuthError(
            "intake_link_exists",
            "Já existe um link ativo. Use regenerar para criar um novo.",
            409,
        )
    raw = generate_session_token()
    row = OrganizationIntakeLink(
        id=uuid.uuid4(),
        organization_id=organization_id,
        token_hash=hash_session_token(raw),
        status="active",
        created_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("intake_link created org=%s", organization_id)
    url = _public_intake_url(raw)
    return {
        "has_active_link": True,
        "id": str(row.id),
        "status": row.status,
        "created_at": row.created_at,
        "rotated_at": row.rotated_at,
        "last_used_at": row.last_used_at,
        "token": raw,
        "public_path": _public_intake_path(raw),
        "public_url": url,
        "wa_message_url": _wa_invite(url),
    }


def rotate_intake_link(
    db: Session, *, organization_id: uuid.UUID, user_id: uuid.UUID | None
) -> dict[str, Any]:
    now = datetime.now(UTC)
    current = _active_link(db, organization_id)
    if current is not None:
        current.status = "disabled"
        current.disabled_at = now
        current.rotated_at = now
        db.add(current)
        db.flush()
    raw = generate_session_token()
    row = OrganizationIntakeLink(
        id=uuid.uuid4(),
        organization_id=organization_id,
        token_hash=hash_session_token(raw),
        status="active",
        created_by_user_id=user_id,
        rotated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("intake_link rotated org=%s", organization_id)
    url = _public_intake_url(raw)
    return {
        "has_active_link": True,
        "id": str(row.id),
        "status": row.status,
        "created_at": row.created_at,
        "rotated_at": row.rotated_at,
        "last_used_at": None,
        "token": raw,
        "public_path": _public_intake_path(raw),
        "public_url": url,
        "wa_message_url": _wa_invite(url),
    }


def disable_intake_link(db: Session, *, organization_id: uuid.UUID) -> dict[str, Any]:
    row = _active_link(db, organization_id)
    if row is None:
        return get_intake_link(db, organization_id=organization_id)
    row.status = "disabled"
    row.disabled_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    logger.info("intake_link disabled org=%s", organization_id)
    return get_intake_link(db, organization_id=organization_id)


def _resolve_active_link_by_token(
    db: Session, *, raw_token: str
) -> tuple[OrganizationIntakeLink, Organization]:
    if not raw_token or not raw_token.strip():
        raise GENERIC_TOKEN_ERROR
    digest = hash_session_token(raw_token.strip())
    row = db.scalar(
        select(OrganizationIntakeLink).where(
            OrganizationIntakeLink.token_hash == digest,
            OrganizationIntakeLink.status == "active",
        )
    )
    if row is None:
        raise GENERIC_TOKEN_ERROR
    org = db.get(Organization, row.organization_id)
    if org is None:
        raise GENERIC_TOKEN_ERROR
    return row, org


def get_public_intake_context(db: Session, *, raw_token: str) -> dict[str, Any]:
    link, org = _resolve_active_link_by_token(db, raw_token=raw_token)
    version = anam_svc.get_published_system_version(db)
    link.last_used_at = datetime.now(UTC)
    db.add(link)
    db.commit()
    return {
        "professional_public_name": org.name,
        "welcome_message": f"Bem-vindo(a) ao acompanhamento com {org.name}.",
        "process_summary": (
            "Preencha seus dados, a anamnese e os consentimentos. "
            "O profissional analisará antes de liberar o acompanhamento."
        ),
        "anamnesis_schema": version.schema_json,
        "template_version_id": str(version.id),
        "attention_client_message": ATTENTION_SAFE_MESSAGE,
    }


def _find_duplicate(
    db: Session,
    *,
    organization_id: uuid.UUID,
    phone_normalized: str,
    email: str | None,
) -> tuple[Client | None, bool]:
    """Return (match, archived_match). Same org only."""
    phone_variants = {phone_normalized}
    if phone_normalized.startswith("55") and len(phone_normalized) in {12, 13}:
        phone_variants.add(phone_normalized[2:])

    clauses = [Client.phone.in_(list(phone_variants))]
    # Also match digit-normalized stored phones loosely via LIKE not needed —
    # compare normalized forms in Python for phone field variants.
    candidates = list(
        db.scalars(
            select(Client).where(Client.organization_id == organization_id)
        ).all()
    )
    match: Client | None = None
    for client in candidates:
        stored = re.sub(r"\D", "", client.phone or "")
        if stored in phone_variants or (
            stored.startswith("55") and stored[2:] in phone_variants
        ) or (phone_normalized[2:] == stored if phone_normalized.startswith("55") else False):
            match = client
            break
        if email and client.email and client.email.lower() == email:
            match = client
            break
    if match is None and email:
        match = db.scalar(
            select(Client).where(
                Client.organization_id == organization_id,
                func.lower(Client.email) == email,
            )
        )
    if match is None:
        return None, False
    return match, match.status == "archived"


def submit_intake(
    db: Session,
    *,
    raw_token: str,
    payload: dict[str, Any],
    idempotency_key: str,
) -> dict[str, Any]:
    # Ignore any client-sent organization_id
    payload = {k: v for k, v in payload.items() if k != "organization_id"}

    key = (idempotency_key or "").strip()
    if not key or len(key) > 64:
        raise AuthError(
            "idempotency_required",
            "Informe uma chave de idempotência válida.",
            422,
        )

    link, org = _resolve_active_link_by_token(db, raw_token=raw_token)

    existing = db.scalar(
        select(ClientIntakeSubmission).where(
            ClientIntakeSubmission.organization_id == org.id,
            ClientIntakeSubmission.idempotency_key == key,
        )
    )
    if existing is not None:
        return _submission_public_result(existing, portal_token=None, idempotent=True)

    full_name = (payload.get("full_name") or "").strip()
    if not full_name or len(full_name) > 200:
        raise AuthError("invalid_name", "Informe o nome completo.", 422)

    phone_normalized = _normalize_phone(str(payload.get("phone") or ""))
    email = _normalize_email(payload.get("email"))
    primary_goal = (payload.get("primary_goal") or "").strip()
    if not primary_goal:
        raise AuthError("invalid_goal", "Informe o objetivo principal.", 422)

    birth_raw = payload.get("birth_date")
    birth_date: date | None = None
    if birth_raw:
        if isinstance(birth_raw, date):
            birth_date = birth_raw
        else:
            try:
                birth_date = date.fromisoformat(str(birth_raw)[:10])
            except ValueError as exc:
                raise AuthError(
                    "invalid_birth_date", "Data de nascimento inválida.", 422
                ) from exc
        if _age_years(birth_date) < 18:
            raise AuthError(
                "underage_blocked",
                "Cadastro disponível apenas para maiores de 18 anos.",
                422,
            )
    else:
        age_band = str(payload.get("age_band") or "").strip()
        if age_band != "18+":
            raise AuthError(
                "age_confirmation_required",
                "Confirme que você tem 18 anos ou mais, ou informe a data de nascimento.",
                422,
            )

    answers = payload.get("answers") or {}
    if not isinstance(answers, dict):
        raise AuthError("invalid_answers", "Respostas da anamnese inválidas.", 422)

    consents = payload.get("consents") or {}
    if not isinstance(consents, dict):
        raise AuthError("invalid_consents", "Consentimentos inválidos.", 422)

    for consent_key in anam_svc.REQUIRED_CONSENT_KEYS:
        if not consents.get(consent_key):
            raise AuthError(
                "consent_required",
                "Aceite todos os consentimentos obrigatórios para continuar.",
                422,
            )

    version = anam_svc.get_published_system_version(db)
    attention = anam_svc.compute_attention_flag(answers, version.schema_json)

    dup, archived_match = _find_duplicate(
        db,
        organization_id=org.id,
        phone_normalized=phone_normalized,
        email=email,
    )

    # Always create a new client row; duplicate is an alert for the professional.
    # Avoid unique email collision while keeping email on the submission record.
    client_email = email
    if (
        email
        and dup is not None
        and dup.email
        and str(dup.email).lower() == email
    ):
        client_email = None
    client = Client(
        id=uuid.uuid4(),
        organization_id=org.id,
        full_name=full_name,
        phone=phone_normalized,
        email=client_email,
        notes=None,
        status="active",
    )
    db.add(client)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AuthError(
            "client_conflict",
            "Não foi possível concluir o cadastro. Tente novamente.",
            409,
        ) from exc

    now = datetime.now(UTC)
    submission = ClientIntakeSubmission(
        id=uuid.uuid4(),
        organization_id=org.id,
        intake_link_id=link.id,
        client_id=client.id,
        idempotency_key=key,
        status="pending_review",
        full_name=full_name,
        phone_normalized=phone_normalized,
        email=email,
        birth_date=birth_date,
        primary_goal=primary_goal,
        occupation=(str(payload.get("occupation")).strip()[:200] if payload.get("occupation") else None),
        emergency_contact=(
            str(payload.get("emergency_contact")).strip()[:200]
            if payload.get("emergency_contact")
            else None
        ),
        initial_notes=(
            str(payload.get("initial_notes")).strip() if payload.get("initial_notes") else None
        ),
        duplicate_client_id=dup.id if dup else None,
        duplicate_alert=dup is not None,
        archived_match=archived_match,
        requires_professional_attention=attention,
        submitted_at=now,
    )
    db.add(submission)
    db.flush()

    response = ClientAnamnesisResponse(
        id=uuid.uuid4(),
        organization_id=org.id,
        client_id=client.id,
        submission_id=submission.id,
        template_version_id=version.id,
        answers_json=answers,
        requires_professional_attention=attention,
    )
    db.add(response)

    for consent_key, accepted in consents.items():
        meta = anam_svc.CONSENT_META.get(str(consent_key))
        if meta is None:
            continue
        db.add(
            ConsentRecord(
                id=uuid.uuid4(),
                organization_id=org.id,
                client_id=client.id,
                submission_id=submission.id,
                consent_key=str(consent_key),
                text_version=anam_svc.CONSENT_TEXT_VERSION,
                accepted=bool(accepted),
                purpose=meta["purpose"],
                legal_basis=meta["legal_basis"],
                accepted_at=now,
            )
        )

    journey_svc.create_journey(
        db,
        organization_id=org.id,
        client_id=client.id,
        stage="pending_review",
        requires_professional_attention=attention,
        next_action="review_submission",
    )

    portal_raw = generate_session_token()
    portal = ClientPublicAccess(
        id=uuid.uuid4(),
        organization_id=org.id,
        client_id=client.id,
        token_hash=hash_session_token(portal_raw),
        created_by_user_id=None,
    )
    db.add(portal)
    db.flush()
    submission.portal_access_id = portal.id
    db.add(submission)

    link.last_used_at = now
    db.add(link)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Race on idempotency
        again = db.scalar(
            select(ClientIntakeSubmission).where(
                ClientIntakeSubmission.organization_id == org.id,
                ClientIntakeSubmission.idempotency_key == key,
            )
        )
        if again is not None:
            return _submission_public_result(again, portal_token=None, idempotent=True)
        raise AuthError(
            "submit_conflict",
            "Não foi possível concluir o envio. Tente novamente.",
            409,
        ) from exc

    db.refresh(submission)
    logger.info(
        "intake_submitted org=%s submission=%s attention=%s duplicate=%s",
        org.id,
        submission.id,
        attention,
        bool(dup),
    )
    return _submission_public_result(submission, portal_token=portal_raw, idempotent=False)


def _submission_public_result(
    submission: ClientIntakeSubmission,
    *,
    portal_token: str | None,
    idempotent: bool,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "submission_id": str(submission.id),
        "client_id": str(submission.client_id) if submission.client_id else None,
        "status": submission.status,
        "requires_professional_attention": submission.requires_professional_attention,
        "attention_message": ATTENTION_SAFE_MESSAGE
        if submission.requires_professional_attention
        else None,
        "idempotent_replay": idempotent,
        "portal_token": portal_token,
        "portal_path": _portal_path(portal_token) if portal_token else None,
        "portal_url": _portal_url(portal_token) if portal_token else None,
        "duplicate_alert": submission.duplicate_alert,
        "archived_match": submission.archived_match,
    }
    return result


def list_submissions(
    db: Session, *, organization_id: uuid.UUID, status: str | None = None
) -> list[ClientIntakeSubmission]:
    q = select(ClientIntakeSubmission).where(
        ClientIntakeSubmission.organization_id == organization_id
    )
    if status:
        q = q.where(ClientIntakeSubmission.status == status)
    return list(
        db.scalars(q.order_by(ClientIntakeSubmission.submitted_at.desc().nullslast())).all()
    )


def get_submission(
    db: Session, *, organization_id: uuid.UUID, submission_id: uuid.UUID
) -> dict[str, Any]:
    row = db.scalar(
        select(ClientIntakeSubmission).where(
            ClientIntakeSubmission.id == submission_id,
            ClientIntakeSubmission.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("submission_not_found", "Submissão não encontrada.", 404)
    anam = db.scalar(
        select(ClientAnamnesisResponse).where(
            ClientAnamnesisResponse.submission_id == row.id
        )
    )
    consents = list(
        db.scalars(
            select(ConsentRecord).where(ConsentRecord.submission_id == row.id)
        ).all()
    )
    journey = None
    if row.client_id:
        journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=row.client_id
        )
    return {
        "submission": row,
        "anamnesis": anam,
        "consents": consents,
        "journey": journey,
    }


def approve_submission(
    db: Session,
    *,
    organization_id: uuid.UUID,
    submission_id: uuid.UUID,
    user_id: uuid.UUID,
    message_to_client: str | None = None,
    evaluation_decision: str | None = None,
    protocol_decision: str | None = None,
) -> ClientIntakeSubmission:
    data = get_submission(
        db, organization_id=organization_id, submission_id=submission_id
    )
    row: ClientIntakeSubmission = data["submission"]
    if row.status != "pending_review":
        raise AuthError(
            "invalid_submission_status",
            "Somente submissões aguardando análise podem ser aprovadas.",
            422,
        )
    if row.client_id is None:
        raise AuthError("client_missing", "Submissão sem cliente associado.", 422)

    now = datetime.now(UTC)
    row.status = "approved"
    row.reviewed_at = now
    row.reviewed_by_user_id = user_id
    row.message_to_client = message_to_client
    db.add(row)

    to_stage = "approved"
    if evaluation_decision or protocol_decision:
        to_stage = journey_svc.compute_stage_after_decisions(
            evaluation_decision=evaluation_decision,
            protocol_decision=protocol_decision,
        )
        if to_stage == "approved" and (
            evaluation_decision is not None or protocol_decision is not None
        ):
            # Partial decisions stay at approved until both resolved.
            to_stage = "approved"

    journey = journey_svc.get_journey(
        db, organization_id=organization_id, client_id=row.client_id
    )
    if journey is None:
        journey = journey_svc.create_journey(
            db,
            organization_id=organization_id,
            client_id=row.client_id,
            stage="pending_review",
        )
    if journey.stage == "pending_review":
        journey_svc.transition_journey(
            db,
            organization_id=organization_id,
            client_id=row.client_id,
            to_stage="approved",
            evaluation_decision=evaluation_decision,
            protocol_decision=protocol_decision,
            next_action="continue_onboarding",
        )
        if to_stage != "approved":
            journey_svc.transition_journey(
                db,
                organization_id=organization_id,
                client_id=row.client_id,
                to_stage=to_stage,
                evaluation_decision=evaluation_decision,
                protocol_decision=protocol_decision,
            )
    db.commit()
    db.refresh(row)
    logger.info("intake_approved org=%s submission=%s", organization_id, submission_id)
    return row


def request_changes_submission(
    db: Session,
    *,
    organization_id: uuid.UUID,
    submission_id: uuid.UUID,
    user_id: uuid.UUID,
    message_to_client: str,
) -> ClientIntakeSubmission:
    data = get_submission(
        db, organization_id=organization_id, submission_id=submission_id
    )
    row: ClientIntakeSubmission = data["submission"]
    if row.status != "pending_review":
        raise AuthError(
            "invalid_submission_status",
            "Somente submissões aguardando análise podem solicitar ajustes.",
            422,
        )
    row.status = "changes_requested"
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = user_id
    row.message_to_client = message_to_client
    db.add(row)
    if row.client_id:
        journey_svc.transition_journey(
            db,
            organization_id=organization_id,
            client_id=row.client_id,
            to_stage="pending_anamnesis",
            next_action="update_anamnesis",
        )
    db.commit()
    db.refresh(row)
    return row


def reject_submission(
    db: Session,
    *,
    organization_id: uuid.UUID,
    submission_id: uuid.UUID,
    user_id: uuid.UUID,
    rejection_internal_reason: str | None = None,
    message_to_client: str | None = None,
) -> ClientIntakeSubmission:
    data = get_submission(
        db, organization_id=organization_id, submission_id=submission_id
    )
    row: ClientIntakeSubmission = data["submission"]
    if row.status != "pending_review":
        raise AuthError(
            "invalid_submission_status",
            "Somente submissões aguardando análise podem ser recusadas.",
            422,
        )
    row.status = "rejected"
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = user_id
    row.rejection_internal_reason = rejection_internal_reason
    row.message_to_client = message_to_client
    db.add(row)
    if row.client_id:
        journey_svc.transition_journey(
            db,
            organization_id=organization_id,
            client_id=row.client_id,
            to_stage="rejected",
            next_action=None,
        )
    db.commit()
    db.refresh(row)
    logger.info("intake_rejected org=%s submission=%s", organization_id, submission_id)
    return row


def get_portal_intake_status(db: Session, *, portal_token: str) -> dict[str, Any]:
    if not portal_token or not portal_token.strip():
        raise GENERIC_TOKEN_ERROR
    digest = hash_session_token(portal_token.strip())
    access = db.scalar(
        select(ClientPublicAccess).where(
            ClientPublicAccess.token_hash == digest,
            ClientPublicAccess.revoked_at.is_(None),
        )
    )
    if access is None:
        raise GENERIC_TOKEN_ERROR

    access.last_used_at = datetime.now(UTC)
    db.add(access)

    journey = journey_svc.get_journey(
        db, organization_id=access.organization_id, client_id=access.client_id
    )
    submission = db.scalar(
        select(ClientIntakeSubmission)
        .where(
            ClientIntakeSubmission.organization_id == access.organization_id,
            ClientIntakeSubmission.client_id == access.client_id,
        )
        .order_by(ClientIntakeSubmission.submitted_at.desc().nullslast())
    )
    org = db.get(Organization, access.organization_id)
    client = db.get(Client, access.client_id)

    published_protocol = None
    proto = db.scalar(
        select(Protocol)
        .where(
            Protocol.organization_id == access.organization_id,
            Protocol.client_id == access.client_id,
            Protocol.status == "published",
        )
        .order_by(Protocol.updated_at.desc())
    )
    if proto is not None and proto.current_version_number > 0:
        ver = db.scalar(
            select(ProtocolVersion).where(
                ProtocolVersion.protocol_id == proto.id,
                ProtocolVersion.version_number == proto.current_version_number,
                ProtocolVersion.status == "published",
            )
        )
        if ver is not None:
            published_protocol = {
                "title": proto.title,
                "version_number": ver.version_number,
                "content": ver.content_json,
                "published_at": ver.published_at,
            }

    db.commit()

    stage = journey.stage if journey else "active"
    return {
        "professional_public_name": org.name if org else None,
        "client_first_name": (client.full_name.split()[0] if client else None),
        "journey_stage": stage,
        "journey_label": journey_svc.stage_label(stage),
        "submission_status": submission.status if submission else None,
        "message_to_client": submission.message_to_client if submission else None,
        "requires_professional_attention": bool(
            journey.requires_professional_attention if journey else False
        ),
        "attention_message": ATTENTION_SAFE_MESSAGE
        if (journey and journey.requires_professional_attention)
        else None,
        "protocol": published_protocol,
    }


def set_evaluation_decision(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    decision: str,
) -> ClientJourney:
    if decision not in {"needed", "waived", "external", "completed"}:
        raise AuthError("invalid_decision", "Decisão de avaliação inválida.", 422)
    journey = journey_svc.ensure_legacy_active_journey(
        db, organization_id=organization_id, client_id=client_id
    )
    journey.evaluation_decision = decision
    db.add(journey)
    db.flush()

    if journey.stage in {"approved", "evaluation_pending"}:
        target = journey_svc.compute_stage_after_decisions(
            evaluation_decision=decision,
            protocol_decision=journey.protocol_decision,
        )
        if target != journey.stage and target in journey_svc.VALID_TRANSITIONS.get(
            journey.stage, set()
        ):
            journey_svc.transition_journey(
                db,
                organization_id=organization_id,
                client_id=client_id,
                to_stage=target,
                evaluation_decision=decision,
            )
        elif decision == "needed" and journey.stage == "approved":
            journey_svc.transition_journey(
                db,
                organization_id=organization_id,
                client_id=client_id,
                to_stage="evaluation_pending",
                evaluation_decision=decision,
            )
    db.commit()
    db.refresh(journey)
    return journey


def set_protocol_decision(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    decision: str,
) -> ClientJourney:
    if decision not in {"needed", "waived", "published"}:
        raise AuthError("invalid_decision", "Decisão de protocolo inválida.", 422)
    journey = journey_svc.ensure_legacy_active_journey(
        db, organization_id=organization_id, client_id=client_id
    )
    journey.protocol_decision = decision
    db.add(journey)
    db.flush()

    if journey.stage in {"approved", "evaluation_pending", "protocol_pending"}:
        if decision == "needed" and journey.stage in {"approved", "evaluation_pending"}:
            # Only move to protocol_pending when evaluation not blocking
            if journey.evaluation_decision != "needed" or journey.stage == "evaluation_pending":
                if journey.evaluation_decision in {
                    "waived",
                    "external",
                    "completed",
                    None,
                } and journey.stage == "approved":
                    pass
                if (
                    journey.evaluation_decision
                    in {"waived", "external", "completed"}
                    or decision == "needed"
                ):
                    target = "protocol_pending"
                    if journey.stage == "approved" and journey.evaluation_decision == "needed":
                        target = "evaluation_pending"
                    elif journey.stage in {"approved", "evaluation_pending"} and decision == "needed":
                        if journey.evaluation_decision != "needed":
                            target = "protocol_pending"
                        else:
                            target = None
                    if target and target != journey.stage:
                        try:
                            journey_svc.transition_journey(
                                db,
                                organization_id=organization_id,
                                client_id=client_id,
                                to_stage=target,
                                protocol_decision=decision,
                            )
                        except AuthError:
                            pass
        else:
            target = journey_svc.compute_stage_after_decisions(
                evaluation_decision=journey.evaluation_decision,
                protocol_decision=decision,
            )
            if target != journey.stage:
                try:
                    journey_svc.transition_journey(
                        db,
                        organization_id=organization_id,
                        client_id=client_id,
                        to_stage=target,
                        protocol_decision=decision,
                    )
                except AuthError:
                    journey.protocol_decision = decision
                    db.add(journey)
    db.commit()
    db.refresh(journey)
    return journey


def prepare_start_checklist(
    db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID
) -> dict[str, Any]:
    journey = journey_svc.ensure_legacy_active_journey(
        db, organization_id=organization_id, client_id=client_id
    )
    has_published_protocol = (
        db.scalar(
            select(func.count())
            .select_from(Protocol)
            .where(
                Protocol.organization_id == organization_id,
                Protocol.client_id == client_id,
                Protocol.status == "published",
            )
        )
        or 0
    ) > 0
    checklist = {
        "journey_stage": journey.stage,
        "evaluation_decision": journey.evaluation_decision,
        "protocol_decision": journey.protocol_decision,
        "evaluation_ok": journey.evaluation_decision
        in {"waived", "external", "completed"},
        "protocol_ok": (journey.protocol_decision in {"waived", "published"})
        or has_published_protocol,
        "attention_cleared": not journey.requires_professional_attention
        or bool(journey.attention_note),
        "ready": False,
    }
    checklist["ready"] = (
        checklist["evaluation_ok"]
        and checklist["protocol_ok"]
        and checklist["attention_cleared"]
        and journey.stage in {"ready_to_start", "approved", "protocol_pending", "evaluation_pending"}
    )
    if checklist["ready"] and journey.stage != "active":
        # Move toward ready_to_start / active when checklist passes
        if journey.stage != "ready_to_start":
            try:
                if journey.stage in {"approved", "evaluation_pending", "protocol_pending"}:
                    # step through allowed transitions toward ready_to_start
                    while journey.stage != "ready_to_start":
                        nxt = journey_svc.compute_stage_after_decisions(
                            evaluation_decision=journey.evaluation_decision
                            or "waived",
                            protocol_decision=journey.protocol_decision or "waived",
                        )
                        if nxt == journey.stage:
                            if "ready_to_start" in journey_svc.VALID_TRANSITIONS.get(
                                journey.stage, set()
                            ):
                                journey = journey_svc.transition_journey(
                                    db,
                                    organization_id=organization_id,
                                    client_id=client_id,
                                    to_stage="ready_to_start",
                                )
                            break
                        journey = journey_svc.transition_journey(
                            db,
                            organization_id=organization_id,
                            client_id=client_id,
                            to_stage=nxt,
                        )
            except AuthError:
                pass
        if journey.stage == "ready_to_start":
            journey = journey_svc.transition_journey(
                db,
                organization_id=organization_id,
                client_id=client_id,
                to_stage="active",
                next_action=None,
            )
        db.commit()
        db.refresh(journey)
        checklist["journey_stage"] = journey.stage
    else:
        db.commit()
    return checklist


def intake_home_counts(db: Session, *, organization_id: uuid.UUID, today: date) -> dict[str, int]:
    new_submissions = (
        db.scalar(
            select(func.count())
            .select_from(ClientIntakeSubmission)
            .where(
                ClientIntakeSubmission.organization_id == organization_id,
                ClientIntakeSubmission.status == "pending_review",
            )
        )
        or 0
    )
    evaluation_pending = (
        db.scalar(
            select(func.count())
            .select_from(ClientJourney)
            .where(
                ClientJourney.organization_id == organization_id,
                ClientJourney.stage == "evaluation_pending",
            )
        )
        or 0
    )
    protocol_pending = (
        db.scalar(
            select(func.count())
            .select_from(ClientJourney)
            .where(
                ClientJourney.organization_id == organization_id,
                ClientJourney.stage == "protocol_pending",
            )
        )
        or 0
    )
    protocol_reviews_due = (
        db.scalar(
            select(func.count())
            .select_from(Protocol)
            .where(
                Protocol.organization_id == organization_id,
                Protocol.review_due_on.is_not(None),
                Protocol.review_due_on <= today,
                Protocol.status.in_(["published", "ready"]),
            )
        )
        or 0
    )
    from app.models.intake import RecurringClientTask

    routines_due = (
        db.scalar(
            select(func.count())
            .select_from(RecurringClientTask)
            .where(
                RecurringClientTask.organization_id == organization_id,
                RecurringClientTask.status == "active",
                RecurringClientTask.next_run_on.is_not(None),
                RecurringClientTask.next_run_on <= today,
            )
        )
        or 0
    )
    return {
        "new_submissions_count": int(new_submissions),
        "anamnesis_pending_count": int(new_submissions),
        "evaluation_pending_count": int(evaluation_pending),
        "protocol_pending_count": int(protocol_pending),
        "protocol_reviews_due_count": int(protocol_reviews_due),
        "routines_due_today_count": int(routines_due),
    }


def platform_intake_stats(db: Session) -> dict[str, Any]:
    active_links = (
        db.scalar(
            select(func.count())
            .select_from(OrganizationIntakeLink)
            .where(OrganizationIntakeLink.status == "active")
        )
        or 0
    )
    by_status_rows = db.execute(
        select(ClientIntakeSubmission.status, func.count())
        .group_by(ClientIntakeSubmission.status)
    ).all()
    by_status = {str(status): int(count) for status, count in by_status_rows}
    return {
        "active_intake_links": int(active_links),
        "submissions_by_status": by_status,
        "submissions_total": sum(by_status.values()),
    }
