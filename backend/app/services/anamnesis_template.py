"""Default Croniu anamnesis template (sections A–J) and attention heuristics."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.intake import AnamnesisTemplate, AnamnesisTemplateVersion
from app.services.anamnesis_schema_v2 import build_schema_v2

SYSTEM_TEMPLATE_CODE = "croniu_default_physical_activity"
SYSTEM_TEMPLATE_NAME = "Anamnese de atividade física — padrão Croniu"
CONSENT_TEXT_VERSION = "v1"

# Required consent keys (section J) — accepted separately from answers_json.
REQUIRED_CONSENT_KEYS = (
    "purpose_science",
    "sensitive_health",
    "self_declared",
    "not_medical",
    "privacy_policy",
)
OPTIONAL_CONSENT_KEYS = ("whatsapp_optional",)

CONSENT_META: dict[str, dict[str, str]] = {
    "purpose_science": {
        "purpose": "Ciência sobre a finalidade do cadastro e anamnese",
        "legal_basis": "consent",
        "label": "Declaro ciência da finalidade deste cadastro e anamnese.",
    },
    "sensitive_health": {
        "purpose": "Tratamento de dados sensíveis de saúde declarados",
        "legal_basis": "consent",
        "label": "Autorizo o tratamento dos dados de saúde que declarei, apenas para este profissional.",
    },
    "self_declared": {
        "purpose": "Declaração de autoria das respostas",
        "legal_basis": "consent",
        "label": "Declaro que as respostas foram fornecidas por mim.",
    },
    "not_medical": {
        "purpose": "Ciência de que o formulário não substitui avaliação médica",
        "legal_basis": "consent",
        "label": "Estou ciente de que este formulário não substitui avaliação médica.",
    },
    "whatsapp_optional": {
        "purpose": "Contato opcional por WhatsApp",
        "legal_basis": "consent",
        "label": "Autorizo contato por WhatsApp (opcional).",
    },
    "privacy_policy": {
        "purpose": "Aceite da política de privacidade",
        "legal_basis": "consent",
        "label": "Li e aceito a política de privacidade.",
    },
    "data_processing": {
        "purpose": "Tratamento dos dados fornecidos no cadastro",
        "legal_basis": "consent",
        "label": "Autorizo o tratamento dos dados que informei, apenas para este profissional.",
    },
}

_YES_DETAIL = ["sim", "prefiro_detalhar", "yes", "prefer_detail", "as_vezes"]


def _q(
    qid: str,
    *,
    label: str,
    qtype: str = "text",
    required: bool = False,
    sensitive: bool = False,
    attention: bool = False,
    options: list[dict[str, str]] | None = None,
    help_text: str | None = None,
    section: str,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": qid,
        "label": label,
        "type": qtype,
        "required": required,
        "sensitive": sensitive,
        "attention": attention,
        "section": section,
    }
    if options is not None:
        item["options"] = options
    if help_text is not None:
        item["help_text"] = help_text
    return item


def _triage_options() -> list[dict[str, str]]:
    return [
        {"value": "nao", "label": "Não"},
        {"value": "sim", "label": "Sim"},
        {"value": "nao_sei", "label": "Não sei"},
        {"value": "prefiro_detalhar", "label": "Prefiro detalhar"},
    ]


def build_default_schema() -> dict[str, Any]:
    """Current default published schema (v2). Historical v1 remains in DB rows."""
    return build_schema_v2()

def _iter_questions(schema: dict[str, Any]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    for section in schema.get("sections") or []:
        questions.extend(section.get("questions") or [])
    return questions


def compute_attention_flag(answers: dict[str, Any], schema: dict[str, Any]) -> bool:
    """True when any attention-marked question has a yes/detail answer. No diagnosis."""
    by_id = {q["id"]: q for q in _iter_questions(schema)}
    for qid, raw in (answers or {}).items():
        meta = by_id.get(qid)
        if not meta or not meta.get("attention"):
            continue
        value = raw
        if isinstance(raw, dict):
            value = raw.get("value", raw.get("answer"))
        if value is None:
            continue
        normalized = str(value).strip().lower()
        if normalized in _YES_DETAIL:
            return True
    return False


def ensure_default_anamnesis_template(db: Session) -> AnamnesisTemplate:
    """Insert system default template + published v1 if missing."""
    existing = db.scalar(
        select(AnamnesisTemplate).where(
            AnamnesisTemplate.organization_id.is_(None),
            AnamnesisTemplate.code == SYSTEM_TEMPLATE_CODE,
            AnamnesisTemplate.is_system_default.is_(True),
        )
    )
    if existing is not None:
        ensure_schema_v2(db, existing)
        return existing

    template = AnamnesisTemplate(
        id=uuid.uuid4(),
        organization_id=None,
        code=SYSTEM_TEMPLATE_CODE,
        name=SYSTEM_TEMPLATE_NAME,
        status="published",
        is_system_default=True,
    )
    db.add(template)
    db.flush()
    version = AnamnesisTemplateVersion(
        id=uuid.uuid4(),
        template_id=template.id,
        version_number=2,
        schema_json=build_default_schema(),
        is_published=True,
    )
    db.add(version)
    db.flush()
    return template


def ensure_schema_v2(db: Session, template: AnamnesisTemplate) -> None:
    latest = db.scalar(
        select(func.max(AnamnesisTemplateVersion.version_number)).where(
            AnamnesisTemplateVersion.template_id == template.id
        )
    )
    if latest is not None and int(latest) >= 2:
        return
    db.add(
        AnamnesisTemplateVersion(
            id=uuid.uuid4(),
            template_id=template.id,
            version_number=2,
            schema_json=build_default_schema(),
            is_published=True,
        )
    )
    db.flush()


def get_template_version(
    db: Session, *, version_id: uuid.UUID
) -> AnamnesisTemplateVersion | None:
    return db.get(AnamnesisTemplateVersion, version_id)


def get_published_system_version(db: Session) -> AnamnesisTemplateVersion:
    template = ensure_default_anamnesis_template(db)
    ensure_schema_v2(db, template)
    template = db.scalar(
        select(AnamnesisTemplate).where(
            AnamnesisTemplate.organization_id.is_(None),
            AnamnesisTemplate.code == SYSTEM_TEMPLATE_CODE,
        )
    )
    assert template is not None
    version = db.scalar(
        select(AnamnesisTemplateVersion)
        .where(
            AnamnesisTemplateVersion.template_id == template.id,
            AnamnesisTemplateVersion.is_published.is_(True),
        )
        .order_by(AnamnesisTemplateVersion.version_number.desc())
    )
    if version is None:
        raise RuntimeError("System anamnesis template has no published version")
    return version


def ensure_system_intake_templates(db: Session) -> None:
    """Published system templates for every profession profile. Never skip generic."""
    from app.services.form_templates import schema_builder_for_code
    from app.services.profession_profile import (
        TPL_AESTHETICS,
        TPL_GENERIC,
        TPL_NUTRITION,
        TPL_PHYSIO,
        TPL_PHYSICAL,
        TPL_TUTOR,
    )

    specs = (
        (TPL_PHYSICAL, SYSTEM_TEMPLATE_NAME, True),
        (TPL_TUTOR, "Cadastro inicial do aluno", False),
        (TPL_AESTHETICS, "Ficha inicial de atendimento", False),
        (TPL_PHYSIO, "Ficha inicial de fisioterapia", False),
        (TPL_NUTRITION, "Ficha inicial de acompanhamento nutricional", False),
        (TPL_GENERIC, "Cadastro inicial", False),
    )
    for code, name, is_default in specs:
        if code == TPL_PHYSICAL:
            ensure_default_anamnesis_template(db)
            continue
        existing = db.scalar(
            select(AnamnesisTemplate).where(
                AnamnesisTemplate.organization_id.is_(None),
                AnamnesisTemplate.code == code,
            )
        )
        if existing is None:
            existing = AnamnesisTemplate(
                id=uuid.uuid4(),
                organization_id=None,
                code=code,
                name=name,
                status="published",
                is_system_default=is_default,
            )
            db.add(existing)
            db.flush()
        published = db.scalar(
            select(AnamnesisTemplateVersion)
            .where(
                AnamnesisTemplateVersion.template_id == existing.id,
                AnamnesisTemplateVersion.is_published.is_(True),
            )
            .order_by(AnamnesisTemplateVersion.version_number.desc())
        )
        if published is None:
            schema = schema_builder_for_code(code)
            db.add(
                AnamnesisTemplateVersion(
                    id=uuid.uuid4(),
                    template_id=existing.id,
                    version_number=1,
                    schema_json=schema,
                    is_published=True,
                )
            )
            db.flush()


def get_published_version_for_code(db: Session, template_code: str) -> AnamnesisTemplateVersion:
    from app.services.profession_profile import TPL_GENERIC, TPL_PHYSICAL

    ensure_system_intake_templates(db)
    code = (template_code or "").strip() or TPL_GENERIC
    if code == TPL_PHYSICAL:
        return get_published_system_version(db)
    template = db.scalar(
        select(AnamnesisTemplate).where(
            AnamnesisTemplate.organization_id.is_(None),
            AnamnesisTemplate.code == code,
        )
    )
    if template is None and code != TPL_GENERIC:
        logger_safe = __import__("logging").getLogger("croniu.intake")
        logger_safe.warning("intake_template_missing code=%s fallback=generic", code)
        return get_published_version_for_code(db, TPL_GENERIC)
    if template is None:
        raise RuntimeError("Generic enrollment template has no published version")
    version = db.scalar(
        select(AnamnesisTemplateVersion)
        .where(
            AnamnesisTemplateVersion.template_id == template.id,
            AnamnesisTemplateVersion.is_published.is_(True),
        )
        .order_by(AnamnesisTemplateVersion.version_number.desc())
    )
    if version is None:
        if code != TPL_GENERIC:
            return get_published_version_for_code(db, TPL_GENERIC)
        raise RuntimeError("Generic enrollment template has no published version")
    return version


def required_consent_keys_from_schema(schema: dict[str, Any]) -> tuple[str, ...]:
    keys: list[str] = []
    for section in schema.get("sections") or []:
        for item in section.get("consents") or []:
            if item.get("required") and item.get("key"):
                keys.append(str(item["key"]))
    if keys:
        return tuple(keys)
    from app.services.profession_profile import GENERIC_CONSENT_KEYS

    return GENERIC_CONSENT_KEYS
