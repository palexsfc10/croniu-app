"""Default Croniu anamnesis template (sections A–J) and attention heuristics."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.intake import AnamnesisTemplate, AnamnesisTemplateVersion

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
}

_YES_DETAIL = ["sim", "prefiro_detalhar", "yes", "prefer_detail"]


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
    """Structured JSON for sections A–J (no copyrighted instruments)."""
    sections = [
        {
            "id": "A",
            "title": "Objetivos",
            "questions": [
                _q("a_primary_goal", label="Objetivo principal", required=True, section="A"),
                _q("a_secondary_goals", label="Objetivos secundários", section="A"),
                _q("a_expectation", label="Expectativa", section="A"),
                _q("a_timeline", label="Prazo desejado", section="A"),
                _q("a_prior_experience", label="Experiência anterior", section="A"),
            ],
        },
        {
            "id": "B",
            "title": "Histórico de atividade física",
            "questions": [
                _q(
                    "b_currently_active",
                    label="Pratica atividade física atualmente?",
                    qtype="single_choice",
                    options=[
                        {"value": "sim", "label": "Sim"},
                        {"value": "nao", "label": "Não"},
                    ],
                    section="B",
                ),
                _q("b_weekly_frequency", label="Frequência semanal", section="B"),
                _q("b_session_duration", label="Duração média das sessões", section="B"),
                _q("b_modalities", label="Modalidades", section="B"),
                _q("b_time_inactive", label="Tempo sem praticar (se aplicável)", section="B"),
                _q("b_past_difficulties", label="Dificuldades anteriores", section="B"),
                _q("b_preferences", label="Preferências", section="B"),
                _q("b_dislikes", label="Atividades que não gosta", section="B"),
            ],
        },
        {
            "id": "C",
            "title": "Rotina e disponibilidade",
            "questions": [
                _q("c_available_days", label="Dias disponíveis", section="C"),
                _q("c_available_times", label="Horários", section="C"),
                _q("c_location", label="Local preferido", section="C"),
                _q("c_equipment", label="Equipamentos disponíveis", section="C"),
                _q(
                    "c_routine_type",
                    label="Rotina predominantemente",
                    qtype="single_choice",
                    options=[
                        {"value": "sentada", "label": "Sentada"},
                        {"value": "em_pe", "label": "Em pé"},
                        {"value": "ativa", "label": "Ativa"},
                    ],
                    section="C",
                ),
                _q("c_commute", label="Deslocamentos", section="C"),
                _q("c_time_limits", label="Limitações de tempo", section="C"),
            ],
        },
        {
            "id": "D",
            "title": "Histórico de saúde declarado",
            "questions": [
                _q(
                    "d_cardiovascular",
                    label="Condição cardiovascular declarada",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_blood_pressure",
                    label="Pressão arterial",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_respiratory",
                    label="Condição respiratória",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_metabolic",
                    label="Diabetes ou alteração metabólica",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_fainting",
                    label="Desmaios ou tonturas",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_chest_pain",
                    label="Dor no peito",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_unusual_breathlessness",
                    label="Falta de ar incomum",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_neurological",
                    label="Condição neurológica",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_musculoskeletal",
                    label="Condição musculoesquelética",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="D",
                ),
                _q(
                    "d_other_conditions",
                    label="Outras condições relevantes",
                    sensitive=True,
                    section="D",
                ),
                _q(
                    "d_medical_followup",
                    label="Acompanhamento médico atual",
                    sensitive=True,
                    section="D",
                ),
            ],
        },
        {
            "id": "E",
            "title": "Lesões, cirurgias, dores e limitações",
            "questions": [
                _q(
                    "e_current_injury",
                    label="Lesão atual",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="E",
                ),
                _q(
                    "e_prior_injury",
                    label="Lesão anterior relevante",
                    sensitive=True,
                    section="E",
                ),
                _q("e_surgery", label="Cirurgia", sensitive=True, section="E"),
                _q(
                    "e_current_pain",
                    label="Dor atual",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="E",
                ),
                _q("e_pain_region", label="Região da dor", sensitive=True, section="E"),
                _q(
                    "e_pain_intensity",
                    label="Intensidade declarada (opcional)",
                    qtype="number",
                    sensitive=True,
                    section="E",
                ),
                _q(
                    "e_limited_movements",
                    label="Movimentos limitados",
                    sensitive=True,
                    section="E",
                ),
                _q(
                    "e_existing_guidance",
                    label="Orientação profissional existente",
                    sensitive=True,
                    section="E",
                ),
            ],
        },
        {
            "id": "F",
            "title": "Medicamentos declarados",
            "questions": [
                _q(
                    "f_meds_affect_exercise",
                    label="Usa medicamento que possa afetar o exercício?",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="F",
                ),
                _q(
                    "f_meds_notes",
                    label="Observações sobre medicamentos (opcional)",
                    sensitive=True,
                    section="F",
                ),
                _q(
                    "f_medical_guidance",
                    label="Orientação médica relevante",
                    sensitive=True,
                    section="F",
                ),
            ],
        },
        {
            "id": "G",
            "title": "Triagem de prontidão para atividade",
            "questions": [
                _q(
                    "g_chest_pain_exertion",
                    label="Sente dor no peito ao se esforçar?",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="G",
                    help_text="Respostas de atenção serão analisadas pelo profissional.",
                ),
                _q(
                    "g_dizziness_exertion",
                    label="Sente tontura ou desmaio ao se esforçar?",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="G",
                ),
                _q(
                    "g_bone_joint_problem",
                    label="Tem problema ósseo ou articular que piore com exercício?",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="G",
                ),
                _q(
                    "g_doctor_advised_limit",
                    label="Algum profissional de saúde aconselhou limitar atividade física?",
                    qtype="single_choice",
                    options=_triage_options(),
                    sensitive=True,
                    attention=True,
                    section="G",
                ),
            ],
        },
        {
            "id": "H",
            "title": "Hábitos e recuperação",
            "questions": [
                _q("h_sleep", label="Sono", section="H"),
                _q("h_stress", label="Percepção de estresse", section="H"),
                _q("h_hydration", label="Hidratação", section="H"),
                _q(
                    "h_smoking",
                    label="Tabagismo",
                    qtype="single_choice",
                    options=[
                        {"value": "nao", "label": "Não"},
                        {"value": "sim", "label": "Sim"},
                        {"value": "prefiro_nao_informar", "label": "Prefiro não informar"},
                    ],
                    section="H",
                ),
                _q(
                    "h_alcohol",
                    label="Consumo de álcool",
                    qtype="single_choice",
                    options=[
                        {"value": "nao", "label": "Não"},
                        {"value": "sim", "label": "Sim"},
                        {"value": "prefiro_nao_informar", "label": "Prefiro não informar"},
                    ],
                    section="H",
                ),
                _q("h_recovery", label="Rotina de recuperação", section="H"),
                _q("h_free_notes", label="Observação livre", section="H"),
            ],
        },
        {
            "id": "I",
            "title": "Preferências de acompanhamento",
            "questions": [
                _q("i_desired_frequency", label="Frequência desejada", section="I"),
                _q("i_contact_preference", label="Preferência de contato", section="I"),
                _q(
                    "i_reminders",
                    label="Receber lembretes",
                    qtype="single_choice",
                    options=[
                        {"value": "sim", "label": "Sim"},
                        {"value": "nao", "label": "Não"},
                    ],
                    section="I",
                ),
                _q(
                    "i_feedback_requests",
                    label="Receber solicitações de feedback",
                    qtype="single_choice",
                    options=[
                        {"value": "sim", "label": "Sim"},
                        {"value": "nao", "label": "Não"},
                    ],
                    section="I",
                ),
                _q("i_best_contact_period", label="Melhor período para contato", section="I"),
            ],
        },
        {
            "id": "J",
            "title": "Declarações e consentimentos",
            "questions": [],
            "consents": [
                {
                    "key": key,
                    "required": key in REQUIRED_CONSENT_KEYS,
                    "label": CONSENT_META[key]["label"],
                    "text_version": CONSENT_TEXT_VERSION,
                }
                for key in (*REQUIRED_CONSENT_KEYS, *OPTIONAL_CONSENT_KEYS)
            ],
        },
    ]
    return {
        "code": SYSTEM_TEMPLATE_CODE,
        "name": SYSTEM_TEMPLATE_NAME,
        "version": 1,
        "sections": sections,
        "attention_client_message": (
            "Suas respostas indicam que alguns pontos precisam ser analisados "
            "pelo profissional antes do início das atividades."
        ),
    }


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
        version_number=1,
        schema_json=build_default_schema(),
        is_published=True,
    )
    db.add(version)
    db.flush()
    return template


def get_published_system_version(db: Session) -> AnamnesisTemplateVersion:
    ensure_default_anamnesis_template(db)
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
