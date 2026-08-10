# Sprint 2C — Serviços, modelos de ciclo e cálculo inteligente

**Estado:** AUTORIZADA · ENTREGUE (local)  
**Branch:** `feature/sprint-2c-cycle-intelligence`  
**SHA-base:** `b8ef0b980f54571328d716ea0424731449bca92b`  
**Autorizada em:** 2026-07-24  
**Migration:** `0006_sprint2c_cycle_intelligence`  
**Relatório:** [`../reports/SPRINT_2C_REPORT.md`](../reports/SPRINT_2C_REPORT.md)

## Objetivo

Núcleo comercial: serviço com valor por aula, modelos reutilizáveis de ciclo, criação personalizada com cálculo exato de aulas e financeiro, geração opcional de compromissos na agenda.

## Escopo

- Evoluir serviços (`default_duration_minutes` + preço em centavos)
- Modelos de ciclo (`calendar_months` / `fixed_days`)
- Ciclo inteligente (snapshot, weekdays, aulas, financeiro)
- Preview de cálculo no backend
- Geração opcional atômica de agenda
- Edição contratual/financeira (sem sync de agenda nesta sprint)
- Integração com recebimento existente (vocabulário atual)
- UI Mais → Serviços / Modelos; fluxo progressivo de ciclo
- Migration, testes, E2E, docs

## Fora do escopo

Google Calendar · Meu Ciclo · gateway/Pix · WhatsApp API · override de conflito · sync completa de agenda na edição · merge `main` · HML/produção · normalização `expected`/`received`

## Decisões

| Tema | Decisão |
|------|---------|
| Money | Integer cents (já existente) |
| `ends_on` inteligente | Renovação **exclusiva** |
| Ciclos legados | Campos novos nulos; UI marca legado; sem backfill falso |
| Edição × agenda | Sem sync de compromissos futuros nesta sprint (ADR) |
| Conflito na geração | Bloqueio total; rollback; sem override |

## Critérios de aceite

Ver `docs/reports/SPRINT_2C_REPORT.md` ao final.

## Rollback

`alembic downgrade 0005_sprint2b_agenda` após backup local.
