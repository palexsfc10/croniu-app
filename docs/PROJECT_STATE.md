# Croniu — Estado do projeto (auditoria)

## Atualização local — Admin premium (2026-09-04)

Nesta worktree, a base é `35ca1e6` (commit identificado na imagem do admin HML), branch `feature/admin-control-premium`.
A interface reaproveita `391d2de` e acrescenta visão geral orientada a pendências, navegação agrupada, busca global de organizações, listagens responsivas e pesquisa/paginação na URL.
Escopo e autorização: [SPRINT_ADMIN_CONTROL_PREMIUM.md](./sprints/SPRINT_ADMIN_CONTROL_PREMIUM.md).
Esta entrega não altera a versão implantada no HML. O retrato abaixo é histórico e não representa o HEAD desta worktree.

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
