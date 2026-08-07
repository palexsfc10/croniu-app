# Relatório — voz automática + contexto temporal (HML)

**Estado:** implantado para homologação humana  
**Branch:** `feature/assistant-premium-ui-and-voice`  
**Worktree:** `c:\projetos\croniu-assistant-premium`

## Causa da interpretação incorreta de “amanhã”

O system prompt **não injetava** data/hora/timezone autoritativos. O modelo inferia “hoje” pelo conhecimento interno / UTC implícito.

## Timezone

| Antes | Depois |
|-------|--------|
| Ausente no prompt (risco UTC/container) | `Organization.timezone` com fallback explícito `America/Sao_Paulo` |

## Relógio contextual

`app/agent/temporal.py` → `build_temporal_context` + bloco no system prompt a cada `run_turn`.

## Voz

Fluxo padrão: gravar → transcrever → **enviar automaticamente** pelo mesmo pipeline textual (`input_modality=voice_transcript` + `client_message_id`). Preferência local `croniu.assistant.voiceAutoSend` (default ligado).

## Proteção anti-duplicata

`client_message_id` em metadata + replay idempotente no backend.
