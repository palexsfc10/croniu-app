"""Normalize Asaas API base URLs across sandbox and production hosts."""

from __future__ import annotations

from urllib.parse import urlparse


PRODUCTION_CANONICAL = "https://api.asaas.com/v3"
SANDBOX_CANONICAL = "https://api-sandbox.asaas.com/v3"
# Legacy sandbox host still documented in older Asaas material.
SANDBOX_LEGACY = "https://sandbox.asaas.com/api/v3"


def normalize_asaas_api_url(url: str, *, environment: str | None = None) -> str:
    """Return a usable Asaas API base URL (no trailing slash).

    Production on ``api.asaas.com`` must use ``/v3`` — ``/api/v3`` returns 404
    and was the RC2.7 go-live checkout failure mode.
    """
    raw = (url or "").strip().rstrip("/")
    env = (environment or "").strip().lower()

    if not raw:
        return PRODUCTION_CANONICAL if env == "production" else SANDBOX_LEGACY

    lowered = raw.lower()

    # Misconfigured production base used in env.prd.example / RC2.7.
    if "api.asaas.com" in lowered and "/api/v3" in lowered:
        return PRODUCTION_CANONICAL

    if lowered in {
        "https://www.asaas.com/api/v3",
        "http://www.asaas.com/api/v3",
        "https://api.asaas.com/v3",
        "http://api.asaas.com/v3",
    }:
        return PRODUCTION_CANONICAL

    if lowered in {
        "https://api-sandbox.asaas.com/v3",
        "http://api-sandbox.asaas.com/v3",
        "https://api-sandbox.asaas.com/api/v3",
    }:
        return SANDBOX_CANONICAL

    if "sandbox.asaas.com" in lowered:
        # Keep legacy sandbox path if already correct; otherwise canonicalize.
        if lowered.rstrip("/").endswith("/api/v3"):
            return SANDBOX_LEGACY
        if lowered.rstrip("/").endswith("/v3"):
            return SANDBOX_CANONICAL if "api-sandbox" in lowered else SANDBOX_LEGACY
        return SANDBOX_LEGACY

    if env == "production" and "api.asaas.com" in lowered:
        parsed = urlparse(raw if "://" in raw else f"https://{raw}")
        path = (parsed.path or "").rstrip("/")
        if path in {"", "/api", "/api/v3"}:
            return PRODUCTION_CANONICAL
        if path == "/v3":
            return PRODUCTION_CANONICAL

    return raw
