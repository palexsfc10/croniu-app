# Relatório — Assistente premium UI + voz (HML)

**Estado:** em implantação / gates  
**Branch:** `feature/assistant-premium-ui-and-voice`  
**Worktree:** `c:\projetos\croniu-assistant-premium`  
**SHA-base:** `3783c596d9c27e3e6aaea73b409575a2fb93b685`  
**SHA final:** _(preencher após commit)_  
**SHA HML anterior:** `3783c596d9c27e3e6aaea73b409575a2fb93b685` (confirm-fix, alembic `0015`)

## Diagnóstico visual anterior

Ver `docs/AI_ASSISTANT_UX.md`.

## Decisões de UX

Ver `docs/AI_ASSISTANT_UX.md` e `docs/AI_ASSISTANT_VOICE.md`.

## Migrations

- Antes: `0015_pending_executing_status`
- Depois: `0016_agent_voice_usage` (contadores de voz em `agent_usage_daily`)

## Modelo de transcrição

- Default código: `whisper-1`
- Validação HML: _(preencher após probe)_

## Gates (local)

| Gate | Resultado |
|------|-----------|
| Backend pytest (voice + assistant) | Bloqueado localmente — Docker/Postgres `:5433` indisponível |
| Frontend vitest (ProposalCard + AppShell) | OK (3/3) |
| `tsc` web | OK |
| `tsc` admin | OK |
| Alembic head local | `0016_agent_voice_usage` |

## Pós-deploy HML

_(preencher)_
