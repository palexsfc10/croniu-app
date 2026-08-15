"""Canonical CHECK constraints: names after create_all and reject/accept DML."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.appointment import Appointment
from app.models.client import Client
from app.models.organization import Organization
from app.models.organization_payment_settings import OrganizationPaymentSettings
from app.models.user import User
from app.models.user_feedback import UserFeedback
from app.security.passwords import hash_password

EXPECTED_CHECKS = {
    "ck_agent_messages_message_type",
    "ck_agent_messages_role",
    "ck_agent_pending_actions_risk_class",
    "ck_agent_pending_actions_status",
    "ck_agent_threads_status",
    "ck_agent_tool_calls_risk_class",
    "ck_appointments_ends_after_starts",
    "ck_client_intake_submissions_status",
    "ck_organization_intake_links_status",
    "ck_org_payment_pix_key_type",
    "ck_payment_proofs_mime",
    "ck_payment_proofs_size",
    "ck_payment_reports_amount",
    "ck_payment_reports_status",
    "ck_protocols_status",
    "ck_renewal_requests_status",
    "ck_user_feedbacks_category",
    "ck_user_feedbacks_status",
}


def _org_user(db_session):
    org = Organization(name="CK Org", status="active", plan_code="trial")
    db_session.add(org)
    db_session.flush()
    user = User(
        email=f"ck_{uuid.uuid4().hex[:8]}@example.com",
        full_name="CK User",
        password_hash=hash_password("SenhaForte1!"),
        account_status="active",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(org)
    db_session.refresh(user)
    return org, user


def test_canonical_check_names_exist(db_session):
    rows = db_session.execute(
        text(
            "SELECT conname FROM pg_constraint "
            "WHERE contype = 'c' AND connamespace = 'public'::regnamespace"
        )
    ).scalars().all()
    missing = EXPECTED_CHECKS - set(rows)
    assert not missing, missing


def test_agent_thread_status_rejected(db_session):
    org, user = _org_user(db_session)
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO agent_threads (id, organization_id, user_id, status) "
                "VALUES (:id, :oid, :uid, 'bogus')"
            ),
            {"id": uuid.uuid4(), "oid": org.id, "uid": user.id},
        )
        db_session.flush()
    db_session.rollback()
    db_session.execute(
        text(
            "INSERT INTO agent_threads (id, organization_id, user_id, status) "
            "VALUES (:id, :oid, :uid, 'active')"
        ),
        {"id": uuid.uuid4(), "oid": org.id, "uid": user.id},
    )
    db_session.flush()


def test_appointment_ends_after_starts(db_session):
    org, _user = _org_user(db_session)
    client = Client(organization_id=org.id, full_name="Ana", phone="11999990000")
    db_session.add(client)
    db_session.flush()
    start = datetime.now(UTC)
    with pytest.raises(IntegrityError):
        db_session.add(
            Appointment(
                organization_id=org.id,
                client_id=client.id,
                starts_at=start,
                ends_at=start,
                status="scheduled",
            )
        )
        db_session.flush()
    db_session.rollback()


def test_pix_key_type_rejected(db_session):
    org, _user = _org_user(db_session)
    with pytest.raises(IntegrityError):
        db_session.add(
            OrganizationPaymentSettings(organization_id=org.id, pix_key_type="iban")
        )
        db_session.flush()
    db_session.rollback()
    db_session.add(OrganizationPaymentSettings(organization_id=org.id, pix_key_type="cpf"))
    db_session.flush()


def test_user_feedback_category_and_status(db_session):
    org, user = _org_user(db_session)
    with pytest.raises(IntegrityError):
        db_session.add(
            UserFeedback(
                organization_id=org.id,
                user_id=user.id,
                category="spam",
                message="x",
                status="new",
            )
        )
        db_session.flush()
    db_session.rollback()
    db_session.add(
        UserFeedback(
            organization_id=org.id,
            user_id=user.id,
            category="suggestion",
            message="ok",
            status="new",
        )
    )
    db_session.flush()


def test_intake_link_status_rejected(db_session):
    org, _user = _org_user(db_session)
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO organization_intake_links "
                "(id, organization_id, token_hash, status) "
                "VALUES (:id, :oid, :th, 'expired')"
            ),
            {"id": uuid.uuid4(), "oid": org.id, "th": "a" * 64},
        )
        db_session.flush()
    db_session.rollback()


def test_protocol_status_rejected(db_session):
    org, _user = _org_user(db_session)
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO protocols (id, organization_id, title, status) "
                "VALUES (:id, :oid, 'P', 'live')"
            ),
            {"id": uuid.uuid4(), "oid": org.id},
        )
        db_session.flush()
    db_session.rollback()


def _cycle_and_receivable(db_session, org, client):
    from datetime import date

    from app.models.cycle import Cycle
    from app.models.receivable import Receivable
    from app.models.service import Service

    service = Service(organization_id=org.id, name="Aula", default_duration_minutes=60)
    db_session.add(service)
    db_session.flush()
    cycle = Cycle(
        organization_id=org.id,
        client_id=client.id,
        service_id=service.id,
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 9, 1),
        status="active",
    )
    db_session.add(cycle)
    db_session.flush()
    rec = Receivable(
        organization_id=org.id,
        cycle_id=cycle.id,
        client_id=client.id,
        amount_cents=1000,
        due_on=date(2026, 8, 1),
        status="pending",
    )
    db_session.add(rec)
    db_session.flush()
    return cycle, rec


def test_payment_report_amount_rejected(db_session):
    org, _user = _org_user(db_session)
    client = Client(organization_id=org.id, full_name="Ana", phone="11999990001")
    db_session.add(client)
    db_session.flush()
    cycle, rec = _cycle_and_receivable(db_session, org, client)
    with pytest.raises(IntegrityError) as ei:
        db_session.execute(
            text(
                "INSERT INTO payment_reports "
                "(id, organization_id, client_id, cycle_id, receivable_id, "
                "status, amount_cents) "
                "VALUES (:id, :oid, :cid, :cy, :rid, 'pending_review', -1)"
            ),
            {
                "id": uuid.uuid4(),
                "oid": org.id,
                "cid": client.id,
                "cy": cycle.id,
                "rid": rec.id,
            },
        )
        db_session.flush()
    assert "ck_payment_reports_amount" in str(ei.value.orig)
    db_session.rollback()


def test_renewal_status_rejected(db_session):
    org, _user = _org_user(db_session)
    client = Client(organization_id=org.id, full_name="Ana", phone="11999990002")
    db_session.add(client)
    db_session.flush()
    cycle, _rec = _cycle_and_receivable(db_session, org, client)
    with pytest.raises(IntegrityError) as ei:
        db_session.execute(
            text(
                "INSERT INTO renewal_requests "
                "(id, organization_id, client_id, source_cycle_id, status) "
                "VALUES (:id, :oid, :cid, :cy, 'open')"
            ),
            {"id": uuid.uuid4(), "oid": org.id, "cid": client.id, "cy": cycle.id},
        )
        db_session.flush()
    assert "ck_renewal_requests_status" in str(ei.value.orig)
    db_session.rollback()


def test_pending_action_status_accepts_executing(db_session):
    org, user = _org_user(db_session)
    db_session.execute(
        text(
            "INSERT INTO agent_pending_actions "
            "(id, organization_id, user_id, tool_name, arguments, summary_text, "
            "status, expires_at, risk_class) "
            "VALUES (:id, :oid, :uid, 't', '{}'::jsonb, 's', 'executing', :exp, 'read')"
        ),
        {
            "id": uuid.uuid4(),
            "oid": org.id,
            "uid": user.id,
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
    )
    db_session.flush()
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO agent_pending_actions "
                "(id, organization_id, user_id, tool_name, arguments, summary_text, "
                "status, expires_at, risk_class) "
                "VALUES (:id, :oid, :uid, 't', '{}'::jsonb, 's', 'unknown', :exp, 'read')"
            ),
            {
                "id": uuid.uuid4(),
                "oid": org.id,
                "uid": user.id,
                "exp": datetime.now(UTC) + timedelta(hours=1),
            },
        )
        db_session.flush()
    db_session.rollback()
