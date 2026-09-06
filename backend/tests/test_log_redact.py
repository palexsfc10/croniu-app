from __future__ import annotations

from app.security.log_redact import redact_portal_secrets


def test_redacts_c_path_and_v1_token():
    msg = "GET /c/v1.402f13144e1746fcafeb3346a09454de.nN5MMge4bu8yvZg8FTIyJkRSEAU5L_GSGYkvPgd99T8 200"
    out = redact_portal_secrets(msg)
    assert "402f13144e1746fcafeb3346a09454de" not in out
    assert "/c/[redacted]" in out


def test_redacts_my_cycle_api_path():
    msg = "GET /api/v1/public/my-cycle/v1.abc123.signature 200"
    out = redact_portal_secrets(msg)
    assert "/public/my-cycle/[redacted]" in out


def test_redacts_entrar_path_and_l1_token():
    msg = "GET /entrar/l1.402f13144e1746fcafeb3346a09454de.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 200"
    out = redact_portal_secrets(msg)
    assert "402f13144e1746fcafeb3346a09454de" not in out
    assert "/entrar/[redacted]" in out


def test_redacts_intake_api_path_and_ci1_token():
    msg = (
        "POST /api/v1/public/intake/"
        "ci1.402f13144e1746fcafeb3346a09454de.11111111111111111111111111111111."
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/submit 201"
    )
    out = redact_portal_secrets(msg)
    assert "402f13144e1746fcafeb3346a09454de" not in out
    assert "/public/intake/[redacted]" in out


def test_redacts_intake_portal_status_path():
    msg = (
        "GET /api/v1/public/intake/portal/"
        "l1.402f13144e1746fcafeb3346a09454de.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/status 200"
    )
    out = redact_portal_secrets(msg)
    assert "402f13144e1746fcafeb3346a09454de" not in out
    assert "/public/intake/portal/[redacted]" in out


def test_redacts_bare_signed_tokens_outside_known_paths():
    # e.g. a full shared URL echoed back inside a wa_message_template or error string.
    msg = "template=https://app.croniu.com.br/c/v1.deadbeefdeadbeefdeadbeefdeadbeef.sig-here-1234567890"
    out = redact_portal_secrets(msg)
    assert "deadbeefdeadbeefdeadbeefdeadbeef" not in out
