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

| evt (prefixo) | tipo | status | org |
|---------------|------|--------|-----|
| `evt_37260be8159d4472` | `CHECKOUT_CREATED` | processed | `2346b5d7…` / `7ada96a9…` |
| `evt_884a48b028bcb7db` | `CHECKOUT_EXPIRED` | processed | `7ada96a9…` |
| `evt_05b708f961d739…` | `PAYMENT_CREATED` | processed | `2346b5d7…` |
| `evt_6561b631fa5580…` | `SUBSCRIPTION_CREATED` | processed | `2346b5d7…` |
| `evt_20f793f686aa47…` | `CHECKOUT_PAID` | processed | `2346b5d7…` |

Todos com `attempts=1`, `last_error` vazio, HTTP **200** devolvido ao Asaas.

Autenticação por header `asaas-access-token` comprovada em 2026-08-05T21:3xZ:
token inválido → **403**, ausência de token → **403**, e nenhuma das tentativas gravou evento.

Idempotência: retries de eventos sintéticos e reentregas → `duplicate` / sem efeito duplicado em checkout.
Nenhum `external_event_id` duplicado por provider (constraint `uq_billing_webhook_provider_event`).

## Pagamento UI hospedada — executado pelo operador

Org de teste: `2346b5d7…345a` (adicionada à allowlist HML em 2026-08-05T21:16Z;
allowlist passou de 2 para 3 entradas, `.env.hml` com backup e `chmod 600`,
somente `croniu-hml-api` recriado).

| Item | Status |
|------|--------|
| Checkout criado pela UI do Croniu | OK · host `sandbox.asaas.com` |
| Checkout mascarado | `2bc48615…445f` (local `e8b94806…`) |
| Retry reutiliza mesmo checkout | comprovado (tentativas anteriores, org `7ada96a9…`) |
| Automação Playwright | bloqueada por reCAPTCHA — pagamento feito **manualmente** pelo operador |
| Cartão de teste oficial Sandbox | usado na UI hospedada Asaas |
| Retorno ao Croniu | `/app/billing/return/success` |
| `CHECKOUT_PAID` real | recebido · checkout local → **`PAID`** · `paid_at=2026-08-05T21:29:32Z` |

### Estado financeiro real no Asaas (consulta ao vivo)

| Objeto | Valor |
|--------|-------|
| Assinatura `sub_mwoa…8s` | `ACTIVE` · `MONTHLY` · `CREDIT_CARD` |
| Primeira cobrança `pay_cmoj4o…` | **`PENDING`** · R$ 29,90 · vencimento **2026-08-12** |
| `confirmedDate` / `paymentDate` | `null` / `null` |

O cartão foi autorizado e a assinatura criada, mas **nenhum valor foi capturado**:
a primeira cobrança vence ao fim do trial de 7 dias.

### Entitlement resultante (org `2346b5d7…`)

| Campo | Valor |
|-------|-------|
| `billing_setup_status` | `subscription_prepared` |
| `payment_prepared` | `true` |
| `payment_status` | `pending` |
| `subscription_status` | `trial` (6 dias restantes) |
| `can_start_checkout` / `can_resume_checkout` | `false` / `false` |
| `can_cancel_subscription` | `true` |

**Conclusão:** o comportamento está correto. `PAID` de entitlement exige evidência
financeira (`PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`), que ainda não existe.
Checkout `PAID` ≠ pagamento capturado — a distinção foi preservada pelo código.

### Isolamento e logs

- Somente a org `2346b5d7…` mudou em 21:29:32Z; `7ada96a9…`, `b68db812…` e demais intactas.
- Log com `502` anterior ao checkout bem-sucedido, causa sanitizada e legítima:
  `"O CPF/CNPJ informado é inválido."` (primeira tentativa do operador).
- `payload_sanitized` grava `customerData: "[redacted]"`; nenhum dado de cartão persistido.

### Pendência aberta

Confirmar a cobrança `pay_cmoj4o…` no painel Asaas Sandbox para observar
`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` real → `payment_status=paid`.
Sem isso, a cadeia só fecha naturalmente em 2026-08-12.

Lacuna menor: `next_billing_at` fica `null` no entitlement enquanto o Asaas
informa `nextDueDate=2026-09-12` (sincronização a partir de `SUBSCRIPTION_CREATED`).

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
1. ~~pagamento Sandbox UI com cartão teste + reCAPTCHA~~ — **concluído** pelo operador em 2026-08-05T21:29Z;
2. ~~webhook real `CHECKOUT_PAID` → checkout `PAID`~~ — **concluído**;
3. **pendente:** evidência financeira real (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`) → `payment_status=paid`;
4. **pendente:** revalidação de idempotência sobre o evento de pagamento confirmado;
5. idealmente separar conta Asaas Croniu da que ainda lista webhook Kyvora interrompido.

**HML card on** permanece aceitável para continuar testes com allowlist.
