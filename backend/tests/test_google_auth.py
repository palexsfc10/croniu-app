from __future__ import annotations

import uuid

import pytest
from app.config import get_settings
from app.models.billing import Subscription
from app.models.organization import Organization
from app.models.session import Session as SessionModel
from app.models.user import User
from app.models.user_auth_identity import UserAuthIdentity
from app.services import google_auth as google_auth_svc
from fastapi.testclient import TestClient
from sqlalchemy import select

GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com"


def _cred(tag: str) -> str:
    """A fake credential long enough to pass GoogleAuthRequest's min_length=20 —
    the real value is irrelevant in these tests since verify_google_id_token
    (or the google-auth library call it wraps) is always mocked before it
    would matter; the tag just keeps requests distinguishable in failures."""
    return f"{tag}-{'x' * 20}"


def _claims(**overrides) -> google_auth_svc.GoogleIdentityClaims:
    base = dict(
        subject=f"google-sub-{uuid.uuid4().hex[:12]}",
        email=f"googleuser_{uuid.uuid4().hex[:8]}@example.com",
        email_verified=True,
        name="Google User",
        picture=None,
    )
    base.update(overrides)
    return google_auth_svc.GoogleIdentityClaims(**base)


@pytest.fixture
def google_client(monkeypatch):
    """A TestClient whose app was built with Google OAuth enabled.

    Uses the same underlying test database as the `client` fixture in
    conftest.py (DATABASE_URL is pinned to croniu_test process-wide); only
    settings differ, which requires a fresh create_app() + cache_clear().
    """
    monkeypatch.setenv("GOOGLE_OAUTH_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_CLIENT_ID)
    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def mock_verify(monkeypatch):
    """Patch the Google-library boundary, not our own code.

    Returns a setter: mock_verify(claims_or_exception) configures what the
    next call to verify_google_id_token will produce.
    """

    box: dict = {}

    def fake_verify(credential: str, settings):  # noqa: ARG001 - signature match
        value = box.get("value")
        if isinstance(value, Exception):
            raise value
        if value is None:
            raise AssertionError("mock_verify() was not configured for this call")
        return value

    monkeypatch.setattr(google_auth_svc, "verify_google_id_token", fake_verify)

    def _set(value):
        box["value"] = value

    return _set


def test_google_oauth_disabled_returns_404(client):
    response = client.post("/api/v1/auth/google", json={"credential": "x" * 40})
    assert response.status_code == 404


def test_google_new_user_creates_account_org_and_trial(google_client, mock_verify, db_session):
    claims = _claims()
    mock_verify(claims)

    response = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-1")})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == claims.email
    assert body["is_new_user"] is True
    assert body["onboarding_required"] is True
    assert "croniu_session" in response.cookies

    user = db_session.scalar(select(User).where(User.email == claims.email))
    assert user is not None
    assert user.password_hash is None
    assert user.email_verified_at is not None

    identity = db_session.scalar(
        select(UserAuthIdentity).where(UserAuthIdentity.provider_subject == claims.subject)
    )
    assert identity is not None
    assert identity.user_id == user.id

    org_id = uuid.UUID(body["organization"]["id"])
    subs = db_session.scalars(
        select(Subscription).where(Subscription.organization_id == org_id)
    ).all()
    assert len(subs) == 1


def test_google_returning_identity_logs_in_same_user_no_duplicate(
    google_client, mock_verify, db_session
):
    claims = _claims()
    mock_verify(claims)
    first = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-a")})
    assert first.status_code == 200
    user_id_1 = first.json()["user"]["id"]

    google_client.post("/api/v1/auth/logout")

    mock_verify(claims)
    second = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-b")})
    assert second.status_code == 200
    body = second.json()
    assert body["is_new_user"] is False
    assert body["user"]["id"] == user_id_1

    users = db_session.scalars(select(User).where(User.email == claims.email)).all()
    assert len(users) == 1
    identities = db_session.scalars(
        select(UserAuthIdentity).where(UserAuthIdentity.provider_subject == claims.subject)
    ).all()
    assert len(identities) == 1


def test_google_invalid_token_rejected(google_client, mock_verify):
    from app.services.auth import AuthError

    mock_verify(
        AuthError("invalid_google_token", "Não foi possível validar sua conta Google.", 401)
    )
    response = google_client.post("/api/v1/auth/google", json={"credential": _cred("garbage")})
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_google_token"


def test_google_token_missing_sub_rejected(google_client, monkeypatch):
    """Exercises the real verify_google_id_token, mocking only the
    google-auth library boundary — confirms OUR claim validation (not just
    the error-mapping path exercised by mock_verify elsewhere)."""

    def fake_verify_oauth2_token(token, request, audience):  # noqa: ARG001
        return {"iss": "https://accounts.google.com", "email": "a@example.com", "aud": audience}

    import google.oauth2.id_token as google_id_token

    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify_oauth2_token)
    response = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-no-sub")})
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_google_token"


