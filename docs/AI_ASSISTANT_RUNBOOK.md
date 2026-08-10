# Runbook — Assistente IA (HML / operação)

## Desabilitar a IA

1. Em `/home/palex/ntws/croniu-hml/deploy/hml/.env.hml` defina `AI_ENABLED=false`.
2. Recrie apenas a API: `docker compose -f compose.hml.yaml up -d --force-recreate croniu-hml-api` (no diretório do compose).
3. Confirme `GET /api/v1/agent/status` → `enabled: false`.

## Trocar o modelo

1. Ajuste `OPENAI_MODEL` (e opcionalmente `OPENAI_REASONING_EFFORT`) no `.env.hml`.
2. Recrie `croniu-hml-api`.
3. Não altere código para trocar modelo.

## Rotacionar a chave OpenAI

1. Gere nova chave no provedor.
2. Substitua `OPENAI_API_KEY` no `.env.hml` (nunca imprima nem commit).
3. Recrie `croniu-hml-api`.
4. Invalide a chave antiga no provedor.
5. Smoke: status + uma consulta de leitura.

## Investigar erro

1. Correlation / request id nos logs da API (`docker logs croniu-hml-api --tail 200`).
2. Admin `/ai` → erros sanitizados e latência.
3. Tabela `agent_runs` / `agent_tool_calls` (metadados; conteúdo mínimo).
4. Não exponha conversas completas sem necessidade operacional.

## Verificar consumo

- Admin: `/ai` (métricas diárias/mensais, orgs top).
- API: `GET /api/v1/platform/ai-ops` (admin autenticado).
- Postgres: `agent_usage_daily`.

## Invalidar ação pendente

- Usuário: Cancelar no cartão; ou TTL (`AI_CONFIRMATION_TTL_SECONDS`).
- Ops: marcar status `expired`/`cancelled` só com procedimento documentado e backup; preferir cancelamento via API autenticada do próprio usuário.

## Smoke HML

1. Login profissional (duas orgs se possível).
2. `/app/assistant` — sugestão “Resuma meu dia.”
3. Proposta de cliente → Cancelar; nova proposta → Confirmar.
4. Tentativa de mensagem cross-tenant deve falhar.
5. Sem chave: `AI_ENABLED=false` e UI degradada.

## Rollback

Ver `docs/AI_ASSISTANT_V1.md` e `deploy/hml/rollback.sh`. Preferência: kill switch `AI_ENABLED=false` antes de downgrade de imagem.
