from __future__ import annotations

from app.config import get_settings


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] is True


def test_liveness_readiness_and_version(client):
    assert client.get("/health/live").json() == {"status": "ok"}

    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "database": True}

    version = client.get("/version")
    assert version.status_code == 200
    assert version.json() == {
        "environment": "development",
        "version": "0.0.0-dev",
        "git_sha": "unknown",
        "build_time": "",
        "status": "ok",
    }


def test_version_uses_injected_build_metadata(monkeypatch):
    monkeypatch.setenv("GIT_SHA", "3922da876514a5484f738d6ab0140b8a86c16090")
    monkeypatch.setenv("BUILD_TIME", "20260814T120000Z")
    monkeypatch.setenv("CRONIU_ENV", "hml")
    monkeypatch.setenv("APP_VERSION", "client-intake-hml")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as local:
        body = local.get("/version").json()
    get_settings.cache_clear()
    assert body["environment"] == "hml"
    assert body["git_sha"] == "3922da876514a5484f738d6ab0140b8a86c16090"
    assert body["git_sha"] != "unknown"
    assert body["build_time"] == "20260814T120000Z"
    assert body["status"] == "ok"


def test_register_valid(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == register_payload["email"]
    assert body["organization"]["name"] == register_payload["organization_name"]
    assert body["role"] == "owner"
    assert "croniu_session" in response.cookies


def test_register_with_profession(client, register_payload):
    payload = {
        **register_payload,
        "email": "consultor@example.com",
        "profession_code": "consultant",
        "use_cases": ["consulting", "periodic_feedback"],
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    org = response.json()["organization"]
    assert org["profession_code"] == "consultant"
    assert org["profession_onboarding_done"] is True


def test_register_duplicate_email(client, register_payload):
    assert client.post("/api/v1/auth/register", json=register_payload).status_code == 201
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_login_valid(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    client.post("/api/v1/auth/logout")
    response = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert response.status_code == 200
    assert response.json()["user"]["email"] == register_payload["email"]
    assert "croniu_session" in response.cookies


def test_login_invalid(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": "errada"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_protected_route_requires_auth(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_me_and_logout(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["role"] == "owner"

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_invalid_session_token(client):
    client.cookies.set("croniu_session", "token-invalido")
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_validation_error(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "x", "full_name": "A", "organization_name": "B"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_transactional_register_creates_membership(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    body = response.json()
    assert body["organization"]["id"]
    assert body["user"]["id"]
    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200
    assert home.json()["organization_id"] == body["organization"]["id"]


def test_tenant_isolation(client, register_payload):
    payload_a = register_payload
    response_a = client.post("/api/v1/auth/register", json=payload_a)
    org_a = response_a.json()["organization"]["id"]
    cookie_a = response_a.cookies.get("croniu_session")

    payload_b = {
        **register_payload,
        "email": "outro_" + register_payload["email"],
        "organization_name": "Outra Org",
    }
    # new client jar for B
    client.cookies.clear()
    response_b = client.post("/api/v1/auth/register", json=payload_b)
    org_b = response_b.json()["organization"]["id"]
    assert org_a != org_b

    summary_b = client.get("/api/v1/home/summary")
    assert summary_b.json()["organization_id"] == org_b

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    summary_a = client.get("/api/v1/home/summary")
    assert summary_a.status_code == 200
    assert summary_a.json()["organization_id"] == org_a
    assert summary_a.json()["organization_id"] != org_b


def test_password_reset_unknown_email_does_not_enumerate(client):
    response = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "nobody@example.com"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "conta" in body["message"].lower() or "e-mail" in body["message"].lower()
    assert body.get("dev_reset_token") is None


def test_password_reset_flow(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    client.post("/api/v1/auth/logout")

    requested = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": register_payload["email"]},
    )
    assert requested.status_code == 200
    token = requested.json()["dev_reset_token"]
    assert token

    new_password = "NovaSenhaForte9!"
    confirmed = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "password": new_password},
    )
    assert confirmed.status_code == 200

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": new_password},
    )
    assert new_login.status_code == 200


def test_password_reset_invalid_token(client):
    response = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": "token-invalido-sem-chance-de-existir", "password": "SenhaForte1!"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_reset_token"
