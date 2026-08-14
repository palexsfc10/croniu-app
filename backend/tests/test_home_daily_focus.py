from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def _auth(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    return response.json()


def _upcoming_slot_on_local_day(
    local_today: str,
    *,
    tz: ZoneInfo,
    minutes_ahead: int = 40,
) -> tuple[datetime, datetime]:
    """Return a future [start,end) still on org-local today (stable near midnight)."""
    today = date.fromisoformat(local_today)
    now_local = datetime.now(tz)
    start = now_local + timedelta(minutes=minutes_ahead)
    if start.date() != today:
        # Keep the slot on local today when +N minutes would roll past midnight.
        start = datetime.combine(today, time(23, 50), tzinfo=tz)
    if start <= now_local or start.date() != today:
        # Last resort: a few minutes ahead still on today, else mid-afternoon past slot.
        candidate = now_local + timedelta(minutes=5)
        if candidate.date() == today and candidate > now_local:
            start = candidate
        else:
            start = datetime.combine(today, time(15, 0), tzinfo=tz)
    end = start + timedelta(hours=1)
    if end.date() != today:
        end = datetime.combine(today, time(23, 59, 59), tzinfo=tz)
    return start, end


def _today_slot_on_local_day(local_today: str, *, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Any appointment on org-local today (may be past) for list/isolation checks."""
    today = date.fromisoformat(local_today)
    start = datetime.combine(today, time(10, 0), tzinfo=tz)
    end = start + timedelta(hours=1)
    return start, end


def _past_slot_on_local_day(local_today: str, *, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Fully ended appointment still on org-local today (stable near midnight)."""
    today = date.fromisoformat(local_today)
    now_local = datetime.now(tz)
    # Prefer a morning slot when the day has progressed far enough.
    start = datetime.combine(today, time(6, 0), tzinfo=tz)
    end = start + timedelta(hours=1)
    if end < now_local and start.date() == today:
        return start, end
    # Early morning: keep a short window that already ended today.
    end = now_local - timedelta(seconds=30)
    start = end - timedelta(minutes=15)
    if start.date() != today:
        start = datetime.combine(today, time(0, 0), tzinfo=tz)
        end = start + timedelta(minutes=1)
        if end >= now_local:
            end = now_local - timedelta(seconds=5)
            start = max(start, end - timedelta(minutes=1))
    if not (start < end <= now_local and start.date() == today):
        # Degenerate clock edge: force a tiny past window on today.
        end = min(now_local - timedelta(seconds=1), datetime.combine(today, time(23, 59, 58), tzinfo=tz))
        start = end - timedelta(seconds=30)
        if start.date() != today:
            start = datetime.combine(today, time(0, 0), tzinfo=tz)
    return start, end


def _in_progress_slot_on_local_day(local_today: str, *, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Appointment covering now, clamped to org-local today."""
    today = date.fromisoformat(local_today)
    now_local = datetime.now(tz)
    day_start = datetime.combine(today, time(0, 0), tzinfo=tz)
    start = max(now_local - timedelta(minutes=20), day_start)
    end = now_local + timedelta(minutes=40)
    if end.date() != today:
        end = datetime.combine(today, time(23, 59, 59), tzinfo=tz)
    if start >= now_local:
        start = day_start
    if end <= now_local:
        end = min(now_local + timedelta(minutes=30), datetime.combine(today, time(23, 59, 59), tzinfo=tz))
    return start, end


def _create_client(client, name="Cliente Home"):
    response = client.post(
        "/api/v1/clients",
        json={"full_name": name, "phone": "11988887777"},
    )
    assert response.status_code == 201
    return response.json()


def _create_service(client):
    response = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_duration_days": 30,
            "default_price_cents": 40000,
        },
    )
    assert response.status_code == 201
    return response.json()


def test_home_priority_cycle_over_appointment_never_repeats_agenda(client, register_payload):
    """Appointments must not become priority_action; nearing cycle wins over agenda."""
    _auth(client, register_payload)
    person = _create_client(client, "Mariana")
    service = _create_service(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    start, end = _upcoming_slot_on_local_day(day, tz=tz, minutes_ahead=40)

    cycle = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": day,
            "ends_on": (date.fromisoformat(day) + timedelta(days=2)).isoformat(),
            "value_cents": 40000,
            "create_receivable": False,
        },
    )
    assert cycle.status_code == 201

    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    appt_id = created.json()["id"]

    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200
    body = home.json()
    assert body["priority_action"]["kind"] == "cycle_nearing_end"
    assert body["priority_action"]["kind"] not in {
        "appointment_upcoming",
        "appointment_in_progress",
    }
    assert body["priority_action"]["entity_id"] != appt_id
    assert body["contextual_hint"] is None
    today_ids = {a["id"] for a in body["upcoming_appointments"]} | {
        a["id"] for a in body.get("in_progress_appointments") or []
    }
    assert appt_id in today_ids
    assert body["priority_action"]["cta_label"] == "Ver ciclo"


def test_home_past_appointment_needs_outcome_not_upcoming(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Carlos")
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    start, end = _past_slot_on_local_day(day, tz=tz)

    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    appt_id = created.json()["id"]

    home = client.get("/api/v1/home/summary").json()
    upcoming_ids = {item["id"] for item in home["upcoming_appointments"]}
    in_progress_ids = {item["id"] for item in home.get("in_progress_appointments") or []}
    needing = {item["id"] for item in home["appointments_needing_outcome"]}
    assert appt_id not in upcoming_ids
    assert appt_id not in in_progress_ids
    assert appt_id in needing
    # Past without outcome is either priority or attention — never duplicated
    in_attention = any(item["entity_id"] == appt_id for item in home["attention_items"])
    is_priority = (
        home["priority_action"] is not None
        and home["priority_action"]["entity_id"] == appt_id
    )
    assert is_priority or in_attention
    assert not (is_priority and in_attention)
    if home["priority_action"] and home["priority_action"]["entity_id"] == appt_id:
        assert home["priority_action"]["kind"] == "appointment_needs_outcome"


def test_home_renewal_request_outranks_cycle_nearing(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Pedro Xavier")
    service = _create_service(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    ends = (datetime.fromisoformat(day).date() + timedelta(days=3)).isoformat()
    cycle = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": day,
            "ends_on": ends,
            "value_cents": 40000,
            "create_receivable": False,
        },
    ).json()

    access = client.post(f"/api/v1/clients/{person['id']}/public-access")
    assert access.status_code in {200, 201}, access.text
    token = access.json()["token"]
    req = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    assert req.status_code == 200, req.text

    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"]["kind"] == "renewal_requested"
    assert home["priority_action"]["cta_label"] == "Revisar solicitação"
    cycle_attention = [
        item
        for item in home["attention_items"]
        if item["kind"] == "cycle_nearing_end" and item["entity_id"] == cycle["id"]
    ]
    assert cycle_attention == []
    # Priority entity is deduped out of attention
    assert not any(
        item["entity_id"] == home["priority_action"]["entity_id"]
        for item in home["attention_items"]
    )
    assert home["contextual_hint"] is None


def test_home_contact_confirmed_suppresses_cycle_nearing(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Sabrina")
    service = _create_service(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    ends = (datetime.fromisoformat(day).date() + timedelta(days=2)).isoformat()
    cycle = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": day,
            "ends_on": ends,
            "value_cents": 40000,
            "create_receivable": False,
        },
    ).json()
    home_before = client.get("/api/v1/home/summary").json()
    assert home_before["priority_action"]["kind"] == "cycle_nearing_end"
    assert home_before["priority_action"]["entity_id"] == cycle["id"]

    confirm = client.post(
        f"/api/v1/cycles/{cycle['id']}/confirm-contact", json={"note": "Falou no zap"}
    )
    assert confirm.status_code == 200

    home = client.get("/api/v1/home/summary").json()
    assert not any(
        item["kind"] == "cycle_nearing_end" and item["entity_id"] == cycle["id"]
        for item in home["attention_items"]
    )
    if home["priority_action"]:
        assert not (
            home["priority_action"]["kind"] == "cycle_nearing_end"
            and home["priority_action"]["entity_id"] == cycle["id"]
        )


def test_cycle_nearing_copy_prefers_lessons_over_distant_date():
    from datetime import date
    from uuid import uuid4

    from app.schemas.domain import CycleOut
    from app.services.domain import _attention_cycle_subtitle, _cycle_nearing_copy

    cycle = CycleOut.model_construct(
        id=uuid4(),
        client_id=uuid4(),
        service_id=uuid4(),
        cycle_type="period",
        status="active",
        starts_on=date(2026, 7, 1),
        ends_on=date(2026, 9, 4),
        client_name="Pedro Xavier",
        service_name="Personal",
        days_remaining=31,
        lessons_remaining=0,
        is_nearing_end=True,
        value_cents=40000,
        notes=None,
        last_contacted_at=None,
        contact_confirmed_at=None,
        created_at=None,
        updated_at=None,
    )
    title, subtitle = _cycle_nearing_copy(cycle)
    assert title == "Aulas do ciclo esgotadas"
    assert "31 dias" not in subtitle
    assert "aulas" in subtitle.lower()
    assert "Aulas esgotadas" in _attention_cycle_subtitle(cycle)


def test_home_successor_cycle_suppresses_exhausted_source(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Pedro Xavier")
    service = _create_service(client)
    day = datetime.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    ).date()
    old = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": (day - timedelta(days=20)).isoformat(),
            "ends_on": (day + timedelta(days=2)).isoformat(),
            "value_cents": 40000,
            "create_receivable": False,
        },
    ).json()
    home_before = client.get("/api/v1/home/summary").json()
    assert home_before["priority_action"]["entity_id"] == old["id"]

    # Manual successor: sequential period (no overlap). Same client+service.
    successor = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": old["ends_on"],
            "ends_on": (day + timedelta(days=32)).isoformat(),
            "value_cents": 40000,
            "create_receivable": False,
        },
    )
    assert successor.status_code == 201, successor.text
    assert successor.json()["id"] != old["id"]

    home = client.get("/api/v1/home/summary").json()
    assert not any(
        item["kind"] == "cycle_nearing_end" and item["entity_id"] == old["id"]
        for item in home["attention_items"]
    )
    if home["priority_action"] and home["priority_action"]["kind"] == "cycle_nearing_end":
        assert home["priority_action"]["entity_id"] != old["id"]


def test_home_resolved_renewal_ends_source_and_clears_cards(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Pedro Xavier")
    service = _create_service(client)
    template = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Mensal 1x",
            "weekly_frequency": 1,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    starts_near_end = (datetime.fromisoformat(day).date() - timedelta(days=25)).isoformat()
    source = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "cycle_template_id": template["id"],
            "starts_on": starts_near_end,
            "weekdays": [0],
            "starts_time": "09:00:00",
            "idempotency_key": "home-renew-source",
            "generate_appointments": True,
        },
    )
    assert source.status_code == 201, source.text
    source_id = source.json()["id"]

    token = client.post(f"/api/v1/clients/{person['id']}/public-access").json()["token"]
    assert client.post(f"/api/v1/public/my-cycle/{token}/renewal").status_code == 200
    rid = client.get("/api/v1/renewal-requests").json()[0]["id"]

    starts = (datetime.fromisoformat(day).date() + timedelta(days=1)).isoformat()
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "cycle_template_id": template["id"],
            "starts_on": starts,
            "weekdays": [0],
            "starts_time": "09:00:00",
            "idempotency_key": "home-renew-approve",
            "renewal_request_id": rid,
            "generate_appointments": True,
        },
    )
    assert created.status_code == 201, created.text
    assert client.get(f"/api/v1/cycles/{source_id}").json()["status"] == "ended"

    home = client.get("/api/v1/home/summary").json()
    assert not any(item["entity_id"] == source_id for item in home["attention_items"])
    assert not any(x["id"] == rid for x in home.get("renewal_requests") or [])
    if home["priority_action"]:
        assert home["priority_action"]["entity_id"] != source_id
        assert home["priority_action"]["kind"] != "renewal_requested"


def test_home_empty_day_message(client, register_payload):
    _auth(client, register_payload)
    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"] is None
    assert home["attention_items"] == []
    assert home["upcoming_appointments"] == []
    assert home["contextual_hint"] is None
    msg = home["message"].lower()
    assert (
        "pendência" in msg
        or "organizado" in msg
        or "configurada" in msg
    )
    assert home["has_active_service"] is False


def test_home_summary_tenant_isolation(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Privado A")
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    start, end = _today_slot_on_local_day(day, tz=tz)
    appt = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    ).json()
    cookie_a = client.cookies.get("croniu_session")

    other = {
        **register_payload,
        "email": f"home_other_{register_payload['email']}",
        "organization_name": "Org Home B",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    home_b = client.get("/api/v1/home/summary").json()
    ids_b = {item["id"] for item in home_b["today_appointments"]}
    assert appt["id"] not in ids_b

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    home_a = client.get("/api/v1/home/summary").json()
    ids_a = {item["id"] for item in home_a["today_appointments"]}
    assert appt["id"] in ids_a


def test_classify_today_appointments_phases():
    from datetime import UTC
    from types import SimpleNamespace
    from uuid import uuid4

    from app.services.domain import classify_today_appointments

    now = datetime(2026, 8, 5, 15, 0, tzinfo=UTC)
    past = SimpleNamespace(
        id=uuid4(),
        starts_at=now - timedelta(hours=2),
        ends_at=now - timedelta(hours=1),
    )
    progress = SimpleNamespace(
        id=uuid4(),
        starts_at=now - timedelta(minutes=10),
        ends_at=now + timedelta(minutes=50),
    )
    future = SimpleNamespace(
        id=uuid4(),
        starts_at=now + timedelta(hours=1),
        ends_at=now + timedelta(hours=2),
    )
    upcoming, in_progress, needing = classify_today_appointments(
        [past, progress, future], now=now
    )
    assert [a.id for a in upcoming] == [future.id]
    assert [a.id for a in in_progress] == [progress.id]
    assert [a.id for a in needing] == [past.id]


def test_select_home_priority_order_payment_over_ended_over_renewal():
    from datetime import date
    from uuid import uuid4

    from app.schemas.domain import CycleOut, ReceivableOut
    from app.services.domain import select_home_priority

    overdue = [
        ReceivableOut.model_construct(
            id=uuid4(),
            client_id=uuid4(),
            cycle_id=None,
            amount_cents=1000,
            due_on=date(2026, 8, 1),
            status="pending",
            received_at=None,
            created_at=None,
            updated_at=None,
            client_name="Devendo",
            cycle_service_name=None,
        )
    ]
    ended = [
        CycleOut.model_construct(
            id=uuid4(),
            client_id=uuid4(),
            service_id=uuid4(),
            cycle_type="period",
            status="ended",
            starts_on=date(2026, 7, 1),
            ends_on=date(2026, 8, 1),
            client_name="Encerrado",
            service_name="Personal",
            days_remaining=-4,
            is_nearing_end=False,
            value_cents=40000,
            notes=None,
            last_contacted_at=None,
            contact_confirmed_at=None,
            created_at=None,
            updated_at=None,
        )
    ]
    class RR:
        id = uuid4()
        client_name = "Renova"

    p = select_home_priority(
        overdue=overdue,
        due_today=[],
        due_later=[],
        pay_reports=[],
        ended_unrenewed=ended,
        renewal_reqs=[RR()],
        nearing=[],
        has_conflict=False,
        conflict_entity_id=None,
        appointments_needing_outcome=[],
    )
    assert p is not None
    assert p.kind == "pending_payment"

    p2 = select_home_priority(
        overdue=[],
        due_today=[],
        due_later=[],
        pay_reports=[],
        ended_unrenewed=ended,
        renewal_reqs=[RR()],
        nearing=[],
        has_conflict=False,
        conflict_entity_id=None,
        appointments_needing_outcome=[],
    )
    assert p2 is not None
    assert p2.kind == "cycle_ended_unrenewed"


def test_home_overdue_outranks_cycle_and_dedupes_attention(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Devendo")
    service = _create_service(client)
    day = datetime.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    ).date()
    cycle = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": day.isoformat(),
            "ends_on": (day + timedelta(days=2)).isoformat(),
            "value_cents": 40000,
            "create_receivable": True,
            "receivable_due_on": (day - timedelta(days=3)).isoformat(),
        },
    )
    assert cycle.status_code == 201, cycle.text
    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"]["kind"] == "pending_payment"
    pay_id = home["priority_action"]["entity_id"]
    assert not any(item["entity_id"] == pay_id for item in home["attention_items"])


def test_home_ended_cycle_without_renewal(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "FimCiclo")
    service = _create_service(client)
    day = datetime.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    ).date()
    created = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": (day - timedelta(days=40)).isoformat(),
            "ends_on": (day - timedelta(days=2)).isoformat(),
            "value_cents": 40000,
            "create_receivable": False,
        },
    )
    assert created.status_code == 201, created.text
    cycle_id = created.json()["id"]
    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"]["kind"] == "cycle_ended_unrenewed"
    assert home["priority_action"]["entity_id"] == cycle_id
    assert any(c["id"] == cycle_id for c in home.get("cycles_ended_unrenewed") or [])


def test_home_in_progress_not_upcoming(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Agora")
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    start, end = _in_progress_slot_on_local_day(day, tz=tz)
    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    appt_id = created.json()["id"]
    home = client.get("/api/v1/home/summary").json()
    assert appt_id in {a["id"] for a in home.get("in_progress_appointments") or []}
    assert appt_id not in {a["id"] for a in home.get("upcoming_appointments") or []}
    assert appt_id not in {a["id"] for a in home.get("appointments_needing_outcome") or []}
    if home["priority_action"]:
        assert home["priority_action"]["kind"] not in {
            "appointment_in_progress",
            "appointment_upcoming",
        }


def test_home_empty_includes_in_progress_field(client, register_payload):
    _auth(client, register_payload)
    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"] is None
    assert home["attention_items"] == []
    assert home["upcoming_appointments"] == []
    assert home.get("in_progress_appointments") == []
    assert home["contextual_hint"] is None
