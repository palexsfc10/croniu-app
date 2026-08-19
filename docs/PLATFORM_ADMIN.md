# Croniu — Painel Administrativo da Plataforma

## Separação de papéis

| Papel | Escopo |
|-------|--------|
| Administrador da **organização** | Somente sua org (clientes, ciclos, agenda, etc.) |
| Administrador da **plataforma** | Operação SaaS NTWS Labs/Croniu |

Um owner de organização **nunca** se torna admin da plataforma via frontend, perfil ou API de autoatendimento.

## Aplicação

- App separado: `apps/admin` (deploy e origem distintos de `apps/web`)
- Hostname pretendido (a confirmar): `admin.croniu.com.br`
- HML sugerido (a confirmar): `admin-hml.croniu.com.br`
- **Não** configurar DNS/Cloudflare sem confirmação

## API

Namespace exclusivo: `/api/v1/platform/*`

Autorização obrigatória no FastAPI via `platform_membership`. Ocultar UI não basta.

## Modelo de permissões (ADR-011)

Tabela `platform_memberships`:

- `user_id`
- `role` (`platform_admin` | `platform_viewer`)
- `created_at`
- `created_by_user_id` (opcional)

Sessões administrativas em `platform_sessions` com cookie **separado** `croniu_admin_session`.

## Bootstrap do primeiro admin

Comando CLI seguro (sem senha padrão, sem seed versionado):

```bash
cd backend
python -m app.cli.create_platform_admin
```

Credenciais via prompt seguro ou variáveis de ambiente **não versionadas**.

## Escopo desta fundação

- Login/logout admin
- Visão geral com métricas **reais** (zero se vazio)
- Listagem paginada de organizações e usuários
- Detalhe de organização com gestão de trial e área de perigo (abaixo)
- Auditoria completa de ações administrativas em `AdminAuditLog`
- Sem impersonação nesta etapa

## Parceiros e indicações

Seção `/referrals` (namespace `/api/v1/platform/referrals/*`): habilitar divulgador, definir
código/comissão, ativar/desativar, contadores. Mutações exigem `platform_admin` (não
`platform_viewer`). Auditado em `AdminAuditLog`. Detalhe completo:
[`REFERRAL_PROGRAM.md`](./REFERRAL_PROGRAM.md).

## Gestão de conta da organização (trial, desativação, exclusão)

Página `/organizations/{id}` no Admin. Todas as mutações exigem `platform_admin` (nunca
`platform_viewer`), namespace `/api/v1/platform/organizations/{id}/*`, e geram uma entrada em
`AdminAuditLog` com ator, organização, motivo, `before_state`/`after_state` e metadados seguros.
Implementação: `backend/app/services/platform_admin_ops.py`.

### Modelo de estados de `Organization.status`

| Valor | Significado |
|---|---|
| `evaluating` | Padrão no cadastro — organização em avaliação |
| `active` | Organização ativa (uso normal) |
| `suspended` | Suspensão por outro motivo operacional (pré-existente, não tocado por estas ações) |
| `disabled` | Desativada via Admin (`Desativar conta`) ou anonimizada via exclusão com histórico financeiro |

`disabled_at`, `disabled_reason` e `status_before_disable` (migration `0024`) só ficam
preenchidos enquanto `status == "disabled"`. `status_before_disable` é o que permite a
**Reativação** restaurar o valor exato anterior (`evaluating`/`active`/`suspended`), em vez de
assumir um padrão.

### Estender teste (`POST .../trial/extend`)

- Só permitido quando `Subscription.status` é `trial` ou `expired` **e** não há
  `BillingCheckout` com status `PENDING`/`ACTIVE` em aberto. Qualquer outro estado (pago,
  cancelado, suspenso, inadimplente) retorna erro explícito (`trial_not_extendable` /
  `checkout_pending`) — nunca altera silenciosamente.
- `additional_days`: 1 a 90 (limite seguro fixo em código,
  `TRIAL_EXTENSION_MAX_DAYS` em `app/schemas/platform.py`). Atalhos na UI: 3/7/15/30 dias.
- Data nova = `max(trial_ends_at atual, agora) + N dias` — nunca soma a partir de uma data já no
  passado (trial vencido há muito tempo não "ganha" dias perdidos, mas também não fica negativo).
- Se a assinatura estava `expired`, volta para `trial` — senão o entitlement (calculado sob
  demanda a partir de `Subscription`, nunca armazenado separadamente) ignoraria a extensão.
