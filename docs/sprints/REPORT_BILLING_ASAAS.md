# Report — Billing Asaas (port Kyvora → Croniu)

**Branch:** `feature/billing-asaas-hosted`  
**SHA base:** `6d7d2c7aa17ef36c89032438993c4af56c655e2e`  
**SHA tip:** `2681245bda50e29506581bfab7dc056fcb473ac3`  
**Commits billing:**
- `6b1f19f` — backend Asaas (migration 0012, entitlement, webhooks, tests)
- `d55a529` — Next billing UI, return poll, BillingGate
- `5eea824` — HML ops docs + evidências
- `34fdb39` / `bdfebf6` / `4254e5e` — tip pointers + evidência parcial
- `2681245` — fechamento homologação Sandbox (**tip**)

## Entregue

### Código
- Backend billing completo + trial no register  
- Frontend Assinatura / return / trial-expired / gate  
- Artefatos HML (`deploy/hml`) + ADR/sprint docs  

### HML Jarvis — cadeia completa comprovada
- Webhook `croniu` ativo; token validado (inválido/ausente → 403)  
- Eventos reais: `CHECKOUT_CREATED`, `CHECKOUT_EXPIRED`, `PAYMENT_CREATED`,
  `SUBSCRIPTION_CREATED`, `CHECKOUT_PAID`, **`PAYMENT_CONFIRMED`**  
- Pagamento UI hospedada (org `2346b5d7…`) · checkout `2bc48615…445f` → `PAID`  
- Cobrança confirmada no painel Sandbox → `PAYMENT_CONFIRMED` → `payment_status=confirmed`  
- Entitlement `billing_setup_status=paid` **somente após** o evento financeiro  
- Reenvio do mesmo evento → HTTP 200 · `status=duplicate` · sem efeitos colaterais  
- Restart api+web · persistência OK · health público 200 · Kyvora preservado  

### Distinção crítica preservada
| Evento | Checkout | Entitlement pago |
|--------|----------|------------------|
| Callback navegador | — | não |
| `CHECKOUT_PAID` | `PAID` | não (`subscription_prepared`) |
| `PAYMENT_CONFIRMED` | (já PAID) | **sim** (`paid` / `confirmed`) |

## Qualidade
- Backend: 131 passed  
- Frontend: 34 passed  
- Lint: limpo (warning img pré-existente)  
- Build Next: OK  

## Estado final HML
- `BILLING_CARD_ENABLED=true` **somente HML** + allowlist (3 orgs)  
- Produção e `main` **intocados**  
- Sem push nesta etapa  

## Recomendação

| Escopo | Decisão |
|--------|---------|
| Continuar testes HML | OK |
| **Preparar produção** | **GO** |
| Deploy / cutover produção | **não autorizado** nesta etapa |

Pendências pré-produção (não bloqueiam preparação): conta Asaas dedicada (sem webhook Kyvora),
sincronizar `next_billing_at`, limpar dirty tree não-billing em PR separado,
autorização explícita de deploy.

Detalhes: [`EVIDENCE_BILLING_HML.md`](./EVIDENCE_BILLING_HML.md).
