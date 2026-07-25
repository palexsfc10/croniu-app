# Croniu — Estado do projeto (auditoria)

**Data da auditoria:** 2026-07-24 (Sprint 2D)  
**Este documento descreve o que existe hoje**, não o ideal.

## Git

| Item | Valor |
|------|-------|
| Branch | `feature/sprint-2d-my-cycle-renewal` |
| SHA-base 2C.1 | `3ee9248cdfd8c577aa7453c90ade250f8509c32b` |
| Remoto | Não configurado |
| Merge em `main` | Não |

## Migration

- **Head:** `0007_sprint2d_my_cycle`
- Cadeia até `0007` (Meu Ciclo / renovação / informes / comprovantes)

## Funcionalidades reais (acréscimo 2D)

Meu Ciclo público (`/c/{token}`), gestão de link no cliente, Pix/link em Preferências → Recebimentos, solicitação de renovação, informe de pagamento + comprovante opcional, confirmação profissional, categorias na Hoje.

## Testes (pós-2D)

| Suite | Resultado típico |
|-------|------------------|
| Backend pytest | **79+** |
| Web vitest | **20+** |
| E2E 2D | `e2e/sprint2d.spec.ts` |

## Limitações conscientes

- Rate limit público in-process (não distribuído)  
- Storage de comprovante local (`PROOF_STORAGE_DIR`) — produção exigirá volume  
- Sem gateway / WhatsApp API / GCal  
- Vocabulário receivable `received` mantido  

## Débitos

1. Vocabulário `expected`/`received`  
2. Sync agenda na edição (ADR-024)  
3. Override de conflito  
4. Object storage / backup de comprovantes em produção  
