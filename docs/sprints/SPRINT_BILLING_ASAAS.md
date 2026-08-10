# Sprint — Billing Asaas (hosted checkout)

**Status:** `AUTORIZADA`  
**Branch:** `feature/billing-asaas-hosted`  
**Referência:** Kyvora `C:\kyvora` (HEAD billing hardened `d4317f1`+) — somente leitura  
**Migration head base:** `0011_renewal_whatsapp` → `0012_billing_asaas`

## Objetivo

Cobrança SaaS do Croniu: trial 7 dias, checkout hospedado Asaas recorrente (R$ 29,90/mês), webhooks idempotentes, entitlement, discriminação de checkout abandonado. Conta/credenciais/webhook **próprios** do Croniu.

## Fora de escopo

- Alterar Kyvora  
- Stripe  
- Cancelamento autosserviço avançado (fase 2)  
- Misturar com Pix do aluno (`OrganizationPaymentSettings`)  
- Deploy produção com cartão liberado sem HML verde  

## Regras críticas (portadas do Kyvora)

1. Callback de sucesso do browser **nunca** prova pagamento.  
2. Checkout `ACTIVE` sem pagamento confirmado ≠ liberação.  
3. Trial nasce com `payment_status=none`.  
4. Entitlement é SSOT de acesso pós-trial.  
5. `BILLING_CARD_ENABLED=false` até HML sandbox validado.  

## Entregáveis

- Pacote `backend/app/billing/`  
- Models + migration `0012`  
- `GET/POST /api/v1/billing/*` + webhook  
- Trial no register  
- UI Next: billing + return poll + gate pós-trial  
- `.env.example` + artefatos HML  

## Homologação

Local + HML Jarvis com Asaas **sandbox Croniu** (não reusar evidência Kyvora).

Checklist e smokes: [`EVIDENCE_BILLING_HML.md`](./EVIDENCE_BILLING_HML.md) · artefatos em `deploy/hml/`.

## UI (Next)

| Rota | Função |
|------|--------|
| `/app/billing` | Status + formulário checkout (se `card_enabled`) |
| `/app/billing/return/[mode]` | Poll entitlement 4s/90s (`success` ≠ pago) |
| `/app/trial-expired` | Gate pós-trial |
| Mais → Assinatura | Entrada na UX |

`BillingGate` no AppShell; portal público `/c/{token}` fora do layout autenticado.
