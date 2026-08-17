from __future__ import annotations

import io
from datetime import date, timedelta

from fastapi.testclient import TestClient


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _seed_cycle(client: TestClient, key: str, *, near_end: bool = True) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Renata Silva", "phone": "11988887777"}
    ).json()["id"]
    service_id = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_price_cents": 9000,
            "default_duration_minutes": 60,
        },
    ).json()["id"]
    template_id = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    today = date.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    )
    # Near end: started ~25d ago so 1-month cycle is in the last week.
    # Early: starts tomorrow (próximo) — renewal must stay hidden.
    starts_on = (today - timedelta(days=25)).isoformat() if near_end else (today + timedelta(days=1)).isoformat()
    # Unique weekday/time per key so multiple cycles in the same org never collide.
    slot = sum(ord(c) for c in key) % 5
    weekdays = [[0, 2], [1, 3], [2, 4], [0, 3], [1, 4]][slot]
    starts_time = f"{8 + slot:02d}:30:00"
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": starts_on,
            "weekdays": weekdays,
            "starts_time": starts_time,
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    return {
        "client_id": client_id,
        "cycle_id": created.json()["id"],
        "value_cents": created.json()["value_cents"],
    }


def test_token_hash_only_and_public_view(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-token-1")
    created = client.post(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert created.status_code == 200
    token = created.json()["token"]
    assert token and len(token) >= 32
    status = client.get(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert status.json()["has_active_link"] is True
    assert status.json().get("token") is None
    assert status.json()["public_url"]
    assert status.json()["public_url"] == created.json()["public_url"]

    pub = client.get(f"/api/v1/public/my-cycle/{token}")
    assert pub.status_code == 200
    assert pub.headers.get("cache-control") == "no-store"
    assert "noindex" in (pub.headers.get("x-robots-tag") or "")
    body = pub.json()
    assert "id" not in body
    assert body["client_first_name"] == "Renata"
    assert body["cycle"]["value_cents"] == ids["value_cents"]
    assert "organization" not in body
    assert body["cycle"]["remaining_planned_lessons"] is not None


def test_invalid_revoked_rotated_token(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-token-2")
    t1 = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    assert client.get("/api/v1/public/my-cycle/not-a-real-token").status_code == 404
    assert client.get(f"/api/v1/public/my-cycle/{t1}").status_code == 200
    rotated = client.post(f"/api/v1/clients/{ids['client_id']}/public-access/rotate")
    t2 = rotated.json()["token"]
    assert client.get(f"/api/v1/public/my-cycle/{t1}").status_code == 404
    assert client.get(f"/api/v1/public/my-cycle/{t2}").status_code == 200
    client.delete(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert client.get(f"/api/v1/public/my-cycle/{t2}").status_code == 404


def test_renewal_idempotent_no_auto_cycle(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-ren-1")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub["can_request_renewal"] is True
    assert pub["cycle"]["status_summary"] in {"encerrando", "encerrado", "vigente"}
    before = len(client.get("/api/v1/cycles").json())
    r1 = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    r2 = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    assert r1.status_code == 200 and r2.status_code == 200
    pending = client.get("/api/v1/renewal-requests").json()
    assert len(pending) == 1
    assert len(client.get("/api/v1/cycles").json()) == before
    home = client.get("/api/v1/home/summary").json()
    assert any(x["id"] == pending[0]["id"] for x in home["renewal_requests"])


def test_portal_hides_renewal_at_cycle_start(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-ren-early", near_end=False)
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub["cycle"]["status_summary"] == "proximo"
    assert pub["can_request_renewal"] is False
    blocked = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    assert blocked.status_code == 422
    assert blocked.json()["code"] == "renewal_not_available"


def test_payment_settings_https_and_public_instructions(client, register_payload):
    _auth(client, register_payload)
    bad = client.put(
        "/api/v1/organization/payment-settings",
        json={
            "external_payment_url": "javascript:alert(1)",
            "show_on_my_cycle": True,
        },
    )
    assert bad.status_code == 422
    ok = client.put(
        "/api/v1/organization/payment-settings",
        json={
            "holder_name": "Studio",
            "pix_key_type": "email",
            "pix_key": "pix@studio.com",
            "external_payment_url": "https://pay.example.com/x",
            "show_on_my_cycle": True,
        },
    )
    assert ok.status_code == 200
    ids = _seed_cycle(client, "mc-pay-cfg")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub["payment_instructions"]["configured"] is False
    assert pub["renewal_payment_instructions"]["configured"] is True
    assert pub["renewal_payment_instructions"]["pix_key"] == "pix@studio.com"


def test_payment_report_keeps_receivable_pending_then_confirm(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-pay-1")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    report = client.post(
        f"/api/v1/public/my-cycle/{token}/payment-report",
        data={"method_note": "Pix", "notes": "Enviei"},
    )
    assert report.status_code == 200, report.text
    assert report.json()["status"] == "pending_review"
    recv = client.get("/api/v1/receivables").json()[0]
    assert recv["status"] == "pending"
    assert recv["amount_cents"] == report.json()["amount_cents"]

    again = client.post(f"/api/v1/public/my-cycle/{token}/payment-report", data={})
    assert again.status_code == 200
    pending = client.get("/api/v1/payment-reports").json()
    assert len(pending) == 1

    conf = client.post(f"/api/v1/payment-reports/{pending[0]['id']}/confirm")
    assert conf.status_code == 200
    assert conf.json()["status"] == "confirmed"
    assert client.get(f"/api/v1/receivables/{recv['id']}").json()["status"] == "received"
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub["cycle"]["payment_status"] == "confirmado"


def test_proof_upload_valid_and_reject_fake(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-proof-1")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02"
        b"\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05"
        b"\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    ok = client.post(
        f"/api/v1/public/my-cycle/{token}/payment-report",
        data={"method_note": "Pix"},
        files={"proof": ("x.png", io.BytesIO(png), "image/png")},
    )
    assert ok.status_code == 200, ok.text
    report_id = client.get("/api/v1/payment-reports").json()[0]["id"]
    dl = client.get(f"/api/v1/payment-reports/{report_id}/proof")
    assert dl.status_code == 200
    assert "attachment" in dl.headers.get("content-disposition", "")

    # new cycle/client for fake mime
    ids2 = _seed_cycle(client, "mc-proof-2")
    token2 = client.post(f"/api/v1/clients/{ids2['client_id']}/public-access").json()["token"]
    bad = client.post(
        f"/api/v1/public/my-cycle/{token2}/payment-report",
        data={},
        files={"proof": ("x.png", io.BytesIO(b"not-an-image"), "image/png")},
    )
    assert bad.status_code == 422


def test_tenant_isolation_access_and_proof(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "mc-iso-a")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    client.post(f"/api/v1/public/my-cycle/{token}/payment-report", data={})
    report_id = client.get("/api/v1/payment-reports").json()[0]["id"]
    client.post("/api/v1/auth/logout")
    other = {
        "email": "mc_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio",
    }
    _auth(client, other)
    assert client.get(f"/api/v1/payment-reports/{report_id}/proof").status_code == 404
    assert client.get(f"/api/v1/clients/{ids['client_id']}/public-access").status_code == 404
