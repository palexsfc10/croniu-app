"""OpenAI Responses API HTTP client (httpx). Never logs the API key."""

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


class OpenAIResponsesProvider:
    """Talks to POST {api_base}/responses with store=false (stateless, no server-side history)."""

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
            "input": _build_input(messages),
            "store": False,
        }
        if tools:
            payload["tools"] = [_tool_to_responses_schema(t) for t in tools]
            payload["tool_choice"] = "auto"

        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(
                    f"{self.api_base}/responses",
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
        return _parse_response(data, model=model)


def _build_input(messages: list[LLMMessage]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for message in messages:
        if message.role in {"system", "user"}:
            items.append(
                {
                    "role": message.role,
                    "content": [{"type": "input_text", "text": message.content or ""}],
                }
            )
        elif message.role == "assistant":
            if message.tool_calls:
                for tc in message.tool_calls:
                    fn = tc.get("function") or {}
                    items.append(
                        {
                            "type": "function_call",
                            "call_id": tc.get("id") or "call",
                            "name": fn.get("name") or "",
                            "arguments": fn.get("arguments") or "{}",
                        }
                    )
            elif message.content:
                items.append(
                    {
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": message.content}],
                    }
                )
        elif message.role == "tool":
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": message.tool_call_id or "call",
                    "output": message.content or "",
                }
            )
    return items


def _tool_to_responses_schema(tool: ToolSpec) -> dict[str, Any]:
    strict = tool.parameters.get("additionalProperties") is False
    schema: dict[str, Any] = {
        "type": "function",
        "name": tool.name,
        "description": tool.description,
        "parameters": tool.parameters,
    }
    if strict:
        schema["strict"] = True
    return schema


def _parse_response(data: dict[str, Any], *, model: str) -> LLMResponse:
    content_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    for item in data.get("output") or []:
        item_type = item.get("type")
        if item_type == "message":
            for part in item.get("content") or []:
                if part.get("type") in {"output_text", "text"} and part.get("text"):
                    content_parts.append(part["text"])
        elif item_type == "function_call":
            args_raw = item.get("arguments") or "{}"
            try:
                args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(
                {
                    "id": item.get("call_id") or item.get("id") or "call",
                    "name": item.get("name") or "",
                    "arguments": args if isinstance(args, dict) else {},
                }
            )

    usage_raw = data.get("usage") or {}
    input_details = usage_raw.get("input_tokens_details") or {}
    output_details = usage_raw.get("output_tokens_details") or {}
    usage = LLMUsage(
        input_tokens=int(usage_raw.get("input_tokens") or 0),
        output_tokens=int(usage_raw.get("output_tokens") or 0),
        cached_input_tokens=int(input_details.get("cached_tokens") or 0),
        reasoning_tokens=int(output_details.get("reasoning_tokens") or 0),
        model=model,
    )
    return LLMResponse(
        content="\n".join(content_parts) if content_parts else None,
        tool_calls=tool_calls,
        usage=usage,
        provider_request_id=data.get("id"),
    )
