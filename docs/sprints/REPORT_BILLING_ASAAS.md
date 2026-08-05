# Report — Billing Asaas (port Kyvora → Croniu)

**Branch:** `feature/billing-asaas-hosted`  
**SHA base:** `6d7d2c7aa17ef36c89032438993c4af56c655e2e`  
**Commits billing:**
- `6b1f19f` — backend Asaas (migration 0012, entitlement, webhooks, tests)
- `d55a529` — Next billing UI, return poll, BillingGate
- `5eea824` — HML ops docs + evidências (**tip**)

## Entregue

### Código
- Backend billing completo + trial no register  
- Frontend Assinatura / return / trial-expired / gate  
- Artefatos HML (`deploy/hml`) + ADR/sprint docs  

### HML Jarvis
- Hostnames `*.ntws.cloud` via tunnel dedicado Croniu  
- Webhook Asaas `croniu` ativo; eventos reais `CHECKOUT_CREATED` / `CHECKOUT_EXPIRED` recebidos  
- Checkout sandbox + allowlist; card enabled só HML  
- Pagamento UI: **pendente** (reCAPTCHA impede automação)

## Qualidade
- Backend: 131 passed  
- Frontend: 34 passed  
- Lint: limpo (warning img pré-existente)  
- Build Next: OK  

## Recomendação

| Escopo | Decisão |
|--------|---------|
| Continuar testes HML com cartão + allowlist | OK |
| Preparar produção | **NO-GO** até pagamento UI real + `CHECKOUT_PAID` + evidência entitlement |

Detalhes: [`EVIDENCE_BILLING_HML.md`](./EVIDENCE_BILLING_HML.md).
