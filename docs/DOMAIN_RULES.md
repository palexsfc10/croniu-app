# Croniu — Regras de domínio

**Fonte canônica de produto:** [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md).  
Este arquivo consolida regras **verificadas no código** e decisões aprovadas.  
Itens não confirmados: `PENDENTE_DE_DECISAO` ou `PLANEJADO`.

---

## Multi-tenancy

| Regra | Status |
|-------|--------|
| Organização = tenant | `IMPLEMENTADO` |
| Membership user↔org + papel (`owner`/`admin`/`member`) | `IMPLEMENTADO` |
| Isolamento: queries de negócio filtram `organization_id` da sessão | `IMPLEMENTADO` |
| Fonte do tenant: sessão autenticada, **nunca** body/query do cliente | `IMPLEMENTADO` |
| UUID de outro tenant não autoriza acesso | `IMPLEMENTADO` (testes) |

Cadastro cria em uma transação: `user` + `organization` + `membership` (`owner`).

---

## Cliente

| Regra | Status |
|-------|--------|
| Cadastro no tenant | `IMPLEMENTADO` |
| Campos: nome, telefone/WhatsApp, notas, status | `IMPLEMENTADO` (ver modelo) |
| Status ativo / arquivado | `IMPLEMENTADO` |
| Arquivamento via PATCH | `IMPLEMENTADO` |
| Histórico completo de edições auditável | `PLANEJADO` / parcial |

Nomenclatura interna: `Client` (UI pode dizer “Aluno” no futuro).

---

## Serviço

| Regra | Status |
|-------|--------|
| Tipos/valores cadastráveis | `IMPLEMENTADO` |
| Valor-base por aula (centavos) | `IMPLEMENTADO` |
| Duração padrão da aula (minutos) | `IMPLEMENTADO` |
| Arquivamento; histórico preservado | `IMPLEMENTADO` |
| Preço atual não altera ciclos históricos | `IMPLEMENTADO` (snapshot no ciclo) |

## Modelo de ciclo

| Regra | Status |
|-------|--------|
| Frequência semanal + duração | `IMPLEMENTADO` |
| `calendar_months` vs `fixed_days` | `IMPLEMENTADO` (não equivalentes) |
| Dias da semana no ciclo do cliente | `IMPLEMENTADO` |

## Ciclo

**Ciclo não é recebimento. Ciclo não é renovação.**

| Regra | Status |
|-------|--------|
| Modo `period` (datas) | `IMPLEMENTADO` |
| Cálculo exato de aulas (enumeração) | `IMPLEMENTADO` |
| Snapshot unitário / subtotal / ajuste / total | `IMPLEMENTADO` |
| Geração opcional de agenda (atômica) | `IMPLEMENTADO` |
| Edição contratual/financeira | `IMPLEMENTADO` |
| Edição financeira na UI (desconto XOR final) | `IMPLEMENTADO` (2C.1) |
| Bloqueio se recebimento confirmado | `IMPLEMENTADO` (409 `payment_confirmed`) |
| Invariantes nas rotas `/intelligent` e `/financial` | `IMPLEMENTADO` (política compartilhada; sem bypass estrutural) |
| Edição financeira sem criar recebimento ausente | `IMPLEMENTADO` (não inventa estado) |
| Sync de compromissos futuros na edição | `PLANEJADO` (ADR-024) |
| Modo `session_count` | `PLANEJADO` |
| Modo `hybrid` | `PLANEJADO` |
| Status persistidos usados | `active`, `ended`, `cancelled` (campo) |
| `planned` / `paused` | **Não implementados** — `PLANEJADO` |
| `nearing_end` | **Calculado** na home/listagens — por data (≤ 7 dias) **ou** por saldo (≤ 1 aula restante / esgotado); não é status persistido |
| Encerrando (portal) | Data ≤ 7 dias **ou** ≤ 1 aula restante / esgotado |
| CTA “Quero continuar” (Meu Ciclo) | Somente `encerrando` ou `encerrado` — **não** em `proximo` nem no início do `vigente` |
| Aprovar renovação (intelligent + `renewal_request_id`) | Marca solicitação `resolved`, cria sucessor e encerra o ciclo origem (`ended`); cancela aulas futuras `scheduled` do origem |
| Encerramento / histórico sem sobrescrita | `IMPLEMENTADO` |
| Próximo ciclo só após confirmação profissional | `IMPLEMENTADO` |
| Ciclos legados (pré-2C) | `is_legacy`; sem backfill falso |

---

## Recebimento

Vocabulário **alvo** (aprovado; normalização em sprint autorizada):

| Status / conceito | Papel |
|-------------------|--------|
| `pending` | Persistido — a receber |
| `paid` | Persistido — pago (alvo; código atual usa `received`) |
| `cancelled` | Persistido — cancelado |
| `overdue` | **Calculado** a partir de vencimento + `pending`, não status concorrente obrigatório |
| valor esperado | Conceito de produto; **não** compete com `pending` como status persistido |

