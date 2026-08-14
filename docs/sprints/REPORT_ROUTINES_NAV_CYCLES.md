# Relatório — rotinas na operação, ciclos no cliente

Data: 2026-08-14  
Sprint: `docs/sprints/SPRINT_ROUTINES_NAV_CYCLES.md`  
Diagnóstico: `docs/sprints/DIAGNOSIS_ROUTINES_AGENDA_CYCLES.md`

## Implementado nesta rodada

- Materialização de `RecurringClientTask` em `OperationalOccurrence` (idempotência `routine:{id}:{due_on}`).
- Agenda consulta `GET /routines/board?on=YYYY-MM-DD` (compromissos vs ações da rotina).
- Concluir ocorrência avança `next_run_on` e **não** arquiva a série (exceto `once`).
- Listagem global de ciclos: período padrão **Todos**; título **Renovações**; hoje da organização.
- Nav: Hoje · Agenda · Clientes · **Rotinas** · Mais. Ciclos em Mais → Ciclos e renovações. `/cycles` redireciona para `/app/cycles`.
- Cadastro: 6 profissões visíveis; códigos antigos válidos; especialidade opcional em texto.
- Plano externo: URL http/https, MFIT só como rótulo de Personal trainer (não é integração).
- Hoje: seção “Suas ações de hoje”.

## Migrations

Nenhuma. `filter_json`, `meta` e `content_json` cobrem o modelo.

## Rollback

Reverter o SHA candidato. Sem DROP. Definições de rotina e ciclos permanecem.

## Pendências conscientes

- Templates visuais completos por profissão (cards com switch) — sugestões já existem; formulário manual permanece.
- Automações `client_lifecycle` / `cycle_lifecycle` além do campo `trigger_type`.
- Alertas 30/15/7/0 como entidade própria (hoje usam attention de ciclo).
- E2E Playwright de seis profissões e CI — executar após gate local.

## Regras preservadas

`starts_on <= today < ends_on`. `ends_on` exclusivo. Isolamento por tenant da sessão. Sem Promote / PRD implantada / reset.
