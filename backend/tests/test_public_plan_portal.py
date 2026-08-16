"""Published accompaniment plan on the public client portal."""

from __future__ import annotations

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


def _payload(register_payload: dict, *, profession: str, email_prefix: str) -> dict:
    data = dict(register_payload)
    data["email"] = f"{email_prefix}_{data['email']}"
    data["profession_code"] = profession
    if profession == "other":
        data["profession_other"] = "Consultoria independente"
    return data


def _create_client(client: TestClient, name: str, phone: str) -> str:
    return client.post("/api/v1/clients", json={"full_name": name, "phone": phone}).json()["id"]


def _publish_plan(client: TestClient, client_id: str, **overrides) -> dict:
    body = {
        "title": "Estratégia do período",
        "client_id": client_id,
        "objective": "Consistência nas aulas",
        "content_json": {
            "strategy": "Revisar o material duas vezes por semana.",
            "milestones": "4 semanas — consistência\n8 semanas — revisão",
            "notes": "NOTA_INTERNA_NUNCA_PUBLICA",
            "external": {
                "platform": "external",
                "url": "https://example.com/material",
                "title": "Material do período",
                "visible_to_client": True,
            },
        },
        "duration_value": 16,
        "duration_unit": "weeks",
    }
    body.update(overrides)
    created = client.post("/api/v1/protocols", json=body)
    assert created.status_code == 201, created.text
    published = client.post(f"/api/v1/protocols/{created.json()['id']}/publish")
    assert published.status_code == 200, published.text
    row = published.json()
    assert row["status"] == "published"
    assert row["client_id"] == client_id
    assert row["starts_on"] is not None
    versions = row.get("versions") or []
    published_versions = [v for v in versions if v["status"] == "published"]
    assert published_versions
    assert published_versions[-1]["published_at"] is not None
    return row


def test_draft_hidden_published_visible_and_republish(client, register_payload):
    _auth(client, _payload(register_payload, profession="personal_trainer", email_prefix="pt"))
    cid = _create_client(client, "Ana Portal", "11910000010")
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]

    draft = client.post(
        "/api/v1/protocols",
        json={
            "title": "Rascunho oculto",
            "client_id": cid,
            "content_json": {"strategy": "Ainda não publicar", "notes": "SEGREDO"},
        },
    )
    assert draft.status_code == 201
    assert draft.json()["status"] == "draft"
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub.get("plan") is None

    published = _publish_plan(client, cid)
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    plan = pub["plan"]
    assert plan["section_title"] == "Plano de acompanhamento"
    assert plan["title"] == "Estratégia do período"
    assert plan["summary"] == "Revisar o material duas vezes por semana."
    assert plan["starts_on"] == published["starts_on"]
    assert plan["ends_on"] == published["ends_on"]
    assert plan["milestones"] == ["4 semanas — consistência", "8 semanas — revisão"]
    assert plan["external_url"] == "https://example.com/material"
    assert plan["external_title"] == "Material do período"
    assert plan["published_at"]
    blob = str(plan)
    assert "SEGREDO" not in blob
    assert "NOTA_INTERNA" not in blob
    assert "organization_id" not in blob
    assert "private_notes" not in blob

    patched = client.patch(
        f"/api/v1/protocols/{published['id']}",
        json={"content_json": {"strategy": "Rascunho novo", "notes": "AINDA_SEGREDO"}},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "draft"
    still = client.get(f"/api/v1/public/my-cycle/{token}").json()["plan"]
    assert still["summary"] == "Revisar o material duas vezes por semana."
    assert "Rascunho novo" not in str(still)

    republished = client.post(f"/api/v1/protocols/{published['id']}/publish")
    assert republished.status_code == 200
    updated = client.get(f"/api/v1/public/my-cycle/{token}").json()["plan"]
    assert updated["summary"] == "Rascunho novo"


def test_tutor_plan_title_and_null_ends_on(client, register_payload):
    _auth(client, _payload(register_payload, profession="private_tutor", email_prefix="tu"))
    cid = _create_client(client, "Aluno Tutor", "11910000011")
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]
    created = client.post(
        "/api/v1/protocols",
        json={
            "title": "Trilha de matemática",
            "client_id": cid,
            "objective": "Reforço em frações",
            "content_json": {"milestones": "Prova bimestral"},
            "duration_value": None,
            "duration_unit": None,
        },
    )
    assert created.status_code == 201
    assert client.post(f"/api/v1/protocols/{created.json()['id']}/publish").status_code == 200
    plan = client.get(f"/api/v1/public/my-cycle/{token}").json()["plan"]
    assert plan["section_title"] == "Plano de aprendizagem"
    assert plan["title"] == "Trilha de matemática"
    assert plan["summary"] == "Reforço em frações"
    assert plan["ends_on"] is None
    assert plan["milestones"] == ["Prova bimestral"]


