"""Redact client portal tokens and public URLs from log records."""

from __future__ import annotations

import logging
import re

_PATH_C = re.compile(r"(/c/)([A-Za-z0-9._~-]+)")
_PATH_ENTRAR = re.compile(r"(/entrar/)([A-Za-z0-9._~-]+)")
_PATH_MY_CYCLE = re.compile(r"(/public/my-cycle/)([A-Za-z0-9._~-]+)")
# Covers both /public/intake/{token} and /public/intake/portal/{portal_token}.
_PATH_INTAKE = re.compile(r"(/public/intake/(?:portal/)?)([A-Za-z0-9._~-]+)")
_SIGNED_V1 = re.compile(r"v1\.[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}")
_SIGNED_L1 = re.compile(r"l1\.[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}")
_SIGNED_CI1 = re.compile(r"ci1\.[0-9a-f]{32}\.[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}")


def redact_portal_secrets(message: str) -> str:
    text = _PATH_C.sub(r"\1[redacted]", message)
    text = _PATH_ENTRAR.sub(r"\1[redacted]", text)
    text = _PATH_MY_CYCLE.sub(r"\1[redacted]", text)
    text = _PATH_INTAKE.sub(r"\1[redacted]", text)
    # Defense in depth: also strip the signed token itself wherever it
    # appears outside a known path prefix (e.g. embedded in a full URL
    # inside an error message or a wa_message_template echoed back).
    text = _SIGNED_CI1.sub("ci1.[redacted]", text)
    text = _SIGNED_L1.sub("l1.[redacted]", text)
    return _SIGNED_V1.sub("v1.[redacted]", text)


class PortalTokenLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = redact_portal_secrets(str(record.msg))
            if record.args:
                if isinstance(record.args, dict):
                    record.args = {
                        key: redact_portal_secrets(str(value)) if isinstance(value, str) else value
                        for key, value in record.args.items()
                    }
                elif isinstance(record.args, tuple):
                    record.args = tuple(
                        redact_portal_secrets(arg) if isinstance(arg, str) else arg
                        for arg in record.args
                    )
        except Exception:
            return True
        return True


def install_portal_log_filter() -> None:
    filt = PortalTokenLogFilter()
    logging.getLogger().addFilter(filt)
    logging.getLogger("croniu").addFilter(filt)
    logging.getLogger("croniu.my_cycle").addFilter(filt)
    logging.getLogger("uvicorn").addFilter(filt)
    logging.getLogger("uvicorn.access").addFilter(filt)
    logging.getLogger("uvicorn.error").addFilter(filt)
    for handler in logging.root.handlers:
        handler.addFilter(filt)
