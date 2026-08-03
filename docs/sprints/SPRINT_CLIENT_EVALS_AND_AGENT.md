# Sprint — Avaliações do cliente e fundação do agente LLM

## Identificação

- Nome / ID: `CLIENT_EVALS_AND_AGENT_FOUNDATION`
- Branch: `feature/client-evaluations-and-agent-foundation`
- Autor: CTO executor (autorização explícita na tarefa)
- Data de criação: 2026-08-02

## Estado

- [x] AUTORIZADA  
- [x] EM_ANDAMENTO  
- [x] ENTREGUE  

## Objetivo

1. Avaliações/evolução do cliente (rascunho/publicação; portal só vê publicadas; notas privadas nunca públicas).
2. Fundação segura do agente LLM (feature flag off por padrão; tools controladas; confirmação para escrita).

## Fora do escopo

Deploy · produção · merge `main` · Jarvis/HML · domínio · gateway · WhatsApp API · GCal · voz · notificações externas · exclusões irreversíveis críticas via agente.

## Migrations

- [x] `0008_client_evaluations`
- [x] `0009_agent_foundation`

## SHA-base

`dcc1e664d0759e9a76da5a4a86449e19b1343aab` (`pilot/pre-deploy-snapshot`)

## Docs

- `docs/CLIENT_EVALS_AND_AGENT.md`
- ADR-032 / ADR-033 em `docs/DECISIONS.md`
