"""Resend HTTP provider (API key never logged)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.email.protocols import EmailMessage, EmailSendResult

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_TIMEOUT_SECONDS = 10.0
MAX_ATTEMPTS = 3


class ResendEmailProvider:
    name = "resend"

    def __init__(
        self,
        *,
        api_key: str,
        from_address: str,
        reply_to: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        if not api_key.strip():
            raise ValueError("RESEND_API_KEY is required when EMAIL_PROVIDER=resend")
        if not from_address.strip():
            raise ValueError("EMAIL_FROM is required when EMAIL_PROVIDER=resend")
        self._api_key = api_key.strip()
        self._from_address = from_address.strip()
        self._reply_to = (reply_to or "").strip() or None
        self._timeout = timeout_seconds

    def send(self, message: EmailMessage) -> EmailSendResult:
        payload: dict[str, Any] = {
            "from": self._from_address,
            "to": [message.to],
            "subject": message.subject,
            "text": message.text_body,
        }
        if message.html_body:
            payload["html"] = message.html_body
        reply_to = message.reply_to or self._reply_to
        if reply_to:
            payload["reply_to"] = reply_to
        if message.tags:
            payload["tags"] = [{"name": "purpose", "value": tag} for tag in message.tags[:5]]

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if message.idempotency_key:
            headers["Idempotency-Key"] = message.idempotency_key[:256]

        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                with httpx.Client(timeout=self._timeout) as client:
                    response = client.post(RESEND_API_URL, json=payload, headers=headers)
                if response.status_code in {200, 201}:
                    body = response.json()
                    message_id = str(body.get("id") or f"resend-{attempt}")
                    logger.info(
                        "email_sent provider=resend status=%s tags=%s",
                        response.status_code,
                        list(message.tags),
                    )
                    return EmailSendResult(
                        provider=self.name,
                        message_id=message_id,
                        accepted=True,
                    )
                if response.status_code in {429, 500, 502, 503, 504} and attempt < MAX_ATTEMPTS:
                    logger.warning(
                        "email_retry provider=resend status=%s attempt=%s",
                        response.status_code,
                        attempt,
                    )
                    continue
                logger.error(
                    "email_failed provider=resend status=%s attempt=%s",
                    response.status_code,
                    attempt,
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning(
                    "email_retry provider=resend error_type=%s attempt=%s",
                    type(exc).__name__,
                    attempt,
                )
                if attempt >= MAX_ATTEMPTS:
                    break
        raise RuntimeError("Resend e-mail delivery failed") from last_error
