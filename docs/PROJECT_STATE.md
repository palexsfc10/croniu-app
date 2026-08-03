# Croniu — Estado do projeto (auditoria)

**Data da auditoria:** 2026-08-02 (avaliações + fundação do agente)  
**Este documento descreve o que existe hoje**, não o ideal.

## Git

| Item | Valor |
|------|-------|
| Branch | `feature/client-evaluations-and-agent-foundation` |
| SHA-base | `dcc1e664d0759e9a76da5a4a86449e19b1343aab` |
| Remoto | Não assumir push sem autorização |
| Merge em `main` | Não |

## Migration

- **Head:** `0009_agent_foundation` (após `0008_client_evaluations` → `0007_sprint2d_my_cycle`)

## Funcionalidades reais (acréscimo)

- Avaliações/evolução do cliente (rascunho/publicação; portal só publicadas; `private_notes` nunca público)
- Fundação do assistente LLM (`AI_ENABLED=false` por padrão; tools allowlisted; confirmação para escrita)

Detalhes: [`CLIENT_EVALS_AND_AGENT.md`](./CLIENT_EVALS_AND_AGENT.md), ADR-032/033 em [`DECISIONS.md`](./DECISIONS.md).

## Limitações conscientes

- Rate limit público e de IA in-process (não distribuído)
- Storage de comprovante local (`PROOF_STORAGE_DIR`)
- Sem gateway / WhatsApp API / GCal / voz
- Agente: uma mutação controlada (rascunho de avaliação)

## Débitos

Ver roadmap e sprint docs.