def test_google_token_invalid_issuer_rejected(google_client, monkeypatch):
    def fake_verify_oauth2_token(token, request, audience):  # noqa: ARG001
        return {
            "iss": "https://evil.example.com",
            "sub": "123",
            "email": "a@example.com",
            "aud": audience,
        }

    import google.oauth2.id_token as google_id_token

    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify_oauth2_token)
    response = google_client.post(
        "/api/v1/auth/google", json={"credential": _cred("token-bad-iss")}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_google_token"


def test_google_token_expired_or_bad_signature_rejected(google_client, monkeypatch):
    def fake_verify_oauth2_token(token, request, audience):  # noqa: ARG001
        raise ValueError("Token expired")

    import google.oauth2.id_token as google_id_token

    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify_oauth2_token)
    response = google_client.post(
        "/api/v1/auth/google", json={"credential": _cred("token-expired")}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_google_token"


def test_google_wrong_audience_rejected(google_client, monkeypatch):
    """Confirms our code actually forwards settings.google_oauth_client_id as
    the audience — a fake token minted for a different client ID must fail,
    the same way google-auth's own verify_oauth2_token would reject it."""

    def fake_verify_oauth2_token(token, request, audience):  # noqa: ARG001
        if audience != GOOGLE_CLIENT_ID:
            raise ValueError("Wrong audience")
        raise AssertionError("test bug: audience should not have matched")

    import google.oauth2.id_token as google_id_token

    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify_oauth2_token)
    response = google_client.post(
        "/api/v1/auth/google", json={"credential": _cred("token-wrong-aud")}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_google_token"


def test_google_email_verification_required_soft_gates_new_user(
    google_client, mock_verify, monkeypatch, db_session
):
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "true")
    get_settings.cache_clear()
    claims = _claims(email_verified=False)
    mock_verify(claims)

    response = google_client.post(
        "/api/v1/auth/google", json={"credential": _cred("token-unverified")}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["requires_email_verification"] is True
    assert "croniu_session" not in response.cookies

    user = db_session.scalar(select(User).where(User.email == claims.email))
    assert user is not None
    assert user.email_verified_at is None
    get_settings.cache_clear()


def test_google_existing_password_account_same_email_requires_link(
    google_client, mock_verify, register_payload
):
    created = google_client.post("/api/v1/auth/register", json=register_payload)
    assert created.status_code == 201
    google_client.post("/api/v1/auth/logout")

    claims = _claims(email=register_payload["email"], email_verified=True)
    mock_verify(claims)
    response = google_client.post(
        "/api/v1/auth/google", json={"credential": _cred("token-conflict")}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "google_link_required"
    assert "croniu_session" not in response.cookies


def test_google_link_with_correct_password_succeeds(
    google_client, mock_verify, register_payload, db_session
):
    google_client.post("/api/v1/auth/register", json=register_payload)
    google_client.post("/api/v1/auth/logout")

    claims = _claims(email=register_payload["email"], email_verified=True)
    mock_verify(claims)
    response = google_client.post(
        "/api/v1/auth/google/link",
        json={"credential": _cred("token-link"), "password": register_payload["password"]},
    )
    assert response.status_code == 200
    assert "croniu_session" in response.cookies

    identity = db_session.scalar(
        select(UserAuthIdentity).where(UserAuthIdentity.provider_subject == claims.subject)
    )
    assert identity is not None
    assert identity.email == claims.email

    # Now the same Google account logs in directly, no more 409.
    mock_verify(claims)
    second = google_client.post(
        "/api/v1/auth/google", json={"credential": _cred("token-relogin")}
    )
    assert second.status_code == 200
    assert second.json()["is_new_user"] is False


def test_google_link_with_wrong_password_rejected(
    google_client, mock_verify, register_payload, db_session
):
    google_client.post("/api/v1/auth/register", json=register_payload)
    google_client.post("/api/v1/auth/logout")

    claims = _claims(email=register_payload["email"], email_verified=True)
    mock_verify(claims)
    response = google_client.post(
        "/api/v1/auth/google/link",
        json={"credential": _cred("token-link-bad-pw"), "password": "senha-errada-123"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"

    identity = db_session.scalar(
        select(UserAuthIdentity).where(UserAuthIdentity.provider_subject == claims.subject)
    )
    assert identity is None


def test_google_login_blocked_for_disabled_organization(google_client, mock_verify, db_session):
    claims = _claims()
    mock_verify(claims)
    first = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-org-1")})
    assert first.status_code == 200
    org_id = uuid.UUID(first.json()["organization"]["id"])
    google_client.post("/api/v1/auth/logout")

    org = db_session.get(Organization, org_id)
    org.status = "disabled"
    db_session.add(org)
    db_session.commit()

    mock_verify(claims)
    response = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-org-2")})
    assert response.status_code == 403
    assert response.json()["code"] == "organization_disabled"


def test_traditional_password_login_unaffected_by_google_endpoints(google_client, register_payload):
    assert google_client.post("/api/v1/auth/register", json=register_payload).status_code == 201
    google_client.post("/api/v1/auth/logout")
    response = google_client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert response.status_code == 200
    assert "croniu_session" in response.cookies


def test_google_only_account_cannot_password_login(google_client, mock_verify, db_session):
    claims = _claims()
    mock_verify(claims)
    google_client.post("/api/v1/auth/google", json={"credential": _cred("token-pwless")})
    google_client.post("/api/v1/auth/logout")

    response = google_client.post(
        "/api/v1/auth/login", json={"email": claims.email, "password": "any-password-123"}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_google_logout_revokes_session_created_via_google(google_client, mock_verify, db_session):
    claims = _claims()
    mock_verify(claims)
    login = google_client.post("/api/v1/auth/google", json={"credential": _cred("token-logout")})
    assert login.status_code == 200

    me = google_client.get("/api/v1/auth/me")
    assert me.status_code == 200

    logout = google_client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert google_client.get("/api/v1/auth/me").status_code == 401

    sessions = db_session.scalars(select(SessionModel)).all()
    assert all(s.revoked_at is not None for s in sessions)
