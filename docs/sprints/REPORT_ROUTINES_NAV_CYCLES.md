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

## Alembic check (drift)

`alembic current` / `heads`: `0022_form_template_pin` (único head).  
`alembic check` **falha** no autogenerate.

Classificação (reconciliado, sem 0023):

- **Não é ausência da unique** `uq_op_occ_org_idem` (presente no modelo, em 0021, no probe e no HML).
- Drift é **nomeação de índices** (`ix_op_occ_*` no SQL vs `ix_operational_occurrences_*` gerado por `index=True`) e representação UniqueConstraint vs unique Index em tokens/billing/renewals.
- Cosmético de metadata SQLAlchemy vs nomes explícitos das revisões. Uma 0023 só para rename de índices mudaria HML sem ganho de regra.
- Pytest de concorrência prova a unique em runtime.

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
- Pytest rotinas/external_ref: 13 passed.
- API `http://127.0.0.1:8010/health` `{"status":"ok","database":true}`.
- Playwright `test:e2e:professions`: 6 passed (personal_trainer, private_tutor, aesthetics, physiotherapist, nutritionist, other + switch de template).
- Playwright `test:e2e:functional`: 15 passed.
- Playwright `test:e2e:regression` + suíte completa local: sprint 2A–2D, cycle-integrity, rotinas, isolamento, viewports.

## Rollback

Reverter o SHA candidato. Sem DROP. Unique `uq_op_occ_org_idem` permanece via `0021_plan_cadence` em qualquer banco já upgradado. Não fazer downgrade de 0021 em HML (droparia `operational_occurrences`). Sem deploy HML, merge, Promote ou alteração de PRD neste SHA.
