# Sprint 2B — Agenda Core

**Estado:** AUTORIZADA · ENTREGUE (local)  
**Branch:** `feature/sprint-2b-agenda-core`  
**SHA-base:** `e77905da6f6665ad69225d2902e646fa824844bc` (`main`)  
**Autorizada em:** 2026-07-24  
**Migration:** `0005_sprint2b_agenda`  
**Relatório:** [`../reports/SPRINT_2B_REPORT.md`](../reports/SPRINT_2B_REPORT.md)

## Objetivo

Timezone da organização, locais, compromissos únicos, conflitos básicos, Agenda diária, Hoje com dados reais e próximo compromisso na barra contextual.

## Escopo

- Timezone IANA (`America/Sao_Paulo` default)
- Locais (ativo/arquivado)
- Compromissos únicos (CRUD + cancelamento + resultado)
- Conflito de sobreposição (bloqueio; override pendente)
- Agenda por dia + nav
- Hoje + barra contextual

## Fora do escopo

Recorrência · Google Calendar · Meu Ciclo · sync · WhatsApp automático · HML/produção · normalização receivable `expected`/`received`

## Critérios de aceite

Ver relatório `docs/reports/SPRINT_2B_REPORT.md` ao final.

## Rollback

`alembic downgrade 0004_password_reset` após backup local.
