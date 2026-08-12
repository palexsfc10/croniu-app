"""Normalize Croniu deployment environment for platform surfaces."""

from __future__ import annotations

_PRODUCTION = frozenset({"production", "prd", "prod"})
_HML = frozenset({"hml", "homologation", "homologacao", "homologação", "staging"})
_DEVELOPMENT = frozenset({"development", "dev", "local"})
_TEST = frozenset({"test", "testing"})

CANONICAL_ENVIRONMENTS = frozenset({"production", "hml", "development", "test", "unknown"})


def normalize_croniu_env(raw: str | None) -> str:
    """Return a stable environment token. Never silently map absence to hml."""
    value = (raw or "").strip().lower()
    if not value:
        return "unknown"
    if value in _PRODUCTION:
        return "production"
    if value in _HML:
        return "hml"
    if value in _DEVELOPMENT:
        return "development"
    if value in _TEST:
        return "test"
    if value in CANONICAL_ENVIRONMENTS:
        return value
    return "unknown"
