"""Provider-neutral e-mail contracts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class EmailMessage:
    to: str
    subject: str
    text_body: str
    html_body: str | None = None
    reply_to: str | None = None
    idempotency_key: str | None = None
    tags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class EmailSendResult:
    provider: str
    message_id: str
    accepted: bool


class EmailProvider(Protocol):
    name: str

    def send(self, message: EmailMessage) -> EmailSendResult:
        """Send one message. Must be safe to retry with the same idempotency_key."""
