"""Static regression checks for deploy/hml/deploy.sh build-arg wiring.

No Docker/DB needed: this only reads the script as text. It exists because
the HML build path silently dropped NEXT_PUBLIC_GOOGLE_CLIENT_ID and the
GIT_SHA/APP_VERSION/BUILD_TIME build-args once already (see
docs/sprints/REPORT_CYCLE_DUPLICATE_GUARD.md) — the fix landed in a one-off
_ops_*.sh script instead of the generic deploy.sh, so the generic path
regressed again. These asserts pin the contract directly on deploy.sh so a
future edit that removes a build-arg fails CI instead of silently shipping
0.0.0-dev / a blank Google button to HML.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SH = REPO_ROOT / "deploy" / "hml" / "deploy.sh"

API_REQUIRED_ARGS = ["GIT_SHA", "APP_VERSION", "BUILD_TIME"]
WEB_REQUIRED_ARGS = [
    "GIT_SHA",
    "APP_VERSION",
    "BUILD_TIME",
    "NEXT_PUBLIC_APP_VERSION",
    "NEXT_PUBLIC_GIT_SHA",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_APP_URL",
    "API_PROXY_TARGET",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
]
ADMIN_REQUIRED_ARGS = [
    "GIT_SHA",
    "APP_VERSION",
    "BUILD_TIME",
    "NEXT_PUBLIC_APP_VERSION",
    "NEXT_PUBLIC_GIT_SHA",
]


def _script_text() -> str:
    assert DEPLOY_SH.is_file(), f"missing {DEPLOY_SH}"
    return DEPLOY_SH.read_text(encoding="utf-8")


def _block(text: str, start_marker: str, end_marker: str | None) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start) if end_marker else len(text)
    return text[start:end]


def _assert_build_args(block: str, required: list[str], label: str) -> None:
    for arg in required:
        pattern = rf'--build-arg\s+"{re.escape(arg)}='
        assert re.search(pattern, block), f"{label}: missing --build-arg {arg}=... in deploy/hml/deploy.sh"


def test_api_build_has_git_sha_version_and_build_time_args() -> None:
    text = _script_text()
    block = _block(text, 'log "Construindo imagem da API"', 'log "Construindo imagem do web"')
    _assert_build_args(block, API_REQUIRED_ARGS, "api build")


def test_web_build_has_version_and_google_client_id_args() -> None:
    text = _script_text()
    block = _block(text, 'log "Construindo imagem do web"', 'log "Construindo imagem do admin"')
    _assert_build_args(block, WEB_REQUIRED_ARGS, "web build")


def test_admin_build_has_version_args() -> None:
    text = _script_text()
    block = _block(text, 'log "Construindo imagem do admin"', None)
    _assert_build_args(block, ADMIN_REQUIRED_ARGS, "admin build")


def test_google_oauth_contract_is_validated_before_build() -> None:
    text = _script_text()
    assert "validate_google_oauth_contract" in text
    assert re.search(r"^\s*validate_google_oauth_contract\s*$", text, re.MULTILINE), (
        "validate_google_oauth_contract must actually be invoked (e.g. from load_env), "
        "not just defined"
    )
    # Fails closed: both IDs required and must match when the flag is on.
    assert 'GOOGLE_OAUTH_ENABLED=true mas GOOGLE_OAUTH_CLIENT_ID' in text
    assert 'GOOGLE_OAUTH_ENABLED=true mas NEXT_PUBLIC_GOOGLE_CLIENT_ID' in text
    assert "server_id" in text and "web_id" in text
    assert '"$server_id" == "$web_id"' in text


def test_google_client_id_values_are_never_logged() -> None:
    text = _script_text()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("log "):
            continue
        assert "${GOOGLE_OAUTH_CLIENT_ID}" not in stripped
        assert "${NEXT_PUBLIC_GOOGLE_CLIENT_ID}" not in stripped
        assert "$GOOGLE_OAUTH_CLIENT_ID" not in stripped
        assert "$NEXT_PUBLIC_GOOGLE_CLIENT_ID" not in stripped


def test_app_version_never_hardcoded_as_dev_fallback_in_deploy_sh() -> None:
    text = _script_text()
    # The literal fallback value itself is fine to mention in a comment; what
    # must never come back is deploy.sh silently defaulting APP_VERSION to it
    # via a bash parameter-expansion default or a plain assignment.
    assert ":-0.0.0-dev" not in text
    assert re.search(r'APP_VERSION\s*=\s*"?0\.0\.0-dev"?', text) is None
    assert "resolve_app_version" in text


def test_git_sha_resolution_fails_closed_without_git_checkout_or_env() -> None:
    text = _script_text()
    assert "resolve_git_sha" in text
    assert "GIT_SHA não pôde ser determinado" in text
