"""Organization intake links, public submit, and professional review queue."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models.client import Client
from app.models.client_public_access import ClientPublicAccess
from app.models.intake import (
    AnamnesisTemplate,
    ClientAnamnesisResponse,
    ClientIntakeSubmission,
    ClientJourney,
    ConsentRecord,
    OrganizationIntakeLink,
    Protocol,
    ProtocolVersion,
)
from app.models.organization import Organization
from app.security.client_intake_link_token import (
    InvalidClientIntakeLinkToken,
    mint_client_intake_link_token,
    parse_client_intake_link_token,
)
from app.security.intake_link_token import (
    InvalidIntakeLinkToken,
    mint_intake_link_token,
    parse_intake_link_token,
)
from app.security.passwords import generate_session_token, hash_session_token
from app.security.portal_token import InvalidPortalToken, mint_portal_token, parse_portal_token
from app.services import anamnesis_snapshot as snap_svc
from app.services import anamnesis_template as anam_svc
from app.services import journey as journey_svc
from app.services import profession as profession_svc
from app.services import profession_profile as profiles
from app.services.auth import AuthError

logger = logging.getLogger("croniu.intake")

GENERIC_TOKEN_ERROR = AuthError(
    "intake_link_invalid",
    "Link inválido ou indisponível.",
    404,
)

AMBIGUOUS_SUBMISSION_MESSAGE = (
    "Resolva a possível duplicidade (vincular a um aluno existente ou "
    "manter como novo) antes de continuar."
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


def _wa_invite(url: str, *, form_noun: str, greeting_name: str | None = None) -> str:
    noun = (form_noun or "cadastro").strip()
    if noun.lower() in {"anamnese", "anamnese de atividade física"}:
        preencha = "seu cadastro e sua anamnese"
    elif noun.lower().startswith("ficha"):
        preencha = f"sua {noun}"
    else:
        preencha = f"seu {noun}"
    greeting = f"Olá, {greeting_name}!" if greeting_name else "Olá!"
    msg = (
        f"{greeting} Para facilitar seu acompanhamento, preencha {preencha} "
        f"no Croniu pelo link abaixo:\n{url}"
    )
    return f"https://wa.me/?text={quote(msg)}"


def _active_link(db: Session, organization_id: uuid.UUID) -> OrganizationIntakeLink | None:
    primary = db.scalar(
        select(OrganizationIntakeLink).where(
            OrganizationIntakeLink.organization_id == organization_id,
            OrganizationIntakeLink.status == "active",
            OrganizationIntakeLink.is_primary.is_(True),
        )
    )
    if primary is not None:
        return primary
    return db.scalar(
        select(OrganizationIntakeLink)
        .where(
            OrganizationIntakeLink.organization_id == organization_id,
            OrganizationIntakeLink.status == "active",
        )
        .order_by(OrganizationIntakeLink.created_at.desc())
    )


def _link_out(
    row: OrganizationIntakeLink,
    *,
    form_noun: str | None = None,
) -> dict[str, Any]:
    # The public token is a deterministic HMAC of the row id (see
    # app.security.intake_link_token), not a stored secret — so it can be
    # reconstructed identically on every call. This lets the professional's
    # dashboard always show the same, reusable link for an active row
    # (reload, logout/login, new device) without ever persisting the raw
    # token. Links created before this scheme keep validating via
    # token_hash — see _resolve_active_link_by_token.
    noun = form_noun or "cadastro"
    signed = mint_intake_link_token(row.id) if row.status == "active" else None
    url = _public_intake_url(signed) if signed else None
    return {
        "has_active_link": row.status == "active",
        "id": str(row.id),
        "status": row.status,
        "name": row.name,
        "purpose": row.purpose,
        "form_kind": row.form_kind,
        "is_primary": bool(row.is_primary),
        "submissions_count": int(row.submissions_count or 0),
        "created_at": row.created_at,
        "rotated_at": row.rotated_at,
        "last_used_at": row.last_used_at,
        "token": signed,
        "public_path": _public_intake_path(signed) if signed else None,
        "public_url": url,
        "wa_message_url": _wa_invite(url, form_noun=noun) if url else None,
    }


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
            "name": None,
            "purpose": None,
            "form_kind": None,
            "is_primary": False,
            "submissions_count": 0,
        }
    return _link_out(row)


def list_intake_links(
    db: Session, *, organization_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(
            select(OrganizationIntakeLink)
            .where(OrganizationIntakeLink.organization_id == organization_id)
            .order_by(
                OrganizationIntakeLink.is_primary.desc(),
                OrganizationIntakeLink.created_at.desc(),
            )
        ).all()
    )
    return [_link_out(r) for r in rows]


def _pin_for_organization(
    db: Session,
    *,
    organization_id: uuid.UUID,
    requested_form_kind: str | None,
) -> tuple[Organization | None, dict[str, Any], Any]:
    org = db.get(Organization, organization_id)
    profession = org.profession_code if org else None
    requested = (requested_form_kind or "").strip() or None
    if requested and not profiles.form_kind_allowed(profession, requested):
        logger.warning(
            "intake_incompatible_form_kind org=%s requested=%s",
            organization_id,
            requested,
        )
        raise AuthError(
            "incompatible_form_kind",
            "Formulário incompatível com a profissão da organização.",
            422,
        )
    profile = profiles.profile_for(profession)
    version = anam_svc.get_published_version_for_code(db, profile["intake_template_code"])
    return org, profile, version


def create_intake_link(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    name: str = "Link de entrada",
    purpose: str = "new_client",
    form_kind: str | None = None,
    set_primary: bool = False,
) -> dict[str, Any]:
    row, profile = _ensure_active_link_row(
        db,
        organization_id=organization_id,
        user_id=user_id,
        name=name,
        purpose=purpose,
        form_kind=form_kind,
        set_primary=set_primary,
    )
    return _link_out(row, form_noun=profile["intake_form_noun"])


def _ensure_active_link_row(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    name: str = "Link de entrada",
    purpose: str = "new_client",
    form_kind: str | None = None,
    set_primary: bool = False,
) -> tuple[OrganizationIntakeLink, dict[str, Any]]:
    # Serialize concurrent "invite" taps for the same organization (double
    # click, duplicate request) so at most one link ends up primary/active
    # from a single burst of create calls — no schema change required.
    db.execute(
        select(Organization.id).where(Organization.id == organization_id).with_for_update()
    )
    _org, profile, version = _pin_for_organization(
        db, organization_id=organization_id, requested_form_kind=form_kind
    )
    resolved_kind = profile["intake_form_kind"]
    existing_active = list(
        db.scalars(
            select(OrganizationIntakeLink).where(
                OrganizationIntakeLink.organization_id == organization_id,
                OrganizationIntakeLink.status == "active",
            )
        ).all()
    )
    if not set_primary and existing_active:
        # A concurrent call already ensured a link while we waited on the
        # organization lock above — reuse it instead of minting a second
        # active row for the same "invite" tap.
        primary = next((r for r in existing_active if r.is_primary), existing_active[0])
        return primary, profile
    make_primary = set_primary or len(existing_active) == 0
    if make_primary:
        for other in existing_active:
            other.is_primary = False
            db.add(other)
    raw = generate_session_token()
    row = OrganizationIntakeLink(
        id=uuid.uuid4(),
        organization_id=organization_id,
        token_hash=hash_session_token(raw),
        status="active",
        name=(name or "Link de entrada").strip()[:120],
        purpose=(purpose or "new_client").strip()[:64],
        form_kind=resolved_kind[:64],
        is_primary=make_primary,
        created_by_user_id=user_id,
        template_version_id=version.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "intake_link created org=%s form_kind=%s template=%s",
        organization_id,
        row.form_kind,
        profile["intake_template_code"],
    )
    return row, profile


def create_client_intake_link(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    user_id: uuid.UUID | None,
) -> dict[str, Any]:
    """Mint a contextual invite bound to one existing client.

    Reuses the organization's active intake link (creating it if none
    exists yet, exactly like the generic "Convidar aluno" invite) but
    signs a token that also binds the target client id — see
    app.security.client_intake_link_token. No new row or column is
    created for the binding itself; it lives entirely inside the token
    and is re-validated on every public use.
    """
    client = db.scalar(
        select(Client).where(
            Client.id == client_id, Client.organization_id == organization_id
        )
    )
    if client is None:
        raise AuthError("client_not_found", "Cliente não encontrado.", 404)
    if client.status != "active":
        raise AuthError(
            "client_not_active",
            "Reative o cliente antes de enviar um convite de cadastro.",
            422,
        )
    row, profile = _ensure_active_link_row(
        db, organization_id=organization_id, user_id=user_id
    )
    signed = mint_client_intake_link_token(row.id, client.id)
    url = _public_intake_url(signed)
    first_name = (client.full_name or "").strip().split()[0] if client.full_name else None
    return {
        "client_id": str(client.id),
        "full_name": client.full_name,
        "token": signed,
        "public_path": _public_intake_path(signed),
        "public_url": url,
        "wa_message_url": _wa_invite(
            url, form_noun=profile["intake_form_noun"], greeting_name=first_name
        ),
    }


def set_primary_intake_link(
    db: Session, *, organization_id: uuid.UUID, link_id: uuid.UUID
) -> dict[str, Any]:
    row = db.scalar(
        select(OrganizationIntakeLink).where(
            OrganizationIntakeLink.id == link_id,
            OrganizationIntakeLink.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("intake_link_not_found", "Link não encontrado.", 404)
    others = list(
        db.scalars(
            select(OrganizationIntakeLink).where(
                OrganizationIntakeLink.organization_id == organization_id,
                OrganizationIntakeLink.id != link_id,
            )
        ).all()
    )
    for other in others:
        other.is_primary = False
        db.add(other)
    row.is_primary = True
    if row.status != "active":
        row.status = "active"
        row.disabled_at = None
    db.add(row)
    db.commit()
    db.refresh(row)
    return _link_out(row)


def rotate_intake_link(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    link_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    if link_id is not None:
        current = db.scalar(
            select(OrganizationIntakeLink).where(
                OrganizationIntakeLink.id == link_id,
                OrganizationIntakeLink.organization_id == organization_id,
            )
        )
    else:
        current = _active_link(db, organization_id)
    if current is None:
        raise AuthError("intake_link_not_found", "Link não encontrado.", 404)
    was_primary = bool(current.is_primary)
    name = current.name
    purpose = current.purpose
    _org, profile, version = _pin_for_organization(
        db, organization_id=organization_id, requested_form_kind=None
    )
    current.status = "disabled"
    current.disabled_at = now
    current.rotated_at = now
    current.is_primary = False
    db.add(current)
    db.flush()
    raw = generate_session_token()
    row = OrganizationIntakeLink(
        id=uuid.uuid4(),
        organization_id=organization_id,
        token_hash=hash_session_token(raw),
        status="active",
        name=name or "Link principal",
        purpose=purpose or "new_client",
        form_kind=profile["intake_form_kind"],
        is_primary=was_primary,
        created_by_user_id=user_id,
        rotated_at=now,
        template_version_id=version.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("intake_link rotated org=%s form_kind=%s", organization_id, row.form_kind)
    return _link_out(row, form_noun=profile["intake_form_noun"])


def disable_intake_link(
    db: Session, *, organization_id: uuid.UUID, link_id: uuid.UUID | None = None
) -> dict[str, Any]:
    now = datetime.now(UTC)
    if link_id is not None:
        row = db.scalar(
            select(OrganizationIntakeLink).where(
                OrganizationIntakeLink.id == link_id,
                OrganizationIntakeLink.organization_id == organization_id,
            )
        )
    else:
        row = _active_link(db, organization_id)
    if row is None:
        return get_intake_link(db, organization_id=organization_id)
    row.status = "disabled"
    row.disabled_at = now
    if row.is_primary:
        row.is_primary = False
        replacement = db.scalar(
            select(OrganizationIntakeLink)
            .where(
                OrganizationIntakeLink.organization_id == organization_id,
                OrganizationIntakeLink.status == "active",
                OrganizationIntakeLink.id != row.id,
            )
            .order_by(OrganizationIntakeLink.created_at.desc())
        )
        if replacement is not None:
            replacement.is_primary = True
            db.add(replacement)
    db.add(row)
    db.commit()
    logger.info("intake_link disabled org=%s", organization_id)
    return get_intake_link(db, organization_id=organization_id)


def _resolve_active_link_by_token(
    db: Session, *, raw_token: str
) -> tuple[OrganizationIntakeLink, Organization]:
    token = (raw_token or "").strip()
    if not token:
        raise GENERIC_TOKEN_ERROR

    row: OrganizationIntakeLink | None = None
    try:
        signed_id = parse_intake_link_token(token)
    except InvalidIntakeLinkToken as exc:
        raise GENERIC_TOKEN_ERROR from exc

    if signed_id is not None:
        row = db.get(OrganizationIntakeLink, signed_id)
    else:
        digest = hash_session_token(token)
        row = db.scalar(
            select(OrganizationIntakeLink).where(
                OrganizationIntakeLink.token_hash == digest,
            )
        )

    # Re-checked here regardless of which path resolved the row: a signed
    # token stays cryptographically valid even after the link is disabled,
    # so "active" status is the actual source of truth for revocation.
    if row is None or row.status != "active":
        raise GENERIC_TOKEN_ERROR
    org = db.get(Organization, row.organization_id)
    if org is None:
        raise GENERIC_TOKEN_ERROR
    return row, org


def _resolve_link_and_client_by_token(
    db: Session, *, raw_token: str
) -> tuple[OrganizationIntakeLink, Organization, Client | None]:
    """Resolve a public intake token to (link, org, bound_client).

    bound_client is not None only for a contextual invite minted by
    create_client_intake_link (a "ci1." token) — every check below must
    pass or the generic, uniform GENERIC_TOKEN_ERROR is raised, exactly
    like any other invalid link, so a tampered or stale binding never
    leaks which part of it was wrong. A generic ("l1." or legacy) token
    always resolves with bound_client=None, unchanged from before.
    """
    token = (raw_token or "").strip()
    if not token:
        raise GENERIC_TOKEN_ERROR

    try:
        composite = parse_client_intake_link_token(token)
    except InvalidClientIntakeLinkToken as exc:
        raise GENERIC_TOKEN_ERROR from exc

    if composite is None:
        link, org = _resolve_active_link_by_token(db, raw_token=token)
        return link, org, None

    link_id, client_id = composite
    link = db.get(OrganizationIntakeLink, link_id)
    if link is None or link.status != "active":
        raise GENERIC_TOKEN_ERROR
    org = db.get(Organization, link.organization_id)
    if org is None:
        raise GENERIC_TOKEN_ERROR
    client = db.scalar(
        select(Client).where(
            Client.id == client_id, Client.organization_id == org.id
        )
    )
    if client is None or client.status != "active":
        raise GENERIC_TOKEN_ERROR
    return link, org, client


def _schema_for_link(
    db: Session, link: OrganizationIntakeLink, org: Organization | None
) -> tuple[dict, str, str]:
    profile = profiles.profile_for(org.profession_code if org else None)
    expected_code = profile["intake_template_code"]

    if link.template_version_id:
        pinned = anam_svc.get_template_version(db, version_id=link.template_version_id)
        if pinned is not None:
            tpl = db.get(AnamnesisTemplate, pinned.template_id)
            if tpl is not None and tpl.organization_id is not None:
                if org is None or tpl.organization_id != org.id:
                    logger.warning(
                        "intake_cross_tenant_template org=%s",
                        link.organization_id,
                    )
                    raise GENERIC_TOKEN_ERROR
            code = tpl.code if tpl is not None else None
            if code and profiles.template_code_allowed(org.profession_code if org else None, code):
                schema = dict(pinned.schema_json)
                form_name = (
                    schema.get("form_name")
                    or schema.get("name")
                    or profile["form_title"]
                )
                schema["form_name"] = form_name
                return schema, str(pinned.id), form_name
            logger.warning(
                "intake_pin_corrected org=%s from=%s to=%s",
                link.organization_id,
                code,
                expected_code,
            )

    version = anam_svc.get_published_version_for_code(db, expected_code)
    link.template_version_id = version.id
    link.form_kind = profile["intake_form_kind"]
    db.add(link)
    schema = dict(version.schema_json)
    form_name = schema.get("form_name") or schema.get("name") or profile["form_title"]
    schema["form_name"] = form_name
    return schema, str(version.id), form_name


def get_public_intake_context(db: Session, *, raw_token: str) -> dict[str, Any]:
    link, org, bound_client = _resolve_link_and_client_by_token(db, raw_token=raw_token)
    schema, template_version_id, form_name = _schema_for_link(db, link, org)
    link.last_used_at = datetime.now(UTC)
    db.add(link)
    db.commit()
    terms = profession_svc.nomenclature_for(org.profession_code)
    intake_noun = terms.get("intake_form") or form_name
    result: dict[str, Any] = {
        "professional_public_name": org.name,
        "welcome_message": f"Bem-vindo(a) ao acompanhamento com {org.name}.",
        "process_summary": (
            f"Preencha seus dados, o {intake_noun} e os consentimentos. "
            "O profissional analisará antes de liberar o acompanhamento."
        ),
        "anamnesis_schema": schema,
        "template_version_id": template_version_id,
        "attention_client_message": schema.get("attention_client_message") or ATTENTION_SAFE_MESSAGE,
        "form_kind": link.form_kind,
        "form_name": form_name,
        "nomenclature": terms,
    }
    # Only the minimum identity fields needed to spare the client from
    # retyping what the professional already has — never anamnesis
    # history, billing, cycles, or any other data about them or anyone
    # else (see create_client_intake_link / _resolve_link_and_client_by_token).
    if bound_client is not None:
        result["prefill_full_name"] = bound_client.full_name
        result["prefill_email"] = bound_client.email
        result["prefill_phone"] = bound_client.phone
        # If this contextual link is being used to correct a submission the
        # professional sent back (see request_changes_submission /
        # submit_intake's correcting_submission), prefill the previous
        # answers too — the client only needs to touch what the message
        # actually asks about, not redo the whole anamnesis. Never
        # surfaced for a submission still pending_review/approved/
        # rejected: this is specifically the "changes requested" resume
        # path, not a way to read back an already-decided submission.
        pending_correction = db.scalar(
            select(ClientIntakeSubmission)
            .where(
                ClientIntakeSubmission.organization_id == org.id,
                ClientIntakeSubmission.client_id == bound_client.id,
                ClientIntakeSubmission.status == "changes_requested",
            )
            .order_by(ClientIntakeSubmission.submitted_at.desc().nullslast())
        )
        if pending_correction is not None:
            result["correction_message"] = pending_correction.message_to_client
            prior_answer = db.scalar(
                select(ClientAnamnesisResponse).where(
                    ClientAnamnesisResponse.submission_id == pending_correction.id
                )
            )
            if prior_answer is not None:
                result["prefill_answers"] = prior_answer.answers_json
                result["prefill_birth_date"] = pending_correction.birth_date
                result["prefill_primary_goal"] = pending_correction.primary_goal
                result["prefill_occupation"] = pending_correction.occupation
                result["prefill_emergency_contact"] = pending_correction.emergency_contact
    return result


def _duplicate_candidates(
    db: Session,
    *,
    organization_id: uuid.UUID,
    phone_normalized: str,
    email: str | None,
) -> list[Client]:
    """Every client (any status) in the organization matched by phone
    and/or email — never by name (see submit_intake's "generic invite"
    protection; a shared name alone is never proof of identity).

    Callers decide what to do with the result:
    - 1 candidate, active: safe to auto-link without human review.
    - 0 candidates: genuinely new person.
    - anything else (2+ candidates, or the only one archived): ambiguous
      — a human decision is required (see list_duplicate_candidates /
      link_submission_to_client), never an automatic guess.
    """
    phone_variants = {phone_normalized}
    if phone_normalized.startswith("55") and len(phone_normalized) in {12, 13}:
        phone_variants.add(phone_normalized[2:])

    rows = list(
        db.scalars(
            select(Client).where(Client.organization_id == organization_id)
        ).all()
    )
    matched: dict[uuid.UUID, Client] = {}
    for candidate in rows:
        stored = re.sub(r"\D", "", candidate.phone or "")
        phone_hit = bool(stored) and (
            stored in phone_variants
            or (stored.startswith("55") and stored[2:] in phone_variants)
        )
        email_hit = bool(email) and bool(candidate.email) and candidate.email.lower() == email
        if phone_hit or email_hit:
            matched[candidate.id] = candidate
    return list(matched.values())


def submit_intake(
    db: Session,
    *,
    raw_token: str,
    payload: dict[str, Any],
    idempotency_key: str,
) -> dict[str, Any]:
    # Ignore any client-sent organization_id
    payload = {k: v for k, v in payload.items() if k not in {"organization_id", "template_version_id", "form_kind"}}

    key = (idempotency_key or "").strip()
    if not key or len(key) > 64:
        raise AuthError(
            "idempotency_required",
            "Informe uma chave de idempotência válida.",
            422,
        )

    link, org, bound_client = _resolve_link_and_client_by_token(db, raw_token=raw_token)

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
        raise AuthError("invalid_answers", "Respostas do formulário inválidas.", 422)

    consents = payload.get("consents") or {}
    if not isinstance(consents, dict):
        raise AuthError("invalid_consents", "Consentimentos inválidos.", 422)

    schema, template_version_id, _form_name = _schema_for_link(db, link, org)
    for consent_key in anam_svc.required_consent_keys_from_schema(schema):
        if not consents.get(consent_key):
            raise AuthError(
                "consent_required",
                "Aceite todos os consentimentos obrigatórios para continuar.",
                422,
            )
    attention = anam_svc.compute_attention_flag(answers, schema)

    # Serialize concurrent submissions for the same organization — same
    # lock already used by _ensure_active_link_row for concurrent "invite"
    # taps. Covers every path below that reuses or creates shared state
    # (client rows, client_journeys, client_public_accesses): without it,
    # two simultaneous submissions — via the same contextual token, or a
    # generic link for a genuinely new person — could each observe "no
    # journey yet" / "no candidates yet" before either commits, and race
    # on a client_journeys insert or create two Client rows. A unique
    # index on phone isn't an option here: shared household/family phones
    # are a real, valid case in this domain, not a bug — locking the
    # decision instead of the data is what keeps that possibility open
    # while still closing the race.
    db.execute(select(Organization.id).where(Organization.id == org.id).with_for_update())

    is_new_client = False
    correcting_submission: ClientIntakeSubmission | None = None
    if bound_client is not None:
        # Contextual invite (see create_client_intake_link): the token
        # cryptographically names this exact client, so there is no
        # candidate search at all — complement the existing record
        # in-place instead of ever creating a second one for the same
        # person. Blanks only: a value the professional already entered
        # is never silently overwritten by what the client typed.
        client = bound_client
        dup, archived_match = None, False
        if not (client.full_name or "").strip():
            client.full_name = full_name
            db.add(client)
        if not client.phone:
            client.phone = phone_normalized
            db.add(client)
        if email and not client.email:
            conflict = db.scalar(
                select(Client).where(
                    Client.organization_id == org.id,
                    Client.email == email,
                    Client.id != client.id,
                )
            )
            if conflict is None:
                client.email = email
                db.add(client)
        # A contextual invite reused for a client that already has a
        # submission awaiting correction (request_changes_submission) is a
        # resubmission, not a new event: correct that same submission row
        # in place instead of creating an orphaned second one sitting next
        # to it in the queue. A "pending_review" submission is left alone
        # here — that's still mid-review, not something this new POST
        # should silently overwrite out from under the professional.
        correcting_submission = db.scalar(
            select(ClientIntakeSubmission)
            .where(
                ClientIntakeSubmission.organization_id == org.id,
                ClientIntakeSubmission.client_id == client.id,
                ClientIntakeSubmission.status == "changes_requested",
            )
            .order_by(ClientIntakeSubmission.submitted_at.desc().nullslast())
        )
    else:
        candidates = _duplicate_candidates(
            db,
            organization_id=org.id,
            phone_normalized=phone_normalized,
            email=email,
        )
        active_candidates = [c for c in candidates if c.status == "active"]
        if len(candidates) == 1 and len(active_candidates) == 1:
            # Generic "Convidar aluno" link, but phone and/or email point
            # to exactly one existing ACTIVE client — same protection a
            # contextual invite gives by construction, applied here via
            # trusted identifiers instead of a signed client id. Already
            # resolved, not merely flagged: duplicate_alert stays False so
            # the review UI doesn't point "ver cliente existente" back at
            # the very client this submission now belongs to.
            client = active_candidates[0]
            dup, archived_match = None, False
        else:
            dup = candidates[0] if candidates else None
            archived_match = any(c.status == "archived" for c in candidates)
            is_new_client = True
            is_ambiguous = len(candidates) > 0
            # Ambiguous (2+ candidates, or the single candidate being
            # archived) requires a human decision — never an automatic
            # guess. A client row still has to be created here
            # (client_anamnesis_responses / consent_records /
            # client_journeys all require a non-null client_id — no
            # migration for this hotfix), but it is QUARANTINED:
            # status="pending_duplicate_review" instead of "active", so it
            # never appears in the normal Alunos list, agenda, cycles, AI
            # assistant context, or platform metrics (see
            # app.services.domain.list_clients and the other
            # status-filtered queries this status was added to) until the
            # professional explicitly resolves it via
            # list_duplicate_candidates / link_submission_to_client /
            # keep_as_new_client. A genuinely new person (0 candidates) is
            # not ambiguous at all — created "active" exactly as before.
            #
            # Never carries an email: the org-wide unique constraint on
            # (organization_id, email) is enforced at the DB level
            # regardless of status, so a quarantined placeholder holding
            # an email could block a legitimate future client from ever
            # being created with it. The submission's own `email` column
            # already preserves it for review.
            client = Client(
                id=uuid.uuid4(),
                organization_id=org.id,
                full_name=full_name,
                phone=phone_normalized,
                # Genuinely new (0 candidates) means _duplicate_candidates
                # already confirmed no existing client owns this email —
                # safe to keep. Ambiguous never carries one (see above).
                email=None if is_ambiguous else email,
                notes=None,
                status="pending_duplicate_review" if is_ambiguous else "active",
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
    is_resubmission = correcting_submission is not None
    if is_resubmission:
        # Correct the same submission in place — see the
        # correcting_submission lookup above. Keeps the same id (so any
        # link the professional already opened to review it still points
        # at the right record), moves it back to "pending_review" (the
        # same status a first-time submission gets — a dedicated
        # "resubmitted" value would need a migration, and this is exactly
        # what it means), and clears the fields that described the now-
        # fulfilled request so the review screen doesn't show a stale
        # "ajustes solicitados" message next to the fresh answers.
        submission = correcting_submission
        submission.idempotency_key = key
        submission.status = "pending_review"
        submission.full_name = full_name
        submission.phone_normalized = phone_normalized
        submission.email = email
        submission.birth_date = birth_date
        submission.primary_goal = primary_goal
        submission.occupation = (
            str(payload.get("occupation")).strip()[:200] if payload.get("occupation") else None
        )
        submission.emergency_contact = (
            str(payload.get("emergency_contact")).strip()[:200]
            if payload.get("emergency_contact")
            else None
        )
        submission.initial_notes = (
            str(payload.get("initial_notes")).strip() if payload.get("initial_notes") else None
        )
        submission.requires_professional_attention = attention
        submission.submitted_at = now
        submission.reviewed_at = None
        submission.reviewed_by_user_id = None
        submission.message_to_client = None
        db.add(submission)
    else:
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

    snapshot = snap_svc.build_questions_snapshot(answers=answers, schema=schema)

    if is_resubmission:
        # client_anamnesis_responses has a unique constraint on
        # submission_id — update the existing row instead of inserting a
        # second one for the same submission. The prior answers this
        # replaces already round-tripped through the correction form's
        # prefill (see get_public_intake_context's prefill_answers), so
        # unedited fields are naturally preserved rather than lost.
        existing_response = db.scalar(
            select(ClientAnamnesisResponse).where(
                ClientAnamnesisResponse.submission_id == submission.id
            )
        )
        if existing_response is not None:
            existing_response.answers_json = answers
            existing_response.questions_snapshot = snapshot
            existing_response.template_version_id = uuid.UUID(str(template_version_id))
            existing_response.requires_professional_attention = attention
            db.add(existing_response)
        else:
            db.add(
                ClientAnamnesisResponse(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    client_id=client.id,
                    submission_id=submission.id,
                    template_version_id=uuid.UUID(str(template_version_id)),
                    answers_json=answers,
                    questions_snapshot=snapshot,
                    requires_professional_attention=attention,
                )
            )
        # Consents are a point-in-time acceptance record, not a log —
        # replace with the freshly (re-)accepted set for this submission.
        db.execute(
            delete(ConsentRecord).where(ConsentRecord.submission_id == submission.id)
        )
    else:
        db.add(
            ClientAnamnesisResponse(
                id=uuid.uuid4(),
                organization_id=org.id,
                client_id=client.id,
                submission_id=submission.id,
                template_version_id=uuid.UUID(str(template_version_id)),
                answers_json=answers,
                questions_snapshot=snapshot,
                requires_professional_attention=attention,
            )
        )

    link.submissions_count = int(link.submissions_count or 0) + 1

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

    if is_new_client:
        journey_svc.create_journey(
            db,
            organization_id=org.id,
            client_id=client.id,
            stage="pending_review",
            requires_professional_attention=attention,
            next_action="review_submission",
        )
    else:
        # Reused client (contextual invite or a confident identifier
        # match) may already have an operational journey — e.g. lazily
        # created as "active" the first time the professional opened a
        # manually-added client's ficha. Do not force a stage transition:
        # most later stages have no "pending_review" edge in
        # VALID_TRANSITIONS, and rewinding one would discard real
        # progress (cycles, evaluations, protocols already in place),
        # which section 4 of this fix explicitly forbids. Surface the
        # review as a next action instead, without touching stage.
        existing_journey = journey_svc.get_journey(
            db, organization_id=org.id, client_id=client.id
        )
        if existing_journey is None:
            journey_svc.create_journey(
                db,
                organization_id=org.id,
                client_id=client.id,
                stage="pending_review",
                requires_professional_attention=attention,
                next_action="review_submission",
            )
        else:
            existing_journey.next_action = "review_submission"
            if attention:
                existing_journey.requires_professional_attention = True
            db.add(existing_journey)

    # Reuse any active portal access this client already has instead of
    # inserting a second row — client_public_accesses allows at most one
    # non-revoked row per client (uq_client_public_accesses_one_active).
    # Never touch its token_hash: that would silently invalidate any
    # /c/... link already handed to the client (e.g. from a prior
    # submission, or one the professional generated manually). Instead,
    # reconstruct a signed "v1." token deterministically from the row's
    # id (app.security.portal_token, same scheme app.services.my_cycle
    # already uses for the professional's own reconstructable copy) — the
    # legacy raw token keeps resolving via its stored hash exactly as
    # before, and this new signed one resolves via the same access row,
    # so both work side by side.
    existing_portal = (
        None
        if is_new_client
        else db.scalar(
            select(ClientPublicAccess).where(
                ClientPublicAccess.organization_id == org.id,
                ClientPublicAccess.client_id == client.id,
                ClientPublicAccess.revoked_at.is_(None),
            )
        )
    )
    if existing_portal is not None:
        portal_token_out = mint_portal_token(existing_portal.id)
        submission.portal_access_id = existing_portal.id
    else:
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
        portal_token_out = portal_raw
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
    return _submission_public_result(submission, portal_token=portal_token_out, idempotent=False)


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
    db: Session,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
    client_id: uuid.UUID | None = None,
) -> list[ClientIntakeSubmission]:
    q = select(ClientIntakeSubmission).where(
        ClientIntakeSubmission.organization_id == organization_id
    )
    if status:
        q = q.where(ClientIntakeSubmission.status == status)
    if client_id:
        q = q.where(ClientIntakeSubmission.client_id == client_id)
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
    form_name = None
    version_number = None
    snapshot = None
    summary = None
    if anam is not None:
        from app.models.intake import AnamnesisTemplateVersion

        version = db.get(AnamnesisTemplateVersion, anam.template_version_id)
        version_number = version.version_number if version else None
        form_name = (
            anam_svc.SYSTEM_TEMPLATE_NAME
            if version is not None
            else "Formulário"
        )
        snapshot = anam.questions_snapshot
        if not snapshot and version is not None:
            snapshot = snap_svc.build_questions_snapshot(
                answers=anam.answers_json or {},
                schema=version.schema_json,
            )
        summary = snap_svc.summarize_snapshot(snapshot or [])
    return {
        "submission": row,
        "anamnesis": anam,
        "consents": consents,
        "journey": journey,
        "questions_snapshot": snapshot or [],
        "form_name": form_name,
        "template_version_number": version_number,
        "anamnesis_summary": summary,
    }


def list_duplicate_candidates(
    db: Session, *, organization_id: uuid.UUID, submission_id: uuid.UUID
) -> list[Client]:
    """Recomputes the candidate clients for an ambiguous submission from
    its own stored phone_normalized/email — no column stores the
    candidate list, so there is nothing to keep in sync; it is always
    derived fresh, the same way submit_intake computed it. Only
    meaningful when the submission's duplicate_alert is True (ambiguous);
    callers should treat an empty list as "nothing left to resolve."
    """
    row = db.scalar(
        select(ClientIntakeSubmission).where(
            ClientIntakeSubmission.id == submission_id,
            ClientIntakeSubmission.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("submission_not_found", "Submissão não encontrada.", 404)
    candidates = _duplicate_candidates(
        db,
        organization_id=organization_id,
        phone_normalized=row.phone_normalized,
        email=row.email,
    )
    # The submission's own (placeholder) client is never offered as a
    # candidate to link to itself.
    return [c for c in candidates if c.id != row.client_id]


def _lock_submission_for_reconciliation(
    db: Session, *, organization_id: uuid.UUID, submission_id: uuid.UUID
) -> ClientIntakeSubmission:
    """Row-locks the submission so two concurrent reconciliation attempts
    (two clicks, two professionals) serialize instead of racing — the
    second one always sees the first's already-committed result and is
    rejected as "already resolved" rather than re-moving data or
    double-archiving.
    """
    row = db.scalar(
        select(ClientIntakeSubmission)
        .where(
            ClientIntakeSubmission.id == submission_id,
            ClientIntakeSubmission.organization_id == organization_id,
        )
        .with_for_update()
    )
    if row is None:
        raise AuthError("submission_not_found", "Submissão não encontrada.", 404)
    return row


def link_submission_to_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    submission_id: uuid.UUID,
    target_client_id: uuid.UUID,
) -> ClientIntakeSubmission:
    """Resolves an ambiguous (quarantined) submission by moving it onto an
    existing ACTIVE client the professional explicitly picked — never
    automatic, never a guess, and never a silent reactivation of an
    archived one (see keep_as_new_client for the other explicit
    resolution, and app.api.intake for why archived targets are rejected
    in this version rather than auto-reactivated).

    Moves the anamnesis/consents/portal access for THIS submission onto
    the target without touching whatever the target already has (prior
    journey/anamnesis/consents/portal survive untouched — see inline
    comments), then archives the placeholder (never deleted, for
    auditability). All of it in one transaction: any failure rolls back
    completely, leaving neither a half-moved submission nor a
    half-archived placeholder.
    """
    row = _lock_submission_for_reconciliation(
        db, organization_id=organization_id, submission_id=submission_id
    )
    if not row.duplicate_alert:
        # Already resolved by a previous call (this one, a concurrent one,
        # or a normal approve/keep-as-new) — reject instead of silently
        # moving data again onto a second target.
        raise AuthError(
            "submission_already_resolved",
            "Esta submissão já foi resolvida.",
            422,
        )
    if row.status != "pending_review":
        raise AuthError(
            "invalid_submission_status",
            "Somente submissões aguardando análise podem ser vinculadas.",
            422,
        )
    target = db.scalar(
        select(Client).where(
            Client.id == target_client_id, Client.organization_id == organization_id
        )
    )
    if target is None:
        raise AuthError("client_not_found", "Cliente não encontrado.", 404)
    if target.status == "archived":
        # No silent reactivation in this version — see app.api.intake.
        # The professional must reactivate the client explicitly first
        # (PATCH /clients/{id} status=active) before linking to them.
        raise AuthError(
            "target_client_archived",
            "Este aluno está arquivado. Reative-o antes de vincular.",
            422,
        )

    placeholder_id = row.client_id
    if target.id == placeholder_id:
        # Already linked to this client — idempotent no-op, no mutation.
        return row

    try:
        db.execute(
            update(ClientAnamnesisResponse)
            .where(ClientAnamnesisResponse.submission_id == row.id)
            .values(client_id=target.id)
        )
        db.execute(
            update(ConsentRecord)
            .where(ConsentRecord.submission_id == row.id)
            .values(client_id=target.id)
        )

        # Journey: never create a second one for the target
        # (uq_client_journeys_client_id). If the target already has one,
        # its stage/history is left exactly as is — only next_action is
        # nudged so the professional sees the new submission needs
        # review. The placeholder's own journey (if any) is left behind
        # on the now-archived placeholder rather than deleted, preserving
        # its audit trail.
        target_journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=target.id
        )
        if target_journey is None:
            placeholder_journey = journey_svc.get_journey(
                db, organization_id=organization_id, client_id=placeholder_id
            )
            if placeholder_journey is not None:
                placeholder_journey.client_id = target.id
                db.add(placeholder_journey)
        else:
            target_journey.next_action = "review_submission"
            db.add(target_journey)

        # Portal access: never create a second active one for the target
        # (uq_client_public_accesses_one_active) and never touch one the
        # target already has (that link, if any, keeps working exactly as
        # before). If the target has none yet, the placeholder's access —
        # already handed to the student as this submission's portal_token
        # — is reassigned so that already-issued link keeps working, now
        # pointing at the right client. If the target already has an
        # active access of its own, the placeholder's is revoked instead
        # of leaving an orphaned, confusing duplicate.
        target_portal = db.scalar(
            select(ClientPublicAccess).where(
                ClientPublicAccess.organization_id == organization_id,
                ClientPublicAccess.client_id == target.id,
                ClientPublicAccess.revoked_at.is_(None),
            )
        )
        placeholder_portal = db.scalar(
            select(ClientPublicAccess).where(
                ClientPublicAccess.organization_id == organization_id,
                ClientPublicAccess.client_id == placeholder_id,
                ClientPublicAccess.revoked_at.is_(None),
            )
        )
        if placeholder_portal is not None:
            if target_portal is None:
                placeholder_portal.client_id = target.id
                db.add(placeholder_portal)
            else:
                placeholder_portal.revoked_at = datetime.now(UTC)
                db.add(placeholder_portal)

        row.client_id = target.id
        row.duplicate_alert = False
        row.duplicate_client_id = None
        db.add(row)

        if placeholder_id is not None:
            placeholder = db.get(Client, placeholder_id)
            if placeholder is not None:
                placeholder.status = "archived"
                db.add(placeholder)

        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    logger.info(
        "intake_submission_linked org=%s submission=%s target_client=%s",
        organization_id,
        submission_id,
        target.id,
    )
    return row


def keep_as_new_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    submission_id: uuid.UUID,
) -> ClientIntakeSubmission:
    """Explicit, auditable resolution of an ambiguous submission: the
    professional confirms this is genuinely a new person, not any of the
    candidates. Promotes the quarantined placeholder to a normal active
    client — no data moves, nothing else is touched.
    """
    row = _lock_submission_for_reconciliation(
        db, organization_id=organization_id, submission_id=submission_id
    )
    if not row.duplicate_alert:
        raise AuthError(
            "submission_already_resolved",
            "Esta submissão já foi resolvida.",
            422,
        )
    if row.client_id is None:
        raise AuthError("client_missing", "Submissão sem cliente associado.", 422)

    client = db.get(Client, row.client_id)
    if client is None:
        raise AuthError("client_not_found", "Cliente não encontrado.", 404)

    client.status = "active"
    db.add(client)
    row.duplicate_alert = False
    row.duplicate_client_id = None
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "intake_submission_kept_as_new org=%s submission=%s client=%s",
        organization_id,
        submission_id,
        row.client_id,
    )
    return row


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
    if row.duplicate_alert:
        # Approving here would implicitly promote the quarantined
        # placeholder to a real client without the professional ever
        # making a conscious, auditable choice — see
        # keep_as_new_client/link_submission_to_client, which is the only
        # way out of an ambiguous submission.
        raise AuthError(
            "submission_ambiguous",
            AMBIGUOUS_SUBMISSION_MESSAGE,
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
            next_action="prepare_accompaniment",
        )
        journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=row.client_id
        )
        if journey is not None:
            journey.preparation_status = "in_progress"
            journey.accompaniment_checklist = journey.accompaniment_checklist or {
                "anamnesis": "todo",
                "evaluation": "todo",
                "plan": "todo",
                "cycle": "todo",
                "agenda": "todo",
                "routine": "todo",
                "activate": "todo",
            }
            db.add(journey)
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
    if row.duplicate_alert:
        raise AuthError(
            "submission_ambiguous",
            AMBIGUOUS_SUBMISSION_MESSAGE,
            422,
        )
    row.status = "changes_requested"
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = user_id
    row.message_to_client = message_to_client
    db.add(row)
    if row.client_id:
        journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=row.client_id
        )
        # Only force the stage down to "pending_anamnesis" for a client
        # still on their first review pass. A reused client (contextual
        # invite / confident match — see submit_intake) can already be
        # "active" with real progress (cycles, evaluations) by the time a
        # later submission needs changes; "active" has no
        # "pending_anamnesis" edge in VALID_TRANSITIONS, so forcing it
        # raised (see approve_submission for the same guard pattern),
        # silently rolling back the whole request and leaving the
        # professional's modal with no feedback. Surface the pending
        # correction as next_action instead, without discarding progress.
        if journey is not None and journey.stage == "pending_review":
            journey_svc.transition_journey(
                db,
                organization_id=organization_id,
                client_id=row.client_id,
                to_stage="pending_anamnesis",
                next_action="update_anamnesis",
            )
        elif journey is not None:
            journey.next_action = "update_anamnesis"
            db.add(journey)
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
    if row.duplicate_alert:
        raise AuthError(
            "submission_ambiguous",
            AMBIGUOUS_SUBMISSION_MESSAGE,
            422,
        )
    row.status = "rejected"
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = user_id
    row.rejection_internal_reason = rejection_internal_reason
    row.message_to_client = message_to_client
    db.add(row)
    if row.client_id:
        journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=row.client_id
        )
        # Same guard as request_changes_submission / approve_submission:
        # only force the journey itself to "rejected" when this is still
        # the client's first review pass. A reused client already "active"
        # with real progress must not have that progress wiped out because
        # a later, unrelated submission (e.g. an ambiguous duplicate that
        # was never linked) gets rejected — VALID_TRANSITIONS has no
        # "active" -> "rejected" edge either way, so forcing it would
        # raise and silently roll back the whole rejection.
        if journey is not None and journey.stage == "pending_review":
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
    token = (portal_token or "").strip()
    if not token:
        raise GENERIC_TOKEN_ERROR

    # Same resolution as app.services.my_cycle._resolve_access: a signed
    # "v1." token (see app.security.portal_token) is reconstructable from
    # the access row's id alone — the same access can be reached by an
    # old raw/legacy link AND a freshly-minted signed one at the same
    # time, so a later submission never has to invalidate an already
    # shared portal link just to hand back a working token of its own.
    access: ClientPublicAccess | None = None
    try:
        signed_id = parse_portal_token(token)
    except InvalidPortalToken as exc:
        raise GENERIC_TOKEN_ERROR from exc
    if signed_id is not None:
        access = db.get(ClientPublicAccess, signed_id)
        if access is not None and access.revoked_at is not None:
            access = None
    else:
        digest = hash_session_token(token)
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

    # A signed "ci1." contextual token (see create_client_intake_link) is
    # deterministic from (link_id, client_id) alone — no new secret, and
    # exactly the same mechanism a professional could mint anyway for this
    # client via the authenticated endpoint. Only offered when there is
    # something to correct: the client re-opening this same portal after
    # a submission is approved/rejected must not see a live "corrigir
    # cadastro" link that would just start ANOTHER round.
    correction_path: str | None = None
    correction_url: str | None = None
    if submission is not None and submission.status == "changes_requested":
        active_link = _active_link(db, access.organization_id)
        if active_link is not None:
            signed = mint_client_intake_link_token(active_link.id, access.client_id)
            correction_path = _public_intake_path(signed)
            correction_url = _public_intake_url(signed)

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
        "correction_path": correction_path,
        "correction_url": correction_url,
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
