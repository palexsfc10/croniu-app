from __future__ import annotations

from app.agent.providers.base import LLMProvider, ProviderUnavailableError
from app.agent.providers.fake import FakeLLMProvider
from app.agent.providers.openai_compatible import OpenAICompatibleProvider
from app.config import Settings


def build_provider(settings: Settings, *, override: LLMProvider | None = None) -> LLMProvider:
    if override is not None:
        return override
    name = (settings.llm_provider or "fake").strip().lower()
    if name in {"fake", "mock", "test"}:
        return FakeLLMProvider()
    if name in {"openai", "openai_compatible"}:
        if not settings.llm_api_key:
            raise ProviderUnavailableError("LLM_API_KEY não configurada.")
        return OpenAICompatibleProvider(
            api_key=settings.llm_api_key,
            api_base=settings.llm_api_base,
        )
    raise ProviderUnavailableError(f"Provedor LLM desconhecido: {name}")
