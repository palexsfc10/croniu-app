"""Voice transcription endpoint and service guards."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.services import voice_transcription as voice_svc
from app.services.auth import AuthError


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _make_settings(**overrides) -> Settings:
    data = {
        "croniu_env": "test",
        "ai_enabled": True,
        "voice_enabled": True,
        "llm_provider": "fake",
        "llm_model": "fake-model",
        "openai_api_key": "sk-test",
        "openai_transcription_model": "whisper-1",
        "voice_max_seconds": 60,
        "voice_max_bytes": 4_194_304,
        "secret_key": "test-secret-key-with-at-least-32-characters",
        "database_url": (
            "postgresql+psycopg://croniu:croniu_dev_password_change_me@"
            "localhost:5433/croniu_test"
        ),
        "session_cookie_secure": False,
    }
    data.update(overrides)
    return Settings(_env_file=None, **data)


def _ids(client: TestClient):
    me = client.get("/api/v1/auth/me").json()
    import uuid

    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def test_voice_status_defaults_disabled():
    settings = _make_settings(voice_enabled=False)
    meta = voice_svc.voice_status(settings)
    assert meta["voice_enabled"] is False
    assert meta["transcription_model"] == "whisper-1"


def test_transcribe_rejects_when_voice_disabled(client, register_payload, monkeypatch):
    _auth(client, register_payload)
    org_id, user_id = _ids(client)
    settings = _make_settings(voice_enabled=False)
    monkeypatch.setattr(
        "app.services.voice_transcription.SubscriptionEntitlementService",
        lambda db: MagicMock(
            get_for_organization=lambda oid: MagicMock(has_active_access=True)
        ),
    )
    db = SessionLocal()
    try:
        with pytest.raises(AuthError) as exc:
            voice_svc.transcribe_audio(
                db,
                organization_id=org_id,
                user_id=user_id,
                audio_bytes=b"\x00\x01",
                content_type="audio/webm",
                settings=settings,
            )
        assert exc.value.code == "voice_disabled"
    finally:
        db.close()


def test_transcribe_rejects_empty_and_bad_mime(client, register_payload, monkeypatch):
    _auth(client, register_payload)
    org_id, user_id = _ids(client)
    settings = _make_settings()
    monkeypatch.setattr(
        "app.services.voice_transcription.SubscriptionEntitlementService",
        lambda db: MagicMock(
            get_for_organization=lambda oid: MagicMock(has_active_access=True)
        ),
    )
    db = SessionLocal()
    try:
        with pytest.raises(AuthError) as empty:
            voice_svc.transcribe_audio(
                db,
                organization_id=org_id,
                user_id=user_id,
                audio_bytes=b"",
                content_type="audio/webm",
                settings=settings,
            )
        assert empty.value.code == "voice_empty"

        with pytest.raises(AuthError) as mime:
            voice_svc.transcribe_audio(
                db,
                organization_id=org_id,
                user_id=user_id,
                audio_bytes=b"abc123",
                content_type="application/pdf",
                settings=settings,
            )
        assert mime.value.code == "voice_unsupported_format"
    finally:
        db.close()


def test_transcribe_success_and_temp_cleanup(client, register_payload, monkeypatch, tmp_path):
    _auth(client, register_payload)
    org_id, user_id = _ids(client)
    settings = _make_settings()
    monkeypatch.setattr(
        "app.services.voice_transcription.SubscriptionEntitlementService",
        lambda db: MagicMock(
            get_for_organization=lambda oid: MagicMock(has_active_access=True)
        ),
    )

    created: list[str] = []
    real_mkstemp = voice_svc.tempfile.mkstemp

    def tracking_mkstemp(*args, **kwargs):
        kwargs = {**kwargs, "dir": str(tmp_path)}
        fd, name = real_mkstemp(*args, **kwargs)
        created.append(name)
        return fd, name

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"text": "Como está meu dia hoje?", "duration": 2.5}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **k):
            return FakeResponse()

    monkeypatch.setattr(voice_svc.tempfile, "mkstemp", tracking_mkstemp)
    monkeypatch.setattr(voice_svc.httpx, "Client", FakeClient)

    db = SessionLocal()
    try:
        result = voice_svc.transcribe_audio(
            db,
            organization_id=org_id,
            user_id=user_id,
            audio_bytes=b"fake-webm-bytes",
            content_type="audio/webm",
            duration_hint_seconds=2.5,
            request_id="req-voice-1",
            settings=settings,
        )
    finally:
        db.close()

    assert result.text == "Como está meu dia hoje?"
    assert result.model == "whisper-1"
    assert created
    for path in created:
        assert not voice_svc.Path(path).exists()


def test_transcribe_endpoint_multipart(client, register_payload, monkeypatch):
    _auth(client, register_payload)
    get_settings.cache_clear()
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("VOICE_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    get_settings.cache_clear()

    fake = voice_svc.TranscriptionResult(
        text="Resuma meu dia",
        model="whisper-1",
        duration_seconds=1.2,
        latency_ms=100,
        bytes_received=12,
        mime_type="audio/webm",
        estimated_cost_cents=1,
        request_id="abc",
    )
    monkeypatch.setattr(
        "app.api.agent.voice_svc.transcribe_audio",
        lambda *a, **k: fake,
    )

    response = client.post(
        "/api/v1/agent/transcribe",
        files={"file": ("clip.webm", b"fake-audio", "audio/webm")},
        data={"duration_seconds": "1.2"},
    )
    get_settings.cache_clear()
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Resuma meu dia"
    assert body["input_modality"] == "voice_transcript"


def test_status_includes_voice_flags(client, register_payload, monkeypatch):
    _auth(client, register_payload)
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("VOICE_ENABLED", "true")
    get_settings.cache_clear()
    status = client.get("/api/v1/agent/status")
    get_settings.cache_clear()
    assert status.status_code == 200
    body = status.json()
    assert "voice_enabled" in body
    assert body["voice"] is not None
    assert body["voice"]["max_seconds"] >= 1
