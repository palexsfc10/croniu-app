"""Fatia 7 (Rotinas + Acompanhamentos) additions — all additive, zero
migration, zero schema change:
- GET /routines/board?include_completed=&include_cancelled= (extends the
  existing endpoint, backward compatible — old callers unaffected).
- GET /evaluations/recent (org-wide published-evaluations feed).
- GET /accompaniment/pending (real "clientes que precisam de acompanhamento"
  signal: active cycle + no evaluation, or evaluation older than N days).
- AI: propose_create_routine/execute_create_routine and
  list_clients_needing_accompaniment.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import uuid

from app.agent.tools import ToolContext, execute_create_routine, get_tool


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _backdate_client_created_at(client_id: str, *, days_ago: int) -> None:
    """Real long-standing clients were registered well before "today" —
    the public API always stamps `created_at` at request time, so tests
    that need to simulate "this relationship has existed for N days"
    (for the avaliação-pendente anchor: cycle start OR client creation,
    whichever is later) must backdate it directly, same as the AI-tool
    tests below already reach into a session for setup that has no REST
    equivalent."""
    from app.db import SessionLocal
    from app.models.client import Client

    db = SessionLocal()
    try:
        row = db.get(Client, uuid.UUID(client_id))
        row.created_at = datetime.now(UTC) - timedelta(days=days_ago)
        db.add(row)
        db.commit()
    finally:
        db.close()


def _create_client(client, name="Aluna Teste", phone="11999990000"):
    res = client.post("/api/v1/clients", json={"full_name": name, "phone": phone})
    assert res.status_code == 201, res.text
    return res.json()


def _me(client) -> tuple[uuid.UUID, uuid.UUID]:
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _today(client) -> date:
    local_today = client.get("/api/v1/organization/preferences").json()["local_today"]
    y, m, d = (int(part) for part in local_today.split("-"))
    return date(y, m, d)


def _create_active_cycle(client, *, client_id, key, starts_time="09:00:00", days_ago=5):
    """An intelligent cycle that started a few days ago and hasn't ended —
    a real `status == "active"` cycle, not "upcoming"."""
    svc = client.post(
        "/api/v1/services",
        json={
            "name": "Aula",
            "default_duration_minutes": 60,
            "default_duration_days": 60,
            "default_price_cents": 9000,
        },
    )
    assert svc.status_code == 201, svc.text
    tpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "3x semana",
            "weekly_frequency": 3,
            "duration_type": "calendar_months",
            "duration_value": 2,
        },
    )
    assert tpl.status_code == 201, tpl.text
    starts_on = (_today(client) - timedelta(days=days_ago)).isoformat()
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": svc.json()["id"],
            "cycle_template_id": tpl.json()["id"],
            "starts_on": starts_on,
            "weekdays": [0, 2, 4],
            "starts_time": starts_time,
            "generate_appointments": True,
            "create_receivable": False,
            "idempotency_key": key,
        },
    )
    assert cycle.status_code == 201, cycle.text
    return cycle.json()


# --- GET /routines/board?include_completed=&include_cancelled= ---------


def test_board_excludes_completed_and_cancelled_by_default(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    routine = client.post(
        "/api/v1/routines",
        json={
            "name": "Ligar para aluna",
            "task_type": "contact_client",
            "recurrence": "once",
            "next_run_on": today.isoformat(),
            "filter_json": {
                "trigger_type": "calendar",
                "audience": "this_client",
                "client_id": person["id"],
            },
        },
    )
    assert routine.status_code == 201, routine.text

    board = client.get("/api/v1/routines/board").json()
    occ_id = next(
        i["id"]
        for g in board["groups"]
        for i in g["items"]
        if i["client_id"] == person["id"]
    )
    decide = client.post(
        f"/api/v1/routines/occurrences/{occ_id}/decide", json={"status": "completed"}
    )
    assert decide.status_code == 200, decide.text

    default_board = client.get("/api/v1/routines/board").json()
    assert not any(
        i["id"] == occ_id for g in default_board["groups"] for i in g["items"]
    )

    completed_board = client.get("/api/v1/routines/board?include_completed=true").json()
    ids = [i["id"] for g in completed_board["groups"] for i in g["items"]]
    assert occ_id in ids
    item = next(i for g in completed_board["groups"] for i in g["items"] if i["id"] == occ_id)
    assert item["status"] == "completed"


def test_board_on_day_view_unaffected_by_new_flags(client, register_payload):
    """Agenda's `?on=` day view must keep its exact original behavior —
    the new flags only apply to the general board (Rotinas desktop)."""
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    routine = client.post(
        "/api/v1/routines",
        json={
            "name": "Ligar para aluna",
            "task_type": "contact_client",
            "recurrence": "once",
            "next_run_on": today.isoformat(),
            "filter_json": {
                "trigger_type": "calendar",
                "audience": "this_client",
                "client_id": person["id"],
            },
        },
    )
    assert routine.status_code == 201, routine.text
    board = client.get("/api/v1/routines/board").json()
    occ_id = next(i["id"] for g in board["groups"] for i in g["items"])
    client.post(f"/api/v1/routines/occurrences/{occ_id}/decide", json={"status": "completed"})

    day_board = client.get(
        f"/api/v1/routines/board?on={today.isoformat()}&include_completed=true"
    ).json()
    ids = [i["id"] for g in day_board["groups"] for i in g["items"]]
    assert occ_id not in ids


# --- GET /evaluations/recent --------------------------------------------


def test_recent_evaluations_only_published_org_wide(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    draft = client.post(
        f"/api/v1/clients/{person['id']}/evaluations",
        json={"title": "Rascunho não deve aparecer"},
    )
    assert draft.status_code == 201, draft.text
    published = client.post(
        f"/api/v1/clients/{person['id']}/evaluations",
        json={"title": "Evolução publicada"},
    )
    assert published.status_code == 201, published.text
    pub = client.post(f"/api/v1/evaluations/{published.json()['id']}/publish")
    assert pub.status_code == 200, pub.text

    res = client.get("/api/v1/evaluations/recent")
    assert res.status_code == 200, res.text
    titles = [e["title"] for e in res.json()]
    assert "Evolução publicada" in titles
    assert "Rascunho não deve aparecer" not in titles


def test_recent_evaluations_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    created = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Só da org A"}
    )
    assert created.status_code == 201, created.text
    client.post(f"/api/v1/evaluations/{created.json()['id']}/publish")

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "evalb_" + register_payload["email"],
        "organization_name": "Studio B Eval",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    res = client.get("/api/v1/evaluations/recent")
    assert res.status_code == 200
    assert res.json() == []


# --- GET /accompaniment/pending -----------------------------------------


def test_accompaniment_pending_flags_active_client_never_evaluated(client, register_payload):
    """Ciclo ativo iniciado bem antes do limiar, cliente cadastrado na
    mesma época, nunca avaliado — deve virar pendência real."""
    _register(client, register_payload)
    person = _create_client(client, name="Nunca Avaliada")
    _backdate_client_created_at(person["id"], days_ago=20)
    _create_active_cycle(client, client_id=person["id"], key="acc-key-1", days_ago=20)

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200, res.text
    body = res.json()
    row = next(r for r in body["items"] if r["client_id"] == person["id"])
    assert row["last_evaluation_at"] is None
    assert row["days_since_last_evaluation"] is None


def test_accompaniment_pending_excludes_client_created_today_without_cycle(client, register_payload):
    """Aluno criado hoje e sem ciclo: ausência de ciclo já basta para
    nunca aparecer aqui, independente de avaliação."""
    _register(client, register_payload)
    person = _create_client(client, name="Cadastrado Agora", phone="11955550000")

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_excludes_recent_cycle_never_evaluated_below_threshold(
    client, register_payload
):
    """Ciclo iniciado há poucos dias (abaixo do limiar) e nunca avaliado
    não pode virar pendência imediata — avaliação é acompanhamento de
    evolução, não requisito instantâneo do cadastro."""
    _register(client, register_payload)
    person = _create_client(client, name="Ciclo Recente", phone="11955551111")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-recent", days_ago=3)

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_anchors_on_client_creation_when_later_than_cycle_start(
    client, register_payload
):
    """Ciclo com início nominal antigo, mas o cliente só existe desde
    hoje (dado importado/retroativo) — a âncora usa a criação do
    cliente, que é posterior, então ainda não passou do limiar."""
    _register(client, register_payload)
    person = _create_client(client, name="Cliente Novo Ciclo Antigo", phone="11955552222")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-anchor", days_ago=20)

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_excludes_recently_evaluated_client(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Avaliada Hoje", phone="11922221111")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-2", starts_time="10:00:00")
    created = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Evolução recente"}
    )
    assert created.status_code == 201, created.text
    pub = client.post(f"/api/v1/evaluations/{created.json()['id']}/publish")
    assert pub.status_code == 200, pub.text

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_ignores_client_without_active_cycle(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Sem Ciclo Ativo", phone="11933332222")

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Org A Cliente")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-iso")

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "accb_" + register_payload["email"],
        "organization_name": "Studio B Acompanhamento",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    assert res.json()["items"] == []


# --- D1/D2/D3/D4: double-check findings on cycle vigency, multiple ------
# --- cycles, org timezone, and "most recent non-archived evaluation" ---


def _create_cycle_exact_window(
    client, *, client_id, key, starts_on: date, duration_days: int, starts_time="09:00:00"
):
    """Like `_create_active_cycle`, but with `fixed_days` duration for
    exact, predictable control over `ends_on` (= starts_on + duration_days,
    the service's own documented "exclusive renewal date" — see
    `cycle_calc.add_fixed_days`) — needed to hit the exact exclusive
    vigency boundary (`ends_on == today`) instead of an approximate
    calendar-months window."""
    svc = client.post(
        "/api/v1/services",
        json={
            "name": "Aula",
            "default_duration_minutes": 60,
            "default_duration_days": duration_days,
            "default_price_cents": 9000,
        },
    )
    assert svc.status_code == 201, svc.text
    tpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Janela exata",
            "weekly_frequency": 1,
            "duration_type": "fixed_days",
            "duration_value": duration_days,
        },
    )
    assert tpl.status_code == 201, tpl.text
    weekday = starts_on.weekday()
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": svc.json()["id"],
            "cycle_template_id": tpl.json()["id"],
            "starts_on": starts_on.isoformat(),
            "weekdays": [weekday],
            "starts_time": starts_time,
            "generate_appointments": True,
            "create_receivable": False,
            "idempotency_key": key,
        },
    )
    assert cycle.status_code == 201, cycle.text
    return cycle.json()


def _backdate_evaluation(
    evaluation_id: str, *, created_at: datetime | None = None, published_at: datetime | None = None
) -> None:
    """The evaluations API always stamps `created_at`/`published_at` at
    request time — tests proving the *ordering* between an old and a
    recent record need to control these directly, same rationale as
    `_backdate_client_created_at` above."""
    from app.db import SessionLocal
    from app.models.client_evaluation import ClientEvaluation

    db = SessionLocal()
    try:
        row = db.get(ClientEvaluation, uuid.UUID(evaluation_id))
        if created_at is not None:
            row.created_at = created_at
        if published_at is not None:
            row.published_at = published_at
        db.add(row)
        db.commit()
    finally:
        db.close()


def test_accompaniment_pending_excludes_expired_cycle_still_marked_active(
    client, register_payload
):
    """D1: a cycle persisted as `active` whose exclusive vigency already
    ended (`ends_on == today`) must not generate a pendency — status
    alone is not vigency. The cycle's status is never touched by this
    fix, only whether it counts as currently vigent."""
    _register(client, register_payload)
    person = _create_client(client, name="Ciclo Vencido Ainda Ativo", phone="11955553333")
    today = _today(client)
    _backdate_client_created_at(person["id"], days_ago=60)
    cycle = _create_cycle_exact_window(
        client,
        client_id=person["id"],
        key="d1-expired",
        starts_on=today - timedelta(days=30),
        duration_days=30,
    )
    assert cycle["ends_on"] == today.isoformat()
    cycles = client.get("/api/v1/cycles", params={"client_id": person["id"]}).json()
    assert cycles[0]["status"] == "active"

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_excludes_future_cycle_even_with_old_evaluation(
    client, register_payload
):
    """D1: a cycle that hasn't started yet never generates a pendency,
    even when the client already has an old evaluation on record — there
    is no vigent accompaniment to be behind on yet."""
    _register(client, register_payload)
    person = _create_client(client, name="Ciclo Futuro", phone="11955554444")
    today = _today(client)
    _backdate_client_created_at(person["id"], days_ago=60)
    old_eval = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Avaliação antiga"}
    )
    assert old_eval.status_code == 201, old_eval.text
    pub = client.post(f"/api/v1/evaluations/{old_eval.json()['id']}/publish")
    assert pub.status_code == 200, pub.text
    _backdate_evaluation(old_eval.json()["id"], published_at=datetime.now(UTC) - timedelta(days=30))
    _create_cycle_exact_window(
        client,
        client_id=person["id"],
        key="d1-future",
        starts_on=today + timedelta(days=5),
        duration_days=30,
    )

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_excludes_cancelled_cycle(client, register_payload):
    """D1 (explicit coverage per the audit's checklist): a cancelled
    cycle, however old and however "vigent" its dates would otherwise
    read, never counts — only `status == 'active'` is eligible."""
    _register(client, register_payload)
    person = _create_client(client, name="Ciclo Cancelado", phone="11955555555")
    today = _today(client)
    _backdate_client_created_at(person["id"], days_ago=60)
    cycle = _create_cycle_exact_window(
        client,
        client_id=person["id"],
        key="d1-cancelled",
        starts_on=today - timedelta(days=30),
        duration_days=60,
    )
    cancel = client.post(f"/api/v1/cycles/{cycle['id']}/cancel")
    assert cancel.status_code == 200, cancel.text

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_survives_a_second_recent_cycle_for_another_service(
    client, register_payload
):
    """D2: a client with two currently-vigent cycles (two different
    services) — one old enough to already owe an avaliação, one started
    yesterday — must still surface as pending exactly once. The recent
    cycle must never silently erase the older, legitimate signal."""
    _register(client, register_payload)
    person = _create_client(client, name="Dois Servicos", phone="11955556666")
    today = _today(client)
    _backdate_client_created_at(person["id"], days_ago=60)
    _create_active_cycle(client, client_id=person["id"], key="d2-old-service", days_ago=30)
    _create_active_cycle(
        client, client_id=person["id"], key="d2-recent-service", days_ago=1, starts_time="18:00:00"
    )

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    items = res.json()["items"]
    matches = [r for r in items if r["client_id"] == person["id"]]
    assert len(matches) == 1
    assert matches[0]["days_since_last_evaluation"] is None


def test_accompaniment_pending_uses_organization_civil_day_not_utc(client, register_payload):
    """D3: near-midnight UTC, a São Paulo org (UTC-3) is still on the
    previous civil day — the threshold must be computed against that
    local day, never `datetime.now(UTC).date()`."""
    from app.db import SessionLocal
    from app.services import client_evolution

    _register(client, register_payload)
    me = client.get("/api/v1/auth/me").json()
    org_id = uuid.UUID(me["organization"]["id"])
    today = _today(client)
    person = _create_client(client, name="Fronteira UTC", phone="11955557777")
    _backdate_client_created_at(person["id"], days_ago=60)
    # Cycle anchored 14 days before local "today" — one day short of the
    # 15-day threshold when measured locally.
    _create_active_cycle(client, client_id=person["id"], key="d3-utc", days_ago=14)

    # 01:00 UTC the *next* calendar day is still 22:00 local the day
    # before in America/Sao_Paulo (UTC-3) — still `today` locally.
    frozen_utc_now = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=UTC) + timedelta(hours=1)

    db = SessionLocal()
    try:
        rows_utc_bug = client_evolution.list_pending(
            db, organization_id=org_id, days_threshold=15, now=frozen_utc_now
        )
        rows_local_correct = client_evolution.list_pending(
            db,
            organization_id=org_id,
            days_threshold=15,
            now=datetime.combine(today, datetime.min.time(), tzinfo=UTC) + timedelta(hours=12),
        )
    finally:
        db.close()

    # If `now` were taken as UTC's own calendar date, 14 days since the
    # cycle start would already read as 15 days (the UTC date rolled
    # over) and wrongly emit a pendency a day early.
    assert not any(r["client_id"] == person["id"] for r in rows_utc_bug)
    assert not any(r["client_id"] == person["id"] for r in rows_local_correct)


def test_evaluations_recent_draft_wins_over_older_published(client, register_payload):
    """D4: a published evaluation from weeks ago must never outrank a
    genuinely more recent draft — the contract is "most recent
    non-archived record", not "most recent published record"."""
    _register(client, register_payload)
    person = _create_client(client, name="Rascunho Recente", phone="11955558888")
    old_published = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Publicada antiga"}
    )
    assert old_published.status_code == 201, old_published.text
    pub = client.post(f"/api/v1/evaluations/{old_published.json()['id']}/publish")
    assert pub.status_code == 200, pub.text
    _backdate_evaluation(
        old_published.json()["id"], published_at=datetime.now(UTC) - timedelta(days=30)
    )

    recent_draft = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Rascunho de hoje"}
    )
    assert recent_draft.status_code == 201, recent_draft.text

    _backdate_client_created_at(person["id"], days_ago=60)
    _create_active_cycle(client, client_id=person["id"], key="d4-draft-wins", days_ago=30)

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    # The recent draft is the effective "last registered" record, so the
    # 30-day-old published evaluation must not keep this client pending.
    assert person["id"] not in ids


