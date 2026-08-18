# Croniu — Programa de indicação e cupom

Decisões arquiteturais: [`ADR-043`](./ADR-043-referral-coupon-program.md).
Billing/Asaas base: [`ADR-040`](./ADR-040-billing-asaas.md).
Painel administrativo: [`PLATFORM_ADMIN.md`](./PLATFORM_ADMIN.md).

## 1. Regras de negócio

- **Divulgador**: usuário do Croniu habilitado pelo Admin da plataforma (`platform_admin`) para
  indicar novos clientes. Um usuário só pode ter um registro de divulgador
  (`ReferralPartner.user_id` único).
- **Campanha/cupom**: pertence a exatamente um divulgador (`ReferralCampaign.partner_id`
  único). Código definido pelo Admin no momento da habilitação, normalizado em maiúsculas,
  único (case-insensitive). Desconto fixo em 10% nesta versão. Comissão prevista configurável
  (0% a 100%).
- **Atribuição**: registro permanente de que uma organização foi cadastrada por um cupom válido
  (`ReferralAttribution`, único por `organization_id`). Criada uma única vez, no momento do
  cadastro. Nunca reatribuída, nunca aplicada retroativamente a conta existente.
- **Desconto de 10% "vitalício"**: permanente para a organização atribuída enquanto ela mantiver
  ou reativar sua assinatura Croniu. Cancelamento seguido de reativação **não remove** o
  desconto — a atribuição não é tocada pelo ciclo de vida da assinatura. "Vitalício" é uma
  promessa comercial de permanência para a organização, não uma garantia jurídica de existência
  eterna do produto.
- **Trial**: 7 dias, inalterado pelo programa de indicação (`settings.trial_days`).
- **Conta sem cupom**: paga o preço normal (R$ 29,90/mês); nenhuma mudança de comportamento.
- **Desativação do divulgador**: bloqueia apenas *novas* atribuições. Atribuições e descontos já
  concedidos permanecem intactos.
- **Reativação do divulgador**: volta a permitir novas atribuições com o mesmo código.
- **Comissão prevista**: campo administrativo interno. Não é visível ao divulgador, não altera o
  desconto do cliente, não gera pagamento, dívida reconhecida, repasse automático ou documento
  fiscal. Alterar a comissão de uma campanha vale **apenas para novas atribuições**; atribuições
  existentes preservam o percentual do dia do cadastro (snapshot — ver ADR-043 §3).

## 2. Modelo de dados

```
ReferralPartner
  id, user_id (FK users, único), enabled, enabled_at, disabled_at,
  enabled_by_user_id (FK users), created_at, updated_at

ReferralCampaign
  id, partner_id (FK referral_partners, único), code (único, case-insensitive),
  discount_percent (fixo 10), commission_percent (Numeric(5,2), 0–100),
  status (active | inactive), created_at, updated_at

ReferralAttribution
  id, organization_id (FK organizations, único), campaign_id (FK, RESTRICT),
  partner_id (FK, RESTRICT, denormalizado para consulta),
  code_used, discount_percent_snapshot, commission_percent_snapshot,
  base_amount_cents_snapshot, final_amount_cents_snapshot,
  ever_paid_at (nullable — primeiro pagamento confirmado via webhook),
  created_at, updated_at
```

Restrições: `organization_id` único em `ReferralAttribution`; `partner_id` único em
`ReferralCampaign`; `user_id` único em `ReferralPartner`; `code` único (índice funcional
`lower(code)` como defesa adicional); `commission_percent`/`discount_percent` limitados por
`CHECK (0–100)`; valores monetários sempre `Integer` em centavos (nunca `float`), consistente
com `billing_prices`/`billing_checkouts`.

Ciclo de vida: `ReferralPartner`/`ReferralCampaign` podem ser desabilitados e reabilitados
livremente; `ReferralAttribution` é **imutável** após criada (só ganha `ever_paid_at` uma vez).

Migration: `backend/alembic/versions/0023_referral_coupon_program.py`, `down_revision =
"0022_form_template_pin"`. Tabelas vazias por padrão, sem seed, sem backfill — nenhuma
assinatura existente é tocada.

## 3. API

### Pública / autenticada (org)

| Rota | Auth | Descrição |
|------|------|-----------|
| `GET /api/v1/referrals/validate?code=X` | nenhuma | Valida um código para pré-visualização no cadastro. Retorna `{valid, code, discount_percent}`. Nunca revela motivo de invalidade, histórico ou identidade do divulgador. |
| `GET /api/v1/referrals/me` | sessão de organização | Visão do divulgador: `{enabled, code, discount_percent, link}`. Sem dados financeiros ou de indicados. `enabled: false` se o usuário não for divulgador habilitado. |
| `POST /api/v1/auth/register` | nenhuma | Aceita `referral_code` opcional. Cria a atribuição *depois* de organização + trial criados, na mesma transação de registro. Código inválido/inativo não bloqueia o cadastro — segue sem desconto. |

