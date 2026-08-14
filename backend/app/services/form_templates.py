"""Lightweight form schemas by intake form_kind (no executable HTML)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services import anamnesis_template as anam_svc


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
        "form_name": "Cadastro simples",
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
                "consents": [
                    {"key": k, "required": True, "label": anam_svc.CONSENT_META[k]["label"]}
                    for k in ("purpose_science", "self_declared", "privacy_policy")
                ]
                + [
                    {
                        "key": "whatsapp_optional",
                        "required": False,
                        "label": anam_svc.CONSENT_META["whatsapp_optional"]["label"],
                    }
                ],
            },
        ],
        "attention_client_message": "",
    }


def build_class_questionnaire_schema() -> dict[str, Any]:
    return {
        "form_name": "Questionário de aulas",
        "sections": [
            {
                "id": "A",
                "title": "Aulas",
                "questions": [
                    _q("a_subject", label="Área ou disciplina", required=True, section="A"),
                    _q(
                        "a_primary_goal",
                        label="Qual é o seu objetivo?",
                        required=True,
                        section="A",
                        help_text="Descreva o que você gostaria de alcançar nas aulas.",
                        placeholder="Ex.: melhorar conversação, reforçar matemática ou preparar uma prova.",
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
                    _q("a_timeline", label="Prazo ou meta", section="A"),
                    _q("h_free_notes", label="Observações", section="A"),
                ],
            },
            {
                "id": "J",
                "title": "Consentimentos",
                "consents": [
                    {"key": k, "required": True, "label": anam_svc.CONSENT_META[k]["label"]}
                    for k in ("purpose_science", "self_declared", "privacy_policy")
                ],
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
                "consents": [
                    {"key": k, "required": True, "label": anam_svc.CONSENT_META[k]["label"]}
                    for k in ("purpose_science", "self_declared", "privacy_policy")
                ],
            },
        ],
        "attention_client_message": "",
    }


def resolve_form_schema(
    db: Session, *, form_kind: str | None
) -> tuple[dict[str, Any], str | None, str]:
    """Return (schema, template_version_id, form_name)."""
    kind = form_kind or "physical_anamnesis"
    if kind == "simple_registration":
        schema = build_simple_registration_schema()
        return schema, None, schema["form_name"]
    if kind == "class_questionnaire":
        schema = build_class_questionnaire_schema()
        return schema, None, schema["form_name"]
    if kind == "consulting_brief":
        schema = build_consulting_brief_schema()
        return schema, None, schema["form_name"]
    # physical_anamnesis and custom default to system physical template
    version = anam_svc.get_published_system_version(db)
    schema = dict(version.schema_json)
    schema["form_name"] = anam_svc.SYSTEM_TEMPLATE_NAME
    return schema, str(version.id), anam_svc.SYSTEM_TEMPLATE_NAME
