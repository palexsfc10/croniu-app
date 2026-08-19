# ADR-043 — Programa de indicação e cupom

## Contexto

O Croniu precisa de um programa simples de indicação: divulgadores habilitados pelo Admin
recebem um código de cupom exclusivo; novos clientes cadastrados por esse código recebem
10% de desconto vitalício (enquanto mantiverem a assinatura); o Admin acompanha uma projeção
de comissão. Não há pagamento de comissão nesta entrega. Detalhe funcional/técnico completo:
[`REFERRAL_PROGRAM.md`](./REFERRAL_PROGRAM.md).

## Decisões

### 1. Backend é a única fonte do preço

O frontend nunca envia preço, percentual, desconto ou `price_id` confiável. O backend resolve
a atribuição de indicação da organização (`ReferralAttribution`) e calcula o valor final a cada
checkout (`resolve_checkout_amount_cents`), aplicando o desconto sobre o preço de catálogo
corrente. Isso elimina qualquer superfície de manipulação de preço no cliente — o exploit mais
óbvio para um "programa de desconto" mal desenhado.

### 2. Atribuição é permanente (uma vez por organização)

`ReferralAttribution` tem `UniqueConstraint(organization_id)`: uma organização só pode ter uma
atribuição, criada uma única vez no registro (`register_owner`), nunca depois. Isso implementa
diretamente a regra de negócio "o cliente não pode trocar livremente de cupom" e "nenhuma
atribuição retroativa a conta existente" sem precisar de lógica extra de bloqueio — a
constraint do banco já impede.

### 3. Snapshots em vez de referência viva

`ReferralAttribution` grava `discount_percent_snapshot`, `commission_percent_snapshot`,
`base_amount_cents_snapshot` e `final_amount_cents_snapshot` no momento da atribuição, em vez de
apenas referenciar `ReferralCampaign` e calcular tudo em tempo real.

Motivo: a comissão prevista pode mudar no futuro (o Admin pode reajustar), e a regra de negócio
exige que **alterações de comissão valham só para novos cadastros**, preservando o valor
histórico das atribuições já existentes. Sem snapshot, mudar a comissão de um parceiro
reescreveria silenciosamente a comissão prevista de todas as organizações já indicadas por ele —
quebrando auditoria e criando um relatório financeiro instável.

O desconto (`discount_percent_snapshot`) é fixo em 10% nesta versão, mas snapshotar do mesmo
jeito prepara o modelo para uma eventual campanha com desconto diferente sem migration nova.

### 4. Preço final recalculado no checkout, não lido do snapshot

`resolve_checkout_amount_cents` aplica `discount_percent_snapshot` sobre o **preço de catálogo
atual** (`BillingPrice.amount_cents`), não sobre `final_amount_cents_snapshot`. O snapshot em
`ReferralAttribution` é o registro de auditoria de "quanto era no dia do cadastro"; o valor
realmente cobrado no único checkout hospedado (Asaas cria a assinatura recorrente a partir dali)
usa sempre a regra de desconto vigente sobre o preço vigente. Isso evita que um catálogo de
preço desatualizado no snapshot cobre um valor errado se o preço base mudar entre o cadastro e o
efetivo checkout (trial de 7 dias no meio).

### 5. Como a desativação do divulgador funciona

Desativar (`ReferralPartner.enabled = False`) e desativar a campanha (`ReferralCampaign.status =
inactive`) bloqueiam **apenas novas atribuições** (`validate_public_code` passa a retornar
inválido). Atribuições já existentes (`ReferralAttribution`) não são tocadas — não há cascade,
não há job de limpeza, o desconto já concedido continua sendo aplicado em
`resolve_checkout_amount_cents`, que consulta só a atribuição, nunca o estado atual do parceiro.

### 6. Idempotência

- **Atribuição**: `create_attribution_if_eligible` é chamada uma única vez em `register_owner`,
  protegida por `UniqueConstraint(organization_id)`; uma segunda tentativa (`IntegrityError`) é
  engolida e retorna `None` — nunca derruba o cadastro.
- **Contador de pagantes**: `mark_referral_paid` só grava `ever_paid_at` se ainda for `None`;
  chamada repetida (webhook duplicado, reprocessamento) não sobrescreve a data original. A
  idempotência de entrega do webhook em si já existe (`BillingWebhookEvent` com
  `UniqueConstraint(provider, external_event_id)`) — `mark_referral_paid` roda dentro do handler
  já protegido contra duplicata.
- **Código do cupom**: unicidade case-insensitive garantida em duas camadas — normalização
  (`normalize_code` sempre grava maiúsculas) e um índice único funcional
  `lower(code)` na migration, como defesa contra bypass por SQL direto.

## Alternativas rejeitadas

- **Guardar só a referência à campanha (sem snapshot)**: mais simples, mas quebra a regra de
  "alteração de comissão vale só para novos cadastros" e destrói o histórico de auditoria.
- **Aplicar desconto criando uma segunda `BillingPrice` "com desconto"**: a arquitetura de
  billing já suporta múltiplos `BillingPrice`, mas isso criaria N preços por percentual de
  desconto possível e ainda exigiria decidir qual usar por organização — mais um nível de
  indireção sem benefício, já que `BillingCheckout.amount_cents` já é gravado por-checkout,
  independente do preço de catálogo usado como referência.
- **Guardar o `ref` do cadastro em `sessionStorage`/cache do navegador como fonte de verdade**:
  rejeitado por instrução explícita de produto — nenhuma decisão de desconto pode depender de
  estado só no cliente. O código de indicação viaja na URL (`?ref=CODIGO`) e é revalidado pelo
  backend a cada leitura (`GET /referrals/validate`) e de novo, autoritativamente, no momento do
  `POST /auth/register`. Limitação conhecida: se o usuário perder a query string antes de
  submeter o formulário (ex.: copiar/colar só a URL base), a atribuição não ocorre. Aceitável
  para esta v1; um mecanismo de cookie assinado de curta duração fica registrado como possível
  evolução futura, não implementado agora.
