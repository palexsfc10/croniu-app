"""API-level tests for smart availability: settings CRUD, day/range queries,
tenant isolation, validation, status filtering and range limits.

Continues the numbered-scenario mapping from test_availability.py for the
DB-backed cases (20-22, 25, 27, 30-API) that need a real database.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from uuid import UUID

from app.db import SessionLocal
from app.services import agenda as agenda_svc
from app.services.auth import AuthError


def _auth_client(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    return client


def _create_client(client, name="Aluno Disponibilidade"):
    response = client.post("/api/v1/clients", json={"full_name": name, "phone": "11999990000"})
    assert response.status_code == 201, response.text
    return response.json()


def _full_week_payload(**overrides) -> dict:
    days = []
    for wd in range(7):
        active = wd < 5  # Mon–Fri active, Sat/Sun off
        days.append(
            {
                "weekday": wd,
                "is_active": active,
                "starts_time": "08:00",
                "ends_time": "18:00",
                "break_starts_time": "12:00" if active else None,
                "break_ends_time": "13:00" if active else None,
                "default_duration_minutes": 60,
            }
        )
    if "days" in overrides:
        for patch in overrides["days"]:
            for day in days:
                if day["weekday"] == patch["weekday"]:
                    day.update(patch)
    return {"days": days}


def _next_weekday(target_weekday: int) -> date:
    today = date.today()
    delta = (target_weekday - today.weekday()) % 7
    delta = delta + 7 if delta == 0 else delta  # always a future date, never "today"
    return today + timedelta(days=delta)


# 8. Jornada não configurada
def test_settings_not_configured_by_default(client, register_payload):
    _auth_client(client, register_payload)
    resp = client.get("/api/v1/availability/settings")
    assert resp.status_code == 200
    assert resp.json() == {"configured": False, "days": []}


def test_settings_put_and_get_roundtrip(client, register_payload):
    _auth_client(client, register_payload)
    put = client.put("/api/v1/availability/settings", json=_full_week_payload())
    assert put.status_code == 200, put.text
    body = put.json()
    assert body["configured"] is True
    assert len(body["days"]) == 7

    got = client.get("/api/v1/availability/settings")
    assert got.status_code == 200
    assert got.json() == body


def test_settings_put_requires_full_week(client, register_payload):
    _auth_client(client, register_payload)
    payload = {"days": _full_week_payload()["days"][:3]}
    resp = client.put("/api/v1/availability/settings", json=payload)
    assert resp.status_code == 422


def test_settings_put_rejects_invalid_time_range(client, register_payload):
    _auth_client(client, register_payload)
    payload = _full_week_payload(
        days=[{"weekday": 0, "starts_time": "18:00", "ends_time": "08:00"}]
    )
    resp = client.put("/api/v1/availability/settings", json=payload)
    assert resp.status_code == 422


def test_settings_put_rejects_break_outside_journey(client, register_payload):
    _auth_client(client, register_payload)
    payload = _full_week_payload(
        days=[{"weekday": 0, "break_starts_time": "07:00", "break_ends_time": "07:30"}]
    )
    resp = client.put("/api/v1/availability/settings", json=payload)
    assert resp.status_code == 422


# 30 (API). Jornada atravessando meia-noite rejeitada
def test_settings_put_rejects_overnight_journey(client, register_payload):
    _auth_client(client, register_payload)
    payload = _full_week_payload(
        days=[{"weekday": 0, "starts_time": "22:00", "ends_time": "02:00"}]
    )
    resp = client.put("/api/v1/availability/settings", json=payload)
    assert resp.status_code == 422


def test_day_query_when_not_configured(client, register_payload):
    _auth_client(client, register_payload)
    monday = _next_weekday(0)
    resp = client.get(f"/api/v1/availability/day?day={monday.isoformat()}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is False
    assert body["slots"] == []


def test_day_query_day_off(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    saturday = _next_weekday(5)
    resp = client.get(f"/api/v1/availability/day?day={saturday.isoformat()}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert body["is_active"] is False
    assert body["slots"] == []


def test_day_query_matches_worked_example(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    person = _create_client(client)
    tuesday = _next_weekday(1)

    for start, end in [("09:00", "10:00"), ("10:00", "11:00"), ("14:00", "15:00"), ("16:00", "17:00")]:
        created = client.post(
            "/api/v1/appointments",
            json={
                "client_id": person["id"],
                "starts_at": f"{tuesday.isoformat()}T{start}:00-03:00",
                "ends_at": f"{tuesday.isoformat()}T{end}:00-03:00",
            },
        )
        assert created.status_code == 201, created.text

    resp = client.get(f"/api/v1/availability/day?day={tuesday.isoformat()}")
    assert resp.status_code == 200
    body = resp.json()
    labels = [s["label"] for s in body["slots"]]
    assert labels == ["08:00", "11:00", "13:00", "15:00", "17:00"]


# 21/22. cancelado não ocupa agenda; agendado ocupa
def test_day_query_excludes_cancelled_appointment(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    person = _create_client(client)
    tuesday = _next_weekday(1)

    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{tuesday.isoformat()}T09:00:00-03:00",
            "ends_at": f"{tuesday.isoformat()}T10:00:00-03:00",
        },
    )
    assert created.status_code == 201
    appt_id = created.json()["id"]

    before = client.get(f"/api/v1/availability/day?day={tuesday.isoformat()}").json()
    assert "09:00" not in [s["label"] for s in before["slots"]]

    cancelled = client.patch(f"/api/v1/appointments/{appt_id}", json={"status": "cancelled"})
    assert cancelled.status_code == 200

    after = client.get(f"/api/v1/availability/day?day={tuesday.isoformat()}").json()
    assert "09:00" in [s["label"] for s in after["slots"]]


def test_duration_query_param_overrides_default(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    monday = _next_weekday(0)
    resp = client.get(
        f"/api/v1/availability/day?day={monday.isoformat()}&duration_minutes=30"
    )
    body = resp.json()
    assert body["duration_minutes"] == 30
    assert len(body["slots"]) > 10  # more, smaller slots than the 60-min default


def test_range_query_covers_each_day(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    monday = _next_weekday(0)
    resp = client.get(
        "/api/v1/availability/range"
        f"?start_date={monday.isoformat()}&end_date={(monday + timedelta(days=6)).isoformat()}"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["days"]) == 7
    saturday = next(d for d in body["days"] if d["weekday"] == 5)
    assert saturday["is_active"] is False


def test_range_query_enforces_max_span(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    monday = _next_weekday(0)
    resp = client.get(
        "/api/v1/availability/range"
        f"?start_date={monday.isoformat()}&end_date={(monday + timedelta(days=60)).isoformat()}"
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "date_range_limited"


def test_range_query_rejects_inverted_dates(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    monday = _next_weekday(0)
    resp = client.get(
        "/api/v1/availability/range"
        f"?start_date={monday.isoformat()}&end_date={(monday - timedelta(days=1)).isoformat()}"
    )
    assert resp.status_code == 422


# 27. Atualização da jornada não afeta compromissos existentes
def test_settings_update_does_not_affect_existing_appointments(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    person = _create_client(client)
    monday = _next_weekday(0)
    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{monday.isoformat()}T09:00:00-03:00",
            "ends_at": f"{monday.isoformat()}T10:00:00-03:00",
        },
    )
    assert created.status_code == 201
    appt_id = created.json()["id"]

    narrower = _full_week_payload(
        days=[{"weekday": 0, "starts_time": "13:00", "ends_time": "18:00", "break_starts_time": None, "break_ends_time": None}]
    )
    reconfigured = client.put("/api/v1/availability/settings", json=narrower)
    assert reconfigured.status_code == 200

    fetched = client.get(f"/api/v1/appointments/{appt_id}")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["status"] == "scheduled"
    starts_at = datetime.fromisoformat(body["starts_at"].replace("Z", "+00:00"))
    assert starts_at.hour == 12 and starts_at.minute == 0  # 09:00 -03:00 == 12:00 UTC, unchanged


# 20. Isolamento entre organizações
def test_tenant_isolation_settings_and_day(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    person = _create_client(client)
    tuesday = _next_weekday(1)
    client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{tuesday.isoformat()}T09:00:00-03:00",
            "ends_at": f"{tuesday.isoformat()}T10:00:00-03:00",
        },
    )

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Outra Org Disponibilidade",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201

    # Org B never configured its journey — must not see org A's config or be blocked by it.
    settings_b = client.get("/api/v1/availability/settings").json()
    assert settings_b == {"configured": False, "days": []}

    day_b = client.get(f"/api/v1/availability/day?day={tuesday.isoformat()}").json()
    assert day_b["configured"] is False
    assert day_b["slots"] == []


# Conflito/concorrência: dois fluxos concorrentes tentando reservar o MESMO horário
# sugerido pela disponibilidade — a checagem de conflito na criação do compromisso
# (agenda_svc.create_appointment, mesma autoridade final de sempre) precisa garantir
# que só um vence, nunca os dois silenciosamente.
def test_concurrent_booking_of_same_suggested_slot_only_one_succeeds(client, register_payload):
    _auth_client(client, register_payload)
    client.put("/api/v1/availability/settings", json=_full_week_payload())
    person = _create_client(client)
    org_id = UUID(client.get("/api/v1/auth/me").json()["organization"]["id"])
    client_id = UUID(person["id"])
    tuesday = _next_weekday(1)

    # Confirm the slot is genuinely free before the race, exactly as a user would see it.
    before = client.get(f"/api/v1/availability/day?day={tuesday.isoformat()}").json()
    assert "09:00" in [s["label"] for s in before["slots"]]

    def worker(_: int):
        db = SessionLocal()
        try:
            return agenda_svc.create_appointment(
                db,
                organization_id=org_id,
                client_id=client_id,
                starts_at=datetime.fromisoformat(f"{tuesday.isoformat()}T09:00:00-03:00"),
                ends_at=datetime.fromisoformat(f"{tuesday.isoformat()}T10:00:00-03:00"),
            )
        except AuthError as exc:
            return exc
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, [0, 1]))

    errors = [r for r in results if isinstance(r, AuthError)]
    successes = [r for r in results if not isinstance(r, AuthError)]
    assert len(successes) == 1, results
    assert len(errors) == 1, results
    assert errors[0].code == "appointment_conflict"

    # The slot is no longer offered — the suggestion engine and the real agenda agree.
    after = client.get(f"/api/v1/availability/day?day={tuesday.isoformat()}").json()
    assert "09:00" not in [s["label"] for s in after["slots"]]