- Exibição no Admin é convertida para o timezone da organização
  (`Organization.timezone`, `zoneinfo`); o cálculo em si é sempre em UTC/instante absoluto, para
  não depender de aritmética de calendário sensível a horário de verão.

### Desativar / reativar (`POST .../deactivate`, `POST .../reactivate`)

- Desativar exige confirmação (nome da organização **ou** e-mail do titular, validada no
  backend, não só na UI) e motivo. Revoga imediatamente todas as `Session` ativas da organização
  (`revoked_at`) e bloqueia novos logins (`ensure_organization_not_disabled` em
  `app/services/auth.py`, chamado no login). Não cancela cobrança externa, não altera
  `Subscription`/`BillingCheckout`/atribuição de cupom.
- Reativar restaura `status_before_disable`, exige motivo, sem confirmação por texto (ação
  reversível de baixo risco, diferente de desativar).

### Excluir permanentemente (`GET .../deletion-preview`, `POST .../permanent-delete`)

Ação irreversível. Duas saídas possíveis, decididas automaticamente pelo backend:

1. **Exclusão física** (`hard_delete`) — só quando a organização nunca teve `BillingCheckout`,
   a assinatura nunca saiu de `trial`/`expired`, nunca teve `provider_customer_id`/
   `provider_subscription_id`, não tem `ReferralAttribution`, e o titular nunca foi
   `ReferralPartner`. Remove a linha `organizations` via `DELETE` filtrado por ID (Core SQL, não
   `db.delete()` ORM) — os filhos (clientes, ciclos, agenda, sessões, memberships, recebíveis...)
   somem via `ON DELETE CASCADE` já definido no schema, não por lógica nova.
2. **Anonimização** (`anonymized`) — quando qualquer critério acima existir. Nome da
   organização e identidade dos titulares (nome/e-mail) exclusivos desta organização são
   substituídos por valores sintéticos; `Subscription`/`BillingCheckout`/`ReferralAttribution`/
   `AdminAuditLog` **não são tocados** — o histórico financeiro e de indicação permanece intacto
   e consultável. Um titular que também pertence a outra organização nunca é anonimizado.

Sempre, em ambos os casos:

- Exige dupla confirmação (texto = nome/e-mail da organização, **e** checkbox de
  entendimento) — validada no backend, não só desabilitando o botão na UI.
- `GET .../deletion-preview` mostra antes da confirmação: se será física ou anonimização, os
  motivos de bloqueio, e contagem de cada tipo de dado afetado.
- Gera um snapshot JSON identificável em `var/admin_backups/org-delete-{id}-{timestamp}.json`
  **antes** de qualquer mutação — escopado à organização (não é um `pg_dump` do banco inteiro:
  mais rápido, auditável, e não exige credencial de superusuário Postgres dentro do processo da
  API).
- A mutação (delete ou anonimização) e o registro de auditoria são preparados na mesma sessão de
  banco e só há **um `commit()`** no final — uma falha em qualquer ponto do meio (ex.: erro ao
  montar o registro de auditoria) descarta tudo, nunca deixa a organização meio-excluída.
- `AdminAuditLog.organization_id` é `ON DELETE SET NULL`: mesmo após exclusão física, a entrada
  de auditoria sobrevive (com nome/e-mail capturados em `metadata_safe` antes da remoção) —
  registro administrativo mínimo da exclusão, mesmo sem a linha original.

### Rollback e recuperação

- **Estender/desativar/reativar**: reversíveis pela própria UI (nova extensão, reativação). Sem
  procedimento de rollback manual necessário.
- **Exclusão anonimizada**: os dados financeiros/de indicação continuam intactos; a
  identidade/nome não são recuperáveis automaticamente (não há "desanonimizar"), mas o snapshot
  em `var/admin_backups/` tem o nome/e-mail originais para reconstrução manual se
  necessário.
- **Exclusão física**: irreversível pela aplicação. Recuperação só via restore do backup de
  banco mais recente anterior à operação (`deploy/release/backup.sh`, rodado automaticamente
  antes de qualquer deploy) **ou** reconstrução manual a partir do snapshot JSON em
  `var/admin_backups/` (contém organização, memberships, assinatura, checkouts e atribuição de
  indicação — não contém clientes/ciclos/agenda, que são o conteúdo operacional já descartado
  pelo `CASCADE`). Por isso a exclusão física só é permitida para organizações sem histórico
  financeiro real — o snapshot é suficiente para provar o que existia, não para restaurar
  operação.
