from __future__ import annotations

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


def _client_id(client: TestClient, name: str = "Maria Souza") -> str:
    return client.post("/api/v1/clients", json={"full_name": name}).json()["id"]


def _eval_payload(**overrides):
    base = {
        "title": "Evolução do mês",
        "summary": "Bom progresso geral.",
        "achievements": "Conseguiu manter a rotina.",
        "attention_points": "Atenção à consistência.",
        "next_goals": "Aumentar frequência.",
        "client_message": "Parabéns pelo esforço!",
        "private_notes": "SEGREDO_PRIVADO_NUNCA_PUBLICO",
        "evaluated_from": "2026-07-01",
        "evaluated_to": "2026-07-31",
        "criteria": [
            {
                "name": "Consistência",
                "score": 4,
                "scale_max": 5,
                "comment": "Melhorou",
                "sort_order": 0,
            }
        ],
    }
    base.update(overrides)
    return base


def test_create_edit_publish_list(client, register_payload):
    _auth(client, register_payload)
    cid = _client_id(client)
    created = client.post(f"/api/v1/clients/{cid}/evaluations", json=_eval_payload())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "draft"
    assert body["private_notes"] == "SEGREDO_PRIVADO_NUNCA_PUBLICO"
    assert body["criteria"][0]["name"] == "Consistência"
    eid = body["id"]

    patched = client.patch(
        f"/api/v1/evaluations/{eid}",
        json={"summary": "Resumo atualizado", "criteria": []},
    )
    assert patched.status_code == 200
    assert patched.json()["summary"] == "Resumo atualizado"
    assert patched.json()["criteria"] == []

    published = client.post(f"/api/v1/evaluations/{eid}/publish")
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert published.json()["published_at"] is not None

    listed = client.get(f"/api/v1/clients/{cid}/evaluations")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["status"] == "published"


def test_draft_hidden_published_visible_no_private_notes(client, register_payload):
    _auth(client, register_payload)
    cid = _client_id(client)
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]

    draft = client.post(f"/api/v1/clients/{cid}/evaluations", json=_eval_payload()).json()
    pub_before = client.get(f"/api/v1/public/my-cycle/{token}")
    assert pub_before.status_code == 200
    assert pub_before.headers.get("cache-control") == "no-store"
    assert pub_before.json()["evaluations"] == []

    client.post(f"/api/v1/evaluations/{draft['id']}/publish")
    pub = client.get(f"/api/v1/public/my-cycle/{token}")
    assert pub.status_code == 200
    evals = pub.json()["evaluations"]
    assert len(evals) == 1
    assert evals[0]["title"] == "Evolução do mês"
    assert evals[0]["client_message"] == "Parabéns pelo esforço!"
    assert "private_notes" not in evals[0]
    assert "id" not in evals[0]
    assert "SEGREDO" not in pub.text

    dumped = pub.json()
    assert "private_notes" not in str(dumped)


def test_unpublish_hides_again(client, register_payload):
    _auth(client, register_payload)
    cid = _client_id(client)
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]
    eid = client.post(f"/api/v1/clients/{cid}/evaluations", json=_eval_payload()).json()["id"]
    client.post(f"/api/v1/evaluations/{eid}/publish")
    assert len(client.get(f"/api/v1/public/my-cycle/{token}").json()["evaluations"]) == 1
    client.post(f"/api/v1/evaluations/{eid}/unpublish")
    assert client.get(f"/api/v1/public/my-cycle/{token}").json()["evaluations"] == []


def test_tenant_isolation_and_other_client(client, register_payload):
    _auth(client, register_payload)
    cid_a = _client_id(client, "Cliente A")
    cid_b = _client_id(client, "Cliente B")
    eid_a = client.post(f"/api/v1/clients/{cid_a}/evaluations", json=_eval_payload()).json()["id"]
    client.post(f"/api/v1/evaluations/{eid_a}/publish")

    token_b = client.post(f"/api/v1/clients/{cid_b}/public-access").json()["token"]
    assert client.get(f"/api/v1/public/my-cycle/{token_b}").json()["evaluations"] == []

    payload_b = {
        "email": "outro_tenant@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro Pro",
        "organization_name": "Outro Studio",
    }
    _auth(client, payload_b)
    assert client.get(f"/api/v1/evaluations/{eid_a}").status_code == 404
    assert client.post(f"/api/v1/evaluations/{eid_a}/publish").status_code == 404
    other_cid = _client_id(client, "Outro")
    assert (
        client.post(
            f"/api/v1/clients/{cid_a}/evaluations",
            json=_eval_payload(title="Invasão"),
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/clients/{other_cid}/evaluations",
            json=_eval_payload(title="Ok"),
        ).status_code
        == 201
    )


def test_unauthorized_and_invalid_token(client, register_payload):
    path = "/api/v1/clients/00000000-0000-0000-0000-000000000001/evaluations"
    assert client.get(path).status_code == 401
    assert client.get("/api/v1/public/my-cycle/token-invalido").status_code == 404


def test_mass_assignment_organization_id_ignored(client, register_payload):
    _auth(client, register_payload)
    cid = _client_id(client)
    payload = _eval_payload()
    payload["organization_id"] = "00000000-0000-0000-0000-000000000099"
    res = client.post(f"/api/v1/clients/{cid}/evaluations", json=payload)
    assert res.status_code == 422


def test_date_and_score_validation(client, register_payload):
    _auth(client, register_payload)
    cid = _client_id(client)
    bad_dates = client.post(
        f"/api/v1/clients/{cid}/evaluations",
        json=_eval_payload(evaluated_from="2026-08-10", evaluated_to="2026-08-01"),
    )
    assert bad_dates.status_code == 422

    bad_score = client.post(
        f"/api/v1/clients/{cid}/evaluations",
        json=_eval_payload(
            criteria=[{"name": "X", "score": 9, "scale_max": 5, "sort_order": 0}]
        ),
    )
    assert bad_score.status_code == 422


def test_archive_hides_from_list_and_portal(client, register_payload):
    _auth(client, register_payload)
    cid = _client_id(client)
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]
    eid = client.post(f"/api/v1/clients/{cid}/evaluations", json=_eval_payload()).json()["id"]
    client.post(f"/api/v1/evaluations/{eid}/publish")
    client.post(f"/api/v1/evaluations/{eid}/archive")
    assert client.get(f"/api/v1/clients/{cid}/evaluations").json() == []
    assert client.get(f"/api/v1/public/my-cycle/{token}").json()["evaluations"] == []
    assert client.get(f"/api/v1/evaluations/{eid}").status_code == 404
