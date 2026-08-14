"""Safe external plan/material URL references. Not a third-party integration."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from app.services.auth import AuthError

ALLOWED_SCHEMES = {"http", "https"}
PLATFORMS = {"mfit", "google_drive", "external", "other"}


def normalize_http_url(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    lowered = value.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:", "file:")):
        raise AuthError("unsafe_url", "Use apenas um link http ou https.", 422)
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise AuthError("unsafe_url", "Use apenas um link http ou https.", 422)
    if not parsed.netloc:
        raise AuthError("invalid_url", "Informe um endereço válido.", 422)
    return parsed.geturl()


def sanitize_content_json(content: dict[str, Any] | None) -> dict[str, Any]:
    data = dict(content or {})
    raw_url = data.get("external_url")
    extra = data.get("external")
    platform = "external"
    title = None
    visible = False
    if isinstance(extra, dict):
        platform = str(extra.get("platform") or platform)
        title = (extra.get("title") or None) and str(extra.get("title")).strip()[:200]
        visible = bool(extra.get("visible_to_client"))
        raw_url = extra.get("url") or raw_url
    if platform not in PLATFORMS:
        platform = "external"
    url = normalize_http_url(str(raw_url) if raw_url else None)
    if url:
        data["external_url"] = url
        data["external"] = {
            "platform": platform,
            "url": url,
            "title": title,
            "visible_to_client": visible,
        }
    else:
        data.pop("external_url", None)
        data.pop("external", None)
    return data
