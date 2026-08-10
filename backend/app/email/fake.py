"""In-memory e-mail provider for automated tests and local development."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field

from app.email.protocols import EmailMessage, EmailSendResult


@dataclass
class FakeEmailProvider:
    name: str = "fake"
    sent: list[EmailMessage] = field(default_factory=list)
    _seen_keys: set[str] = field(default_factory=set)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def send(self, message: EmailMessage) -> EmailSendResult:
        with self._lock:
            if message.idempotency_key and message.idempotency_key in self._seen_keys:
                return EmailSendResult(
                    provider=self.name,
                    message_id=f"fake-dup-{message.idempotency_key}",
                    accepted=True,
                )
            self.sent.append(message)
            if message.idempotency_key:
                self._seen_keys.add(message.idempotency_key)
            return EmailSendResult(
                provider=self.name,
                message_id=f"fake-{uuid.uuid4().hex}",
                accepted=True,
            )

    def clear(self) -> None:
        with self._lock:
            self.sent.clear()
            self._seen_keys.clear()
