"""Feedback API — session tenant, validation, admin list/status."""

from __future__ import annotations

import uuid

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


def test_feedback_requires_auth(client):
    res = client.post(
        "/api/v1/feedback",
        json={"category": "suggestion", "message": "Preciso de um relatório semanal."},
    )
    assert res.status_code in {401, 403}


def test_feedback_validation_and_create(client, register_payload):
    _auth(client, register_payload)
    short = client.post(
        "/api/v1/feedback",
        json={"category": "suggestion", "message": "curto"},
    )
    assert short.status_code == 422

    ok = client.post(
        "/api/v1/feedback",
        json={
            "category": "suggestion",
            "subject": "Filtro",
            "message": "Gostaria de filtrar a agenda por local de atendimento.",
            "include_technical_context": True,
            "technical_context": {
                "route": "/app/help",
                "device_kind": "mobile",
                "viewport": "390x844",
                "client_mode": "browser",
                "app_version": "hml",
            },
            "organization_id": str(uuid.uuid4()),
            "user_id": str(uuid.uuid4()),
        },
    )
    # extra fields forbidden by schema
    assert ok.status_code == 422

    ok = client.post(
        "/api/v1/feedback",
        json={
            "category": "suggestion",
            "subject": "Filtro",
            "message": "Gostaria de filtrar a agenda por local de atendimento.",
            "include_technical_context": True,
            "technical_context": {
                "route": "/app/help",
                "device_kind": "mobile",
                "viewport": "390x844",
                "client_mode": "browser",
                "app_version": "hml",
            },
        },
    )
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert body["status"] == "new"
    assert "id" in body


def test_feedback_rate_limit(client, register_payload):
    _auth(client, register_payload)
    payload = {
        "category": "other",
        "message": "Mensagem de teste de limite de envio do feedback.",
    }
    codes = []
    for i in range(10):
        res = client.post(
            "/api/v1/feedback",
            json={**payload, "message": f"{payload['message']} #{i}"},
        )
        codes.append(res.status_code)
    assert 201 in codes
    assert 429 in codes
