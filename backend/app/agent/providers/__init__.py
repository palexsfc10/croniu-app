from __future__ import annotations

from app.agent.providers.base import LLMProvider, ProviderUnavailableError
from app.agent.providers.fake import FakeLLMProvider
from app.agent.providers.openai_compatible import OpenAICompatibleProvider
from app.agent.providers.openai_responses import OpenAIResponsesProvider
from app.config import Settings


def build_provider(settings: Settings, *, override: LLMProvider | None = None) -> LLMProvider:
    if override is not None:
        return override
    name = (settings.llm_provider or "fake").strip().lower()
    if name in {"fake", "mock", "test"}:
        return FakeLLMProvider()
    api_key = settings.resolved_llm_api_key
    if name in {"openai", "openai_responses", "responses"}:
        if not api_key:
            raise ProviderUnavailableError("OPENAI_API_KEY / LLM_API_KEY não configurada.")
        return OpenAIResponsesProvider(api_key=api_key, api_base=settings.llm_api_base)
    if name == "openai_compatible":
        if not api_key:
            raise ProviderUnavailableError("LLM_API_KEY não configurada.")
        return OpenAICompatibleProvider(
            api_key=api_key,
            api_base=settings.llm_api_base,
        )
    raise ProviderUnavailableError(f"Provedor LLM desconhecido: {name}")
