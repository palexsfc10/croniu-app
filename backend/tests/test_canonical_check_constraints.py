"""Canonical CHECK constraints: names after create_all and reject/accept DML."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from psycopg.errors import CheckViolation, ForeignKeyViolation
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from sqlalchemy.orm import Session

from app.models.appointment import Appointment
from app.models.client import Client
from app.models.cycle import Cycle
from app.models.organization import Organization
from app.models.organization_payment_settings import OrganizationPaymentSettings
from app.models.receivable import Receivable
from app.models.service import Service
from app.models.user_feedback import UserFeedback

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


def _assert_check(exc_info, constraint_name: str) -> None:
    orig = exc_info.value.orig
    assert not isinstance(orig, ForeignKeyViolation), (
        f"expected {constraint_name}, got FK first: {orig}"
    )
    assert isinstance(orig, CheckViolation), orig
    assert constraint_name in str(orig)


def _persist_client(db_session, org_id, *, phone: str) -> uuid.UUID:
    seed = Session(bind=db_session.get_bind())
    try:
        client = Client(organization_id=org_id, full_name="Ana", phone=phone)
        seed.add(client)
        seed.commit()
        return client.id
    finally:
        seed.close()


def _persist_cycle_and_receivable(db_session, org_id, client_id):
    seed = Session(bind=db_session.get_bind())
    try:
        service = Service(organization_id=org_id, name="Aula", default_duration_minutes=60)
        seed.add(service)
        seed.flush()
        cycle = Cycle(
            organization_id=org_id,
            client_id=client_id,
            service_id=service.id,
            starts_on=date(2026, 8, 1),
            ends_on=date(2026, 9, 1),
            status="active",
        )
        seed.add(cycle)
        seed.flush()
        rec = Receivable(
            organization_id=org_id,
            cycle_id=cycle.id,
            client_id=client_id,
            amount_cents=1000,
            due_on=date(2026, 8, 1),
            status="pending",
        )
        seed.add(rec)
        seed.commit()
        return cycle.id, rec.id
    finally:
        seed.close()


def test_canonical_check_names_exist(db_session):
    rows = db_session.execute(
        text(
            "SELECT conname FROM pg_constraint "
            "WHERE contype = 'c' AND connamespace = 'public'::regnamespace"
        )
    ).scalars().all()
    missing = EXPECTED_CHECKS - set(rows)
    assert not missing, missing


def test_agent_thread_status_rejected(db_session, seeded_org_user):
    org, user = seeded_org_user
    with pytest.raises(IntegrityError) as ei:
        db_session.execute(
            text(
                "INSERT INTO agent_threads (id, organization_id, user_id, status) "
                "VALUES (:id, :oid, :uid, 'bogus')"
            ),
            {"id": uuid.uuid4(), "oid": org.id, "uid": user.id},
        )
        db_session.flush()
    _assert_check(ei, "ck_agent_threads_status")
    db_session.rollback()
    assert db_session.get(Organization, org.id) is not None
    db_session.execute(
        text(
            "INSERT INTO agent_threads (id, organization_id, user_id, status) "
            "VALUES (:id, :oid, :uid, 'active')"
        ),
        {"id": uuid.uuid4(), "oid": org.id, "uid": user.id},
    )
    db_session.flush()


def test_appointment_ends_after_starts(db_session, seeded_org_user):
    org, _user = seeded_org_user
    client_id = _persist_client(db_session, org.id, phone="11999990000")
    start = datetime.now(UTC)
    with pytest.raises(IntegrityError) as ei:
        db_session.add(
            Appointment(
                organization_id=org.id,
                client_id=client_id,
                starts_at=start,
                ends_at=start,
                status="scheduled",
            )
        )
        db_session.flush()
    _assert_check(ei, "ck_appointments_ends_after_starts")
    db_session.rollback()


def test_pix_key_type_rejected(db_session, seeded_org_user):
    org, _user = seeded_org_user
    with pytest.raises(IntegrityError) as ei:
        db_session.add(
            OrganizationPaymentSettings(organization_id=org.id, pix_key_type="iban")
        )
        db_session.flush()
    _assert_check(ei, "ck_org_payment_pix_key_type")
    db_session.rollback()
    assert db_session.get(Organization, org.id) is not None
    db_session.add(OrganizationPaymentSettings(organization_id=org.id, pix_key_type="cpf"))
    db_session.flush()


def test_user_feedback_category_and_status(db_session, seeded_org_user):
    org, user = seeded_org_user
    with pytest.raises(IntegrityError) as ei:
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
    _assert_check(ei, "ck_user_feedbacks_category")
    db_session.rollback()
    assert db_session.get(Organization, org.id) is not None
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


def test_intake_link_status_rejected(db_session, seeded_org_user):
    org, _user = seeded_org_user
    with pytest.raises(IntegrityError) as ei:
        db_session.execute(
            text(
                "INSERT INTO organization_intake_links "
                "(id, organization_id, token_hash, status, is_primary, submissions_count) "
                "VALUES (:id, :oid, :th, 'expired', false, 0)"
            ),
            {"id": uuid.uuid4(), "oid": org.id, "th": "a" * 64},
        )
        db_session.flush()
    _assert_check(ei, "ck_organization_intake_links_status")
    db_session.rollback()


def test_protocol_status_rejected(db_session, seeded_org_user):
    org, _user = seeded_org_user
    with pytest.raises(IntegrityError) as ei:
        db_session.execute(
            text(
                "INSERT INTO protocols "
                "(id, organization_id, title, protocol_type, status, is_org_template, "
                "current_version_number) "
                "VALUES (:id, :oid, 'P', 'free', 'live', false, 0)"
            ),
            {"id": uuid.uuid4(), "oid": org.id},
        )
        db_session.flush()
    _assert_check(ei, "ck_protocols_status")
    db_session.rollback()


def test_payment_report_amount_rejected(db_session, seeded_org_user):
    org, _user = seeded_org_user
    client_id = _persist_client(db_session, org.id, phone="11999990001")
    cycle_id, rec_id = _persist_cycle_and_receivable(db_session, org.id, client_id)
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
                "cid": client_id,
                "cy": cycle_id,
                "rid": rec_id,
            },
        )
        db_session.flush()
    _assert_check(ei, "ck_payment_reports_amount")
    db_session.rollback()


def test_renewal_status_rejected(db_session, seeded_org_user):
    org, _user = seeded_org_user
    client_id = _persist_client(db_session, org.id, phone="11999990002")
    cycle_id, _rec_id = _persist_cycle_and_receivable(db_session, org.id, client_id)
    with pytest.raises(IntegrityError) as ei:
        db_session.execute(
            text(
                "INSERT INTO renewal_requests "
                "(id, organization_id, client_id, source_cycle_id, status) "
                "VALUES (:id, :oid, :cid, :cy, 'open')"
            ),
            {"id": uuid.uuid4(), "oid": org.id, "cid": client_id, "cy": cycle_id},
        )
        db_session.flush()
    _assert_check(ei, "ck_renewal_requests_status")
    db_session.rollback()


def test_pending_action_status_accepts_executing(db_session, seeded_org_user):
    org, user = seeded_org_user
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
    with pytest.raises(IntegrityError) as ei:
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
    _assert_check(ei, "ck_agent_pending_actions_status")
    db_session.rollback()
