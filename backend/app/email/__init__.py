"""Outbound e-mail providers for Croniu (Resend + fake/test)."""

from __future__ import annotations

from app.email.factory import get_email_provider
from app.email.protocols import EmailMessage, EmailProvider, EmailSendResult

__all__ = [
    "EmailMessage",
    "EmailProvider",
    "EmailSendResult",
    "get_email_provider",
]
