# Sprint — Assistente premium UI + voz (HML)

**Estado:** AUTORIZADA  
**Escopo:** HML / Jarvis apenas — sem produção, sem push/merge.  
**Branch:** `feature/assistant-premium-ui-and-voice`  
**SHA-base:** `3783c596d9c27e3e6aaea73b409575a2fb93b685` (confirm-fix + alembic `0015`)

## Objetivos

1. Modernizar profundamente a UX visual do Assistente (chat moderno Croniu).
2. Liberar entrada por voz (gravação → transcrição → revisão → envio textual).
3. Preservar núcleo textual, tools, confirmações, idempotência, multi-tenant e guardrails.

## Fora de escopo

- TTS / resposta falada
- Produção, push, merge
- Alterações em Kyvora, Samba, UniFi, Cloudflare
- Auto-envio da transcrição ao agente

## Gates

Ver `REPORT_ASSISTANT_PREMIUM_UI_VOICE.md` após entrega.
