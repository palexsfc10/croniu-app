# Relatório — rotinas na operação, ciclos no cliente

Data: 2026-08-14  
Sprint: `docs/sprints/SPRINT_ROUTINES_NAV_CYCLES.md`  
Diagnóstico: `docs/sprints/DIAGNOSIS_ROUTINES_AGENDA_CYCLES.md`

## Constraint de idempotência

Nome: `uq_op_occ_org_idem`  
Definição: `UNIQUE (organization_id, idempotency_key)`  
Origem Alembic: `0021_plan_cadence` (`op.create_table(..., UniqueConstraint(..., name="uq_op_occ_org_idem"))`).  
Head atual: `0022_form_template_pin`.

Não foi criada migration nesta rodada: a constraint **já existe** em bancos upgradados até o head. Não afirmar “nenhuma migration no produto”; afirmar que **0021 já a institui**.

### Banco de teste recriado do zero (Alembic, não `create_all`)

Base vazia `croniu_constraint_probe` → `alembic upgrade head` → `0022_form_template_pin`.

```
conname            | pg_get_constraintdef
uq_op_occ_org_idem | UNIQUE (organization_id, idempotency_key)
indexname          | CREATE UNIQUE INDEX uq_op_occ_org_idem ON public.operational_occurrences USING btree (organization_id, idempotency_key)
```

### Schema HML (somente leitura)

`croniu-hml-db` / `croniu_hml` / Alembic `0022_form_template_pin`:

```
conname            | pg_get_constraintdef
uq_op_occ_org_idem | UNIQUE (organization_id, idempotency_key)
```

### Histórico Alembic

`0021_plan_cadence` cria a tabela com a unique. `0022` não a altera.

## Alembic check (metadata alinhado ao schema canônico)

`alembic current` / `heads`: `0022_form_template_pin` (único head).  
`alembic check`: **No new upgrade operations detected**.

Nenhuma migration 0023. Nenhum DDL. `uq_op_occ_org_idem` preservada.

### Versões Alembic (causa raiz HML)

| Ambiente | Antes | Depois (pin) |
|---|---|---|
| Local / `requirements.txt` / CI `pip -r` | 1.18.5 + SQLAlchemy 2.0.51 | **alembic 1.19.1** + SQLAlchemy **2.0.51** |
| Imagem API (Dockerfile `>=`) / HML `3749d21` | alembic **1.19.1**, SQLAlchemy **2.0.52** | mesmas pins `==` no Dockerfile |
| `migrations-check` | 1.18.5, sem `alembic check` | 1.19.1 + `alembic check` + inspeção de constraints |

O job CI e a imagem de deploy instalam a mesma versão pinada. Sem `>=` para Alembic/SQLAlchemy.

### 18 CHECKs que faltavam no metadata (HML, validados, não deferrable)

Fonte da expressão: migrations 0005–0019 (head 0021/0015 para status finais). HML confirmou o objeto físico.

| Tabela | Nome | Migration (expressão canônica) |
|---|---|---|
| agent_messages | ck_agent_messages_message_type | 0013 `message_type IN ('text', 'pending_card', 'system')` |
| agent_messages | ck_agent_messages_role | 0013 `role IN ('user', 'assistant', 'system', 'tool')` |
| agent_pending_actions | ck_agent_pending_actions_risk_class | 0013 `risk_class IN ('read', 'write_common', 'write_sensitive', 'forbidden')` |
| agent_pending_actions | ck_agent_pending_actions_status | 0015 `... 'executing' ...` |
| agent_threads | ck_agent_threads_status | 0013 `status IN ('active', 'archived')` |
| agent_tool_calls | ck_agent_tool_calls_risk_class | 0013 (mesmo conjunto de risk_class) |
| appointments | ck_appointments_ends_after_starts | 0005 `ends_at > starts_at` |
| client_intake_submissions | ck_client_intake_submissions_status | 0019 |
| organization_intake_links | ck_organization_intake_links_status | 0019 |
| organization_payment_settings | ck_org_payment_pix_key_type | 0007 |
| payment_proofs | ck_payment_proofs_mime / size | 0007 |
| payment_reports | ck_payment_reports_status / amount | 0007 |
| protocols | ck_protocols_status | 0019 |
| renewal_requests | ck_renewal_requests_status | 0011 (inclui `payment_reported`) |
| user_feedbacks | ck_user_feedbacks_category / status | 0017 |

Já alinhados e preservados: `cycle_templates.*`, `client_evaluations.*`.

Reprodução: banco A `croniu_alembic_fresh` (`upgrade head`) e banco B restore local do backup pré-deploy (não no Git, não no HML). Ambos: `No new upgrade operations detected.`

Sem `include_object`, sem silenciar `alembic check`.

## Serviço canônico

`ensure_routine_occurrences` em `backend/app/services/routine_occurrences.py`. Lazy. Unique + savepoint; `IntegrityError` ignorada.

`trigger_type`: `calendar` | `cycle_lifecycle`. `client_lifecycle` / `manual` → 422.

Âncoras `cycle_lifecycle`: após `starts_on`, antes de `ends_on` (offset), no `ends_on` (offset 0).

## Gates Web

Lint, typecheck e Vitest completos; build de produção Web. Admin não afetado.

## Stack local

API `127.0.0.1:8010` `/health` ok; Web Playwright `127.0.0.1:3000`; Postgres `croniu-dev-db:5433`; testes em `croniu_test`; app em `croniu`; head `0022`; sem HML.

## Gates (local, SHA seguinte a este relatório)

- Lint Web: 0 errors (warnings pré-existentes).
- Typecheck Web: ok.
- Vitest: 174 passed.
- Build Web produção: ok. Admin não afetado.
- Pytest completo: 354 passed.
- Playwright suíte completa: 40 passed, 0 skipped.
- API `http://127.0.0.1:8010/health` `{"status":"ok","database":true}`.
- Playwright `test:e2e:professions`: 6 passed (personal_trainer, private_tutor, aesthetics, physiotherapist, nutritionist, other + switch de template).
- Playwright `test:e2e:functional`: 15 passed.
- Playwright `test:e2e:regression` + suíte completa local: sprint 2A–2D, cycle-integrity, rotinas, isolamento, viewports.

## Rollback

Reverter o SHA candidato. Sem DROP. Unique `uq_op_occ_org_idem` permanece via `0021_plan_cadence` em qualquer banco já upgradado. Não fazer downgrade de 0021 em HML (droparia `operational_occurrences`). Sem deploy HML, merge, Promote ou alteração de PRD neste SHA.
