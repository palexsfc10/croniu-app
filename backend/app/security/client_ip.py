"""Client IP helpers that are safe behind Cloudflare Tunnel / reverse proxies."""

from __future__ import annotations

from fastapi import Request

from app.config import Settings


def request_client_ip(request: Request, settings: Settings) -> str:
    """Return the best-effort client IP without trusting spoofable headers by default.

    CF-Connecting-IP / X-Forwarded-For are honored only when TRUST_PROXY is enabled
    and the immediate peer is in TRUSTED_PROXY_IPS (typically loopback when the
    tunnel terminates on the host and services bind to 127.0.0.1).
    """
    peer = request.client.host if request.client else "unknown"
    if not settings.trust_proxy:
        return peer
    if peer not in settings.trusted_proxy_ip_set:
        return peer

    cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf_ip and _looks_like_ip(cf_ip):
        return cf_ip

    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first and _looks_like_ip(first):
            return first
    return peer


def _looks_like_ip(value: str) -> bool:
    if value.count(".") == 3:
        parts = value.split(".")
        return all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)
    if ":" in value:
        # Accept compressed IPv6 forms without full validation.
        return all(c in "0123456789abcdefABCDEF:" for c in value)
    return False
