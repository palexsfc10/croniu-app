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
| Tipos/valores cadastráveis | `IMPLEMENTADO` (criar/listar) |
| PATCH de serviço | `PARCIAL` (API; UI limitada) |
| Inativação formal | `PARCIAL` / `PENDENTE_DE_DECISAO` de política de UI |
| Ciclos históricos mantêm snapshot/valor associado | `PARCIAL` (ciclo guarda dados; política completa pendente) |

---

## Ciclo

**Ciclo não é recebimento. Ciclo não é renovação.**

| Regra | Status |
|-------|--------|
| Modo `period` (datas) | `IMPLEMENTADO` |
| Modo `session_count` | `PLANEJADO` |
| Modo `hybrid` | `PLANEJADO` |
| Status persistidos usados | `active`, `ended`, `cancelled` (campo) |
| `planned` / `paused` | **Não implementados** — `PLANEJADO` |
| `nearing_end` | **Calculado** (~7 dias) na home — não status persistido |
| Encerramento / histórico sem sobrescrita | `IMPLEMENTADO` (novos ciclos não apagam anteriores) |
| Edição avançada / pausa com retorno | `PLANEJADO` |
| Próximo ciclo só após confirmação profissional | `IMPLEMENTADO` (não auto-cria no confirm-contact) |

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
| Atraso calculado | `IMPLEMENTADO` |
| Pagamento parcial | `FUTURO` |
| Gateway de pagamento | `FORA_DO_ESCOPO` do MVP |

---

## Timezone (organização)

| Regra | Status |
|-------|--------|
| Campo IANA por organização | `PLANEJADO` (Sprint 2B candidata) |
| Default inicial | `America/Sao_Paulo` |
| Persistência de instantes | UTC |
| Apresentação | Fuso da organização |
| Migration nesta baseline | **Não** — só documentação |

---

## Renovação

| Regra | Status |
|-------|--------|
| Preparação de contato (mensagem + `wa.me`) | `IMPLEMENTADO` |
| Abrir WhatsApp ≠ envio pelo sistema | `IMPLEMENTADO` |
| Confirmação manual de contato | `IMPLEMENTADO` |
| Criação automática de novo ciclo | **Proibido** no MVP |
| Máquina de estados completa (`wants_renew`, etc.) | `PLANEJADO` |
| Página pública Meu Ciclo | `PLANEJADO` |

---

## Alertas

| Regra | Status |
|-------|--------|
| Prioridades no `/home/summary` | `PARCIAL` |
| Cálculo de ciclos encerrando / recebíveis | `IMPLEMENTADO` (serviço) |
| Entidade Alert persistida + dedupe formal | `PLANEJADO` |
| Timezone explícito da org | `PENDENTE_DE_DECISAO` (usar UTC/local conforme código atual) |

---

## Agenda / locais / Google

Todos `PLANEJADO`. Evento Google **não** vira cliente/ciclo automaticamente. Ver PRODUCT_SPEC §8.

---

## Entidades planejadas (ainda sem tabela)

`appointment`, `location`, `public_access_link`, máquina rica de `renewal`.

**Proibido como entidade central rígida:** `student`, `personal_trainer`, `class`.

## UI vs domínio

Rótulos de UI podem mapear por segmento sem alterar o modelo interno.
