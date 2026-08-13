"""Profession codes, use cases, recommended forms, and adaptive nomenclature."""

from __future__ import annotations

from typing import Any

PROFESSION_OPTIONS: list[dict[str, str]] = [
    {"code": "personal_trainer", "label": "Personal trainer"},
    {"code": "private_tutor", "label": "Professor particular"},
    {"code": "sports_teacher", "label": "Professor de esportes"},
    {"code": "physiotherapist", "label": "Fisioterapeuta"},
    {"code": "nutritionist", "label": "Nutricionista"},
    {"code": "therapist", "label": "Terapeuta"},
    {"code": "consultant", "label": "Consultor"},
    {"code": "coach_mentor", "label": "Coach ou mentor"},
    {"code": "aesthetics", "label": "Profissional de estética"},
    {"code": "other", "label": "Outro profissional autônomo"},
]

SPORTS_SPECIALTIES: list[dict[str, str]] = [
    {"code": "musculacao", "label": "Musculação"},
    {"code": "corrida", "label": "Corrida"},
    {"code": "natacao", "label": "Natação"},
    {"code": "futebol", "label": "Futebol"},
    {"code": "luta", "label": "Luta"},
    {"code": "danca", "label": "Dança"},
    {"code": "pilates", "label": "Pilates"},
    {"code": "funcional", "label": "Funcional"},
    {"code": "other", "label": "Outro"},
]

TUTOR_SPECIALTIES: list[dict[str, str]] = [
    {"code": "idiomas", "label": "Idiomas"},
    {"code": "reforco_escolar", "label": "Reforço escolar"},
    {"code": "musica", "label": "Música"},
    {"code": "tecnologia", "label": "Tecnologia"},
    {"code": "provas", "label": "Preparação para provas"},
    {"code": "other", "label": "Outro"},
]

USE_CASE_OPTIONS: list[dict[str, str]] = [
    {"code": "appointments_agenda", "label": "Atendimentos e agenda"},
    {"code": "classes", "label": "Aulas"},
    {"code": "workouts", "label": "Treinos"},
    {"code": "evaluations", "label": "Avaliações"},
    {"code": "plans_cycles", "label": "Planos ou ciclos"},
    {"code": "protocols", "label": "Protocolos"},
    {"code": "periodic_feedback", "label": "Feedbacks periódicos"},
    {"code": "consulting", "label": "Consultorias"},
    {"code": "other", "label": "Outro"},
]

FORM_KIND_OPTIONS: list[dict[str, str]] = [
    {"code": "simple_registration", "label": "Cadastro simples"},
    {"code": "physical_anamnesis", "label": "Cadastro + anamnese de atividade física"},
    {"code": "class_questionnaire", "label": "Cadastro + questionário de aulas"},
    {"code": "consulting_brief", "label": "Cadastro + briefing"},
    {"code": "custom", "label": "Formulário personalizado"},
]

PURPOSE_OPTIONS: list[dict[str, str]] = [
    {"code": "new_client", "label": "Novo aluno/cliente"},
    {"code": "trial_class", "label": "Aula experimental"},
    {"code": "initial_evaluation", "label": "Avaliação inicial"},
    {"code": "consulting", "label": "Consultoria"},
    {"code": "interest_list", "label": "Lista de interesse"},
    {"code": "other", "label": "Outro"},
]

_VALID_PROFESSION = {p["code"] for p in PROFESSION_OPTIONS}
_VALID_USE_CASES = {u["code"] for u in USE_CASE_OPTIONS}


def recommended_form_kind(profession_code: str | None) -> str:
    if profession_code == "personal_trainer":
        return "physical_anamnesis"
    if profession_code == "private_tutor":
        return "class_questionnaire"
    if profession_code == "sports_teacher":
        return "physical_anamnesis"
    if profession_code in {"consultant", "coach_mentor"}:
        return "consulting_brief"
    return "simple_registration"


