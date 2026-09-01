# Disponibilidade inteligente de horários

**Fonte única de cálculo:** backend `app/services/availability.py::compute_free_slots` (motor puro) e
`compute_day`/`compute_range` (orquestração + DB). Frontend e a IA nunca recalculam — só consomem
`GET /api/v1/availability/day` / `range` (UI) ou a tool `get_available_slots` (IA), que chama o mesmo
serviço. Migration `0026_availability_schedules`. Sprint: [`sprints/SPRINT_SMART_AVAILABILITY.md`](sprints/SPRINT_SMART_AVAILABILITY.md).

Status: **PARCIAL** — implementado e testado em HML; recorrência (§Recorrência) e produção estão fora
do escopo desta entrega.

---

## Objetivo

Responder com segurança "quais horários estão livres", derivando a resposta de uma jornada de trabalho
configurada explicitamente pelo profissional, nunca inventando horários. É aditivo: sem jornada
configurada, a agenda e todo o restante do produto continuam exatamente como eram antes desta entrega.

## Escopo: organização, não profissional

`Membership.role` só assume `"owner"` na prática hoje — não existe entidade "Profissional" separada de
`Organization` (ver `docs/business-rules/permissions-and-tenancy.md` §3.1). A jornada é escopada só por
`organization_id`, no mesmo padrão de `Location`/`Organization.timezone`. Se o produto vier a suportar
múltiplos profissionais por organização, este modelo precisará ganhar uma segunda dimensão (ex.:
`location_id` ou uma tabela `professionals`) — não implementado aqui por não haver, hoje, nenhum caminho
no sistema que crie uma segunda membership para a mesma organização.

## Modelo de dados

Tabela `availability_schedules` (uma linha por dia da semana 0=segunda…6=domingo, por organização):

| Campo | Tipo | Regra |
|---|---|---|
| `organization_id` | FK → organizations, CASCADE | escopo |
| `weekday` | smallint | 0–6, único por organização |
| `is_active` | bool | `false` = dia sem atendimento |
| `starts_time` / `ends_time` | time | `ends_time > starts_time` (CHECK) |
| `break_starts_time` / `break_ends_time` | time, opcional | ambos ou nenhum; dentro da jornada (CHECK) |
| `default_duration_minutes` | int | > 0 (CHECK) |

`PUT /availability/settings` exige os 7 dias no payload e substitui a semana inteira numa transação —
não existe atualização parcial, então não há risco de "apagar" um dia por omissão. Configurar a jornada
não cria, altera nem apaga nenhum `Appointment` existente.

## Regra de cálculo

```
disponibilidade = jornada configurada − intervalo − compromissos que ocupam agenda
```

1. **Sem nenhuma linha em `availability_schedules` para a organização** → `configured=false`, nunca
   `slots=[]` disfarçado de "dia livre". UI/IA orientam a configurar primeiro.
2. **Dia com `is_active=false`** → `configured=true`, `slots=[]`. Distinto do caso acima.
3. Compromissos que ocupam agenda: `status != "cancelled"` — mesmo critério de
   `agenda_svc.find_conflicts` (AGENDA-004), sem duplicar a regra. `scheduled`, `completed` e `no_show`
   bloqueiam o horário; `cancelled` libera.
4. Overlap semiaberto `[início, fim)`, idêntico ao resto da agenda.
5. **Passo de geração = duração do slot** (não configurável separadamente nesta versão). Documentado
   como limitação: um encaixe que exista fora dos limites do passo (ex.: 90 min de duração com passo de
   30 min encontraria alternativas que o passo=90 não encontra) não é sugerido. Ver exemplo no §8 da
   spec da sprint.
6. Horários com início já passado **no dia corrente** são excluídos da sugestão — nunca do histórico,
   nunca de compromissos já criados.
7. Jornada atravessando meia-noite (`ends_time <= starts_time`) é rejeitada na validação do payload —
   não suportado nesta versão.

## Precedência de duração

1. `duration_minutes` explícito na consulta (API `?duration_minutes=` ou tool `duration_minutes`).
2. `default_duration_minutes` configurado para aquele dia da semana.
3. Fallback interno de 60 minutos, usado só quando a jornada nem sequer está configurada (não afeta o
   resultado, já que nesse caso não há slots).

