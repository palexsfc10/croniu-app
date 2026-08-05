# Report — Billing Asaas (port Kyvora → Croniu)

**Branch:** `feature/billing-asaas-hosted`  
**SHA base:** `6d7d2c7aa17ef36c89032438993c4af56c655e2e`  
**Commits billing:**
- `6b1f19f` — backend Asaas (migration 0012, entitlement, webhooks, tests)
- `d55a529` — Next billing UI, return poll, BillingGate
- `5eea824` — HML ops docs + evidências
- `34fdb39` — tip SHAs no relatório (**tip**)

## Entregue

### Código
- Backend billing completo + trial no register  
- Frontend Assinatura / return / trial-expired / gate  
- Artefatos HML (`deploy/hml`) + ADR/sprint docs  

### HML Jarvis
- Hostnames `*.ntws.cloud` via tunnel dedicado Croniu  
- Webhook Asaas `croniu` ativo; token validado (inválido/ausente → 403)  
- Eventos reais recebidos: `CHECKOUT_CREATED`, `CHECKOUT_EXPIRED`, `PAYMENT_CREATED`,
  `SUBSCRIPTION_CREATED`, `CHECKOUT_PAID` — todos `processed`, HTTP 200  
- Checkout sandbox + allowlist (3 orgs); card enabled só HML  
- **Pagamento UI hospedada concluído** pelo operador em 2026-08-05T21:29Z ·
  checkout `2bc48615…445f` → **`PAID`**

### Pagamento vs entitlement
- Asaas: assinatura `ACTIVE`, primeira cobrança `PENDING` vencendo 2026-08-12, sem captura  
- Croniu: `billing_setup_status=subscription_prepared`, `payment_status=pending`, acesso por trial  
- Comportamento **correto**: checkout `PAID` não libera entitlement pago sem evidência financeira

## Qualidade
- Backend: 131 passed  
- Frontend: 34 passed  
- Lint: limpo (warning img pré-existente)  
- Build Next: OK  

## Recomendação

| Escopo | Decisão |
|--------|---------|
| Continuar testes HML com cartão + allowlist | OK |
| Preparar produção | **NO-GO** até `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` real → `payment_status=paid` + idempotência sobre esse evento |

Detalhes: [`EVIDENCE_BILLING_HML.md`](./EVIDENCE_BILLING_HML.md).