def nomenclature_for(profession_code: str | None) -> dict[str, str]:
    """Central term resolver — UI only; enums/API stay unchanged."""
    code = profession_code or "generic"
    if code == "personal_trainer":
        return {
            "client": "aluno",
            "clients": "alunos",
            "plan": "plano de treino",
            "plan_short": "treino",
            "plan_review": "revisão do treino",
            "session": "treino",
            "evaluation": "avaliação",
            "cycle": "ciclo",
            "agenda": "agenda",
            "routine": "rotina",
            "accompaniment": "acompanhamento",
            "new_intake": "Novos alunos",
            "intake_form": "anamnese",
        }
    if code == "private_tutor":
        return {
            "client": "aluno",
            "clients": "alunos",
            "plan": "plano de aulas",
            "plan_short": "plano",
            "plan_review": "revisão do plano",
            "session": "aula",
            "evaluation": "diagnóstico inicial",
            "cycle": "ciclo",
            "agenda": "agenda",
            "routine": "rotina",
            "accompaniment": "acompanhamento",
            "new_intake": "Novos alunos",
            "intake_form": "questionário",
        }
    if code == "sports_teacher":
        return {
            "client": "aluno",
            "clients": "alunos",
            "plan": "plano de treino",
            "plan_short": "treino",
            "plan_review": "revisão do treino",
            "session": "aula",
            "evaluation": "avaliação",
            "cycle": "ciclo",
            "agenda": "agenda",
            "routine": "rotina",
            "accompaniment": "acompanhamento",
            "new_intake": "Novos alunos",
            "intake_form": "formulário",
        }
    if code == "consultant":
        return {
            "client": "cliente",
            "clients": "clientes",
            "plan": "plano de acompanhamento",
            "plan_short": "plano",
            "plan_review": "revisão do plano",
            "session": "atendimento",
            "evaluation": "avaliação",
            "cycle": "ciclo",
            "agenda": "agenda",
            "routine": "rotina",
            "accompaniment": "acompanhamento",
            "new_intake": "Novos clientes",
            "intake_form": "briefing",
        }
    # Generic + regulated professions: avoid clinical overclaims
    return {
        "client": "cliente",
        "clients": "clientes",
        "plan": "plano de acompanhamento",
        "plan_short": "plano",
        "plan_review": "revisão do plano",
        "session": "atendimento",
        "evaluation": "avaliação",
        "cycle": "ciclo",
        "agenda": "agenda",
        "routine": "rotina",
        "accompaniment": "acompanhamento",
        "new_intake": "Novos clientes",
        "intake_form": "formulário",
    }


def validate_profession_payload(
    *,
    profession_code: str | None,
    profession_specialty: str | None = None,
    profession_other: str | None = None,
    use_cases: list[str] | None = None,
) -> dict[str, Any]:
    if profession_code is not None and profession_code not in _VALID_PROFESSION:
        raise ValueError("Área de atuação inválida.")
    cleaned_cases: list[str] = []
    if use_cases:
        for item in use_cases:
            if item not in _VALID_USE_CASES:
                raise ValueError(f"Forma de acompanhamento inválida: {item}")
            if item not in cleaned_cases:
                cleaned_cases.append(item)
    other = (profession_other or "").strip() or None
    if profession_code == "other" and not other:
        raise ValueError("Descreva sua atuação.")
    specialty = (profession_specialty or "").strip() or None
    if profession_code == "sports_teacher" and specialty:
        if specialty not in {s["code"] for s in SPORTS_SPECIALTIES}:
            raise ValueError("Especialidade esportiva inválida.")
    if profession_code == "private_tutor" and specialty:
        if specialty not in {s["code"] for s in TUTOR_SPECIALTIES}:
            raise ValueError("Área de ensino inválida.")
    return {
        "profession_code": profession_code,
        "profession_specialty": specialty,
        "profession_other": other if profession_code == "other" else None,
        "use_cases": cleaned_cases or None,
    }


def profession_catalog() -> dict[str, Any]:
    return {
        "professions": PROFESSION_OPTIONS,
        "sports_specialties": SPORTS_SPECIALTIES,
        "tutor_specialties": TUTOR_SPECIALTIES,
        "use_cases": USE_CASE_OPTIONS,
        "form_kinds": FORM_KIND_OPTIONS,
        "purposes": PURPOSE_OPTIONS,
    }
