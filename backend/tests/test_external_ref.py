from uuid import uuid4

import pytest
from app.services.auth import AuthError
from app.services.external_ref import sanitize_content_json


def test_https_url_normalized():
    out = sanitize_content_json({"external_url": "mfit.com.br/treino"})
    assert out["external_url"].startswith("https://")
    assert out["external"]["platform"] == "external"


def test_rejects_javascript_scheme():
    with pytest.raises(AuthError):
        sanitize_content_json({"external_url": "javascript:alert(1)"})


def test_rejects_data_scheme():
    with pytest.raises(AuthError):
        sanitize_content_json({"external_url": "data:text/html,hi"})


def test_visible_flag_stays_false_by_default():
    out = sanitize_content_json({"external_url": "https://drive.google.com/file"})
    assert out["external"]["visible_to_client"] is False


def test_other_tenant_cannot_read_protocol(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    proto = client.post(
        "/api/v1/protocols",
        json={
            "title": "Plano",
            "protocol_type": "free",
            "content_json": {
                "external": {
                    "platform": "mfit",
                    "url": "https://mfit.com.br/treino",
                    "visible_to_client": False,
                }
            },
        },
    )
    assert proto.status_code == 201, proto.text
    pid = proto.json()["id"]
    client.post("/api/v1/auth/logout")
    other = dict(register_payload)
    other["email"] = f"b_{uuid4().hex[:8]}@example.com"
    other["organization_name"] = f"Org {uuid4().hex[:6]}"
    client.post("/api/v1/auth/register", json=other)
    stolen = client.get(f"/api/v1/protocols/{pid}")
    assert stolen.status_code == 404
