from app.services.auth import AuthError
from app.services.external_ref import sanitize_content_json
import pytest


def test_https_url_normalized():
    out = sanitize_content_json({"external_url": "mfit.com.br/treino"})
    assert out["external_url"].startswith("https://")
    assert out["external"]["platform"] == "external"


def test_rejects_javascript_scheme():
    with pytest.raises(AuthError):
        sanitize_content_json({"external_url": "javascript:alert(1)"})


def test_rejects_data_scheme():
    with pytest.raises(AuthError):
        sanitize_content_json({"external_url": "data:text/html,hi"})
