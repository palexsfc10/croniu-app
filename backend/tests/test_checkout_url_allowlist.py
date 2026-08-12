"""Checkout URL allowlist — exact Asaas hosts only (no wildcards)."""

from __future__ import annotations

from app.billing.checkout_helpers import (
    ASAAS_CHECKOUT_HOSTS_PRODUCTION,
    ASAAS_CHECKOUT_HOSTS_SANDBOX,
    is_allowed_asaas_checkout_link,
)


def test_sandbox_official_checkout_link_from_docs():
    # Documented Asaas sandbox response link host.
    assert (
        is_allowed_asaas_checkout_link(
            "https://sandbox.asaas.com/checkoutSession/show/131ca662-56c8-4479-b5b3-fd61a413fce7",
            sandbox_mode=True,
        )
        is True
    )


def test_production_official_checkout_hosts():
    assert (
        is_allowed_asaas_checkout_link(
            "https://asaas.com/checkoutSession/show?id=c7b1c696-b27b-4d3d-80b9-d1c018e387f8",
            sandbox_mode=False,
        )
        is True
    )
    assert (
        is_allowed_asaas_checkout_link(
            "https://www.asaas.com/checkoutSession/show?id=abc",
            sandbox_mode=False,
        )
        is True
    )


def test_rejects_http_substring_and_lookalikes():
    assert (
        is_allowed_asaas_checkout_link(
            "http://sandbox.asaas.com/checkoutSession/show/x",
            sandbox_mode=True,
        )
        is False
    )
    assert (
        is_allowed_asaas_checkout_link(
            "https://sandbox.asaas.com.evil.com/x",
            sandbox_mode=True,
        )
        is False
    )
    assert (
        is_allowed_asaas_checkout_link(
            "https://evil-asaas.com/x",
            sandbox_mode=True,
        )
        is False
    )
    assert (
        is_allowed_asaas_checkout_link(
            "https://api-sandbox.asaas.com/v3/checkouts",
            sandbox_mode=True,
        )
        is False
    )


def test_allowlists_are_exact_hosts_not_wildcards():
    assert ASAAS_CHECKOUT_HOSTS_SANDBOX == frozenset({"sandbox.asaas.com"})
    assert ASAAS_CHECKOUT_HOSTS_PRODUCTION == frozenset({"asaas.com", "www.asaas.com"})
    for host in (*ASAAS_CHECKOUT_HOSTS_SANDBOX, *ASAAS_CHECKOUT_HOSTS_PRODUCTION):
        assert "*" not in host
        assert host.count(".") >= 1
