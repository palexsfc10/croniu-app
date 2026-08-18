"""Profession routine templates — suggestions, never mandatory."""
# ruff: noqa: E501

from __future__ import annotations

from typing import Any

from app.services.profession import _canonical

TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "personal_trainer": [
        {"id": "pt-review", "name": "Revisar plano", "task_type": "review_protocol", "description": "Revisar o plano de acompanhamento dos alunos.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "pt-feedback", "name": "Pedir feedback", "task_type": "send_feedback", "description": "Pedir retorno sobre o acompanhamento.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "pt-eval", "name": "Realizar avaliação", "task_type": "review_evaluation", "description": "Registrar evolução periódica.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "pt-renew", "name": "Preparar renovação", "task_type": "prepare_renewal", "description": "Sete dias antes do fim de cada ciclo.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "ends_on", "offset_days": 7},
    ],
    "private_tutor": [
        {"id": "tu-prep", "name": "Preparar aula", "task_type": "free", "description": "Preparar o material da próxima aula.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "tu-plan", "name": "Revisar plano de ensino", "task_type": "review_protocol", "description": "Ajustar o plano de ensino.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "tu-progress", "name": "Avaliar progresso", "task_type": "review_evaluation", "description": "Registrar progresso do aluno.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "tu-feedback", "name": "Enviar feedback", "task_type": "send_feedback", "description": "Enviar retorno ao aluno ou responsável.", "recurrence": "biweekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "tu-renew", "name": "Preparar renovação", "task_type": "prepare_renewal", "description": "Sete dias antes do fim do período.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "ends_on", "offset_days": 7},
    ],
    "aesthetics": [
        {"id": "ae-confirm", "name": "Confirmar atendimento", "task_type": "contact_client", "description": "Confirmar o próximo atendimento.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ae-post", "name": "Acompanhar pós-procedimento", "task_type": "send_feedback", "description": "Checar como o cliente está após o atendimento.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ae-return", "name": "Solicitar retorno", "task_type": "contact_client", "description": "Combinar o retorno.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ae-evo", "name": "Registrar evolução", "task_type": "review_evaluation", "description": "Registrar a evolução do acompanhamento.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ae-pack", "name": "Renovar pacote", "task_type": "prepare_renewal", "description": "Sete dias antes do fim do pacote.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "ends_on", "offset_days": 7},
    ],
    "physiotherapist": [
        {"id": "ph-confirm", "name": "Confirmar sessão", "task_type": "contact_client", "description": "Confirmar a próxima sessão.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ph-evo", "name": "Registrar evolução", "task_type": "review_evaluation", "description": "Registrar evolução sem prescrever conduta.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ph-re", "name": "Reavaliar", "task_type": "review_evaluation", "description": "Reavaliar no meio do período.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "starts_on", "offset_days": 28},
        {"id": "ph-follow", "name": "Fazer acompanhamento", "task_type": "send_feedback", "description": "Acompanhar o andamento.", "recurrence": "biweekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ph-cont", "name": "Preparar continuidade", "task_type": "prepare_renewal", "description": "Sete dias antes do fim do período.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "ends_on", "offset_days": 7},
    ],
    "nutritionist": [
        {"id": "nu-confirm", "name": "Confirmar consulta", "task_type": "contact_client", "description": "Confirmar a próxima consulta.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "nu-fb", "name": "Solicitar feedback", "task_type": "send_feedback", "description": "Pedir retorno sobre o acompanhamento.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "nu-evo", "name": "Registrar evolução", "task_type": "review_evaluation", "description": "Registrar evolução sem montar dieta.", "recurrence": "biweekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "nu-ret", "name": "Agendar retorno", "task_type": "contact_client", "description": "Combinar o retorno.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "nu-cont", "name": "Preparar continuidade", "task_type": "prepare_renewal", "description": "Sete dias antes do fim do período.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "ends_on", "offset_days": 7},
    ],
    "other": [
        {"id": "ot-contact", "name": "Entrar em contato", "task_type": "contact_client", "description": "Falar com quem precisa de atenção.", "recurrence": "weekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ot-plan", "name": "Revisar plano", "task_type": "review_protocol", "description": "Revisar o plano de acompanhamento.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ot-fb", "name": "Pedir feedback", "task_type": "send_feedback", "description": "Pedir retorno periódico.", "recurrence": "biweekly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ot-evo", "name": "Registrar evolução", "task_type": "review_evaluation", "description": "Registrar o andamento.", "recurrence": "monthly", "trigger_type": "calendar", "audience": "all_active"},
        {"id": "ot-renew", "name": "Preparar renovação", "task_type": "prepare_renewal", "description": "Sete dias antes do fim de cada ciclo.", "recurrence": "once", "trigger_type": "cycle_lifecycle", "anchor": "ends_on", "offset_days": 7},
    ],
}

_ALIAS = {
    "sports_teacher": "private_tutor",
    "consultant": "other",
    "coach_mentor": "other",
    "therapist": "other",
}


def templates_for(profession_code: str | None) -> list[dict[str, Any]]:
    code = _canonical(profession_code) or "other"
    code = _ALIAS.get(code, code)
    return list(TEMPLATES.get(code) or TEMPLATES["other"])
