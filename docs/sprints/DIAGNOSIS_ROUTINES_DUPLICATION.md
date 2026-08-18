# Diagnóstico — duplicação de ocorrências de Rotinas

Data: 2026-08-18
SHA-base: `7f762e23484fa4570f12f679c30d3da19ffa4eaf` (origin/main após PR #17)
Branch de trabalho: `fix/routines-occurrence-model-and-ux`

## Causa raiz A (catastrófica) — recorrência `once` sem âncora persistida

`backend/app/services/recurrence.py::next_after`:

```python
starts = spec.get("starts_on")
start = date.fromisoformat(starts) if starts else after   # sem starts_on: start == after
...
if kind == "once":
    day = start if start >= after else None
    return clamp(day)
```

Nenhum ponto do fluxo de criação (`routines.py::create_routine`) ou de resolução do
disparo (`routine_occurrences.py::validate_trigger`) persiste `starts_on` em
`filter_json` para rotinas de gatilho `calendar`. Sem `starts_on`, `start` vira
sempre igual a `after` — ou seja, o dia perguntado sempre "bate" com o único dia
da rotina `once`.

Isso por si só não duplicaria (uma leitura pontual devolve exatamente o dia
perguntado). O problema é o **loop de materialização**,
`routine_occurrences.py::_calendar_dues`:

```python
cursor = rec_svc.next_after(task.recurrence, spec, weekday=task.weekday, after=range_start)
while cursor is not None and cursor <= range_end and guard < 400:
    dues.append(cursor)
    nxt = rec_svc.advance(task.recurrence, spec, weekday=task.weekday, from_day=cursor)
    if nxt is None or nxt <= cursor:
        break
    cursor = nxt
    guard += 1
```

`advance()` chama `next_after(after=from_day + 1)`. Sem `starts_on`, `start`
volta a copiar `after` (`from_day + 1`) — então `nxt = from_day + 1` **sempre**,
nunca `None`. O loop nunca quebra por essa via; ele avança **um dia por
iteração** até `range_end` (ou 400 iterações).

`pendencies.py::board()` chama `materialize_org()` a cada leitura (Hoje, Agenda,
Rotinas, IA), com janela `range_start=today-14, range_end=today+1` — **15 dias**.
Resultado: uma rotina `once` sem `starts_on` gera **uma ocorrência nova por dia**
dentro da janela, toda vez que qualquer tela é aberta, e a janela desliza para
frente a cada dia — a rotina nunca para de gerar ocorrências.

Isso reproduz exatamente: *"rotina apresentada como única vez gerou ocorrências
em vários dias consecutivos"* e o caso *"Conferir acompanhamento aa199207"*.

## Causa raiz B — rotinas de calendário não têm fan-out por cliente elegível

`_matching_cycles()` resolve `audience` (`all_active` / `this_client` / `service`
/ `selected`) **somente** para o gatilho `cycle_lifecycle`. Para o gatilho
`calendar` (usado por todos os templates de sugestão: "Revisar plano", "Pedir
feedback", "Realizar avaliação"), `ensure_routine_occurrences` só olha
`spec.get("client_id")` — um único cliente opcional. Sem esse campo, a
ocorrência é criada com `client_id=None`, uma **única ocorrência "geral"**,
mesmo que a intenção do produto seja "uma ocorrência por aluno elegível".

Combinado com a causa raiz A (quando a rotina é semanal/mensal e a janela de
15 dias contém mais de uma data de vencimento), isso produz o padrão relatado:
*"11 ocorrências · 0 clientes"* e *"Revisar plano"/"Realizar avaliação"
duplicadas* — todas com `client_id=None`, sem isolar por aluno.

## Causa raiz C — nenhuma trava de "no máximo uma ocorrência aberta"

Mesmo corrigindo A e B, o serviço não verifica se **já existe uma ocorrência
aberta** para a mesma combinação (rotina, alvo) antes de materializar a
próxima data da recorrência. Uma rotina semanal não concluída por 3 semanas
materializaria 3 linhas abertas (uma por vencimento dentro da janela), em vez
de manter uma única ocorrência aberta que se torna "atrasada" com o tempo.

## Entidades envolvidas

- `RecurringClientTask` (`recurring_client_tasks`) — definição da regra.
- `OperationalOccurrence` (`operational_occurrences`) — instância materializada,
  única fonte lida por Hoje, Agenda, Rotinas e IA (`pendencies.board()` /
  `agent/tools.py`).
- Constraint existente: `uq_op_occ_org_idem` = `UNIQUE(organization_id, idempotency_key)`,
  instituída em `0021_plan_cadence`. **Não precisa mudar de forma** — a chave
  lógica muda de significado (deixa de incluir `due_on` cru para rotinas
  recorrentes; ver seção "Modelo" no relatório final).

## Impacto

- Alto volume de linhas “lixo” em `operational_occurrences` para rotinas
  `once` antigas (uma por dia desde a criação) e para rotinas de calendário
  sem fan-out (uma por período vencido).
- Nenhuma perda de dados: ocorrências concluídas (`status=completed`)
  preservam histórico legítimo e não são tocadas pelo reparo.
- HML e PRD podem ter duplicações; PRD **não será alterada** nesta tarefa.

## Estratégia de compatibilidade

- Sem migration estrutural: `filter_json` (JSONB livre) já comporta
  `audience`/`client_ids` para o gatilho `calendar`, no mesmo padrão já usado
  por `cycle_lifecycle`. Sem DDL novo.
- Correção é 100% na camada de serviço (`recurrence.py`, `routine_occurrences.py`,
  `routines.py`). `idempotency_key` mantém o formato, mas passa a ser
  computada a partir de uma âncora estável (não mais "devolve o dia perguntado").
- Reparo de dados existentes: script auditável, idempotente, sem `DELETE`
  (cancela/arquiva excedentes preservando histórico). Executado manualmente em
  HML durante a validação desta tarefa — não embutido em `alembic upgrade`.
