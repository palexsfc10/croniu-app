"""Versioned profession profile — intake, consents, labels, capabilities.

Specialized health forms are never used as fallback.
"""

from __future__ import annotations

from typing import Any

PROFILE_VERSION = 1

# System AnamnesisTemplate.code values (organization_id IS NULL).
TPL_PHYSICAL = "croniu_default_physical_activity"
TPL_TUTOR = "croniu_tutor_enrollment"
TPL_AESTHETICS = "croniu_aesthetics_intake"
TPL_PHYSIO = "croniu_physio_intake"
TPL_NUTRITION = "croniu_nutrition_intake"
TPL_GENERIC = "croniu_generic_enrollment"

KIND_PHYSICAL = "physical_anamnesis"
KIND_CLASS = "class_questionnaire"
KIND_AESTHETICS = "aesthetics_intake"
KIND_PHYSIO = "physio_intake"
KIND_NUTRITION = "nutrition_intake"
KIND_GENERIC = "simple_registration"
KIND_CONSULTING = "consulting_brief"

HEALTH_TEMPLATE_CODES = frozenset({TPL_PHYSICAL, TPL_AESTHETICS, TPL_PHYSIO, TPL_NUTRITION})
HEALTH_FORM_KINDS = frozenset({KIND_PHYSICAL, KIND_AESTHETICS, KIND_PHYSIO, KIND_NUTRITION})

GENERIC_CONSENT_KEYS = ("purpose_science", "data_processing", "privacy_policy")
OPTIONAL_CONSENT_KEYS = ("whatsapp_optional",)
HEALTH_CONSENT_KEYS = (
    "purpose_science",
    "sensitive_health",
    "self_declared",
    "not_medical",
    "privacy_policy",
)


def _base(
    *,
    code: str,
    intake_form_kind: str,
    intake_template_code: str,
    form_title: str,
    queue_received: str,
    queue_analyze: str,
    consent_profile: str,
    client_noun: str,
    clients_noun: str,
    service_noun: str,
    appointment_noun: str,
    plan_noun: str,
    evaluation_noun: str,
    intake_form_noun: str,
    collects_health: bool,
) -> dict[str, Any]:
    return {
        "version": PROFILE_VERSION,
        "code": code,
        "intake_form_kind": intake_form_kind,
        "intake_template_code": intake_template_code,
        "form_title": form_title,
        "queue_received": queue_received,
        "queue_analyze": queue_analyze,
        "consent_profile": consent_profile,
        "client_noun": client_noun,
        "clients_noun": clients_noun,
        "service_noun": service_noun,
        "appointment_noun": appointment_noun,
        "plan_noun": plan_noun,
        "evaluation_noun": evaluation_noun,
        "intake_form_noun": intake_form_noun,
        "collects_health": collects_health,
        "ai_intake_noun": form_title.lower(),
    }