def test_evaluations_recent_published_wins_over_older_draft(client, register_payload):
    """D4, the mirrored case: an old, never-published draft must not
    keep a client pending once a real, recent publication exists."""
    _register(client, register_payload)
    person = _create_client(client, name="Publicacao Recente", phone="11955559999")
    old_draft = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Rascunho antigo"}
    )
    assert old_draft.status_code == 201, old_draft.text
    _backdate_evaluation(old_draft.json()["id"], created_at=datetime.now(UTC) - timedelta(days=30))

    recent_published = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Publicada agora"}
    )
    assert recent_published.status_code == 201, recent_published.text
    pub = client.post(f"/api/v1/evaluations/{recent_published.json()['id']}/publish")
    assert pub.status_code == 200, pub.text

    _backdate_client_created_at(person["id"], days_ago=60)
    _create_active_cycle(client, client_id=person["id"], key="d4-published-wins", days_ago=30)

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_evaluations_archived_most_recent_is_ignored(client, register_payload):
    """D4: an archived record, however recent, must never count as "the
    last registered evaluation" — the older, valid published one still
    applies."""
    _register(client, register_payload)
    person = _create_client(client, name="Arquivada Recente", phone="11955550001")
    valid_old = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Válida, mais antiga"}
    )
    assert valid_old.status_code == 201, valid_old.text
    pub = client.post(f"/api/v1/evaluations/{valid_old.json()['id']}/publish")
    assert pub.status_code == 200, pub.text
    _backdate_evaluation(valid_old.json()["id"], published_at=datetime.now(UTC) - timedelta(days=30))

    archived_recent = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Arquivada, mais recente"}
    )
    assert archived_recent.status_code == 201, archived_recent.text
    arch = client.post(f"/api/v1/evaluations/{archived_recent.json()['id']}/archive")
    assert arch.status_code == 200, arch.text

    _backdate_client_created_at(person["id"], days_ago=60)
    _create_active_cycle(client, client_id=person["id"], key="d4-archived-ignored", days_ago=30)

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    # The valid (non-archived) evaluation is 30 days old — at/over the
    # 15-day threshold — so the client IS legitimately pending; the more
    # recent archived one must not have hidden that by looking "recent".
    assert person["id"] in ids


