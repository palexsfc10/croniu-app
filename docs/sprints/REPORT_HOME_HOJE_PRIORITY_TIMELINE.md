# Relatório — Home Hoje: prioridade + timeline

**Branch:** `feature/home-hoje-priority-timeline`  
**Worktree:** `c:\projetos\croniu-home-hoje`  
**SHA-base:** `bfa3a8959b56079c703ffacfd4b723d5a7a9e6a6`  
**Data:** 2026-08-05  
**Migration:** nenhuma (head inalterado)

## 1. Diagnóstico

A home-daily-focus já removia ContextualBar/hint e separava passados via `ends_at`, mas:

- prioridade ainda privilegiava compromissos (em andamento / 2h / próximo), repetindo a agenda;
- `upcoming_appointments` incluía em andamento (`ends_at > now`);
- card “organizado” grande podia aparecer sem necessidade.

## 2. Base escolhida

Tip limpo `bfa3a89` (billing homologado) contendo `home-daily-focus`. Árvore original dirty em `c:\projetos\croniu` **não tocada**.

Restauração mínima de `support.ts` e `evolution-entry.tsx`: o tip já importava esses módulos sem versioná-los — necessário para gates do web.

## 3. Regra canônica

Documentada em [`docs/HOME_PRIORITY.md`](../HOME_PRIORITY.md); seleção só no backend (`select_home_priority` / `classify_today_appointments`).

Ordem: cobrança relevante → ciclo encerrado sem renovação → pedido de renovação → ciclo nearing → conflito / desfecho / demais recebíveis.  
**Compromissos nunca são `priority_action`.**

## 4. Entrega

| Área | Mudança |
|------|---------|
| Backend | Split temporal; `in_progress_appointments`; `cycles_ended_unrenewed`; dedupe atenção vs prioridade |
| Frontend | TodayBoard: saudação serifada, timeline compacta, prioridade compacta ou linha “Tudo em dia”, slot UI `appointment_awaiting_confirmation` sem emissão |
| Docs | HOME_PRIORITY, sprint, DOMAIN_RULES, UX_UI |

## 5. Testes / gates

| Gate | Resultado |
|------|-----------|
| Backend pytest completo | **136 passed** |
| Web vitest | **36 passed** |
| lint | 0 errors (warning prévio `no-img-element`) |
| tsc / `next build` | OK |

## 6. Limitações

- Kind IA `appointment_awaiting_confirmation` não emitido (sem mock).
- Atividade “em andamento” depende de `starts_at`/`ends_at` persistidos.
- Homologação visual manual pendente.

## 7. GO / NO-GO

**GO condicional** para merge da branch após smoke visual Hoje (mobile/desktop).  
**NO-GO** deploy/produção/DNS nesta etapa.
