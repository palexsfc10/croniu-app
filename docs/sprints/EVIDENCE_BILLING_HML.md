# Evidências HML — Billing Asaas Croniu

**Homologação UTC:** 2026-08-05T18:06Z → 2026-08-05T20:30Z  
**Branch:** `feature/billing-asaas-hosted`  
**SHA base:** `6d7d2c7`  
**SHA tip (commits billing):** `34fdb39`  

## Hostnames

| Serviço | URL |
|---------|-----|
| Web | https://croniu-hml.ntws.cloud |
| API | https://api-croniu-hml.ntws.cloud |
| Webhook | https://api-croniu-hml.ntws.cloud/api/v1/billing/webhooks/asaas |

## Webhook Asaas Sandbox

| Item | Status |
|------|--------|
| Webhook nome `croniu` | cadastrado · `enabled=true` · `interrupted=false` |
| URL | aponta para API HML Croniu |
| authToken | o mesmo de `ASAAS_WEBHOOK_TOKEN` no `.env.hml` (não alterado / não impresso) |
| Eventos | PAYMENT_* + **CHECKOUT_*** + **SUBSCRIPTION_*** (lista completada em 2026-08-05) |
| Webhook `kyvora` na mesma conta | presente · **interrupted=true** · **não alterado** |

### Eventos reais recebidos (IDs mascarados)

| evt (prefixo) | tipo | status |
|---------------|------|--------|
| `evt_37260be8159d4472` | `CHECKOUT_CREATED` | processed |
| `evt_884a48b028bcb7db` | `CHECKOUT_EXPIRED` | processed |

Autenticação por header `asaas-access-token` comprovada (token inválido → 403; token válido → 200).

Idempotência: retries de eventos sintéticos e reentregas → `duplicate` / sem efeito duplicado em checkout.

## Pagamento UI hospedada

| Item | Status |
|------|--------|
| Checkout sandbox criado | OK · host `sandbox.asaas.com` · retry reutiliza mesmo `checkout_id` |
| Checkout mascarado (último ativo) | `bbb2c756…2dd3` (org `7ada96a9…`) |
| Setup pré-pagamento | `checkout_pending` · `payment_status=none` · access por trial |
| Automação Playwright | **bloqueada por reCAPTCHA** (“Tente novamente e verifique o recaptcha”) |
| Pagamento cartão teste 4444… pela UI | **PENDENTE operador** (ação humana no captcha) |
| `CHECKOUT_PAID` / entitlement pago | **ainda não** — aguarda pagamento UI |

### Instruções ao operador (pagamento)

1. DNS: use `1.1.1.1` se `*.ntws.cloud` não resolver.  
2. Login: https://croniu-hml.ntws.cloud/login  
   - e-mail: `uipay_1785957006@example.com`  
   - senha: `SenhaForte1!`  
3. Ou abra o checkout Asaas:  
   `https://sandbox.asaas.com/checkoutSession/show/3b5b879f-bf8e-4d5d-ba65-545533cc9b9a`  
4. Cartão oficial Sandbox: `4444 4444 4444 4444` · validade futura · CCV `123` · titular fictício.  
5. Completar reCAPTCHA manualmente e pagar.  
6. Validar retorno `/app/billing/return/success` (poll ≠ pago até webhook).

## Já comprovado (card-off / infra)

- Trial 7d, gate `/app/trial-expired`, portal `/c/{token}` fora do gate  
- Multi-tenant, restart/persistência, Kyvora/Samba/UniFi preservados  
- Backup `croniu_hml_20260805T185611Z.sql.gz`  
- Alembic `0012_billing_asaas`  
- `BILLING_CARD_ENABLED=true` em HML + allowlist  

## Suítes locais (pós-commits)

| Check | Resultado |
|-------|-----------|
| Pytest backend completo | **131 passed** |
| Vitest web | **34 passed** |
| ESLint | 0 errors (1 warning pré-existente brand-mark) |
| `tsc --noEmit` + `next build` | OK · rotas `/app/billing*` e `/app/trial-expired` presentes |

## Recomendação (neste momento)

**NO-GO para preparar produção** até:
1. pagamento Sandbox UI com cartão teste + reCAPTCHA concluído pelo operador;
2. webhook real `CHECKOUT_PAID` (ou payment+subscription) → checkout `PAID` → entitlement coerente;
3. revalidação de idempotência no evento de pagamento;
4. idealmente separar conta Asaas Croniu da que ainda lista webhook Kyvora interrompido.

**HML card on** permanece aceitável para continuar testes com allowlist.
