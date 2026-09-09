"""GET /clients/onboarding-board — real state grouping, no invented data.

Groups clients strictly by ClientJourney.stage + requires_professional_attention
(never a fabricated "continuous accompaniment"/progress percentage). Also
covers the draft-evaluations digest used by the mobile view.
"""

from __future__ import annotations

import uuid

from app.models.intake import ClientIntakeSubmission, ClientJourney, OrganizationIntakeLink
from app.models.client_evaluation import ClientEvaluation


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _create_client(client, name):
    res = client.post("/api/v1/clients", json={"full_name": name})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _org_id(client) -> uuid.UUID:
    return uuid.UUID(client.get("/api/v1/auth/me").json()["organization"]["id"])


def _set_journey(db_session, *, organization_id, client_id, **kwargs):
    journey = ClientJourney(
        id=uuid.uuid4(),
        organization_id=organization_id,
        client_id=uuid.UUID(client_id),
        stage=kwargs.pop("stage"),
        **kwargs,
    )
    db_session.add(journey)
    db_session.commit()
    return journey


def _link(db_session, *, organization_id):
    link = OrganizationIntakeLink(
        id=uuid.uuid4(),
        organization_id=organization_id,
        token_hash="x" * 64,
        status="active",
    )
    db_session.add(link)
    db_session.commit()
    return link


def _submission(db_session, *, organization_id, link_id, client_id, status="pending_review"):
    sub = ClientIntakeSubmission(
        id=uuid.uuid4(),
        organization_id=organization_id,
        intake_link_id=link_id,
        client_id=uuid.UUID(client_id) if client_id else None,
        idempotency_key=uuid.uuid4().hex,
        status=status,
        full_name="Convidado Teste",
        phone_normalized="5511999990000",
        primary_goal="Emagrecimento",
    )
    db_session.add(sub)
    db_session.commit()
    return sub


def test_manual_client_with_no_journey_is_completed_and_manual(client, register_payload, db_session):
    _register(client, register_payload)
    client_id = _create_client(client, "Cliente Manual")

    res = client.get("/api/v1/clients/onboarding-board")
    assert res.status_code == 200, res.text
    body = res.json()
    completed_ids = {item["client_id"] for item in body["completed"]}
    assert client_id in completed_ids
    item = next(i for i in body["completed"] if i["client_id"] == client_id)
    assert item["entry_type"] == "manual"
    assert item["stage"] == "active"
    assert item["requires_professional_attention"] is False


def test_client_from_invite_pending_review_is_in_progress_with_submission_link(
    client, register_payload, db_session
):
    _register(client, register_payload)
    org_id = _org_id(client)
    client_id = _create_client(client, "Cliente Convite")
    link = _link(db_session, organization_id=org_id)
    sub = _submission(db_session, organization_id=org_id, link_id=link.id, client_id=client_id)
    _set_journey(
        db_session,
        organization_id=org_id,
        client_id=client_id,
        stage="pending_review",
        next_action="review_submission",
    )

    res = client.get("/api/v1/clients/onboarding-board")
    body = res.json()
    in_progress_ids = {item["client_id"] for item in body["in_progress"]}
    assert client_id in in_progress_ids
    item = next(i for i in body["in_progress"] if i["client_id"] == client_id)
    assert item["entry_type"] == "convite"
    assert item["submission_id"] == str(sub.id)
    assert item["next_action_label"] == "Analisar cadastro"
    assert client_id not in {i["client_id"] for i in body["completed"]}


def test_pending_registration_stage_is_invite_pending(client, register_payload, db_session):
    _register(client, register_payload)
    org_id = _org_id(client)
    client_id = _create_client(client, "Cliente Cadastro Incompleto")
    _set_journey(db_session, organization_id=org_id, client_id=client_id, stage="pending_registration")

    res = client.get("/api/v1/clients/onboarding-board")
    body = res.json()
    assert client_id in {i["client_id"] for i in body["invite_pending"]}


def test_attention_flag_wins_over_stage_grouping_and_is_never_duplicated(
    client, register_payload, db_session
):
    _register(client, register_payload)
    org_id = _org_id(client)
    client_id = _create_client(client, "Cliente Atenção")
    _set_journey(
        db_session,
        organization_id=org_id,
        client_id=client_id,
        stage="pending_review",
        requires_professional_attention=True,
        attention_note="Divergência de e-mail com cadastro existente.",
    )

    res = client.get("/api/v1/clients/onboarding-board")
    body = res.json()
    attention_ids = {i["client_id"] for i in body["attention"]}
    assert client_id in attention_ids
    item = next(i for i in body["attention"] if i["client_id"] == client_id)
    assert item["attention_note"] == "Divergência de e-mail com cadastro existente."
    for group in ("invite_pending", "in_progress", "completed"):
        assert client_id not in {i["client_id"] for i in body[group]}


def test_rejected_and_archived_stages_are_excluded_from_the_board(client, register_payload, db_session):
    _register(client, register_payload)
    org_id = _org_id(client)
    rejected_id = _create_client(client, "Cliente Recusado")
    archived_id = _create_client(client, "Cliente Arquivado")
    _set_journey(db_session, organization_id=org_id, client_id=rejected_id, stage="rejected")
    _set_journey(db_session, organization_id=org_id, client_id=archived_id, stage="archived")

    res = client.get("/api/v1/clients/onboarding-board")
    body = res.json()
    all_ids = {
        i["client_id"]
        for group in ("attention", "invite_pending", "in_progress", "completed")
        for i in body[group]
    }
    assert rejected_id not in all_ids
    assert archived_id not in all_ids


def test_draft_evaluations_digest_excludes_published_and_includes_client_name(
    client, register_payload, db_session
):
    _register(client, register_payload)
    client_id = _create_client(client, "Cliente Rascunho")

    draft = client.post(
        f"/api/v1/clients/{client_id}/evaluations", json={"title": "Avaliação de setembro"}
    )
    assert draft.status_code == 201, draft.text
    eval_id = draft.json()["id"]

    published = client.post(
        f"/api/v1/clients/{client_id}/evaluations", json={"title": "Avaliação já publicada"}
    )
    assert published.status_code == 201, published.text
    pub_id = published.json()["id"]
    assert client.post(f"/api/v1/evaluations/{pub_id}/publish").status_code == 200

    res = client.get("/api/v1/clients/onboarding-board")
    body = res.json()
    titles = {d["title"] for d in body["draft_evaluations"]}
    assert "Avaliação de setembro" in titles
    assert "Avaliação já publicada" not in titles
    item = next(d for d in body["draft_evaluations"] if d["evaluation_id"] == eval_id)
    assert item["client_name"] == "Cliente Rascunho"


def test_onboarding_board_is_isolated_by_tenant(client, register_payload, db_session):
    _register(client, register_payload)
    org_a = _org_id(client)
    client_a = _create_client(client, "Cliente Org A")
    _set_journey(
        db_session,
        organization_id=org_a,
        client_id=client_a,
        stage="pending_review",
        requires_professional_attention=True,
    )
    client.post("/api/v1/auth/logout")

    suffix = uuid.uuid4().hex[:8]
    other_payload = {
        "email": f"other_org_{suffix}@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outra Profissional",
        "organization_name": f"Outro Studio {suffix}",
    }
    _register(client, other_payload)

    res = client.get("/api/v1/clients/onboarding-board")
    body = res.json()
    all_ids = {
        i["client_id"]
        for group in ("attention", "invite_pending", "in_progress", "completed")
        for i in body[group]
    }
    assert client_a not in all_ids
