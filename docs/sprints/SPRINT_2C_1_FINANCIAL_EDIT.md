# Sprint 2C.1 — Fechamento da edição financeira de ciclos

**Estado:** ENTREGUE (local)  
**Branch:** `feature/sprint-2c1-cycle-financial-edit`  
**SHA-base:** `545148029442d89c08834195e30535dd06c93bfe` (Sprint 2C)  
**Autorizada em:** 2026-07-24  
**Migration:** nenhuma (mantém `0006_sprint2c_cycle_intelligence`)

## Objetivo

Expor na UI a edição financeira do ciclo (desconto/ajuste/valor final) já suportada pelo domínio, com respeito ao recebimento e aviso de que a Agenda não sincroniza (ADR-024).

## Escopo entregue

- Página `/app/cycles/[cycleId]/financial` — “Editar valores”
- Endpoint dedicado `PATCH /api/v1/cycles/{id}/financial`
- Bloqueio se pagamento confirmado (`received`/`paid`) — HTTP 409 `payment_confirmed`
- Snapshot unitário imutável neste fluxo
- Prévia local + autoridade do backend
- Testes mensais 28–31 / fev / ano; FE; E2E (3 cenários)
- Warning RHF `watch`: eliminado (fluxo antigo sem `watch()`)

## Fora do escopo

Sync agenda · GCal · Meu Ciclo · gateway · migration nova · merge `main` · normalização `expected`/`received`

## Rollback

Reverter commit da branch; sem migration.

## Relatório

[`../reports/SPRINT_2C_1_REPORT.md`](../reports/SPRINT_2C_1_REPORT.md)
