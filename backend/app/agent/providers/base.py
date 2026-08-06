"""LLM provider abstractions — domain never binds to a single vendor."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class LLMMessage:
    role: str
    content: str | None = None
    tool_call_id: str | None = None
    name: str | None = None
    tool_calls: list[dict[str, Any]] | None = None


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass
class LLMUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_input_tokens: int = 0
    reasoning_tokens: int = 0
    model: str | None = None


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    usage: LLMUsage = field(default_factory=LLMUsage)
    provider_request_id: str | None = None


class LLMProvider(Protocol):
    def complete(
        self,
        *,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
        model: str,
        timeout_seconds: float,
    ) -> LLMResponse: ...


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class ProviderTimeoutError(ProviderError):
    def __init__(self, message: str = "O provedor de IA excedeu o tempo limite."):
        super().__init__("llm_timeout", message)


class ProviderUnavailableError(ProviderError):
    def __init__(self, message: str = "O provedor de IA está indisponível."):
        super().__init__("llm_unavailable", message)
