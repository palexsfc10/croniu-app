# Relatório — Assistente premium UI + voz (HML)

**Estado:** HML disponível para homologação humana  
**Recomendação:** **GO** para homologação humana (HML only)

## Identificação

| Item | Valor |
|------|--------|
| Worktree | `c:\projetos\croniu-assistant-premium` |
| Branch | `feature/assistant-premium-ui-and-voice` |
| SHA-base | `3783c596d9c27e3e6aaea73b409575a2fb93b685` |
| SHA final | `4c213959b32d5fc133de23eafec566dd92a5c7ea` |
| SHA implantado Jarvis | `4c213959b32d5fc133de23eafec566dd92a5c7ea` |
| Produção | intacta (não tocada) |
| Push/merge | não realizados |

## 1. Diagnóstico visual anterior

Cabeçalho serifado grande, explicação permanente, caixa única com bolhas genéricas, propostas embutidas na bolha, composer sem safe-area/teclado explícitos, auto-scroll sempre forçado. Detalhes: `docs/AI_ASSISTANT_UX.md`.

## 2. Decisões de UX implementadas

Chat moderno Croniu (bolhas L/R, empty state, ProposalCard, composer fixo acima da bottom nav com `h-dvh`/safe-area, scroll inteligente, motion discreto, voz tap-start/stop com revisão obrigatória antes do envio).

## 9. Migrations

| Momento | Revision |
|---------|----------|
| Antes | `0015_pending_executing_status` |
| Depois | `0016_agent_voice_usage` (contadores de voz) |

Backup HML: `pre-assistant-voice_*.sql.gz` em `/home/palex/ntws/backups/croniu-hml/`.

## 10. Modelo de transcrição validado

Probe OpenAI (sem imprimir chave):

| Modelo | HTTP | Latência |
|--------|------|----------|
| `whisper-1` | 200 | ~1652 ms |
| `gpt-4o-mini-transcribe` | 200 | ~1088 ms |
| `gpt-4o-transcribe` | 200 | ~1254 ms |

**HML ativo:** `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe` + `VOICE_ENABLED=true`.

## 11. Áudios testados

- Tom sintético WAV ~1.5s / ~48 KB → 422 humano (`voice_transcription_failed`) — esperado.
- MP3 falado (~38 KB, ~3s, frase “Como está meu dia hoje?”) → **200**, texto revisável, `temp_left=0`.

## 12. Gates

| Gate | Resultado |
|------|-----------|
| Backend pytest local | Bloqueado — Docker Desktop / Postgres `:5433` indisponível no host do agente |
| Vitest ProposalCard + AppShell | OK (3/3) |
| `tsc` web / admin | OK |
| Alembic head | `0016_agent_voice_usage` |
| Build produção (Docker HML web/api/admin) | OK após correção CSS |
| Smoke STT real HML | OK |
| Smoke chat read-only (`get_today_summary`) | OK |
| Descarte tempfile | OK (`temp_left=0`) |
| Produção / Kyvora / Samba / UniFi | Intactos |

## 13–16. Smoke / containers / URLs

- Transcribe: HTTP 200, latency_ms≈1695, model=`gpt-4o-mini-transcribe`, text_len=23.
- Chat: status `ok`, tools `['get_today_summary']`, sem pending.
- Containers recriados: `croniu-hml-api`, `croniu-hml-web`, `croniu-hml-admin`.
- URLs: `https://croniu-hml.ntws.cloud/app/assistant` → 200; `https://api-croniu-hml.ntws.cloud/api/v1/agent/health` → 200.

## 17. Mobile / desktop / PWA

Layout mobile-first + composer/safe-area implementados. Homologação visual humana pendente (viewport mobile, PWA instalada, teclado aberto).

## 18. Git status final (worktree)

Branch limpa após commits locais (sem push).

## 19. Riscos restantes

- Pytest backend completo não rodou localmente (infra Docker local).
- E2E Playwright mutação por voz (Juliana / compromisso) não automatizado nesta rodada — smoke real cobriu STT + tool de leitura; confirmação idempotente permanece no núcleo já homologado (`3783c59`).
- Safari/iOS PWA depende de homologação humana (MediaRecorder/mp4).
- Custo STT+TTS de smoke operacional é residual e aceitável em HML.

## 20. GO / NO-GO

**GO para homologação humana no HML.**  
Kill switch: `VOICE_ENABLED=false` + recreate `croniu-hml-api`.
