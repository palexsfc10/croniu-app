# Sprint — Planos com valor fixo pelo período

## Identificação

- Nome / ID: FIXED_PERIOD_PLAN_PRICING
- Branch: `feature/fixed-period-plan-pricing`, worktree `croniu-fixed-period-pricing`, a partir de
  `origin/main` @ `ea95a4d`.
- Autor: Claude Code (execução autônoma sob instrução direta do operador)
- Data de criação: 2026-08-27

## Estado

- [x] AUTORIZADA
- [x] EM_ANDAMENTO

> Autorização: instrução direta e explícita do operador nesta sessão, com contexto de negócio
> (personal trainer parceira cobrando por aula avulsa vs. planos mensal/trimestral/semestral com
> valor fixo), regras obrigatórias, integração completa e testes mínimos especificados. Registrado
> aqui por exigência de `AGENTS.md` regra 1/9 — `AGENTS.md` em si não foi alterado.

## Objetivo

Separar o controle operacional das aulas (agenda, progresso, quantidade prevista/realizada) da
regra financeira do ciclo. Um `Service` passa a declarar como cobra — `per_lesson` (padrão, todo
comportamento atual preservado) ou `fixed_period` (valor fixo pelo período, independente da
quantidade de aulas) — e todo `Cycle` criado a partir dele herda e **snapshota** esse modo.

## Contexto

Investigação prévia (ver commits desta branch) encontrou que o backend já suportava um "valor
final" via `final_cents`/`value_cents`, mas sempre **reconciliando** contra `unit_price × lesson_count`
— um valor fixo virava um "ajuste" artificial em vez de ser a própria fórmula. O período
(mensal/trimestral/semestral/personalizado) já existe como `duration_type`
(`calendar_months`/`fixed_days`) + `duration_value` em `CycleTemplate`/`Cycle` — não foi criado
nenhum conceito de período novo.

## Escopo

- Migration `0027_fixed_period_plan_pricing` (aditiva): `services.pricing_mode`,
  `services.fixed_price_cents`, `cycles.pricing_mode` (snapshot).
- `cycle_calc.compose_financial`: ganha `pricing_mode`/`fixed_price_cents`, única fórmula para os
  dois modos.
- `create_cycle_with_schedule`, `cycle_intelligence.build_preview`/`create_intelligent_cycle`/
  `update_intelligent_cycle` (edição financeira): resolvem o modo a partir do `Service`, nunca do
  caller; nunca permitem trocar o modo depois de criado.
- `prepare_renewal`: sugere o modo/valor atual do serviço (nunca do ciclo expirando).
- `cycle_prepare.py` (IA): resolve preço pelo modo do serviço, nunca multiplica por aula em um
  plano fixo, rotula "Valor do plano" na confirmação.
- Frontend: toggle "Por aula | Valor fixo pelo período" no formulário de serviço (criar/editar),
  preview e detalhe do ciclo com rótulo condicional, edição financeira do ciclo corrigida (não
  bloqueava mais ciclos fixed_period — achado real durante a implementação, ver §Riscos).

## Fora do escopo

Parcelamento · recorrência automática de recebível · múltiplos recebíveis por ciclo · uma terceira
modalidade de período (o "personalizado" já é `fixed_days` com `duration_value` livre) · mudanças no
portal do cliente (já mostra só o total, nenhuma mudança necessária) · admin (não exibe esses
campos).

## Regras de domínio afetadas

Nenhuma regra de `per_lesson` muda de comportamento — `compose_financial` sem `pricing_mode`
explícito continua idêntico ao anterior (testado). `AGENDA-004`/atomicidade de criação de ciclo
(ciclo+aulas+recebível juntos, com rollback) não muda — só a origem do valor muda.

## UX

`SegmentedToggle` reaproveitado (já usado para duração/frequência nos mesmos formulários) — sem
componente novo. Sem alteração de wordmark ou navegação.

## Segurança

Mesmo isolamento por `organization_id` de sempre — nenhum novo endpoint, só campos novos nos
existentes. Validação de enum (`per_lesson`/`fixed_period`) e obrigatoriedade condicional
(`fixed_price_cents` obrigatório quando `fixed_period`) no backend, tanto no schema Pydantic quanto
em CHECK constraint no banco (defesa em profundidade).

## Migrations

- [x] Sim — id: `0027_fixed_period_plan_pricing`, `down_revision = "0026_availability_schedules"`.

**Histórico**: esta branch foi cortada originalmente do mesmo head (`0025_user_auth_identities`)
que a PR #37 (disponibilidade inteligente), e ambas reivindicavam a revisão `0026`. A PR #37
mergeu primeiro em `main`, então `0026` ficou oficialmente com `0026_availability_schedules`; esta
migration foi renumerada para `0027` e reencadeada logo em seguida, antes do próprio merge desta
PR. Nunca foi aplicada em HML ou PRD, então a renumeração não tem risco de histórico de migration.

Justificativa: `services.pricing_mode`/`fixed_price_cents` e `cycles.pricing_mode`, todos com
`server_default='per_lesson'` — nenhuma linha existente é reescrita, nenhum valor histórico muda,
migração 100% aditiva e reversível (`downgrade` remove só as colunas/constraints novas).

## Testes

- `backend/tests/test_cycle_calc.py`: 6 casos novos de `compose_financial` em modo `fixed_period`
  (puro, sem banco) + confirmação de que os testes `per_lesson` existentes continuam passando sem
  alteração (regressão).
- `backend/tests/test_fixed_period_pricing.py`: 16 casos de integração via API — criação por aula
  sem regressão, validação de enum/obrigatoriedade, planos mensal/trimestral/semestral/
  personalizado, valor fixo independente da frequência de aulas, desconto sobre valor base,
  recebível com valor correto sem duplicidade em retry idempotente, snapshot imune a mudança
  posterior do serviço, edição financeira pós-criação, isolamento multi-tenant, serialização de
  `pricing_mode` nos payloads.
- Regressão: suíte completa do backend e `tsc`/`eslint`/`vitest`/`next build` do frontend — ver
  relatório de entrega para o resultado (CI, já que o Docker local ficou indisponível durante esta
  sessão).

## Gates

Mesmos do PR #37: `pytest -q`, `alembic upgrade head` + `alembic check` (via CI `migrations-check`),
`npm run typecheck && npm run lint && npm test && npm run build`.

## Critérios de aceite

Ver a instrução original da tarefa (Entrega 2) — reproduzidos e verificados no relatório de entrega.

## Rollback

`alembic downgrade -1` remove as 3 colunas novas e as constraints associadas — nenhum dado fora
delas é tocado. Reverter os commits do branch remove o modo de cobrança da UI/backend; sem feature
flag — a ausência de `fixed_period` configurado em qualquer serviço já é o estado atual, sem ação
adicional para "desligar" em produção (que não recebe este código nesta etapa).

## Riscos identificados durante a implementação

`apps/web/.../cycles/[cycleId]/financial/page.tsx` tinha uma guarda (`cycle.unit_price_cents ==
null`) que **bloquearia completamente** a edição financeira de qualquer ciclo `fixed_period`, já
que `unit_price_cents` é legitimamente `null` nesse modo — corrigido nesta mesma entrega antes de
virar um bug em produção, não era um risco pré-existente conhecido.

## Autorização

| Campo | Valor |
|-------|-------|
| Autorizado por | Operador (palexsfc10), via instrução direta e detalhada nesta sessão |
| Data | 2026-08-27 |
| Notas | Contexto de negócio real (parceira personal trainer), regras obrigatórias, escopo de integração e testes mínimos explicitados na própria instrução. |