# --- AI: propose_create_routine / execute_create_routine ---------------


def test_propose_create_routine_summarizes_client_and_date(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Ana Cobranca")
    tomorrow = (_today(client) + timedelta(days=1)).isoformat()

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("propose_create_routine").handler(
            ctx,
            {
                "name": "Cobrar a Ana",
                "task_type": "check_payment",
                "due_on": tomorrow,
                "client_id": person["id"],
            },
        )
        assert result["needs_confirmation"] is True
        assert "Ana Cobranca" in result["summary"]
    finally:
        db.close()


def test_execute_create_routine_creates_real_client_scoped_occurrence(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Gabriel Rotina")
    tomorrow = (_today(client) + timedelta(days=1)).isoformat()

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = execute_create_routine(
            ctx,
            {
                "name": "Cobrar o Gabriel",
                "task_type": "check_payment",
                "due_on": tomorrow,
                "client_id": person["id"],
            },
        )
        assert result["kind"] == "routine"
        db.commit()
    finally:
        db.close()

    board = client.get("/api/v1/routines/board").json()
    items = [i for g in board["groups"] for i in g["items"] if i["client_id"] == person["id"]]
    assert any(i["due_on"] == tomorrow for i in items)


def test_create_routine_tool_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Org A Cliente Rotina")
    tomorrow = (_today(client) + timedelta(days=1)).isoformat()

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "routineb_" + register_payload["email"],
        "organization_name": "Studio B Rotina",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    org_b_id, user_b_id = _me(client)

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_b_id, user_id=user_b_id, db=db)
        try:
            execute_create_routine(
                ctx,
                {
                    "name": "Cobrar cliente de outra org",
                    "task_type": "check_payment",
                    "due_on": tomorrow,
                    "client_id": person["id"],
                },
            )
            raised = False
        except Exception:
            raised = True
        assert raised
    finally:
        db.close()


# --- AI: list_clients_needing_accompaniment -----------------------------


def test_list_clients_needing_accompaniment_matches_rest_signal(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Precisa Acompanhamento")
    _backdate_client_created_at(person["id"], days_ago=20)
    _create_active_cycle(client, client_id=person["id"], key="acc-ai-key", days_ago=20)

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("list_clients_needing_accompaniment").handler(
            ctx, {"days_threshold": 15}
        )
        ids = [c["client_id"] for c in result["clients"]]
        assert person["id"] in ids
    finally:
        db.close()
