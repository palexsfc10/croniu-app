# Diagnóstico — rotinas na Agenda e ciclo na listagem

Data: 2026-08-14  
SHA-base: `4df952c7e43795f8e2c95520a65fa8adcebffd52`

## Bug 1 — Rotinas não aparecem na Agenda / Hoje

**Causa:** duas entidades desconectadas.

1. A definição vive em `recurring_client_tasks` (`next_run_on`, `recurrence`, `filter_json`).
2. Agenda e Hoje leem `operational_occurrences` via `GET /api/v1/routines/board`, materializado só a partir de **planos publicados** (`pendencies.materialize_protocol`).
3. Criar/concluir rotina **não** gera ocorrência operacional. O quadro fica vazio.
4. `GET /api/v1/agenda/day` lista **somente** `appointments`. Rotinas nunca entram na fonte do dia.
5. A UI da Agenda chama o board com `bucket=today` e ignora o dia selecionado.
6. `routines_due_today_count` no Hoje é sobrescrito pelo board vazio.

Rotina **não** deve virar `Appointment`. Fonte canônica da ação: `OperationalOccurrence` (idempotência `routine:{task_id}:{due_on}`), derivada da definição.

## Bug 2 — Ciclo da ficha some na tela global

**Causa:** o ciclo **é** persistido (por isso a Agenda tem aulas). A listagem global aplica filtros de UI que o escondem.

- `GET /api/v1/cycles` devolve todos os ciclos do tenant (sem paginação).
- A página `/app/cycles` inicia em bucket `active` **e** período `this_month`.
- Ciclo futuro cai em `upcoming`; ciclo cujo `ends_on` exclusivo já passou no calendário UTC do browser cai em `ended`.
- `today` inicial usa `Date.toISOString()` (UTC), não `America/Sao_Paulo`, até as preferências hidratarem.
- Não há refetch ao focar a aba. Uma entidade canônica (`cycles`) — não há segundo ciclo de jornada.

## Inventário de rotas

| Rota | Papel hoje | Destino |
|---|---|---|
| `/app` | Hoje | Seção “Suas ações de hoje” |
| `/app/agenda` | Compromissos | + ações da rotina do dia |
| `/app/clients` | Clientes | inalterado |
| `/app/cycles` | Nav “Ciclos” + lista filtrada | Visão **Renovações** (domínio ciclo permanece) |
| `/app/cycles/new`, `/app/cycles/[id]` | Criação/detalhe | inalterado; deep links válidos |
| `/app/routines` | Form vazio | Templates + barra principal |
| `/app/renewals` | Pedidos de renovação | Unificar na visão Renovações |
| `/app/profile` | Mais | Link “Ciclos e renovações” |

Nav: Hoje · Agenda · Clientes · **Rotinas** · Mais.

## Modelo / migration

Sem migration se:

- `trigger_type` e horário opcional em `filter_json`;
- `routine_id` em `operational_occurrences.meta`;
- link externo / MFIT em `protocols.content_json`.

Códigos de profissão antigos permanecem; UI de cadastro limita a 6 opções com alias.

## Compatibilidade

- `/app/cycles*` continua resolvendo.
- Ciclo continua existindo; só sai da barra.
- Plano externo não é integração.
- Isolamento por `organization_id` da sessão.
