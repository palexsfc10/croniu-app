"""Deterministic fake provider for tests — never calls a remote LLM."""

from __future__ import annotations

from typing import Any

from app.agent.providers.base import LLMMessage, LLMResponse, LLMUsage, ToolSpec


class FakeLLMProvider:
    """Scripted responses; default returns a short text reply."""

    def __init__(self, script: list[LLMResponse] | None = None):
        self.script = list(script or [])
        self.calls: list[dict[str, Any]] = []

    def enqueue(self, response: LLMResponse) -> None:
        self.script.append(response)

    def complete(
        self,
        *,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
        model: str,
        timeout_seconds: float,
    ) -> LLMResponse:
        self.calls.append(
            {
                "message_count": len(messages),
                "tool_names": [t.name for t in tools],
                "model": model,
                "timeout_seconds": timeout_seconds,
            }
        )
        if self.script:
            return self.script.pop(0)
        return LLMResponse(
            content="Não encontrei dados suficientes para responder com segurança.",
            usage=LLMUsage(input_tokens=10, output_tokens=12, model=model),
        )
