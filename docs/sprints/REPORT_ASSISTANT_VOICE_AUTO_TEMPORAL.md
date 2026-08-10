# Relatório — voz automática + contexto temporal (HML)

**Recomendação:** **GO** para homologação humana (HML)  
**Worktree:** `c:\projetos\croniu-assistant-premium`  
**Branch:** `feature/assistant-premium-ui-and-voice`  
**SHA implantado:** `d341f3dbce4ad370b07c2153904a386a6672eff8`

## Causa da interpretação incorreta de “amanhã”

O system prompt **não injetava** data/hora/timezone autoritativos. O modelo inferia “hoje” pelo conhecimento interno (e frequentemente alinhava com UTC).

## Timezone

| Antes | Depois |
|-------|--------|
| Ausente no prompt | `Organization.timezone`, fallback explícito `America/Sao_Paulo` (nunca o TZ do container) |

## Relógio contextual

`backend/app/agent/temporal.py` constrói o contexto a cada `run_turn` e injeta no system prompt (`prompts.py` v`2026-08-07.1`): UTC, local, hoje/amanhã/depois de amanhã, weekday, regras PT-BR e obrigação de passar ISO absoluto nas tools.

## Resolução de datas relativas

Tokens determinísticos em testes (`amanhã`, `sexta-feira`, `próxima segunda`, virada de mês/ano, bissexto). O LLM recebe as datas absolutas do dia no prompt; tools de agenda formatam propostas como  
`sexta-feira, 7 de agosto de 2026, das 08:00 às 09:00`.

## Fluxo final da voz

Gravar → finalizar → Transcrevendo… → **Enviando…** (mesmo pipeline textual) → resposta/proposta.  
Preferência `Enviar voz automaticamente` (localStorage, **default ligado**). Mutações continuam no card de confirmação.

## Anti-duplicata

`client_message_id` + `X-Request-Id`; replay idempotente no backend (`idempotent_replay: true` no smoke).

## Smoke HML (real)

- timezone org = `America/Sao_Paulo`
- “hoje / amanhã” → **hoje 6/8/2026 (quinta), amanhã 7/8/2026 (sexta)**
- replay idempotente = true
- voz transcrita → `input_modality=voice_transcript` → tool `list_upcoming_appointments`

## Arquivos principais

- `backend/app/agent/temporal.py`, `prompts.py`, `orchestrator.py`, `tools.py`
- `backend/app/api/agent.py`, `schemas/agent.py`
- `apps/web/src/app/app/assistant/page.tsx`
- testes `backend/tests/test_agent_temporal.py`

Produção / push / merge: não realizados.