PROFILES: dict[str, dict[str, Any]] = {
    "personal_trainer": _base(
        code="personal_trainer",
        intake_form_kind=KIND_PHYSICAL,
        intake_template_code=TPL_PHYSICAL,
        form_title="Anamnese de atividade física",
        queue_received="Anamnese recebida",
        queue_analyze="Analisar anamnese",
        consent_profile="health_physical",
        client_noun="aluno",
        clients_noun="alunos",
        service_noun="treino",
        appointment_noun="treino",
        plan_noun="plano de acompanhamento",
        evaluation_noun="avaliação",
        intake_form_noun="anamnese",
        collects_health=True,
    ),
    "private_tutor": _base(
        code="private_tutor",
        intake_form_kind=KIND_CLASS,
        intake_template_code=TPL_TUTOR,
        form_title="Cadastro inicial do aluno",
        queue_received="Cadastro do aluno recebido",
        queue_analyze="Analisar cadastro",
        consent_profile="generic",
        client_noun="aluno",
        clients_noun="alunos",
        service_noun="aula",
        appointment_noun="aula",
        plan_noun="plano de aprendizagem",
        evaluation_noun="avaliação",
        intake_form_noun="cadastro inicial",
        collects_health=False,
    ),
    "sports_teacher": _base(
        code="sports_teacher",
        intake_form_kind=KIND_CLASS,
        intake_template_code=TPL_TUTOR,
        form_title="Cadastro inicial do aluno",
        queue_received="Cadastro do aluno recebido",
        queue_analyze="Analisar cadastro",
        consent_profile="generic",
        client_noun="aluno",
        clients_noun="alunos",
        service_noun="aula",
        appointment_noun="aula",
        plan_noun="plano de aprendizagem",
        evaluation_noun="avaliação",
        intake_form_noun="cadastro inicial",
        collects_health=False,
    ),
    "aesthetics": _base(
        code="aesthetics",
        intake_form_kind=KIND_AESTHETICS,
        intake_template_code=TPL_AESTHETICS,
        form_title="Ficha inicial de atendimento",
        queue_received="Ficha de atendimento recebida",
        queue_analyze="Analisar ficha",
        consent_profile="health_aesthetics",
        client_noun="cliente",
        clients_noun="clientes",
        service_noun="sessão",
        appointment_noun="sessão",
        plan_noun="plano de acompanhamento",
        evaluation_noun="avaliação",
        intake_form_noun="ficha de atendimento",
        collects_health=True,
    ),
    "physiotherapist": _base(
        code="physiotherapist",
        intake_form_kind=KIND_PHYSIO,
        intake_template_code=TPL_PHYSIO,
        form_title="Ficha inicial de fisioterapia",
        queue_received="Ficha inicial recebida",
        queue_analyze="Analisar ficha",
        consent_profile="health_physio",
        client_noun="cliente",
        clients_noun="clientes",
        service_noun="sessão",
        appointment_noun="sessão",
        plan_noun="plano de cuidado/acompanhamento",
        evaluation_noun="avaliação",
        intake_form_noun="ficha inicial",
        collects_health=True,
    ),
    "nutritionist": _base(
        code="nutritionist",
        intake_form_kind=KIND_NUTRITION,
        intake_template_code=TPL_NUTRITION,
        form_title="Ficha inicial de acompanhamento nutricional",
        queue_received="Ficha de acompanhamento recebida",
        queue_analyze="Analisar ficha",
        consent_profile="health_nutrition",
        client_noun="cliente",
        clients_noun="clientes",
        service_noun="consulta",
        appointment_noun="consulta",
        plan_noun="plano de acompanhamento",
        evaluation_noun="avaliação",
        intake_form_noun="ficha nutricional",
        collects_health=True,
    ),
    "other": _base(
        code="other",
        intake_form_kind=KIND_GENERIC,
        intake_template_code=TPL_GENERIC,
        form_title="Cadastro inicial",
        queue_received="Cadastro recebido",
        queue_analyze="Analisar cadastro",
        consent_profile="generic",
        client_noun="cliente",
        clients_noun="clientes",
        service_noun="atendimento",
        appointment_noun="atendimento",
        plan_noun="plano de acompanhamento",
        evaluation_noun="avaliação",
        intake_form_noun="cadastro",
        collects_health=False,
    ),
}

# Fail-closed generic for missing/legacy/unknown professions.
GENERIC_PROFILE = PROFILES["other"]


def profile_for(profession_code: str | None) -> dict[str, Any]:
    from app.services.profession import _canonical

    code = _canonical(profession_code)
    if not code or code not in PROFILES:
        return dict(GENERIC_PROFILE)
    return dict(PROFILES[code])


def recommended_form_kind(profession_code: str | None, specialty: str | None = None) -> str:
    del specialty  # specialty never upgrades to a health form
    return profile_for(profession_code)["intake_form_kind"]


def template_code_for(profession_code: str | None) -> str:
    return profile_for(profession_code)["intake_template_code"]


def form_kind_allowed(profession_code: str | None, form_kind: str | None) -> bool:
    if not form_kind:
        return True
    expected = recommended_form_kind(profession_code)
    if form_kind == expected:
        return True
    # consulting_brief is a non-health alias of generic enrollment
    if expected == KIND_GENERIC and form_kind == KIND_CONSULTING:
        return True
    if expected == KIND_CLASS and form_kind == "sports_questionnaire":
        return True
    return False


def template_code_allowed(profession_code: str | None, template_code: str | None) -> bool:
    if not template_code:
        return False
    expected = template_code_for(profession_code)
    if template_code == expected:
        return True
    profile = profile_for(profession_code)
    if not profile["collects_health"] and template_code in HEALTH_TEMPLATE_CODES:
        return False
    if profile["collects_health"] and template_code == TPL_GENERIC:
        return False
    return template_code == expected
