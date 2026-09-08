"""agenda_svc.commit_or_raise_conflict must translate exclusively a
ck_appointments_no_overlap violation (SQLSTATE 23P01 from that specific
constraint) into a 409 appointment_conflict — never any other 23P01, never
any other SQLSTATE — and must always roll back first, leaving the session
usable for a subsequent legitimate operation.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from app.models.appointment import APPOINTMENT_NO_OVERLAP_CONSTRAINT, Appointment
from app.models.client import Client
from app.models.organization import Organization
from app.services import agenda as agenda_svc
from app.services.auth import AuthError
from sqlalchemy.exc import IntegrityError


def _seed_org_and_client(db_session) -> tuple[Organization, Client]:
    org = Organization(id=uuid.uuid4(), name="Conflict Classification Org")
    client = Client(id=uuid.uuid4(), organization_id=org.id, full_name="Cliente Teste")
    db_session.add_all([org, client])
    db_session.commit()
    return org, client


def _fake_integrity_error(*, sqlstate: str, constraint_name: str | None, has_diag: bool = True):
    diag = SimpleNamespace(constraint_name=constraint_name) if has_diag else SimpleNamespace()
    orig = SimpleNamespace(sqlstate=sqlstate, diag=diag)
    return IntegrityError("INSERT", {}, orig)


def _make_commit_raise(exc: IntegrityError):
    def _raise():
        raise exc

    return _raise


def test_real_no_overlap_violation_becomes_409_appointment_conflict(db_session):
    org, client = _seed_org_and_client(db_session)
    starts = datetime(2027, 3, 1, 9, 0, tzinfo=UTC)
    ends = starts + timedelta(hours=1)

    first = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(first)
    db_session.commit()

    duplicate = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(duplicate)
    with pytest.raises(AuthError) as excinfo:
        agenda_svc.commit_or_raise_conflict(
            db_session, organization_id=org.id, starts_at=starts, ends_at=ends
        )
    assert excinfo.value.code == "appointment_conflict"
    assert excinfo.value.status_code == 409


def test_other_constraint_23p01_is_reraised_untouched(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    exc = _fake_integrity_error(sqlstate="23P01", constraint_name="some_other_exclusion_constraint")
    monkeypatch.setattr(db_session, "commit", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.commit_or_raise_conflict(db_session)


def test_23p01_without_readable_constraint_name_is_reraised(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    exc = _fake_integrity_error(sqlstate="23P01", constraint_name=None, has_diag=False)
    monkeypatch.setattr(db_session, "commit", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.commit_or_raise_conflict(db_session)


def test_other_sqlstate_is_reraised_even_with_matching_constraint_name(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    exc = _fake_integrity_error(sqlstate="23505", constraint_name=APPOINTMENT_NO_OVERLAP_CONSTRAINT)
    monkeypatch.setattr(db_session, "commit", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.commit_or_raise_conflict(db_session)


def test_rollback_happens_for_every_reraised_case(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    calls = {"count": 0}
    real_rollback = db_session.rollback

    def _spy_rollback():
        calls["count"] += 1
        real_rollback()

    monkeypatch.setattr(db_session, "rollback", _spy_rollback)
    exc = _fake_integrity_error(sqlstate="23505", constraint_name="unrelated")
    monkeypatch.setattr(db_session, "commit", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.commit_or_raise_conflict(db_session)
    assert calls["count"] == 1


def test_session_is_usable_again_after_a_real_overlap_violation(db_session):
    org, client = _seed_org_and_client(db_session)
    starts = datetime(2027, 3, 2, 9, 0, tzinfo=UTC)
    ends = starts + timedelta(hours=1)

    first = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(first)
    db_session.commit()

    duplicate = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(duplicate)
    with pytest.raises(AuthError):
        agenda_svc.commit_or_raise_conflict(
            db_session, organization_id=org.id, starts_at=starts, ends_at=ends
        )

    later_starts = starts + timedelta(hours=3)
    healthy = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=later_starts,
        ends_at=later_starts + timedelta(hours=1),
        status="scheduled",
    )
    db_session.add(healthy)
    agenda_svc.commit_or_raise_conflict(
        db_session,
        organization_id=org.id,
        starts_at=later_starts,
        ends_at=later_starts + timedelta(hours=1),
    )
    assert db_session.get(Appointment, healthy.id) is not None


# flush_or_raise_conflict shares its classifier with commit_or_raise_conflict
# (both call the same _flush_or_commit_and_raise_conflict/_is_overlap_violation
# internals) — these mirror the commit-side cases above for the flush entry
# point specifically, since Postgres validates ck_appointments_no_overlap
# immediately on INSERT/UPDATE, not only at COMMIT.


def test_flush_real_no_overlap_violation_becomes_409_appointment_conflict(db_session):
    org, client = _seed_org_and_client(db_session)
    starts = datetime(2027, 3, 3, 9, 0, tzinfo=UTC)
    ends = starts + timedelta(hours=1)

    first = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(first)
    db_session.flush()

    duplicate = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(duplicate)
    with pytest.raises(AuthError) as excinfo:
        agenda_svc.flush_or_raise_conflict(
            db_session, organization_id=org.id, starts_at=starts, ends_at=ends
        )
    assert excinfo.value.code == "appointment_conflict"
    assert excinfo.value.status_code == 409


def test_flush_other_constraint_23p01_is_reraised_untouched(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    exc = _fake_integrity_error(sqlstate="23P01", constraint_name="some_other_exclusion_constraint")
    monkeypatch.setattr(db_session, "flush", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.flush_or_raise_conflict(db_session)


def test_flush_23p01_without_readable_constraint_name_is_reraised(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    exc = _fake_integrity_error(sqlstate="23P01", constraint_name=None, has_diag=False)
    monkeypatch.setattr(db_session, "flush", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.flush_or_raise_conflict(db_session)


def test_flush_other_sqlstate_is_reraised_even_with_matching_constraint_name(
    db_session, monkeypatch
):
    _seed_org_and_client(db_session)
    exc = _fake_integrity_error(sqlstate="23505", constraint_name=APPOINTMENT_NO_OVERLAP_CONSTRAINT)
    monkeypatch.setattr(db_session, "flush", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.flush_or_raise_conflict(db_session)


def test_flush_rollback_happens_for_every_reraised_case(db_session, monkeypatch):
    _seed_org_and_client(db_session)
    calls = {"count": 0}
    real_rollback = db_session.rollback

    def _spy_rollback():
        calls["count"] += 1
        real_rollback()

    monkeypatch.setattr(db_session, "rollback", _spy_rollback)
    exc = _fake_integrity_error(sqlstate="23505", constraint_name="unrelated")
    monkeypatch.setattr(db_session, "flush", _make_commit_raise(exc))
    with pytest.raises(IntegrityError):
        agenda_svc.flush_or_raise_conflict(db_session)
    assert calls["count"] == 1


def test_flush_session_is_usable_again_after_a_real_overlap_violation(db_session):
    org, client = _seed_org_and_client(db_session)
    starts = datetime(2027, 3, 4, 9, 0, tzinfo=UTC)
    ends = starts + timedelta(hours=1)

    first = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(first)
    db_session.flush()

    duplicate = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=starts,
        ends_at=ends,
        status="scheduled",
    )
    db_session.add(duplicate)
    with pytest.raises(AuthError):
        agenda_svc.flush_or_raise_conflict(
            db_session, organization_id=org.id, starts_at=starts, ends_at=ends
        )

    later_starts = starts + timedelta(hours=3)
    healthy = Appointment(
        organization_id=org.id,
        client_id=client.id,
        starts_at=later_starts,
        ends_at=later_starts + timedelta(hours=1),
        status="scheduled",
    )
    db_session.add(healthy)
    agenda_svc.flush_or_raise_conflict(
        db_session,
        organization_id=org.id,
        starts_at=later_starts,
        ends_at=later_starts + timedelta(hours=1),
    )
    db_session.commit()
    assert db_session.get(Appointment, healthy.id) is not None
