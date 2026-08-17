"""Human-readable labels for internal enums. Never render raw codes in UI."""

from __future__ import annotations

import logging

logger = logging.getLogger("croniu.status_labels")

_JOURNEY_STAGE = {
    "pending_registration": "Cadastro incompleto",
    "pending_anamnesis": "Formulário pendente",
    "pending_review": "Aguardando análise",
    "approved": "Cadastro aprovado",
    "evaluation_pending": "Avaliação pendente",
    "protocol_pending": "Plano pendente",
    "ready_to_start": "Pronto para iniciar",
    "active": "Em acompanhamento",
    "review_due": "Revisão necessária",
    "paused": "Pausado",
    "rejected": "Cadastro recusado",
    "archived": "Arquivado",
}

_NEXT_ACTION = {
    "review_submission": "Analisar cadastro",
    "update_anamnesis": "Atualizar formulário",
    "prepare_accompaniment": "Preparar acompanhamento",
    "continue_onboarding": "Preparar acompanhamento",
    "review_anamnesis": "Analisar formulário",
    "register_evaluation": "Registrar avaliação",
    "create_plan": "Criar plano",
    "create_cycle": "Criar ciclo",
    "organize_agenda": "Organizar agenda",
    "configure_routine": "Configurar rotina",
    "activate_accompaniment": "Ativar acompanhamento",
    "review_plan": "Revisar plano",
    "prepare_new_plan": "Preparar novo plano",
    "send_feedback": "Enviar acompanhamento",
}

_PROTOCOL_STATUS = {
    "draft": "Rascunho",
    "published": "Publicado",
    "archived": "Arquivado",
    "superseded": "Substituído",
}

_VERSION_STATUS = {
    "draft": "Rascunho",
    "published": "Publicado",
    "superseded": "Substituído",
}

_OCCURRENCE_TYPE = {
    "plan_review": "Revisar plano",
    "plan_ending": "Planejamento terminando",
    "feedback_due": "Registrar feedback",
    "evaluation_review": "Revisar avaliação",
    "cycle_renewal": "Preparar renovação",
    "custom_task": "Tarefa",
}

_OCCURRENCE_STATUS = {
    "open": "Pendente",
    "completed": "Concluído",
    "deferred": "Adiado",
    "dismissed": "Dispensado",
    "cancelled": "Cancelado",
}

_CLIENT_STATUS = {
    "active": "Ativo",
    "archived": "Arquivado",
    "evaluating": "Em avaliação",
}

_DECISION = {
    "now": "Registrar agora",
    "later": "Fazer depois",
    "skip": "Não se aplica",
    "external": "Já foi realizada fora do Croniu",
    "published": "Publicado",
    "create_now": "Criar agora",
}


def _safe(mapping: dict[str, str], value: str | None, fallback: str, *, kind: str) -> str:
    if not value:
        return fallback
    label = mapping.get(value)
    if label:
        return label
    logger.info("unknown_status_code kind=%s", kind)
    return fallback


def journey_stage_label(stage: str | None) -> str:
    return _safe(_JOURNEY_STAGE, stage, "Em acompanhamento", kind="journey_stage")


def next_action_label(action: str | None) -> str | None:
    if not action:
        return None
    return _safe(_NEXT_ACTION, action, "Próximo passo", kind="next_action")


def protocol_status_label(status: str | None) -> str:
    return _safe(_PROTOCOL_STATUS, status, "Em elaboração", kind="protocol_status")


def version_status_label(status: str | None) -> str:
    return _safe(_VERSION_STATUS, status, "Versão", kind="version_status")


def occurrence_type_label(value: str | None) -> str:
    return _safe(_OCCURRENCE_TYPE, value, "Pendência", kind="occurrence_type")


def occurrence_status_label(value: str | None) -> str:
    return _safe(_OCCURRENCE_STATUS, value, "Pendente", kind="occurrence_status")


def client_status_label(status: str | None) -> str:
    return _safe(_CLIENT_STATUS, status, "Ativo", kind="client_status")


def decision_label(value: str | None) -> str | None:
    if not value:
        return None
    return _safe(_DECISION, value, "Definido", kind="decision")