### Admin (`platform_admin`/`platform_viewer`, mutações exigem `platform_admin`)

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/v1/platform/referrals` | GET | Lista divulgadores com contadores e comissão prevista. |
| `/api/v1/platform/referrals/code-availability?code=X` | GET | Checagem de disponibilidade antes de salvar. |
| `/api/v1/platform/referrals` | POST | Habilita divulgador (`user_id`, `code`, `commission_percent`). Cria ou reabilita `ReferralPartner` + upsert de `ReferralCampaign`. Renomear código só é permitido sem atribuições existentes. |
| `/api/v1/platform/referrals/{partner_id}/commission` | PATCH | Atualiza `commission_percent` da campanha (vale para novos cadastros). |
| `/api/v1/platform/referrals/{partner_id}/status?enabled=bool` | PATCH | Habilita/desabilita o divulgador (bloqueia/libera novas atribuições). |

Erros seguem o padrão `AuthError` do projeto (`{code, message}` + status HTTP): `reserved_code`,
`code_taken`, `code_locked` (renomear com atribuições existentes), `validation_error`,
`platform_forbidden` (viewer tentando mutar), `not_found`.

Toda mutação grava `AdminAuditLog` (`platform.referral_partner_enabled`,
`platform.referral_commission_updated`, `platform.referral_partner_status_changed`).

## 4. Billing / Asaas

- **Cálculo do preço**: `app/services/referral.resolve_checkout_amount_cents` — busca a
  atribuição da organização (se houver) e aplica `discount_percent_snapshot` sobre o preço de
  catálogo corrente (`Decimal`, `ROUND_HALF_UP`, nunca `float`). Chamado a partir de
  `BillingService.create_hosted_checkout`, entre a resolução do `BillingPrice` e o envio do
  valor à Asaas — o frontend nunca escolhe o valor final.
- **Sem cupom**: R$ 29,90/mês, comportamento e trial inalterados.
- **Com cupom**: R$ 29,90 − 10% = **R$ 26,91/mês**, enviado como `value` ao endpoint de checkout
  hospedado da Asaas (`POST /v3/checkouts`), e gravado em `BillingCheckout.amount_cents = 2691`.
- **Idempotência de checkout**: já garantida pelo mecanismo existente (`uq_billing_checkouts_org_open`)
  — não alterada pelo programa de indicação.
- **Webhook**: `BillingWebhookService._apply_event`, no bloco `PAYMENT_CONFIRMED`/
  `PAYMENT_RECEIVED`, chama `referral_svc.mark_referral_paid(db, subscription.organization_id)`
  — idempotente (só grava a primeira vez), roda dentro da mesma transação/idempotência de
  webhook já existente (`BillingWebhookEvent` único por `external_event_id`).
- **Cancelamento/reativação**: o programa de indicação não observa esses eventos além de
  contagem de "Ativos" (lida de `Subscription.status` em tempo real) — a atribuição e o desconto
  não são afetados pelo ciclo de vida da assinatura.

## 5. Contadores do Admin

Calculados em `app/services/referral.list_partner_summaries`, por campanha:

- **Cadastros**: `COUNT(ReferralAttribution)` da campanha. Só existe atribuição após cadastro
  concluído — não conta clique, visita ou tentativa abandonada.
- **Pagantes**: `COUNT` de atribuições com `ever_paid_at IS NOT NULL`. Histórico — nunca
  decresce, mesmo após cancelamento.
- **Ativos**: `COUNT` de atribuições cuja `Subscription.status == 'active'` **agora**. Não conta
  trial, pendente, cancelada ou expirada.
- **Comissão mensal prevista**: soma, por atribuição ativa, de
  `final_amount_cents_snapshot × commission_percent_snapshot ÷ 100`. Estimativa apresentada com
  tooltip "Estimativa baseada nas assinaturas ativas. Não representa comissão paga." Não inclui
  taxas da Asaas, impostos, chargeback ou reembolso.

## 6. Frontend

- **Admin** (`apps/admin/src/app/(console)/referrals/page.tsx`): busca de usuário existente,
  formulário de habilitação (código + comissão), checagem de disponibilidade de código em tempo
  real, tabela de divulgadores com contadores, edição de comissão, toggle habilitar/desabilitar,
  botão copiar link. Item de menu "Parceiros e indicações" no `AdminShell`.
- **Web** (`apps/web`):
  - `AppShell` busca `GET /referrals/me` uma vez após autenticação; mostra o item "Meu link de
    indicação" (mobile e desktop) só se `enabled: true`.
  - `/app/referrals`: página do divulgador — código, desconto, link, copiar, compartilhar no
    WhatsApp. Sem dados financeiros. Usuário sem a flag vê uma mensagem de indisponibilidade
    (nunca dados de outro divulgador).
  - `/register?ref=CODIGO`: `RegisterForm` lê `ref` da URL, valida via
    `GET /referrals/validate`, mostra "Cupom X aplicado" ou "Este cupom não está disponível."
    sem bloquear o cadastro; envia `referral_code` no `POST /auth/register`.
  - `/app/billing`: quando a organização tem atribuição ativa
    (`EntitlementSnapshot.referral_active`), mostra o detalhamento Plano / Desconto vitalício de
    indicação / Total, com o texto "Seu desconto permanece vinculado a esta conta enquanto você
    utilizar o Croniu."

## 7. Runbook operacional

**Habilitar um divulgador**
1. Admin → Parceiros e indicações → buscar usuário por nome/e-mail.
2. Selecionar o usuário, definir código (verificar disponibilidade) e comissão prevista.
3. "Habilitar divulgador". O link fica disponível para o usuário em `/app/referrals` e no menu
   da conta.

**Trocar a comissão de um parceiro já ativo**
- Editar o campo "Comissão prevista" na tabela (salva ao sair do campo). Vale só para novos
  cadastros a partir dali; atribuições existentes preservam o percentual antigo.

**Desabilitar um divulgador**
- Botão "Desabilitar" na tabela. Bloqueia novos cadastros com o código; não afeta clientes já
  atribuídos (desconto permanece).

**Investigar divergência de contadores**
- `Cadastros`: conferir `SELECT * FROM referral_attributions WHERE campaign_id = ...`.
- `Pagantes`/`Ativos`: cruzar com `subscriptions` pela `organization_id` da atribuição —
  `ever_paid_at` vs. `status`.
- Comissão prevista é sempre recalculada em tempo real a partir dos snapshots; não há tabela de
  cache a invalidar.

**Rollback**
- Aplicação: reverter o deploy (a feature é aditiva — nenhuma rota/tabela existente foi
  alterada em formato incompatível).
- Migration: `alembic downgrade -1` remove as três tabelas novas. Seguro em ambiente sem
  atribuições. **Se já existirem atribuições em produção, o downgrade as apaga
  permanentemente** — antes de fazer downgrade em PRD com dados reais, exportar
  `referral_attributions` (auditoria/possível reconciliação manual). Nenhuma tabela pré-existente
  (`organizations`, `subscriptions`, `billing_*`) é alterada por esta migration — o downgrade não
  arrisca dados de billing.

## 8. Plano de testes

Cobertura automatizada: `backend/tests/test_referral.py` (19 casos) — habilitação, papéis
(`platform_admin` vs. `platform_viewer`), código reservado/inválido/duplicado (case-insensitive),
comissão fora do range, desabilitar/reabilitar, validação pública de código,
cadastro sem/com cupom, cupom inválido não bloqueia cadastro, cupom de parceiro desabilitado não
gera atribuição, dupla atribuição impossível, **preço 2990/2691 verificado ponta a ponta contra
o payload real enviado ao provider Asaas mockado**, contador de pagantes idempotente, endpoint
do divulgador sem dados financeiros, isolamento de tenant (dono de organização não acessa rotas
de plataforma).

Frontend: `apps/web/src/components/auth/auth-forms.test.tsx` (banner de cupom aplicado/indisponível,
nenhuma chamada sem `?ref=`) e `apps/web/src/components/app/app-shell.test.tsx` (item de menu
condicional). Regressão completa das suítes existentes (backend e frontend) executada sem
quebras.

Verificação manual (smoke, ambiente local): registro com `?ref=` válido mostrando o banner,
checkout hospedado carregando exatamente R$ 26,91 para organização indicada, página
`/app/referrals` do divulgador, item de menu condicional, Admin habilitando/desabilitando um
divulgador com contadores atualizando em tempo real.

Não cobertos nesta entrega (fora do orçamento de tempo, registrado para transparência): suíte
Playwright automatizada dos fluxos E2E A–H do enunciado (cobertos manualmente, não via CI);
teste de carga/concorrência de cadastro simultâneo com o mesmo código (a proteção existe via
constraint de banco, mas não há teste de race condition dedicado).
