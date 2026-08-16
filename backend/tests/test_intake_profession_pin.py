"""Profession determines pinned intake template. Health forms are never fallback."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.models.intake import OrganizationIntakeLink


def _register(client: TestClient, payload: dict, profession: str) -> None:
    body = {
        **payload,
        "profession_code": profession,
        "profession_other": "Consultoria independente" if profession == "other" else None,
        "use_cases": ["appointments_agenda"],
    }
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _schema_ids(schema: dict) -> tuple[set[str], str]:
    ids: set[str] = set()
    blob = str(schema).lower()
    for section in schema.get("sections") or []:
        for q in section.get("questions") or []:
            ids.add(str(q.get("id") or ""))
            blob += " " + str(q.get("label") or "").lower()
    return ids, blob


PROFILES = [
    ("personal_trainer", "Anamnese de atividade física", True, {"lesão", "dor"}),
    ("private_tutor", "Cadastro inicial do aluno", False, {"aprendizagem", "matéria"}),
    ("sports_teacher", "Cadastro inicial do aluno", False, {"aprendizagem", "modalidade"}),
    ("aesthetics", "Ficha inicial de atendimento", True, {"alergias"}),
    ("physiotherapist", "Ficha inicial de fisioterapia", True, {"mobilidade"}),
    ("nutritionist", "Ficha inicial de acompanhamento nutricional", True, {"rotina alimentar"}),
    ("other", "Cadastro inicial", False, {"objetivo"}),
]


def test_six_professions_pin_expected_form(client, register_payload):
    for i, (code, title, health, hints) in enumerate(PROFILES):
        payload = dict(register_payload)
        payload["email"] = f"{code}_{i}_{register_payload['email']}"
        payload["organization_name"] = f"Org {code} {i}"
        _register(client, payload, code)
        created = client.post("/api/v1/intake-link")
        assert created.status_code == 200, created.text
        token = created.json()["token"]
        ctx = client.get(f"/api/v1/public/intake/{token}")
        assert ctx.status_code == 200, ctx.text
        body = ctx.json()
        assert title.lower() in (body.get("form_name") or "").lower()
        schema = body["anamnesis_schema"]
        ids, blob = _schema_ids(schema)
        if code == "private_tutor" or code == "sports_teacher" or code == "other":
            assert "d_chest_pain" not in ids
            assert "anamnese" not in (body.get("form_name") or "").lower()
            assert "lesão" not in blob
            assert "avaliação médica" not in blob
            consent_blob = str(schema).lower()
            assert "dados de saúde" not in consent_blob
        if code == "personal_trainer":
            assert "anamnese" in (body.get("form_name") or "").lower()
        for hint in hints:
            assert hint in blob or hint in (body.get("form_name") or "").lower()
        client.post("/api/v1/auth/logout")


def test_tutor_rejects_physical_form_kind(client, register_payload):
    _register(client, register_payload, "private_tutor")
    bad = client.post(
        "/api/v1/intake-link",
        json={"form_kind": "physical_anamnesis", "name": "x"},
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "incompatible_form_kind"


def test_nutritionist_does_not_receive_personal_form(client, register_payload):
    _register(client, register_payload, "nutritionist")
    token = client.post("/api/v1/intake-link").json()["token"]
    ctx = client.get(f"/api/v1/public/intake/{token}").json()
    assert "anamnese de atividade física" not in (ctx.get("form_name") or "").lower()
    ids, blob = _schema_ids(ctx["anamnesis_schema"])
    assert "d_chest_pain" not in ids
    assert "rotina alimentar" in blob


def test_legacy_physical_pin_corrected_for_tutor(client, register_payload, db_session):
    _register(client, register_payload, "private_tutor")
    created = client.post("/api/v1/intake-link")
    token = created.json()["token"]
    link_id = created.json()["id"]
    from uuid import UUID

    from app.services.anamnesis_template import get_published_system_version

    version = get_published_system_version(db_session)
    row = db_session.get(OrganizationIntakeLink, UUID(link_id))
    assert row is not None
    row.template_version_id = version.id
    row.form_kind = "physical_anamnesis"
    db_session.add(row)
    db_session.commit()
    ctx = client.get(f"/api/v1/public/intake/{token}").json()
    assert "cadastro inicial" in (ctx.get("form_name") or "").lower()
    assert "anamnese" not in (ctx.get("form_name") or "").lower()


def test_generic_fallback_has_no_health_questions(client, register_payload):
    _register(client, register_payload, "consultant")
    token = client.post("/api/v1/intake-link").json()["token"]
    ctx = client.get(f"/api/v1/public/intake/{token}").json()
    assert ctx["form_name"] == "Cadastro inicial"
    ids, blob = _schema_ids(ctx["anamnesis_schema"])
    assert "d_chest_pain" not in ids
    assert "lesão" not in blob
    assert "treino" not in blob
