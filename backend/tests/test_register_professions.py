from __future__ import annotations

from app.services.profession import PROFESSION_OPTIONS, USE_CASE_OPTIONS


def _auth(client, payload):
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response


def test_register_every_profession_creates_atomic_account(client, register_payload):
    for index, option in enumerate(PROFESSION_OPTIONS):
        payload = {
            **register_payload,
            "email": f"pro_{option['code']}_{index}@example.com",
            "organization_name": f"Org {option['code']}",
            "profession_code": option["code"],
            "use_cases": [USE_CASE_OPTIONS[0]["code"]],
        }
        if option["code"] == "other":
            payload["profession_other"] = "Fotógrafo autônomo"
        if option["code"] == "sports_teacher":
            payload["profession_specialty"] = "natacao"
        if option["code"] == "private_tutor":
            payload["profession_specialty"] = "idiomas"
        response = _auth(client, payload)
        org = response.json()["organization"]
        assert org["profession_code"] == option["code"]
        assert org["profession_onboarding_done"] is True
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200
        client.post("/api/v1/auth/logout")


def test_register_other_without_description_is_422(client, register_payload):
    payload = {
        **register_payload,
        "profession_code": "other",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_profession"
    assert "Descreva" in body["message"]


def test_register_invalid_profession_code(client, register_payload):
    payload = {**register_payload, "profession_code": "Personal trainer"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_profession"


def test_profession_catalog_codes_are_stable(client, register_payload):
    _auth(client, register_payload)
    profile = client.get("/api/v1/organization/profession")
    assert profile.status_code == 200, profile.text
    codes = [row["code"] for row in profile.json()["catalog"]["professions"]]
    assert codes == [row["code"] for row in PROFESSION_OPTIONS]
