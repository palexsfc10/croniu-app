# Assistente Croniu — entrada por voz (STT)

## Escopo

- Gravação no navegador → upload autenticado → transcrição OpenAI → texto no composer.
- **Sem TTS** nesta versão.
- **Sem auto-envio** ao agente: o usuário revisa e envia pelo pipeline textual homologado.
- Mutações continuam exigindo confirmação explícita.

## Arquitetura

```
Browser MediaRecorder
  → POST /api/v1/agent/transcribe (multipart)
  → tempfile + OpenAI /v1/audio/transcriptions
  → delete tempfile (finally)
  → { text } no composer
  → POST /api/v1/agent/threads/{id}/messages (input_modality=voice_transcript|text)
```

Organization isolation: `organization_id` / `user_id` apenas da sessão. Billing/trial via entitlement existente.

## Configuração

| Variável | Default | Notas |
|----------|---------|--------|
| `VOICE_ENABLED` | `false` | Kill switch global |
| `OPENAI_TRANSCRIPTION_MODEL` | `whisper-1` | Validar no projeto OpenAI do HML |
| `VOICE_MAX_SECONDS` | `60` | |
| `VOICE_MAX_BYTES` | `4194304` | 4 MiB |
| `VOICE_ALLOWED_MIME_TYPES` | webm/mp4/wav/ogg… | Allowlist |
| `VOICE_TIMEOUT_SECONDS` | `45` | |
| `VOICE_USER_REQUESTS_PER_MINUTE` | `4` | |
| `VOICE_ORG_DAILY_REQUEST_LIMIT` | `80` | |
| `VOICE_COST_PER_MINUTE_CENTS` | `0.6` | Estimativa admin |

Requer `AI_ENABLED=true` e chave `OPENAI_API_KEY` / `LLM_API_KEY` no servidor.

## Privacidade / retenção

- Áudio bruto **não** vai para banco, histórico, storage permanente ou logs.
- Tempfile com limpeza em `finally`.
- Logs: `request_id` sanitizado, bytes, MIME, modelo, latência, custo estimado — **nunca** texto completo nem chave.
- Histórico do chat guarda só o texto que o usuário efetivamente enviou.

## Estados frontend

`idle` → `requesting_permission` → `recording` → `stopping` → `uploading` → `transcribing` → `ready` | `cancelled` | `error`

## Compatibilidade

Feature detection de `getUserMedia` + `MediaRecorder`. MIME preferido por `isTypeSupported` (webm/opus, mp4, ogg).

## Desligamento / rollback

1. `VOICE_ENABLED=false` no `.env.hml` e recriar `croniu-hml-api`.
2. UI oculta/desabilita microfone via `/agent/status`.
3. Pipeline textual permanece intacto.

## Admin

`/ai` mostra contagens, minutos, erros, latência, modelo, custo estimado e bloqueios — **sem** conteúdo transcrito.
