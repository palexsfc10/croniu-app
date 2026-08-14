# Sprint — Rotinas na operação diária, ciclos no cliente, adaptação profissional

## Identificação

- ID: `ROUTINES_NAV_CYCLES_PROFESSION`
- Branch: `feature/client-intake-journey`
- Data: 2026-08-14
- SHA-base: `4df952c7e43795f8e2c95520a65fa8adcebffd52`

## Estado

- [x] AUTORIZADA (tarefa explícita do operador)
- [x] EM_ANDAMENTO
- [ ] ENTREGUE_HML
- [ ] HOMOLOGADA
- [ ] ENTREGUE

Sem Promote, merge em `main`, alteração da versão PRD implantada ou reset de banco.

## Diagnóstico (antes do código)

Ver `docs/sprints/DIAGNOSIS_ROUTINES_AGENDA_CYCLES.md`.

## Materialização (lazy)

Não há scheduler nesta etapa. `ensure_routine_occurrences(organization_id, range_start, range_end)` é a única regra:

- ao criar/editar rotina;
- ao ler Agenda (`list_day_agenda`) e Hoje (`build_home_summary` via agenda do dia);
- ao montar o board de pendências.

Idempotência: unique `(organization_id, idempotency_key)` + `INSERT` em savepoint; `IntegrityError` é ignorada. Teste concorrente em `test_concurrent_ensure_does_not_duplicate`.

`trigger_type`: `calendar` | `cycle_lifecycle`. `client_lifecycle` não é aceito na API.


Nenhuma nesta rodada se `filter_json` / `operational_occurrences.meta` / `protocols.content_json` cobrirem o modelo. Se surgir coluna obrigatória, parar e documentar.

## Fora de escopo

Integração MFIT, prescrição clínica, deploy HML antes do gate local, reset de banco.
