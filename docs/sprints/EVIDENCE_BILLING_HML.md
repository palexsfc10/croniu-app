# Evidências HML — Billing Asaas Croniu

**Homologação UTC:** 2026-08-05T18:06Z → 2026-08-05T21:45Z  
**Branch:** `feature/billing-asaas-hosted`  
**SHA base:** `6d7d2c7`  
**SHA tip (commits billing):** `2681245`  

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
| Eventos | PAYMENT_* + **CHECKOUT_*** + **SUBSCRIPTION_*** |
| Webhook `kyvora` na mesma conta | presente · **interrupted=true** · **não alterado** |

### Eventos reais recebidos (IDs mascarados)

| evt (prefixo) | tipo | status | org | quando (UTC) |
|---------------|------|--------|-----|--------------|
| `evt_37260be8159d…` | `CHECKOUT_CREATED` | processed | `2346b5d7…` / `7ada96a9…` | 21:29 / anteriores |
| `evt_884a48b028bc…` | `CHECKOUT_EXPIRED` | processed | `7ada96a9…` | anteriores |
| `evt_05b708f961d7…` | `PAYMENT_CREATED` | processed | `2346b5d7…` | 21:29:32 |
| `evt_6561b631fa55…` | `SUBSCRIPTION_CREATED` | processed | `2346b5d7…` | 21:29:32 |
| `evt_20f793f686aa…` | `CHECKOUT_PAID` | processed | `2346b5d7…` | 21:29:32 |
| `evt_15e444ff9b9a…` | **`PAYMENT_CONFIRMED`** | processed | `2346b5d7…` | **21:41:56** |

Todos com `attempts=1`, `last_error` vazio, HTTP **200** devolvido ao Asaas.

Autenticação `asaas-access-token`:
- token inválido → **403**
- ausência de token → **403**
- token válido (eventos reais + reenvio) → **200**
- tentativas inválidas não gravaram evento

## Pagamento UI hospedada (org `2346b5d7…345a`)

Org adicionada à allowlist HML em 21:16Z (3 entradas). Somente `croniu-hml-api` recriado.

| Item | Status |
|------|--------|
| Checkout pela UI Croniu | OK · `sandbox.asaas.com` |
| Checkout mascarado | `2bc48615…445f` (local `e8b94806…`) |
| Retry reutiliza mesmo checkout | comprovado (orgs anteriores) |
| Cartão teste oficial Sandbox | pago manualmente (reCAPTCHA) |
| Retorno navegador | `/app/billing/return/success` |
| `CHECKOUT_PAID` | checkout local → **`PAID`** · `paid_at=21:29:32Z` |

### Cadeia financeira (prova de liberação só após evidência)

| Momento UTC | Evidência | `payment_status` | `billing_setup_status` |
|-------------|-----------|------------------|------------------------|
| 21:29:32 | `CHECKOUT_PAID` real | `pending` | `subscription_prepared` |
| 21:41:56 | **`PAYMENT_CONFIRMED` real** (confirmação manual no painel) | **`confirmed`** | **`paid`** |

Consulta Asaas ao vivo após confirmação: cobrança `pay_cmoj4o…` → `CONFIRMED`, `confirmedDate=2026-08-05`.

**Conclusão:** callback do navegador e `CHECKOUT_PAID` **não** liberaram entitlement pago.
Somente `PAYMENT_CONFIRMED` elevou `billing_setup_status` para `paid`.

### Entitlement final (org `2346b5d7…`)

| Campo | Valor |
|-------|-------|
| `billing_setup_status` | `paid` |
| `payment_status` | `confirmed` |
| `subscription_status` | `trial` (6 dias restantes · trial Asaas ativo) |
| `has_active_access` / `can_write` | `true` / `true` |
| `payment_prepared` | `false` |
| `can_start_checkout` | `false` |
| `can_cancel_subscription` | `true` |

### Idempotência do evento financeiro

Reenvio do mesmo `PAYMENT_CONFIRMED` real (`evt_15e444ff9b9a…`) com token válido:

| Item | Resultado |
|------|-----------|
| HTTP | **200** |
| Body | `{"status":"duplicate",…}` |
| Linhas do evento | permanece **1** |
| `attempts` | permanece **1** |
| `subscriptions.updated_at` | **inalterado** (21:41:56Z) |
| Orgs vizinhas | `7ada96a9…` / `b68db812…` intactas |

### Restart e persistência

Reiniciados somente `croniu-hml-api` e `croniu-hml-web` (db preservado).

Pós-restart:
- checkout `e8b94806…` → `PAID` com `paid_at`
- subscription → `payment_status=confirmed`
- entitlement → `billing_setup_status=paid`, `has_active_access=true`
- API `healthy` · `BILLING_CARD_ENABLED` / allowlist ativos
- Kyvora containers presentes · Samba/UniFi não tocados

### Healthcheck HML

`healthcheck.sh`: web/admin/api-health/openapi/manifest/register/me/anonymous/logout/session → **OK**.
Falhou no final com `KeyError: 'organization'` (script de health, não regressão de billing).
HTTP público: api=`200`, web=`200`.

### Isolamento e logs

- Somente org `2346b5d7…` afetada pelos eventos de pagamento
- Payload com `customerData: "[redacted]"`; sem dados de cartão
- Warning sanitizado pré-checkout: CPF/CNPJ inválido na 1ª tentativa → `502`

### Lacunas residuais (não bloqueiam GO de preparação)

1. Conta Asaas Sandbox ainda lista webhook `kyvora` interrompido — separar conta antes de produção.
2. `next_billing_at` pode ficar `null` no entitlement apesar de `nextDueDate` no Asaas.
3. Árvore Git local ainda tem arquivos **não-billing** dirty (fora do escopo desta sprint).

## Já comprovado (infra)

- Trial 7d, BillingGate, portal `/c/{token}` fora do gate  
- Multi-tenant, Alembic `0012_billing_asaas`  
- Backup `croniu_hml_20260805T185611Z.sql.gz`  
- `BILLING_CARD_ENABLED=true` **somente HML** + allowlist obrigatória  

## Suítes locais (pós-commits billing)

| Check | Resultado |
|-------|-----------|
| Pytest backend completo | **131 passed** |
| Vitest web | **34 passed** |
| ESLint | 0 errors (1 warning pré-existente brand-mark) |
| `tsc --noEmit` + `next build` | OK |

## Recomendação final

**GO para preparar produção** (não autoriza deploy/prod ainda).

Critérios atendidos: webhook real autenticado, pagamento UI hospedada, `PAID` de entitlement só após evidência financeira, entitlement coerente, idempotência do `PAYMENT_CONFIRMED`, isolamento multi-tenant, sem credenciais expostas, suítes verdes, billing versionado.

Antes do deploy de produção: conta Asaas dedicada, `BILLING_CARD_ENABLED` off até cutover, secrets novos, e autorização explícita de sprint/deploy.
