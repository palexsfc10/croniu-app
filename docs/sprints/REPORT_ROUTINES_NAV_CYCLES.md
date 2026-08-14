# Relatório — rotinas na operação, ciclos no cliente

Data: 2026-08-14  
Sprint: `docs/sprints/SPRINT_ROUTINES_NAV_CYCLES.md`  
Diagnóstico: `docs/sprints/DIAGNOSIS_ROUTINES_AGENDA_CYCLES.md`

## Serviço canônico

`ensure_routine_occurrences(organization_id, range_start, range_end)` em `backend/app/services/routine_occurrences.py`.

Chamado ao criar/editar rotina, ao ler Agenda (`list_day_agenda`) e ao montar o board. Sem scheduler: materialização lazy na leitura da janela. Documentado na spec da sprint.

Idempotência: unique `(organization_id, idempotency_key)` + insert em savepoint; `IntegrityError` não vira 500. Teste concorrente: `test_concurrent_ensure_does_not_duplicate`.

`trigger_type`: `calendar` | `cycle_lifecycle`. `client_lifecycle` retorna 422.

## Renovações

Filtro padrão: Próximas (vencendo em até 30 dias no fuso da org). Contagens visíveis para Em andamento / Próximos / Encerrados / Todos. Portal do cliente continua “encerrando” em 7 dias (`PORTAL_NEARING_DAYS`).

## Templates

`GET /api/v1/routines/templates` + cards com switch na tela Rotinas.

## Migrations

Nenhuma.

## Rollback

Reverter o SHA. Sem DROP.

## Gates

Ver mensagem de entrega desta etapa (pytest local / lint / Playwright / CI).