| Regra | Status |
|-------|--------|
| Valor monetário + vencimento | `IMPLEMENTADO` |
| Status `pending` → `received` (mark-paid) | `IMPLEMENTADO` (divergência vs alvo `paid`) |
| Status `expected` em queries de home | **Divergência** — referenciado no código; criação usa `pending`; normalizar em sprint autorizada |
| Sync valor do recebimento `pending` na edição financeira | `IMPLEMENTADO` (mesmo vínculo; sem duplicar) |
| Atraso calculado | `IMPLEMENTADO` |
| Pagamento parcial | `FUTURO` |
| Gateway de pagamento | `FORA_DO_ESCOPO` do MVP |

---

## Timezone (organização)

| Regra | Status |
|-------|--------|
| Campo IANA por organização | `IMPLEMENTADO` (`organizations.timezone`) |
| Default inicial | `America/Sao_Paulo` |
| Persistência de instantes | UTC (timezone-aware) |
| Apresentação / “hoje” | Fuso da organização |
| Alteração de timezone | Não muda instantes; muda representação e cálculos futuros |
| DST | Depende da zona IANA; documentar limitações na UI de preferências |

## Locais

| Regra | Status |
|-------|--------|
| Entidade `location` por tenant | `IMPLEMENTADO` |
| Status ativo / arquivado | `IMPLEMENTADO` (arquivar ≠ excluir) |
| Arquivado em compromissos históricos | `IMPLEMENTADO` |
| Arquivado fora do seletor padrão | `IMPLEMENTADO` |

## Compromissos

| Regra | Status |
|-------|--------|
| Compromisso único (`appointment`) | `IMPLEMENTADO` |
| Cliente obrigatório | `IMPLEMENTADO` |
| Status scheduled / completed / no_show / cancelled | `IMPLEMENTADO` |
| Realizado / falta consome 1 aula do ciclo | `IMPLEMENTADO` (ADR-031) |
| Intervalo half-open `[start, end)` | `IMPLEMENTADO` |
| Conflito por sobreposição na org | `IMPLEMENTADO` (bloqueio 409) |
| Override explícito de conflito | `PENDENTE_DE_DECISAO` |
| Recorrência | `PLANEJADO` |

---

## Renovação

| Regra | Status |
|-------|--------|
| Preparação de contato (mensagem + `wa.me`) | `IMPLEMENTADO` |
| Abrir WhatsApp ≠ envio pelo sistema | `IMPLEMENTADO` |
| Confirmação manual de contato | `IMPLEMENTADO` |
| Criação automática de novo ciclo | **Proibido** no MVP |
| Máquina de estados completa (`wants_renew`, etc.) | `PLANEJADO` |
| Página pública Meu Ciclo | `IMPLEMENTADO` (2D) |
| Token opaco + hash / HMAC reconstruível / revogação / rotação | `IMPLEMENTADO` |
| Renovação = interesse (sem criar ciclo) | `IMPLEMENTADO` |
| Informe de pagamento ≠ mark-paid automático | `IMPLEMENTADO` |
| Aulas restantes (saldo = total − realizadas/faltas) | `IMPLEMENTADO` (ADR-031) |
| Preferências Pix / link https | `IMPLEMENTADO` |

---

## Indicação / cupom

Detalhe completo: [`REFERRAL_PROGRAM.md`](./REFERRAL_PROGRAM.md) · [`ADR-043`](./ADR-043-referral-coupon-program.md).

| Regra | Status |
|-------|--------|
| Divulgador habilitado pelo Admin da plataforma (não autoatendimento) | `IMPLEMENTADO` |
| Código de cupom definido pelo Admin, único (case-insensitive) | `IMPLEMENTADO` |
| Desconto fixo de 10%, vitalício para a organização atribuída | `IMPLEMENTADO` |
| Atribuição única por organização, criada só no cadastro, nunca retroativa | `IMPLEMENTADO` |
| Backend calcula o preço final; frontend nunca envia preço/desconto/`price_id` confiável | `IMPLEMENTADO` |
| Comissão prevista: projeção interna, não visível ao divulgador, snapshot por atribuição | `IMPLEMENTADO` |
| Cancelamento/reativação da mesma organização preserva o desconto | `IMPLEMENTADO` |
| Desativação do divulgador não remove descontos já concedidos | `IMPLEMENTADO` |
| Pagamento de comissão / repasse automático / nota fiscal | **Fora do escopo** desta entrega |

---

## Alertas

| Regra | Status |
|-------|--------|
| Prioridades no `/home/summary` | `IMPLEMENTADO` — regra canônica em [`HOME_PRIORITY.md`](./HOME_PRIORITY.md) |
| Cálculo de ciclos encerrando / recebíveis | `IMPLEMENTADO` (serviço) |
| Entidade Alert persistida + dedupe formal | `PLANEJADO` |
| Timezone explícito da org | `IMPLEMENTADO` (Sprint 2B) |

Seleção de prioridade e split temporal da home: **somente backend**. Frontend não duplica a regra.

---

## Agenda / locais / Google

Todos `PLANEJADO`. Evento Google **não** vira cliente/ciclo automaticamente. Ver PRODUCT_SPEC §8.

---

## Entidades planejadas (ainda sem tabela)

`appointment`, `location`, `public_access_link`, máquina rica de `renewal`.

**Proibido como entidade central rígida:** `student`, `personal_trainer`, `class`.

## UI vs domínio

Rótulos de UI podem mapear por segmento sem alterar o modelo interno.
