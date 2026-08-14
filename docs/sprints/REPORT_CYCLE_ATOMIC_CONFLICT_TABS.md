# Relatório — criação atômica de ciclo, conflitos e abas da ficha

**Branch:** `feature/client-intake-journey`  
**PR:** não mergeado; HML somente após CI verde.  
**Alembic:** sem migration nova (head permanece `0022_form_template_pin`).

## 1. Reprodução (local)

1. Cliente sem ciclo + compromissos nos slots do modelo 2x/semana.
2. `POST /api/v1/cycles/intelligent` com `generate_appointments=true`.
3. HTTP **409** `SCHEDULE_CONFLICT`.
4. `GET /cycles` e `GET /receivables` vazios; agenda só com o bloqueio original.
5. Retry com a mesma idempotency key → 409 de novo (chave não marcada como sucesso).
6. Retry com horário livre e chave nova → 201, um ciclo, um recebível, aulas materializadas.

## 2. Causa raiz

O POST inteligente **já validava conflitos antes de persistir** (não era commit do ciclo + falha da agenda). O teste HML combina três efeitos:

1. **UX:** 409 mapeado para “Não foi possível adicionar as aulas à agenda” + lista longa; Voltar devolve à preparação (checklist continua pendente — correto).
2. **Consultas divergentes:** a ficha usava qualquer `status=active` (inclui início futuro). A lista global “em andamento” exigia `starts_on <= hoje`, então um ciclo futuro (ou a ausência de ciclo) parecia “nenhum ciclo” na lista e “já tem ciclo” na ficha.
3. **Idempotência:** chave só era gravada no flush do ciclo. Conflito não gravava chave. Se existisse ciclo ativo sem a quantidade de aulas, o replay tratava como sucesso — agora cancela o incompleto e libera a chave.

Não houve prova de commit parcial no código atual do POST `/cycles/intelligent`. `POST /cycles` legado ainda cria ciclo+recebível **sem** agenda; a Web do fluxo “Preparar” usa `/intelligent`.

## 3. Transaction boundary anterior

Validação de conflito → (se ok) `add cycle` → `flush` → recebível → appointments → `commit`.  
`get_db` só fazia `close()` (rollback implícito no close).  
`agenda_incomplete` no caminho inteligente **não** dava `rollback()` explícito antes do raise.

## 4. Transaction boundary final

Conflito **antes** de criar entidades → `SCHEDULE_CONFLICT` sem flush de ciclo.  
Persistência: cycle + receivable + appointments + (renovação) → `flush` → revalidação com `exclude_cycle_id` e `FOR UPDATE` no Postgres → `commit`.  
Qualquer `AuthError` nos POST de ciclos faz `db.rollback()`. `get_db` faz rollback em exceção.  
`agenda_incomplete` dá rollback explícito.

## 5–10. HML (Murilo)

**Não alterado nesta rodada de código.** Investigação read-only e reconciliação só após backup + CI verde + SHA implantado. IDs não listados aqui (PII).

Perguntas de domínio (código):

| # | Resposta |
|---|----------|
| Ciclo persistido em conflito? | Não, no contrato atual. |
| Status incompleto? | Não há `draft`. Incompleto = active com menos aulas que `lesson_count`. |
| Lista global filtra futuro? | Sim, antes desta correção. |
| Ficha outro critério? | Sim: `status=active` ou `cycles[0]`. Agora `selectDisplayCycle`. |
| Idempotência de falha? | Conflito não grava chave; incompleto é cancelado e a chave é anulada. |

## 11. Cache

Sem optimistic update de sucesso. `router.replace` só após 201. Sem correção via cache.

## 12–15. Correções

**Backend:** `SCHEDULE_CONFLICT` estruturado; rollback; lock Postgres; replay incompleto; retry após conflito.

**Web:** alerta recolhível; permanece no passo 4; “Ajustar dias e horários”; abas em grid `1fr / 1.45fr / 1fr`; `role=tablist`; `?tab=` preservado.

## 16–19. Testes

- `test_generate_appointments_atomic_conflict` + retry mesma key + criação após mudar horário.
- `cycle-period.test.ts` alinhamento ficha/lista.
- Testes de agenda standalone continuam `appointment_conflict`.

## 20–26. HML / CI

Pendente: CI, backup timestamped, SHA HML, smoke. Sem merge, sem PRD, sem Promote.

## 27. Riscos

- Ciclo legado `POST /cycles` ainda sem agenda.
- Revalidação in-transaction não cobre 100% de corrida em SQLite de teste.
- Reconciliação Murilo ainda não executada.

## 28. Pendente

Implantar HML, backup, lookup sanitizado, smoke conflito + sucesso.

## 29. Validação recomendada

Repetir o fluxo da ficha em 320–412px; conflito; permanecer no form; lista Ciclos e ficha iguais; criar após ajustar horário.

**Veredito pretendido (após HML):**  
CYCLE CREATION ATOMIC — SCHEDULE CONFLICTS VALIDATED BEFORE PERSISTENCE — NO PARTIAL CYCLE OR RECEIVABLE — FAILED ATTEMPTS RETRYABLE — CLIENT VIEW, PREPARATION AND CYCLE LIST CONSISTENT — MOBILE TABS FIXED — HML READY FOR REGRESSION REVIEW
