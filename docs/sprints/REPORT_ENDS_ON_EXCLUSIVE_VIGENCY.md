# Exclusive `ends_on` vigency — resolvers and copy

**Branch:** `feature/client-intake-journey`  
**Base smoke aceito:** `efdfd92`  
**Não mergeado. Sem Promote. Banco HML não limpo neste passo.**

## Contrato

`ends_on` permanece exclusivo (não muda valor persistido).

Vigência canônica: `starts_on <= today < ends_on`

| Estado | Condição |
|---|---|
| Atual / vigente | `starts_on <= today AND today < ends_on` |
| Próximo | `starts_on > today` |
| Encerrado (por data) | `ends_on <= today` |

Não alterados: gerador de aulas, guarda de sobreposição, regra sequencial, vencimento do recebível, atomicidade.

## Código

Fonte única: `backend/app/services/cycle_period.py` e `apps/web/src/lib/cycle-period.ts` + copy em `date-format.ts` (`lastInclusiveIso` civil, não UTC).

Resolvedores alinhados: ficha (`selectDisplayCycle`), preparação (`pick_operational_cycle`), portal (`select_relevant_cycle` prioriza vigente), Hoje (`is_current` / `is_elapsed`), IA (`get_client_cycle_status` / overview — um ciclo operacional), lista (bucket `ends_on <= today` → Encerrados).

Copy humana: último dia inclusivo + “Renovação em {ends_on}”. Formulário: “Data de renovação” no preview; helper de vigência até o dia anterior.

## Testes

Relógio controlado (`org_local_today` / `_today` / `ToolContext.today`).

Par 17/08–17/09 e 17/09–17/10:

- 16/09: anterior atual; seguinte próximo; portal/ficha/prep/IA no anterior.
- 17/09: anterior encerrado; seguinte atual; nenhum resolvedor devolve ambos.
- 17/10: seguinte encerrado.

Também: virada de mês/ano, bissexto, intervalo de 1 dia, legado exclusivo, buckets da lista.

## Gates locais

- backend pytest completo: **307 passed**
- web lint, typecheck, vitest: **149 passed**
- admin: sem mudança de vigência (eslint local indisponível neste worktree)

## HML

Deploy do SHA deste commit após backup. Reset integral de HML **não** executado aqui — fica para o passo seguinte, depois de comprovada a fronteira.
