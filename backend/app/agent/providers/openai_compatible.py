"""OpenAI-compatible Chat Completions HTTP client (httpx)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.agent.providers.base import (
    LLMMessage,
    LLMResponse,
    LLMUsage,
    ProviderTimeoutError,
    ProviderUnavailableError,
    ToolSpec,
)

logger = logging.getLogger("croniu.agent.llm")


class OpenAICompatibleProvider:
    def __init__(self, *, api_key: str, api_base: str):
        self.api_key = api_key
        self.api_base = api_base.rstrip("/")

    def complete(
        self,
        *,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
        model: str,
        timeout_seconds: float,
    ) -> LLMResponse:
        payload: dict[str, Any] = {
            "model": model,
            "messages": [_serialize_message(m) for m in messages],
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ]
            payload["tool_choice"] = "auto"

        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(
                    f"{self.api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError() from exc
        except httpx.HTTPError as exc:
            logger.warning("llm_http_error status=unavailable")
            raise ProviderUnavailableError() from exc

        if response.status_code >= 500:
            raise ProviderUnavailableError()
        if response.status_code >= 400:
            logger.warning("llm_http_error status=%s", response.status_code)
            raise ProviderUnavailableError("Falha ao consultar o provedor de IA.")

        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        usage_raw = data.get("usage") or {}
        tool_calls = []
        for tc in message.get("tool_calls") or []:
            fn = tc.get("function") or {}
            args_raw = fn.get("arguments") or "{}"
            try:
                args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(
                {
                    "id": tc.get("id") or "call",
                    "name": fn.get("name") or "",
                    "arguments": args if isinstance(args, dict) else {},
                }
            )
        return LLMResponse(
            content=message.get("content"),
            tool_calls=tool_calls,
            usage=LLMUsage(
                input_tokens=int(usage_raw.get("prompt_tokens") or 0),
                output_tokens=int(usage_raw.get("completion_tokens") or 0),
                model=model,
            ),
        )


def _serialize_message(message: LLMMessage) -> dict[str, Any]:
    out: dict[str, Any] = {"role": message.role}
    if message.content is not None:
        out["content"] = message.content
    if message.tool_call_id:
        out["tool_call_id"] = message.tool_call_id
    if message.name:
        out["name"] = message.name
    if message.tool_calls:
        out["tool_calls"] = message.tool_calls
    return out
