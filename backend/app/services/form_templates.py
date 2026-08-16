"""Lightweight form schemas by intake form_kind (no executable HTML)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services import anamnesis_template as anam_svc
from app.services import profession_profile as profiles


def _generic_consents() -> list[dict[str, Any]]:
    return [
        {
            "key": "purpose_science",
            "required": True,
            "label": "Declaro ciência da finalidade deste cadastro.",
        },
        {
            "key": "data_processing",
            "required": True,
            "label": "Autorizo o tratamento dos dados que informei, apenas para este profissional.",
        },
        {
            "key": "privacy_policy",
            "required": True,
            "label": anam_svc.CONSENT_META["privacy_policy"]["label"],
        },
        {
            "key": "whatsapp_optional",
            "required": False,
            "label": anam_svc.CONSENT_META["whatsapp_optional"]["label"],
        },
    ]


def _health_consents(*extra_labels: tuple[str, str]) -> list[dict[str, Any]]:
    items = [
        {
            "key": "purpose_science",
            "required": True,
            "label": "Declaro ciência da finalidade deste cadastro e desta ficha.",
        },
        {
            "key": "sensitive_health",
            "required": True,
            "label": anam_svc.CONSENT_META["sensitive_health"]["label"],
        },
        {
            "key": "self_declared",
            "required": True,
            "label": anam_svc.CONSENT_META["self_declared"]["label"],
        },
        {
            "key": "not_medical",
            "required": True,
            "label": anam_svc.CONSENT_META["not_medical"]["label"],
        },
        {
            "key": "privacy_policy",
            "required": True,
            "label": anam_svc.CONSENT_META["privacy_policy"]["label"],
        },
        {
            "key": "whatsapp_optional",
            "required": False,
            "label": anam_svc.CONSENT_META["whatsapp_optional"]["label"],
        },
    ]
    return items


def _q(
    qid: str,
    *,
    label: str,
    qtype: str = "text",
    required: bool = False,
    options: list[dict[str, str]] | None = None,
    section: str = "A",
    help_text: str | None = None,
    placeholder: str | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": qid,
        "label": label,
        "type": qtype,
        "required": required,
        "sensitive": False,
        "attention": False,
        "section": section,
    }
    if options is not None:
        item["options"] = options
    if help_text:
        item["help_text"] = help_text
    if placeholder:
        item["placeholder"] = placeholder
    return item


def build_simple_registration_schema() -> dict[str, Any]:
    return {
        "form_name": "Cadastro inicial",
        "sections": [
            {
                "id": "A",
                "title": "Sobre você",
                "questions": [
                    _q(
                        "a_primary_goal",
                        label="Qual é o seu objetivo ou necessidade?",
                        required=True,
                        section="A",
                    ),
                    _q(
                        "c_available_days",
                        label="Disponibilidade (dias)",
                        qtype="multi",
                        options=[
                            {"value": "seg", "label": "Segunda"},
                            {"value": "ter", "label": "Terça"},
                            {"value": "qua", "label": "Quarta"},
                            {"value": "qui", "label": "Quinta"},
                            {"value": "sex", "label": "Sexta"},
                            {"value": "sab", "label": "Sábado"},
                            {"value": "dom", "label": "Domingo"},
                        ],
                        section="A",
                    ),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {
                "id": "J",
                "title": "Consentimentos",
                "consents": _generic_consents(),
            },
        ],
        "attention_client_message": "",
    }


def build_class_questionnaire_schema() -> dict[str, Any]:
    return {
        "form_name": "Cadastro inicial do aluno",
        "sections": [
            {
                "id": "A",
                "title": "Aulas",
                "questions": [
                    _q("a_subject", label="Matéria ou modalidade", required=True, section="A"),
                    _q(
                        "a_primary_goal",
                        label="Qual é o seu objetivo de aprendizagem?",
                        required=True,
                        section="A",
                        help_text="Descreva o que você gostaria de alcançar nas aulas.",
                        placeholder="Ex.: reforço em matemática, conversação ou preparação para prova.",
                    ),
                    _q(
                        "a_level",
                        label="Nível atual",
                        qtype="single",
                        options=[
                            {"value": "iniciante", "label": "Iniciante"},
                            {"value": "intermediario", "label": "Intermediário"},
                            {"value": "avancado", "label": "Avançado"},
                            {"value": "nao_sei", "label": "Não sei"},
                        ],
                        section="A",
                    ),
                    _q(
                        "a_difficulties",
                        label="Quais dificuldades você já teve?",
                        section="A",
                        help_text="Pode ser sobre conteúdo, rotina ou motivação.",
                    ),
                    _q(
                        "c_available_days",
                        label="Quais dias costumam funcionar melhor?",
                        qtype="multi",
                        options=[
                            {"value": "seg", "label": "Segunda"},
                            {"value": "ter", "label": "Terça"},
                            {"value": "qua", "label": "Quarta"},
                            {"value": "qui", "label": "Quinta"},
                            {"value": "sex", "label": "Sexta"},
                            {"value": "sab", "label": "Sábado"},
                            {"value": "dom", "label": "Domingo"},
                            {"value": "ainda_nao_sei", "label": "Ainda não sei"},
                        ],
                        section="A",
                    ),
                    _q(
                        "c_available_periods",
                        label="Quais períodos funcionam melhor?",
                        qtype="multi",
                        options=[
                            {"value": "manha", "label": "Manhã"},
                            {"value": "tarde", "label": "Tarde"},
                            {"value": "noite", "label": "Noite"},
                            {"value": "flexivel", "label": "Horário flexível"},
                        ],
                        section="A",
                    ),
                    _q(
                        "a_format",
                        label="Formato preferido",
                        qtype="single",
                        options=[
                            {"value": "presencial", "label": "Presencial"},
                            {"value": "online", "label": "Online"},
                            {"value": "hibrido", "label": "Híbrido"},
                        ],
                        section="A",
                    ),
                    _q("a_prior_experience", label="Experiência anterior", section="A"),
                    _q(
                        "a_learning_prefs",
                        label="Preferências de aprendizagem",
                        section="A",
                    ),
                    _q(
                        "a_desired_frequency",
                        label="Frequência desejada",
                        section="A",
                    ),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {
                "id": "J",
                "title": "Consentimentos",
                "consents": _generic_consents(),
            },
        ],
        "attention_client_message": "",
    }


def build_consulting_brief_schema() -> dict[str, Any]:
    return {
        "form_name": "Briefing de consultoria",
        "sections": [
            {
                "id": "A",
                "title": "Briefing",
                "questions": [
                    _q(
                        "a_primary_goal",
                        label="Qual é o seu objetivo?",
                        required=True,
                        section="A",
                        help_text="Descreva o resultado que você busca.",
                        placeholder="Ex.: organizar processos, aumentar vendas ou estruturar a operação.",
                    ),
                    _q("a_context", label="Contexto atual", required=True, section="A"),
                    _q("a_challenge", label="Desafio principal", section="A"),
                    _q("a_expected_result", label="Resultado esperado", section="A"),
                    _q(
                        "a_urgency",
                        label="Urgência",
                        qtype="single",
                        options=[
                            {"value": "baixa", "label": "Baixa"},
                            {"value": "media", "label": "Média"},
                            {"value": "alta", "label": "Alta"},
                        ],
                        section="A",
                    ),
                    _q(
                        "c_available_days",
                        label="Quais dias costumam funcionar melhor?",
                        qtype="multi",
                        options=[
                            {"value": "seg", "label": "Segunda"},
                            {"value": "ter", "label": "Terça"},
                            {"value": "qua", "label": "Quarta"},
                            {"value": "qui", "label": "Quinta"},
                            {"value": "sex", "label": "Sexta"},
                            {"value": "sab", "label": "Sábado"},
                            {"value": "dom", "label": "Domingo"},
                            {"value": "ainda_nao_sei", "label": "Ainda não sei"},
                        ],
                        section="A",
                    ),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {
                "id": "J",
                "title": "Consentimentos",
                "consents": _generic_consents(),
            },
        ],
        "attention_client_message": "",
    }


def build_aesthetics_schema() -> dict[str, Any]:
    return {
        "form_name": "Ficha inicial de atendimento",
        "sections": [
            {
                "id": "A",
                "title": "Atendimento",
                "questions": [
                    _q("a_primary_goal", label="Qual é o seu objetivo?", required=True, section="A"),
                    _q("a_relevant_history", label="Histórico relevante para o atendimento", section="A"),
                    _q("a_allergies", label="Alergias declaradas", section="A"),
                    _q("a_sensitivity", label="Sensibilidade conhecida", section="A"),
                    _q("a_previous_procedures", label="Procedimentos anteriores", section="A"),
                    _q("a_products", label="Uso de produtos", section="A"),
                    _q("a_preferences", label="Preferências", section="A"),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {"id": "J", "title": "Consentimentos", "consents": _health_consents()},
        ],
        "attention_client_message": "",
    }


def build_physio_schema() -> dict[str, Any]:
    return {
        "form_name": "Ficha inicial de fisioterapia",
        "sections": [
            {
                "id": "A",
                "title": "Fisioterapia",
                "questions": [
                    _q("a_primary_goal", label="Qual é o seu objetivo?", required=True, section="A"),
                    _q("a_mobility", label="Como está sua mobilidade no dia a dia?", section="A"),
                    _q("a_main_complaint", label="Queixa principal declarada", section="A"),
                    _q("a_previous_care", label="Acompanhamento anterior", section="A"),
                    _q("c_available_days", label="Disponibilidade (dias)", qtype="multi", options=[
                        {"value": "seg", "label": "Segunda"},
                        {"value": "ter", "label": "Terça"},
                        {"value": "qua", "label": "Quarta"},
                        {"value": "qui", "label": "Quinta"},
                        {"value": "sex", "label": "Sexta"},
                        {"value": "sab", "label": "Sábado"},
                        {"value": "dom", "label": "Domingo"},
                    ], section="A"),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {"id": "J", "title": "Consentimentos", "consents": _health_consents()},
        ],
        "attention_client_message": "",
    }


def build_nutrition_schema() -> dict[str, Any]:
    return {
        "form_name": "Ficha inicial de acompanhamento nutricional",
        "sections": [
            {
                "id": "A",
                "title": "Acompanhamento nutricional",
                "questions": [
                    _q("a_primary_goal", label="Qual é o seu objetivo?", required=True, section="A"),
                    _q("a_food_routine", label="Como é sua rotina alimentar?", section="A"),
                    _q("a_food_prefs", label="Preferências alimentares", section="A"),
                    _q("a_restrictions", label="Restrições declaradas", section="A"),
                    _q("a_relevant_history", label="Histórico relevante", section="A"),
                    _q("a_previous_care", label="Acompanhamento anterior", section="A"),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {"id": "J", "title": "Consentimentos", "consents": _health_consents()},
        ],
        "attention_client_message": "",
    }


def schema_builder_for_code(template_code: str) -> dict[str, Any]:
    from app.services.profession_profile import (
        TPL_AESTHETICS,
        TPL_GENERIC,
        TPL_NUTRITION,
        TPL_PHYSIO,
        TPL_PHYSICAL,
        TPL_TUTOR,
    )

    if template_code == TPL_TUTOR:
        return build_class_questionnaire_schema()
    if template_code == TPL_AESTHETICS:
        return build_aesthetics_schema()
    if template_code == TPL_PHYSIO:
        return build_physio_schema()
    if template_code == TPL_NUTRITION:
        return build_nutrition_schema()
    if template_code == TPL_PHYSICAL:
        schema = anam_svc.build_default_schema()
        return {**schema, "form_name": schema.get("name") or "Anamnese de atividade física"}
    return build_simple_registration_schema()


def resolve_form_schema(
    db: Session, *, form_kind: str | None, profession_code: str | None = None
) -> tuple[dict[str, Any], str | None, str]:
    """Never defaults to a health form. Pin is applied by intake service."""
    del db
    profile = profiles.profile_for(profession_code)
    kind = (form_kind or "").strip() or profile["intake_form_kind"]
    if kind in profiles.HEALTH_FORM_KINDS and not profile["collects_health"]:
        kind = profiles.KIND_GENERIC
    if kind == profiles.KIND_PHYSICAL and profile["code"] != "personal_trainer":
        kind = profiles.KIND_GENERIC
    if kind in {profiles.KIND_CLASS, "sports_questionnaire"}:
        schema = build_class_questionnaire_schema()
        return schema, None, schema["form_name"]
    if kind == profiles.KIND_AESTHETICS:
        schema = build_aesthetics_schema()
        return schema, None, schema["form_name"]
    if kind == profiles.KIND_PHYSIO:
        schema = build_physio_schema()
        return schema, None, schema["form_name"]
    if kind == profiles.KIND_NUTRITION:
        schema = build_nutrition_schema()
        return schema, None, schema["form_name"]
    if kind == profiles.KIND_CONSULTING:
        schema = build_consulting_brief_schema()
        return schema, None, schema["form_name"]
    if kind == profiles.KIND_PHYSICAL:
        schema = anam_svc.build_default_schema()
        name = schema.get("name") or "Anamnese de atividade física"
        return {**schema, "form_name": name}, None, name
    schema = build_simple_registration_schema()
    return schema, None, schema["form_name"]