def test_plan_isolation_tenant_and_client(client, register_payload):
    payload_a = _payload(register_payload, profession="personal_trainer", email_prefix="iso_a")
    _auth(client, payload_a)
    cid_a = _create_client(client, "Cliente A", "11910000012")
    token_a = client.post(f"/api/v1/clients/{cid_a}/public-access").json()["token"]
    _publish_plan(client, cid_a, title="Plano A")
    cid_other = _create_client(client, "Cliente B mesma org", "11910000013")
    token_other = client.post(f"/api/v1/clients/{cid_other}/public-access").json()["token"]
    assert client.get(f"/api/v1/public/my-cycle/{token_other}").json().get("plan") is None
    assert client.get(f"/api/v1/public/my-cycle/{token_a}").json()["plan"]["title"] == "Plano A"

    client.post("/api/v1/auth/logout")
    payload_b = _payload(register_payload, profession="personal_trainer", email_prefix="iso_b")
    _auth(client, payload_b)
    cid_b = _create_client(client, "Cliente Tenant B", "11910000014")
    token_b = client.post(f"/api/v1/clients/{cid_b}/public-access").json()["token"]
    assert client.get(f"/api/v1/public/my-cycle/{token_b}").json().get("plan") is None
    foreign = client.get(f"/api/v1/public/my-cycle/{token_a}").json()
    assert foreign["plan"]["title"] == "Plano A"
    assert foreign["plan"]["title"] != "Cliente Tenant B"


def test_selects_current_over_future_and_keeps_ended(client, register_payload):
    _auth(client, _payload(register_payload, profession="personal_trainer", email_prefix="sel"))
    cid = _create_client(client, "Cliente Selecao", "11910000015")
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]
    today = date.fromisoformat(client.get("/api/v1/organization/preferences").json()["local_today"])
    future = client.post(
        "/api/v1/protocols",
        json={
            "title": "Próximo plano",
            "client_id": cid,
            "starts_on": (today + timedelta(days=40)).isoformat(),
            "ends_on": (today + timedelta(days=80)).isoformat(),
            "content_json": {"strategy": "Depois"},
        },
    )
    assert client.post(f"/api/v1/protocols/{future.json()['id']}/publish").status_code == 200
    current = client.post(
        "/api/v1/protocols",
        json={
            "title": "Plano atual",
            "client_id": cid,
            "starts_on": (today - timedelta(days=7)).isoformat(),
            "ends_on": (today + timedelta(days=21)).isoformat(),
            "content_json": {"strategy": "Agora"},
        },
    )
    assert client.post(f"/api/v1/protocols/{current.json()['id']}/publish").status_code == 200
    plan = client.get(f"/api/v1/public/my-cycle/{token}").json()["plan"]
    assert plan["title"] == "Plano atual"


def test_hidden_external_link_stays_off_portal(client, register_payload):
    _auth(client, _payload(register_payload, profession="personal_trainer", email_prefix="hid"))
    cid = _create_client(client, "Cliente Link", "11910000016")
    token = client.post(f"/api/v1/clients/{cid}/public-access").json()["token"]
    hidden = client.post(
        "/api/v1/protocols",
        json={
            "title": "Link oculto",
            "client_id": cid,
            "content_json": {
                "strategy": "Sem link público",
                "external": {
                    "platform": "external",
                    "url": "https://example.com/oculto",
                    "visible_to_client": False,
                },
            },
        },
    )
    assert client.post(f"/api/v1/protocols/{hidden.json()['id']}/publish").status_code == 200
    plan = client.get(f"/api/v1/public/my-cycle/{token}").json()["plan"]
    assert plan["title"] == "Link oculto"
    assert plan["external_url"] is None
