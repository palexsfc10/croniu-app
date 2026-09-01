# Sprint — Disponibilidade inteligente de horários

## Identificação

- Nome / ID: SMART_AVAILABILITY
- Branch: `feature/smart-availability-main` (worktree `croniu-smart-availability-main`), a partir de
  `origin/main` @ `ea95a4d`. Superde a tentativa inicial em `feature/smart-availability` (base antiga
  `release/croniu-prd-v1` @ `bc93e8d`, 189 commits atrás de `main`) — mantida intacta como referência/
  checkpoint de recuperação (commit `bf3b82e`), não usada para a entrega.
- Autor: Claude Code (execução autônoma sob instrução direta do operador)
- Data de criação: 2026-08-25

## Estado

- [x] AUTORIZADA
- [x] EM_ANDAMENTO

> Autorização: instrução direta e explícita do operador nesta sessão — prompt da tarefa especifica
> objetivo, restrições, escopo, modelo de dados, regras de cálculo, testes e critérios de aceite com o
> mesmo nível de detalhe de uma spec de sprint formal. Ver §Autorização abaixo. Registrado aqui — e
> apenas aqui — por exigência de `AGENTS.md` regra 1 ("não implementar roadmap, só sprint autorizada")
> e regra 9 ("parar diante de divergência, registrar em vez de silenciar"). `AGENTS.md` em si **não foi
> alterado** por esta sprint: a rastreabilidade da autorização vive inteiramente neste arquivo, sem
> editar a governança do repositório para autorizar a própria implementação.

## Objetivo

Profissionais configuram sua jornada de trabalho semanal e o Croniu calcula, de forma determinística e
só no backend, quais horários estão realmente livres — na tela de agenda e via assistente de IA — sem
nunca inventar horários nem substituir a checagem de conflito existente na criação de compromissos.

## Contexto

Ligação com `docs/AVAILABILITY.md` (documentação completa da regra) e com as regras existentes
`AGENDA-004` (conflito) e `AI-002` (IA reaproveita serviços de domínio) do catálogo de regras. Não há
sprint/PRODUCT_SPEC anterior cobrindo jornada de trabalho — é um módulo novo, aditivo.

## Escopo

- Migration `0026_availability_schedules` (tabela nova, por organização).
- Serviço `app/services/availability.py` (motor puro + orquestração).
- Endpoints `GET/PUT /availability/settings`, `GET /availability/day`, `GET /availability/range`.
- Tool de IA `get_available_slots` (`kind="read"`).
- Tela `/app/availability` (configuração) + integração em `/app/agenda` ("Ver horários livres") +
  prefill em `/app/appointments/new`.
- Testes automatizados (motor puro, API, tool, frontend).
- Deploy controlado em HML; produção **não** tocada.

## Fora do escopo

Múltiplos profissionais/`Location` por organização · bloqueios pontuais (folgas/feriados) ·
recorrência de disponibilidade (proposta técnica documentada, não implementada) · alteração de
`cycle_schedule.suggest_recurring_times` · painel admin · merge em `main` · deploy em produção.

## Regras de domínio afetadas

Nenhuma regra existente muda de comportamento — mudança puramente aditiva. `AGENDA-004` permanece a
única autoridade para criação de compromisso (o slot sugerido nunca é reserva). Nenhum `Appointment`,
`Cycle`, `Client` ou `Receivable` existente é lido de forma diferente ou alterado por esta entrega.

## UX

Sem alteração de wordmark ou navegação global; um item novo em `/app/profile` ("Seu trabalho") e uma
seção opt-in (checkbox) dentro da agenda existente. Mobile-first, reaproveitando os componentes de UI
já existentes (`TextField`, `Button`, `BackLink`).

## Segurança

Mesmo modelo de isolamento por `organization_id` do resto do sistema (nenhum filtro automático — 100%
por parâmetro explícito nos serviços, testado). `PUT /availability/settings` exige `role in {owner,
admin}`, mesmo padrão de `update_organization_timezone`. Tool de IA é `kind="read"`, sem mutação
possível, contexto de tenant vindo exclusivamente da sessão autenticada (nunca do modelo de linguagem).

## Migrations

- [x] Sim — id: `0026_availability_schedules` (`down_revision = 0025_user_auth_identities`, head real de
  `origin/main` no momento da entrega)
Justificativa: nova tabela `availability_schedules`, aditiva, reversível (`downgrade` testado), sem
reescrita de dado existente, sem criação automática de jornada para organizações já existentes.

## Testes

- Backend: `backend/tests/test_availability.py` (motor puro, 23 casos), `test_availability_api.py`
  (API/isolamento/validação, 16 casos), `test_availability_tool.py` (tool de IA, 7 casos).
- Frontend: `apps/web/src/app/app/availability/page.test.tsx` (5 casos) + assert adicional em
  `profile/page.test.tsx`.
- Regressão: suíte completa `pytest` (backend) e `vitest`/`tsc`/`eslint`/`next build` (frontend) — ver
  relatório de entrega para a contagem e o resultado completo. A adição da migration exigiu
  atualizar 4 asserções pré-existentes de "head atual" em `test_migrations_intake.py` e a lista de
  constraints canônicas em `scripts/assert_canonical_constraints.py` e `.github/workflows/ci.yml` —
  manutenção esperada sempre que uma nova migration é adicionada, não uma mudança de comportamento.
- Verificação visual: smoke manual em navegador contra backend/DB reais (não apenas testes com mock),
  cobrindo configuração da jornada, badge "Configurado", estado não configurado, dia desativado,
  slots reais na agenda, prefill do novo compromisso e isolamento entre duas organizações distintas.

## Gates

- `cd backend && python -m pytest -q` → verde.
- `cd backend && alembic upgrade head` (contra Postgres limpo) → chain íntegra; `alembic downgrade -1`
  → reversível.
- `cd apps/web && npm run typecheck && npm run lint && npm test` → verde (lint: sem novos erros nos
  arquivos desta sprint; débito pré-existente em outros arquivos não é desta sprint).

## Critérios de aceite

Ver seção 25 da instrução original da tarefa (20 itens) — reproduzidos e verificados um a um no
relatório de entrega.

## Rollback

`alembic downgrade -1` remove a tabela (nenhum dado fora dela é tocado). Reverter os commits da branch
`feature/smart-availability-main` remove endpoints/tool/telas. Sem feature flag: a ausência de jornada
configurada já é o estado "desligado" — nenhuma ação adicional necessária para desativar em produção
(que nunca recebeu este código).

## Relatório

`docs/sprints/REPORT_SMART_AVAILABILITY.md` (a publicar ao final da entrega).

## Autorização

| Campo | Valor |
|-------|-------|
| Autorizado por | Operador (palexsfc10), via instrução direta e detalhada nesta sessão |
| Data | 2026-08-25 |
| Notas | Instrução funciona como spec formal (objetivo, restrições, modelo de dados, regras de cálculo, testes, critérios de aceite explícitos); tratada como autorização equivalente à marcação `AUTORIZADA` exigida por `AGENTS.md`. |
