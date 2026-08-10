# Relatório — Assistente IA V1

**Branch:** `feature/ai-assistant-v1`  
**Worktree:** `c:\projetos\croniu-ai-assistant`  
**SHA-base:** `22114a1` (Home Hoje + billing `0012`)  
**SHA-final:** `b7e6e73e8636cfa0bcb9b52c8143e31923db3f8f`  
**Data:** 2026-08-06  
**Produção:** **não alterada**

## 1. Diagnóstico inicial

| Item | Estado |
|------|--------|
| Árvore original `c:\projetos\croniu` | Dirty (evals/PWA) — **não tocada** |
| `croniu-home-hoje` | `22114a1` — base HML anterior |
| Fundação agente | Presente (`0008`/`0009`, `/api/v1/agent/*`) |
| HML pré-deploy | Alembic `0012_billing_asaas`; containers healthy |

## 2–6. Worktree / branch / SHAs / commits

- Worktree: `c:\projetos\croniu-ai-assistant`
- Branch: `feature/ai-assistant-v1`
- Commits:
  1. `a9f8e07` — modelo, migration `0013`, config, Responses provider
  2. `efbc4aa` — tools, threads, orchestrator, API, testes
  3. `822e693` — UI assistente, admin AI ops, docs
  4. `b7e6e73` — fixes UI + runbook HML
- Dependências de outras branches: apenas base `22114a1` (sem cherry-pick adicional)

## 7–11. Arquitetura

- Provider desacoplado: `OpenAIResponsesProvider` + `FakeAIProvider`
- `organization_id` só da sessão; tools → serviços de domínio
- Escrita apenas via pending action + confirm/cancel
- Modelo configurável: `OPENAI_MODEL` (default sugerido `gpt-5.6-terra`)
- Confirmação: read / write_common / write_sensitive / forbidden V1

Ferramentas leitura: today summary, appointments, clients, cycles, receivables, renewals, evaluations/milestones.  
Propostas: client, appointment, reschedule, cycle, payment, outcome, evaluation, milestone.

## 12–14. Endpoints / tabelas / UI

- `/api/v1/agent/threads`, messages, pending confirm/cancel, status, health (+ legacy chat)
- `/api/v1/platform/ai-ops` (admin)
- Migration `0013_agent_assistant_v1`
- UI: `/app/assistant` · Admin: `/ai`

## 15–18. Segurança / limites / custos

- Auth + tenant + entitlement billing canônico
- Rate limits: user/min, org/day, input size, tool rounds, confirmation TTL
- Uso em `agent_runs` / `agent_usage_daily`
- Sem chave no frontend; `store=false`

## 19–21. Testes locais

| Gate | Resultado |
|------|-----------|
| Agent pytest | **20 passed** |
| Backend completo | **143 passed**, **2 failed** pré-existentes (`test_home_daily_focus` midnight edge) |
| Web vitest assistant | **1 passed** |
| Web tsc | OK |

## 22–31. HML (Jarvis)

| Item | Resultado |
|------|-----------|
| Backup | `/home/palex/ntws/backups/croniu-hml/pre-ai-assistant-v1_20260806T032944Z.sql.gz` |
| Antes | alembic `0012`; api/web/admin/db healthy |
| Depois | alembic **`0013_agent_assistant_v1 (head)`**; api/web/admin/db/cloudflared healthy |
| Containers | `croniu-hml-{api,web,admin,db,cloudflared}` |
| Healthcheck | web/admin/api/openapi/manifest/register/me/logout/session OK; billing entitlement OK |
| Agent health | `ai_enabled=false`, `provider=openai_responses`, `database=true` |
| Agent status (auth) | `enabled=false`, `entitlement_ok=true`, modelo `gpt-5.6-terra`, tools listadas |
| Mensagem com IA off | HTTP 200, `status=disabled`, texto claro de desativação |
| OpenAPI | 11 paths agent/ai-ops |
| OpenAI smoke real | **BLOQUEADO** — `OPENAI_API_KEY` EMPTY no `.env.hml` |
| Isolamento tenants | healthcheck tenant isolation OK na reexecução |
| Confirmação/idempotência | cobertas em testes locais com FakeAI; HML real pendente de chave |
| Billing | entitlement trial no healthcheck OK; IA respeita entitlement quando `AI_ENABLED` |
| Kyvora | 5 containers intactos |
| Samba / UniFi | `smbd=active`, `unifi=active` |

Marker: `DEPLOY_MARKER.txt` → SHA `b7e6e73…` · `feature=ai-assistant-v1`

Config HML aplicada (sem imprimir segredos):

- `AI_ENABLED=false`
- `OPENAI_API_KEY=` (vazio)
- `LLM_PROVIDER=openai_responses`
- `OPENAI_MODEL=gpt-5.6-terra`
- limites TTL/rate appendados

Para ativar smoke real: preencher `OPENAI_API_KEY` em `/home/palex/ntws/croniu-hml/deploy/hml/.env.hml`, setar `AI_ENABLED=true`, recreate só `croniu-hml-api`. Ver `docs/AI_ASSISTANT_RUNBOOK.md`.

## 32–36. Pendências / riscos / veredito

**Pendências**

- Chave OpenAI HML ausente → smoke LLM real bloqueado
- Push/PR não feitos (não solicitados; HML via git-archive)
- 2 flakes midnight home (pré-existentes)

**Riscos**

- Scripts `.sh` vindos de Windows precisam LF (já normalizados no Jarvis nesta entrega)
- Ativar IA sem chave/limites monitorados pode gerar custo ou erro de provider

**Rollback**

1. Preferencial: `AI_ENABLED=false` + recreate `croniu-hml-api`
2. Restore DB do backup `pre-ai-assistant-v1_*.sql.gz` se necessário
3. `./rollback.sh previous-image` com imagens anteriores

**Veredito:** **GO condicional** para homologação humana da entrega com IA **desabilitada** (API/UI/admin/migration).  
**NO-GO** para validação conversacional OpenAI até configurar chave em HML.

**Produção não foi alterada.**
