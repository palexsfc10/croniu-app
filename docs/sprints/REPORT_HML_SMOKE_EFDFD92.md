# Smoke HML — `efdfd92` — persistência, duplicata e `ends_on`

**SHA HML:** `efdfd92dd6492a8b1bca128e77de087ebd765609`  
**Playwright:** `apps/web/e2e/hml-smoke-final.spec.ts` contra `https://croniu-hml.ntws.cloud` — **1 passed (36.4s)**  
**Prints:** `apps/web/e2e/artifacts/hml-smoke/` (21 PNGs)  
**Banco:** não limpo.

## Semântica de `ends_on` (contrato existente)

**Geração, guarda e portal: exclusivo (meio-aberto `[starts_on, ends_on)`).**

| Superfície | Contrato |
|---|---|
| `enumerate_lesson_dates` / `build_occurrences` | `while current < ends_on` |
| `compute_renewal_on` | data exclusiva de renovação = start + 1 mês calendário |
| `cycle_guard` overlap | `starts_on < other.ends_on && other.starts_on < ends_on` |
| Sequencial | `novo.starts_on == anterior.ends_on` **permitido** |
| Portal Meu Ciclo | `starts_on <= today < ends_on` |
| Preview Web | “até **antes de** {ends_on}”; renovação = `ends_on` |

**Prova HML (SQL, ciclos 17/08→17/09 ativos):** `lessons_on_ends_on = 0` em todos; última aula 14/09 ou 16/09, nunca 17/09.

Respostas:

1. Um ciclo “17 ago. a 17 set.” na lista **não** gera aula em 17/09.  
2. Gerador: **exclusivo**.  
3. Preparação/ficha (`_pick_cycle` / `selectDisplayCycle`): `ends_on >= today` — trata o último dia como “atual” **mesmo sem aula**.  
4. Portal: último dia **não** é vigente (`today < ends_on`).  
5. Recebível: vencimento padrão = `starts_on`; o período comercial persistido usa `ends_on` como renovação exclusiva.  
6. UI: preview correto (exclusivo). Listas/ficha usam `formatHumanDateRange` **inclusivo** (“17 ago. a 17 set.”) — divergência de apresentação, **não** da guarda.

A regra meio-aberta **não foi alterada**. Ciclo sequencial deve começar em `ends_on` (primeiro dia sem aula do ciclo anterior).

## Smoke UI (massa controlada, tenant novo)

- Anamnese analisada persiste após navegar, reload e logout/login; botão não reaparece.  
- Avaliação/Plano/Rotina: NA e Fazer depois persistem após reload e relogin.  
- `DUPLICATE_CYCLE` 409 + “Ver ciclo existente”; 1 ciclo / 1 recebível.  
- `OVERLAPPING_CYCLE` 409 + “Ajustar período”; sem side effect.  
- Sequencial `starts_on = ends_on` → 201, segundo ciclo+recebível.  
- Serviço diferente no mesmo período, horário distinto → 201.  
- Conflito de agenda 409 visual, formulário preservado, zero ciclo extra; ajuste de horário → 201.  
- Ficha, preparação, Ciclos, Agenda, Hoje, IA após criação; Admin loopback HTTP 200.

## Residual

Listas ainda mostram intervalo inclusivo. Murilo (`fc819693` canônico, `c11d129d` duplicata) permanece até reset controlado.
