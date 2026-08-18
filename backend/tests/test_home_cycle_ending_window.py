"""Hotfix: 'Ciclo chegando ao fim' on Hoje must only fire inside the final
7 calendar days of a cycle's vigency (org-local date), counting the last
inclusive day as day 0 — not the previous 30-day heads-up window still used
by the Cycles list/detail badge. See docs/HOME_PRIORITY.md and
backend/app/services/domain.py::home_cycle_ending_eligible.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import uuid4


def _auth(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    return response.json()


def _create_client(client, name="Aluno Ciclo"):
    response = client.post("/api/v1/clients", json={"full_name": name})
    assert response.status_code == 201
    return response.json()


def _create_service(client):
    response = client.post(
        "/api/v1/services",
        json={"name": "Personal", "default_duration_days": 30, "default_price_cents": 40000},
    )
    assert response.status_code == 201
    return response.json()


def _org_local_today(client) -> date:
    return date.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    )


def _cycle_ending_in(client, *, client_id, service_id, days_to_last_day: int, today: date):
    """Create an active cycle whose *last inclusive day* is `days_to_last_day`
    days from `today`. ends_on is exclusive ([starts_on, ends_on)), so the
    stored ends_on is one day past the intended last day."""
    last_day = today + timedelta(days=days_to_last_day)
    ends_on = last_day + timedelta(days=1)
    starts_on = min(today, last_day) - timedelta(days=1)
    res = client.post(
        "/api/v1/cycles",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "starts_on": starts_on.isoformat(),
            "ends_on": ends_on.isoformat(),
            "value_cents": 40000,
            "create_receivable": False,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


# ---------------------------------------------------------------------------
# Unit-level: pure boundary matrix for home_cycle_ending_eligible
# ---------------------------------------------------------------------------


def _cycle_out(*, ends_on: date, is_nearing_end: bool) -> "CycleOut":
    from app.schemas.domain import CycleOut

    return CycleOut.model_construct(
        id=uuid4(),
        client_id=uuid4(),
        service_id=uuid4(),
        cycle_type="period",
        status="active",
        starts_on=ends_on - timedelta(days=30),
        ends_on=ends_on,
        client_name="Aluno",
        service_name="Personal",
        days_remaining=(ends_on - date(2026, 1, 1)).days,
        lessons_remaining=None,
        is_nearing_end=is_nearing_end,
        value_cents=40000,
        notes=None,
        last_contacted_at=None,
        contact_confirmed_at=None,
        created_at=None,
        updated_at=None,
    )


def test_home_cycle_ending_window_boundary_matrix():
    """30/8 dias fora da janela; 7/1/0 dias dentro. ends_on é exclusivo, então
    o último dia civil de vigência é ends_on - 1 (last_inclusive_on)."""
    from app.services.domain import home_cycle_ending_eligible

    today = date(2026, 8, 18)

    cases = {
        30: False,
        8: False,
        7: True,
        1: True,
        0: True,
    }
    for days_to_last_day, expected in cases.items():
        last_day = today + timedelta(days=days_to_last_day)
        ends_on = last_day + timedelta(days=1)  # exclusive boundary
        cycle = _cycle_out(ends_on=ends_on, is_nearing_end=True)
        assert (
            home_cycle_ending_eligible(cycle, today) is expected
        ), f"days_to_last_day={days_to_last_day} esperado eligible={expected}"


def test_home_cycle_ending_window_not_nearing_never_eligible():
    """Ciclo vencido (is_elapsed) ou não-ativo chega com is_nearing_end=False
    de _cycle_out — deve permanecer inelegível independente da data, e nunca
    disputar com o tratamento urgente existente de 'ciclo vencido'."""
    from app.services.domain import home_cycle_ending_eligible

    today = date(2026, 8, 18)
    overdue_cycle = _cycle_out(ends_on=today - timedelta(days=3), is_nearing_end=False)
    assert home_cycle_ending_eligible(overdue_cycle, today) is False

    inside_window_but_not_flagged = _cycle_out(ends_on=today + timedelta(days=2), is_nearing_end=False)
    assert home_cycle_ending_eligible(inside_window_but_not_flagged, today) is False


def test_home_cycle_ending_window_lessons_reason_ignores_day_window():
    """Motivo por aulas (baixas/esgotadas) não é afetado pela janela de dias
    — fora do escopo deste hotfix, que trata apenas do critério por data."""
    from app.schemas.domain import CycleOut
    from app.services.domain import home_cycle_ending_eligible

    today = date(2026, 8, 18)
    far_cycle = CycleOut.model_construct(
        id=uuid4(),
        client_id=uuid4(),
        service_id=uuid4(),
        cycle_type="period",
        status="active",
        starts_on=today - timedelta(days=10),
        ends_on=today + timedelta(days=60),
        client_name="Aluno",
        service_name="Personal",
        days_remaining=60,
        lessons_remaining=0,
        is_nearing_end=True,
        value_cents=40000,
        notes=None,
        last_contacted_at=None,
        contact_confirmed_at=None,
        created_at=None,
        updated_at=None,
    )
    assert home_cycle_ending_eligible(far_cycle, today) is True


# ---------------------------------------------------------------------------
# Integration-level: real API, org-local date, tenant isolation, dedupe
# ---------------------------------------------------------------------------


def test_home_shows_seven_days_hides_eight_days(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Fronteira 7x8")
    service = _create_service(client)
    today = _org_local_today(client)

    far = _cycle_ending_in(
        client, client_id=person["id"], service_id=service["id"], days_to_last_day=8, today=today
    )
    home = client.get("/api/v1/home/summary").json()
    assert not any(c["id"] == far["id"] for c in home["cycles_nearing_end"])
    assert not any(item["entity_id"] == far["id"] for item in home["attention_items"])
    assert home["priority_action"] is None or home["priority_action"]["entity_id"] != far["id"]

    # Same client can't hold two active cycles for the same service without
    # overlap; end the 8-day one and use a second client for the 7-day case.
    person2 = _create_client(client, "Fronteira 7 dias")
    near = _cycle_ending_in(
        client, client_id=person2["id"], service_id=service["id"], days_to_last_day=7, today=today
    )
    home2 = client.get("/api/v1/home/summary").json()
    assert any(c["id"] == near["id"] for c in home2["cycles_nearing_end"])
    assert home2["priority_action"] is not None
    assert home2["priority_action"]["kind"] == "cycle_nearing_end"
    assert home2["priority_action"]["entity_id"] == near["id"]
    # Not duplicated into attention_items alongside the priority card.
    assert not any(item["entity_id"] == near["id"] for item in home2["attention_items"])


def test_home_cycle_ends_today_shows_and_overdue_stays_urgent(client, register_payload):
    _auth(client, register_payload)
    service = _create_service(client)
    today = _org_local_today(client)

    ends_today_client = _create_client(client, "Termina Hoje")
    ends_today = _cycle_ending_in(
        client,
        client_id=ends_today_client["id"],
        service_id=service["id"],
        days_to_last_day=0,
        today=today,
    )
    home = client.get("/api/v1/home/summary").json()
    assert any(c["id"] == ends_today["id"] for c in home["cycles_nearing_end"])

    overdue_client = _create_client(client, "Vencido")
    overdue = _cycle_ending_in(
        client,
        client_id=overdue_client["id"],
        service_id=service["id"],
        days_to_last_day=-3,
        today=today,
    )
    home2 = client.get("/api/v1/home/summary").json()
    assert not any(c["id"] == overdue["id"] for c in home2["cycles_nearing_end"])
    urgent = [item for item in home2["attention_items"] if item["entity_id"] == overdue["id"]]
    is_priority_urgent = (
        home2["priority_action"] is not None
        and home2["priority_action"]["entity_id"] == overdue["id"]
    )
    assert urgent or is_priority_urgent
    if urgent:
        assert urgent[0]["kind"] == "cycle_ended_unrenewed"
    if is_priority_urgent:
        assert home2["priority_action"]["kind"] == "cycle_ended_unrenewed"


def test_home_renewal_already_forwarded_hides_nearing_card_in_new_window(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Renovacao Encaminhada")
    service = _create_service(client)
    today = _org_local_today(client)

    cycle = _cycle_ending_in(
        client, client_id=person["id"], service_id=service["id"], days_to_last_day=3, today=today
    )
    home_before = client.get("/api/v1/home/summary").json()
    assert any(c["id"] == cycle["id"] for c in home_before["cycles_nearing_end"])

    access = client.post(f"/api/v1/clients/{person['id']}/public-access")
    assert access.status_code in {200, 201}, access.text
    token = access.json()["token"]
    req = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    assert req.status_code == 200, req.text

    home_after = client.get("/api/v1/home/summary").json()
    assert not any(c["id"] == cycle["id"] for c in home_after["cycles_nearing_end"])
    assert not any(
        item["kind"] == "cycle_nearing_end" and item["entity_id"] == cycle["id"]
        for item in home_after["attention_items"]
    )


def test_home_two_clients_both_within_window_appear(client, register_payload):
    _auth(client, register_payload)
    service = _create_service(client)
    today = _org_local_today(client)

    alice = _create_client(client, "Alice")
    bob = _create_client(client, "Bob")
    cycle_alice = _cycle_ending_in(
        client, client_id=alice["id"], service_id=service["id"], days_to_last_day=2, today=today
    )
    cycle_bob = _cycle_ending_in(
        client, client_id=bob["id"], service_id=service["id"], days_to_last_day=5, today=today
    )

    home = client.get("/api/v1/home/summary").json()
    nearing_ids = {c["id"] for c in home["cycles_nearing_end"]}
    assert cycle_alice["id"] in nearing_ids
    assert cycle_bob["id"] in nearing_ids
    # Sooner ends_on wins the single priority slot; the other stays in attention.
    assert home["priority_action"]["entity_id"] == cycle_alice["id"]
    assert any(item["entity_id"] == cycle_bob["id"] for item in home["attention_items"])
    assert not any(item["entity_id"] == cycle_alice["id"] for item in home["attention_items"])


def test_home_cycle_ending_window_uses_org_timezone_not_server_time(client, register_payload):
    """Org em fuso UTC+14 (Pacific/Kiritimati): a data local da organização
    pode já estar um dia à frente do relógio do servidor (UTC). O cálculo de
    dias restantes tem que usar essa data local, não date.today() do
    container nem UTC puro."""
    _auth(client, register_payload)
    tz_res = client.patch(
        "/api/v1/organization/preferences", json={"timezone": "Pacific/Kiritimati"}
    )
    assert tz_res.status_code == 200, tz_res.text
    assert tz_res.json()["timezone"] == "Pacific/Kiritimati"

    person = _create_client(client, "Fuso Extremo")
    service = _create_service(client)
    today = _org_local_today(client)

    cycle = _cycle_ending_in(
        client, client_id=person["id"], service_id=service["id"], days_to_last_day=7, today=today
    )
    home = client.get("/api/v1/home/summary").json()
    assert any(c["id"] == cycle["id"] for c in home["cycles_nearing_end"])

    person2 = _create_client(client, "Fuso Extremo Fora")
    cycle2 = _cycle_ending_in(
        client, client_id=person2["id"], service_id=service["id"], days_to_last_day=8, today=today
    )
    home2 = client.get("/api/v1/home/summary").json()
    assert not any(c["id"] == cycle2["id"] for c in home2["cycles_nearing_end"])


def test_home_cycle_ending_window_day_rollover_uses_fresh_org_today(client, register_payload):
    """Virada de dia: o mesmo ciclo deve mudar de elegibilidade quando 'hoje'
    (local da organização) avança um dia, sem precisar recriar o ciclo —
    a cada GET, build_home_summary recalcula org_local_today do zero."""
    _auth(client, register_payload)
    person = _create_client(client, "Virada de Dia")
    service = _create_service(client)
    today = _org_local_today(client)

    # Cycle whose last inclusive day is exactly 8 days out today — outside
    # the window now, but will fall inside it once 1 more day passes without
    # any write to the cycle itself (proving the window is computed fresh
    # from org-local "today" on every read, not cached at creation time).
    cycle = _cycle_ending_in(
        client, client_id=person["id"], service_id=service["id"], days_to_last_day=8, today=today
    )
    home_day0 = client.get("/api/v1/home/summary").json()
    assert not any(c["id"] == cycle["id"] for c in home_day0["cycles_nearing_end"])

    from app.db import SessionLocal
    from app.models.cycle import Cycle

    db = SessionLocal()
    try:
        row = db.get(Cycle, cycle["id"])
        row.starts_on = row.starts_on - timedelta(days=1)
        row.ends_on = row.ends_on - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    home_day1 = client.get("/api/v1/home/summary").json()
    assert any(c["id"] == cycle["id"] for c in home_day1["cycles_nearing_end"])
