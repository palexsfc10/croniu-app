# Sprint 2A — Clientes, ciclos e financeiro simples (local)

**Estado:** ENTREGUE (local)  
**Autorização histórica:** execução local concluída; sem Jarvis/HML/DNS.  
**Relatório oficial de entrega:** [`../SPRINT_2A_REPORT.md`](../SPRINT_2A_REPORT.md)

## Objetivo

Entregar domínio operacional mínimo: clientes, serviços, ciclos por período, recebimentos manuais, central Hoje acionável e renovação via WhatsApp manual — apenas em ambiente local.

## Contexto

Após fundação (auth, multi-tenant, admin leitura, identidade). Identidade wordmark homologada manualmente.

## Escopo (entregue)

- Clientes e serviços  
- Ciclos `mode=period`  
- Recebimentos manuais + mark-paid  
- Home `/home/summary` + UI Hoje  
- Ação prioritária e hint contextual  
- Prep `wa.me` + confirmação manual de contato  
- Métricas admin (clientes/ciclos)  
- Migration `0003_sprint2a_domain`  
- Seed `python -m app.cli.seed_demo`  
- Testes backend domínio + E2E Sprint 2A + artefatos  

## Fora do escopo (cumprido)

- Agenda / locais / Google Calendar  
- Ciclos session_count / hybrid / pause  
- Envio automático WhatsApp  
- Meu Ciclo público  
- HML / Jarvis / DNS / domínio / produção  
- Commit/push/PR obrigatório (repo ainda sem commits na auditoria 2A.1)

## Regras preservadas

Multi-tenancy; ciclo ≠ recebimento ≠ renovação; WhatsApp manual; FastAPI como fonte de regras.

## Migrations

`0003_sprint2a_domain` (head na entrega).

## Gates (conforme relatório + revalidação 2A.1)

- Backend: ruff + **21** pytest  
- Web/admin: lint, typecheck, testes, builds  
- E2E Sprint 2A  

## Critérios de aceite

Ver relatório 2A. Homologação visual do wordmark: manual (produto).

## Relatório

[`../SPRINT_2A_REPORT.md`](../SPRINT_2A_REPORT.md) · evidências `apps/web/e2e/artifacts/sprint2a/`
