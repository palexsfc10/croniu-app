# Sprint 2D — Meu Ciclo, renovação e pagamento manual

**Estado:** ENTREGUE (local)  
**Branch:** `feature/sprint-2d-my-cycle-renewal`  
**SHA-base:** `3ee9248cdfd8c577aa7453c90ade250f8509c32b` (Sprint 2C.1 corrigida)  
**Autorizada em:** 2026-07-24  
**Migration:** `0007_sprint2d_my_cycle`

## Objetivo

Portal seguro do cliente do profissional (sem login): consultar ciclo, solicitar renovação e informar pagamento manual (Pix/link), com comprovante opcional e confirmação obrigatória do profissional.

## Escopo

- Token opaco + hash; link `/c/{token}`; API pública
- Gestão do link no detalhe do cliente
- Preferências de recebimento (Pix/link https)
- Solicitação de renovação (sem criar ciclo)
- Informe de pagamento + upload seguro opcional
- Confirmação/rejeição pelo profissional
- Integração Hoje (prioridade)
- Migration `0007`

## Fora do escopo

Login cliente · gateway · WhatsApp API · GCal · QR dinâmico · PDF · HML/prod · merge `main` · normalização `expected`/`received`

## Segurança

ADR-006 atualizado; ADRs 027–030 (token, renovação, pagamento informado, upload). Threat model no relatório.

## Critérios de aceite

Ver checklist da autorização da sprint (token, portal, renovação, pagamento, comprovante, Hoje, testes, gates).

## Relatório

`docs/reports/SPRINT_2D_REPORT.md`

## Rollback

`alembic downgrade -1`; reverter commit da branch.
