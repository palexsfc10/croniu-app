"""Hotfix: safe single/batch occurrence completion through AI confirmation."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from app.agent import confirmation as conf_svc
from app.agent.orchestrator import run_turn
from app.agent.providers.base import LLMResponse, LLMUsage
from app.agent.providers.fake import FakeLLMProvider
from app.agent.thread_entities import collect_thread_entity_refs, extract_entities_from_tool_result
from app.agent.tools import ToolContext, execute_complete_occurrences, get_tool
from app.config import Settings
from app.db import SessionLocal
from app.models.agent import AgentPendingAction
from app.models.client import Client
from app.models.intake import OperationalOccurrence, RecurringClientTask
from app.models.organization import Organization
from app.services import agent_threads as threads_svc
from app.services.auth import AuthError
from sqlalchemy import select


def _auth(client, payload: dict) -> tuple[uuid.UUID, uuid.UUID]:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        croniu_env="test",
        ai_enabled=True,
        llm_provider="fake",
        llm_model="fake-model",
        llm_max_tool_steps=4,
        llm_max_input_chars=4000,
        ai_rate_limit_per_hour=1000,
        ai_user_requests_per_minute=1000,
        ai_org_daily_request_limit=1000,
        ai_pending_action_ttl_minutes=15,
        ai_confirmation_ttl_seconds=600,
        secret_key="test-secret-key-with-at-least-32-characters",
        database_url=(
            "postgresql+psycopg://croniu:croniu_dev_password_change_me@localhost:5433/croniu_test"
        ),
        session_cookie_secure=False,
    )


def _occurrence(db, org_id: uuid.UUID, key: str, **overrides) -> OperationalOccurrence:
    row = OperationalOccurrence(
        organization_id=org_id,
        occurrence_type=overrides.pop("occurrence_type", "plan_review"),
        status=overrides.pop("status", "open"),
        due_on=overrides.pop("due_on", date(2026, 8, 17)),
        operational_date=overrides.pop("operational_date", date(2026, 8, 17)),
        source="computed",
        idempotency_key=key,
        **overrides,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _ctx(
    db,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    today: date | None = None,
    user_message: str | None = None,
) -> ToolContext:
    return ToolContext(
        organization_id=org_id,
        user_id=user_id,
        db=db,
        today=today,
        user_message=user_message,
    )


def _client(db, org_id: uuid.UUID, name: str) -> Client:
    row = Client(organization_id=org_id, full_name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_single_and_defer_proposals_have_confirmation_contract(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        murilo = _client(db, org_id, "Murilo Macedo")
        complete_row = _occurrence(
            db,
            org_id,
            "single-complete",
            occurrence_type="cycle_renewal",
            client_id=murilo.id,
        )
        defer_row = _occurrence(
            db,
            org_id,
            "single-defer",
            occurrence_type="custom_task",
            meta={"name": "Enviar relatório mensal"},
        )
        complete = get_tool("propose_complete_occurrence").handler(
            _ctx(db, org_id, user_id, today=date(2026, 8, 17)),
            {"occurrence_id": str(complete_row.id)},
        )
        deferred = get_tool("propose_defer_occurrence").handler(
            _ctx(db, org_id, user_id),
            {"occurrence_id": str(defer_row.id), "deferred_until": "2026-08-20"},
        )
        assert complete["tool_name"] == "complete_occurrence"
        assert complete["arguments"] == {"occurrence_id": str(complete_row.id)}
        assert deferred["tool_name"] == "defer_occurrence"
        assert deferred["arguments"]["deferred_until"] == "2026-08-20"
        assert complete["summary_fields"] == {
            "Ação": "Preparar renovação",
            "Data": "17/08/2026",
            "Situação": "Hoje",
            "Cliente": "Murilo Macedo",
        }
        assert "cycle_renewal" not in complete["summary"]
        assert "Preparar renovação" in complete["summary"]
        assert "Murilo Macedo" in complete["summary"]
        assert "17/08/2026" in complete["summary"]
        assert "Hoje" in complete["summary"]
        assert "custom_task" not in deferred["summary"]
        assert "Enviar relatório mensal" in deferred["summary"]
        assert complete_row.status == defer_row.status == "open"
    finally:
        db.close()


def test_batch_confirmation_completes_plan_and_routine_atomically(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        routine = RecurringClientTask(
            organization_id=org_id,
            name="Revisão de avaliação",
            task_type="evaluation_review",
            recurrence="weekly",
            filter_json={},
            next_run_on=date(2026, 8, 17),
            status="active",
        )
        db.add(routine)
        db.commit()
        db.refresh(routine)
        routine_occurrence = _occurrence(
            db,
            org_id,
            "routine-completion",
            occurrence_type="evaluation_review",
            meta={"routine_id": str(routine.id), "name": routine.name},
        )
        plan_occurrence = _occurrence(db, org_id, "plan-completion")
        args = {"occurrence_ids": [str(routine_occurrence.id), str(plan_occurrence.id)]}
        proposal = get_tool("propose_complete_occurrences").handler(_ctx(db, org_id, user_id), args)
        assert proposal["needs_confirmation"] is True
        assert proposal["summary_fields"]["Quantidade"] == 2
        assert "evaluation_review" not in proposal["summary"]
        assert "plan_review" not in proposal["summary"]
        assert "Revisar avaliação" in proposal["summary"]
        assert "Revisar plano" in proposal["summary"]
        assert all(
            db.get(OperationalOccurrence, item).status == "open" for item in args["occurrence_ids"]
        )

        pending = conf_svc.create_pending_action(
            db,
            organization_id=org_id,
            user_id=user_id,
            tool_name=proposal["tool_name"],
            arguments=proposal["arguments"],
            summary_text=proposal["summary"],
        )
        result = conf_svc.confirm_pending_action(
            db,
            organization_id=org_id,
            user_id=user_id,
            pending_id=pending.id,
            expected_arguments=proposal["arguments"],
        )
        assert result["result"]["count"] == 2
        assert set(result["result"]["occurrence_ids"]) == set(args["occurrence_ids"])
        assert all(
            db.get(OperationalOccurrence, uuid.UUID(item)).status == "completed"
            for item in args["occurrence_ids"]
        )
        db.refresh(routine)
        assert routine.last_completed_at is not None

        replay = conf_svc.confirm_pending_action(
            db,
            organization_id=org_id,
            user_id=user_id,
            pending_id=pending.id,
        )
        assert replay["idempotent_replay"] is True
    finally:
        db.close()


def test_batch_rejects_foreign_missing_and_completed_without_partial_write(
    client, register_payload
):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        owned = _occurrence(db, org_id, "owned-open")
        completed = _occurrence(db, org_id, "owned-completed", status="completed")
        foreign_org = Organization(name="Tenant estrangeiro")
        db.add(foreign_org)
        db.commit()
        db.refresh(foreign_org)
        foreign = _occurrence(db, foreign_org.id, "foreign-open")
        for invalid_id, expected_code in [
            (foreign.id, "occurrence_not_found"),
            (uuid.uuid4(), "occurrence_not_found"),
            (completed.id, "occurrence_not_actionable"),
        ]:
            with pytest.raises(AuthError) as exc:
                execute_complete_occurrences(
                    _ctx(db, org_id, user_id),
                    {"occurrence_ids": [str(owned.id), str(invalid_id)]},
                )
            assert exc.value.code == expected_code
            db.refresh(owned)
            assert owned.status == "open"
    finally:
        db.close()


def test_today_qualifier_uses_organization_local_date_and_never_selects_future(
    client, register_payload
):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        today_row = _occurrence(db, org_id, "local-today", due_on=date(2026, 8, 17))
        future_row = _occurrence(db, org_id, "local-future", due_on=date(2026, 8, 18))
        ctx = _ctx(
            db,
            org_id,
            user_id,
            today=date(2026, 8, 17),
            user_message="Conclua a revisão de hoje",
        )
        proposal = get_tool("propose_complete_occurrence").handler(
            ctx, {"occurrence_id": str(today_row.id)}
        )
        assert proposal["summary_fields"]["Situação"] == "Hoje"
        with pytest.raises(AuthError) as exc:
            get_tool("propose_complete_occurrence").handler(
                ctx, {"occurrence_id": str(future_row.id)}
            )
        assert exc.value.code == "occurrence_selection_mismatch"
        db.refresh(today_row)
        db.refresh(future_row)
        assert today_row.status == future_row.status == "open"
    finally:
        db.close()


def test_today_qualifier_without_match_does_not_create_proposal(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        future_row = _occurrence(db, org_id, "only-future", due_on=date(2026, 8, 18))
        with pytest.raises(AuthError) as exc:
            get_tool("propose_complete_occurrence").handler(
                _ctx(
                    db,
                    org_id,
                    user_id,
                    today=date(2026, 8, 17),
                    user_message="Conclua a de hoje",
                ),
                {"occurrence_id": str(future_row.id)},
            )
        assert exc.value.code == "occurrence_selection_not_found"
        db.refresh(future_row)
        assert future_row.status == "open"
    finally:
        db.close()


def test_two_today_occurrences_require_clarification(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        first = _occurrence(db, org_id, "today-first")
        second = _occurrence(db, org_id, "today-second")
        with pytest.raises(AuthError) as exc:
            get_tool("propose_complete_occurrence").handler(
                _ctx(
                    db,
                    org_id,
                    user_id,
                    today=date(2026, 8, 17),
                    user_message="Conclua a de hoje",
                ),
                {"occurrence_id": str(first.id)},
            )
        assert exc.value.code == "occurrence_selection_ambiguous"
        db.refresh(first)
        db.refresh(second)
        assert first.status == second.status == "open"
    finally:
        db.close()


def test_client_qualifier_selects_only_matching_occurrence(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        murilo = _client(db, org_id, "Murilo Macedo")
        ana = _client(db, org_id, "Ana Souza")
        murilo_row = _occurrence(db, org_id, "murilo-task", client_id=murilo.id)
        ana_row = _occurrence(db, org_id, "ana-task", client_id=ana.id)
        ctx = _ctx(
            db,
            org_id,
            user_id,
            today=date(2026, 8, 17),
            user_message="Conclua a do Murilo",
        )
        proposal = get_tool("propose_complete_occurrence").handler(
            ctx, {"occurrence_id": str(murilo_row.id)}
        )
        assert proposal["summary_fields"]["Cliente"] == "Murilo Macedo"
        with pytest.raises(AuthError) as exc:
            get_tool("propose_complete_occurrence").handler(
                ctx, {"occurrence_id": str(ana_row.id)}
            )
        assert exc.value.code == "occurrence_selection_mismatch"
    finally:
        db.close()


def test_defer_executes_only_after_confirmation_and_expired_batch_does_not_write(
    client, register_payload
):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        row = _occurrence(db, org_id, "defer-confirm")
        proposal = get_tool("propose_defer_occurrence").handler(
            _ctx(db, org_id, user_id),
            {"occurrence_id": str(row.id), "deferred_until": "2026-08-22"},
        )
        pending = conf_svc.create_pending_action(
            db,
            organization_id=org_id,
            user_id=user_id,
            tool_name=proposal["tool_name"],
            arguments=proposal["arguments"],
            summary_text=proposal["summary"],
        )
        db.refresh(row)
        assert row.status == "open"
        conf_svc.confirm_pending_action(
            db,
            organization_id=org_id,
            user_id=user_id,
            pending_id=pending.id,
        )
        db.refresh(row)
        assert row.status == "deferred"
        assert row.deferred_until == date(2026, 8, 22)

        expiring = _occurrence(db, org_id, "expired-batch")
        expired = conf_svc.create_pending_action(
            db,
            organization_id=org_id,
            user_id=user_id,
            tool_name="complete_occurrences",
            arguments={"occurrence_ids": [str(expiring.id)]},
            summary_text="Concluir uma pendência.",
        )
        expired.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.add(expired)
        db.commit()
        with pytest.raises(AuthError) as exc:
            conf_svc.confirm_pending_action(
                db,
                organization_id=org_id,
                user_id=user_id,
                pending_id=expired.id,
            )
        assert exc.value.code == "expired"
        db.refresh(expiring)
        assert expiring.status == "open"
    finally:
        db.close()


def test_listed_occurrences_are_scoped_to_latest_assistant_message(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        first = _occurrence(db, org_id, "listed-first")
        second = _occurrence(db, org_id, "listed-second")
        thread = threads_svc.create_thread(db, organization_id=org_id, user_id=user_id)
        threads_svc.append_message(
            db,
            thread=thread,
            role="assistant",
            content="Pendência antiga",
            message_type="text",
            metadata_safe={
                "entities": [
                    {
                        "entity_type": "operational_occurrence",
                        "entity_id": str(first.id),
                        "display_name": "antiga",
                        "operation": "list_plan_pendencies",
                    }
                ]
            },
        )
        threads_svc.append_message(
            db,
            thread=thread,
            role="assistant",
            content="Estas duas",
            message_type="text",
            metadata_safe={
                "entities": [
                    {
                        "entity_type": "operational_occurrence",
                        "entity_id": str(second.id),
                        "display_name": "atual",
                        "operation": "list_plan_pendencies",
                    }
                ]
            },
        )
        refs = collect_thread_entity_refs(db, thread_id=thread.id, organization_id=org_id)
        occurrence_ids = {
            ref["entity_id"] for ref in refs if ref["entity_type"] == "operational_occurrence"
        }
        assert occurrence_ids == {str(second.id)}
    finally:
        db.close()


def test_listed_occurrence_reference_carries_human_date_client_and_situation():
    occurrence_id = str(uuid.uuid4())
    refs = extract_entities_from_tool_result(
        tool_name="list_plan_pendencies",
        result={
            "today": "2026-08-17",
            "groups": [
                {
                    "label": "Preparar renovação",
                    "items": [
                        {
                            "id": occurrence_id,
                            "type_label": "Preparar renovação",
                            "client_name": "Murilo Macedo",
                            "due_on": "2026-08-17",
                            "overdue": False,
                        }
                    ],
                }
            ],
        },
    )
    assert len(refs) == 1
    assert refs[0]["entity_type"] == "operational_occurrence"
    assert refs[0]["entity_id"] == occurrence_id
    assert refs[0]["operation"] == "list_plan_pendencies"
    assert refs[0]["display_name"] == (
        "Preparar renovação — Murilo Macedo — 2026-08-17 — Hoje"
    )


def test_orchestrator_sanitizes_invalid_write_contract_without_500(
    client, register_payload, monkeypatch
):
    org_id, user_id = _auth(client, register_payload)
    tool = get_tool("propose_complete_occurrence")
    monkeypatch.setattr(
        tool,
        "handler",
        lambda _ctx, _args: {"needs_confirmation": True, "summary": "Inválido"},
    )
    fake = FakeLLMProvider(
        [
            LLMResponse(
                tool_calls=[
                    {
                        "id": "broken",
                        "name": "propose_complete_occurrence",
                        "arguments": {"occurrence_id": str(uuid.uuid4())},
                    }
                ],
                usage=LLMUsage(),
            ),
            LLMResponse(content="Não consegui preparar a ação.", usage=LLMUsage()),
        ]
    )
    db = SessionLocal()
    try:
        result = run_turn(
            db,
            organization_id=org_id,
            user_id=user_id,
            message="Conclua a pendência",
            provider=fake,
            settings=_settings(),
        )
        assert result.status == "ok"
        assert result.pending_action is None
        assert (
            db.scalar(select(AgentPendingAction).where(AgentPendingAction.user_id == user_id))
            is None
        )
    finally:
        db.close()
