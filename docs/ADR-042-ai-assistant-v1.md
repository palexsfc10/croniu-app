# ADR-042 — Assistente IA V1 sem fila

## Status

Aceito

## Contexto

Chat interativo com OpenAI Responses API, ferramentas allowlisted e confirmação para escritas.

## Decisão

V1 **não** introduz Redis/Celery. Turnos síncronos com timeout, limites de rodadas e rate limit in-process + `agent_usage_daily`.

Sinais futuros para fila: notificações proativas, resumos programados, jobs longos, fan-out multi-canal.

## Consequências

- Simples de operar em HML
- Limites por processo (multi-worker precisa compartilhar ou aceitar aproximação)
- Interface `AIProvider` permite trocar backend sem mudar domínio