Não existe hoje vínculo entre a consulta de disponibilidade e um `Service` específico — se o produto
quiser priorizar a duração de um serviço no futuro, ela entraria entre os itens 1 e 2 acima.

## Timezone

`Organization.timezone` (IANA), convertido com a mesma função `local_dt` de `cycle_schedule.py` — sem
segunda implementação de conversão local↔UTC.

## Endpoints (`/api/v1`, autenticados, escopados por `auth.organization.id`)

| Endpoint | Método | Notas |
|---|---|---|
| `/availability/settings` | GET | `configured=false, days=[]` se nunca configurado |
| `/availability/settings` | PUT | `role in {owner, admin}`; payload = 7 dias completos |
| `/availability/day?day=` | GET | `duration_minutes` opcional; limite ±31 dias (mesmo de `/agenda/day`) |
| `/availability/range?start_date=&end_date=` | GET | limite de 31 dias de span; 400 `date_range_limited` se exceder |

## Tool de IA — `get_available_slots`

`kind="read"`, `requires_confirmation=false`, registrada em `app/agent/tools.py` junto das demais tools
de leitura. Recebe `starts_on` (obrigatório), `ends_on` opcional, `duration_minutes` opcional, `period`
opcional (`manha`/`tarde`/`noite`, filtro pós-cálculo por hora local). Chama exclusivamente
`availability_svc.compute_range` — nunca gera horário por conta própria. Quando `configured=false`, o
campo `note` orienta a IA a pedir para o usuário configurar a jornada em vez de inventar horários.
Distingue explicitamente jornada não configurada / dia sem atendimento / dia sem vagas / vagas reais,
igual ao motor.

A tool **não cria, altera nem cancela compromissos**. Um pedido de agendamento pelo usuário continua
usando o fluxo de confirmação já existente (`propose_create_appointment`/`propose_create_cycle`), que
revalida conflito no momento da gravação — o slot sugerido nunca é uma reserva.

## Frontend

- `/app/availability` — configuração da jornada semanal (fora do fluxo de cadastro/login). Salva sempre
  os 7 dias; botão "Aplicar segunda aos dias úteis" para preencher rápido.
- `/app/agenda` — checkbox "Ver horários livres" carrega `/availability/day` sob demanda (não em toda
  visita à agenda) e mostra os slots como chips clicáveis; cada um abre `/app/appointments/new` com
  `day`/`start`/`end` pré-preenchidos. A criação em si continua validando conflito normalmente — o slot
  visual não é garantia de reserva.
- Link de acesso em `/app/profile` → grupo "Seu trabalho" → "Horários de atendimento".

## Limitações conhecidas / fora do escopo desta entrega

- Um único profissional por organização (ver §Escopo).
- Sem bloqueios pontuais (folgas/feriados) — só jornada semanal recorrente.
- Sem disponibilidade por `Location` — uma jornada única cobre toda a organização.
- Passo de geração = duração (§Regra de cálculo item 5).
- `cycle_schedule.suggest_recurring_times` (usada na criação de ciclos recorrentes) continua com a
  janela hardcoded 06:00–22:00 — não foi migrada para usar a jornada real nesta entrega, para não
  ampliar o raio de mudança em um fluxo crítico já testado. Fica como melhoria futura natural.
- Recorrência de disponibilidade ("tenho vaga terças e quintas por 4 semanas?") não implementada — ver
  proposta técnica abaixo.

## Recorrência — proposta técnica (não implementada)

Dado um conjunto de datas geradas por `weekdays` + intervalo (reaproveitando
`cycle_schedule.enumerate_lesson_dates`), rodar `compute_day` para cada data e agregar
disponível/conflito por ocorrência — sem criar ciclo, sem persistir nada. Exigiria: um novo endpoint
(`GET /availability/recurring`) e uma tool de IA equivalente, ambos read-only, reaproveitando
`compute_free_slots`. Risco baixo (é composição do motor já existente), mas foi deixado fora desta
entrega para não misturar validação em dois eixos (jornada real + geração de ocorrências) na mesma
sprint. Rastreado como próximo passo em
[`sprints/SPRINT_SMART_AVAILABILITY.md`](sprints/SPRINT_SMART_AVAILABILITY.md).

## Validação em HML

Ver `sprints/SPRINT_SMART_AVAILABILITY.md` §Rollout e o relatório de entrega para o resultado do smoke
test executado.
