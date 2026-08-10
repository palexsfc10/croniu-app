# Sprint 2C.1 — Relatório de entrega

**Data:** 2026-07-24  
**Branch:** `feature/sprint-2c1-cycle-financial-edit`  
**SHA-base:** `545148029442d89c08834195e30535dd06c93bfe`

## 1. Preflight

| Item | Valor |
|------|--------|
| Branch origem | `feature/sprint-2c-cycle-intelligence` @ `5451480` |
| Working tree (pré-sprint) | limpa |
| Migration | `0006_sprint2c_cycle_intelligence` (sem nova) |
| Remoto | ausente |
| Branch criada | `feature/sprint-2c1-cycle-financial-edit` |

## 2. Auditoria da API existente

- `PATCH /cycles/{id}/intelligent` — edição contratual/financeira sem sync de agenda; aceitava ajuste XOR final.
- Lacuna: UI de detalhe sem fluxo completo de edição financeira; pagamento confirmado não bloqueava de forma explícita na UX.
- Endurecimento 2C.1: `PATCH /cycles/{id}/financial` (`FinancialCycleUpdate`); rejeição de `unit_price_cents` no intelligent (`snapshot_immutable`); bloqueio `payment_confirmed` (409).

## 3. Interface

- Detalhe do ciclo → link “Editar valores”
- Página dedicada: composição atual, modos desconto XOR valor final, confirmação, aviso de agenda, bloqueio com mensagem clara se pago.

## 4. Regra financeira

- Integer cents; backend `compose_financial` autoridade; frontend só prévia.
- Ajuste negativo = desconto; positivo = acréscimo; final ≥ 0; campos contraditórios → 422.

## 5. Recebimento pendente

Atualiza o único recebimento `pending`/`expected` na mesma transação; não cria segundo; não cria se ausente.

## 6. Recebimento confirmado

Não altera valor; não reabre; 409 + mensagem PT na UI.

## 7. Agenda

Nenhuma alteração de compromissos (ADR-024). Aviso na UI.

## 8. Casos mensais

`add_calendar_months` com clamp: 28/29/30/31, fev comum/bissexto, virada de ano — cobertos em `test_cycle_calc.py`.

## 9. Segurança

Tenant da sessão; ciclo/recebimento cruzado → 404; mass assignment limitado ao schema; snapshot não editável por este fluxo.

## 10. Warning RHF

Busca por `watch(` em `apps/web`: **0 ocorrências**. Eliminado com a substituição do formulário antigo; lint web sem warning RHF.

## 11. Testes e gates

| Gate | Resultado |
|------|-----------|
| Backend ruff | OK |
| Backend pytest | **72 passed** (incl. `test_cycle_financial_invariants`) |
| Migration current = head | `0006_sprint2c_cycle_intelligence` |
| Web lint / typecheck / vitest / build | OK / **19** testes |
| Admin lint / typecheck / vitest / build | OK / **4** testes |
| E2E `sprint2c1.spec.ts` | **3 passed** (seed endurecido: `goto /cycles/new`) |
| Secrets scan | sem achados novos |
| Screenshots E2E | continuam em `.gitignore` (`**/e2e/artifacts/`) |

### E2E — o que cada cenário comprova

1. Desconto R$ 60 → total R$ 660; recebimento pendente; aviso de agenda.  
2. Após mark-paid → bloqueio com mensagem “pagamento já foi confirmado”.  
3. Tenant B → PATCH financeiro do ciclo A → 404.

### Flake corrigido (gate)

`test_home_summary_includes_appointments` falhava após ~22h SP (slot fixo 22:00). Ajuste: horário relativo a `now` (±30 min / in-progress na virada). Pré-existente na 2B; não é regressão financeira.

## 12. Esclarecimento do relatório 2C (§18)

Entre `b8ef0b9` (2B) e `5451480` (HEAD 2C):

| Item | Valor real |
|------|------------|
| Commits | **2** |
| Lista | `9989474` feat: add intelligent cycle pricing and scheduling · `5451480` docs: mark Sprint 2C as delivered in AGENTS |
| Diff total `b8ef0b9..5451480` | **42 files, +2650 / −253** |
| Feature commit `9989474` | **42 files, +2649 / −253** (código + docs da sprint) |
| Commit docs `5451480` | **1 file** (`AGENTS.md`), **+4 / −3** |
| Arquivos fora dos commits | nenhum no HEAD 2C (working tree limpa) |

O relatório 2C arredondou corretamente a ordem de grandeza; o feature commit já continha a documentação da 2C — o segundo commit só atualizou `AGENTS.md`.

## 13. Diff desta sprint (2C → 2C.1)

Pré-commit staged: **25 files, +1152 / −87** vs `5451480`. Sem migration nova. SHA final = HEAD após o commit de entrega.

## 14. Divergências / pendências

- Ciclo sem recebimento: edição financeira **não** cria recebimento (registrado; sem inventar estado).
- Sync de agenda na edição (ADR-024) — permanece planejado.
- Vocabulário `expected`/`received` — não normalizado.
- Override de conflito — `PENDENTE_DE_DECISAO`.

## 15. Homologação manual (curto)

1. Criar ciclo inteligente ~R$ 720.  
2. Detalhe → Editar valores → desconto R$ 60 → confirmar → total R$ 660 e recebimento único atualizado.  
3. Conferir Agenda inalterada.  
4. Marcar pago → Editar valores → mensagem de bloqueio.  
5. (Opcional) Segundo tenant não edita o ciclo.

## 17. Auditoria corretiva — bypass entre rotas (pós-`55ebfd4`)

### Matriz **antes** da correção

| Caminho | Pode alterar financeiro? | Bloqueia pago? | Snapshot protegido? | Atualiza recebimento? |
| --------------------------- | ---: | ---: | ---: | ---: |
| PATCH `/intelligent` | Sim (ajuste/final **e** recálculo estrutural) | Parcial — só se enviasse ajuste/final | Parcial — `unit_price` rejeitado; extras ignorados | Sim se recalcular |
| PATCH `/financial` | Sim | Sim (`payment_confirmed`) | Sim no schema financeiro | Sim (pending) |
| POST `/cycles` (legado create) | Só na criação | N/A | N/A | Opcional na criação |
| Frontend | Só `/financial` na UI de edição | UI preventiva | N/A | Via `/financial` |

**Bypass existia:** sim. Rota vulnerável: `PATCH /intelligent` com mudança estrutural (`starts_on`, `weekdays`, `service_id`, `cycle_template_id`) em ciclo com recebimento confirmado, **sem** enviar `adjustment_cents`/`final_cents` — recalculava aulas/subtotal/total e podia sincronizar recebimento pendente sem passar por `_assert_financial_editable`.

### Correção

Política compartilhada em `cycle_intelligence`:

- `_guard_financial_outcome_mutation` — bloqueia pago antes de inputs financeiros **ou** chaves estruturais de recálculo
- `_reject_snapshot_mutation` — snapshot/derived imutáveis
- `_apply_financial_composition` + `_sync_pending_receivable` — composição e sync únicos
- `IntelligentCycleUpdate` / `FinancialCycleUpdate` com `extra="forbid"`

### Evidência

`backend/tests/test_cycle_financial_invariants.py` — chama `/intelligent` e `/financial` diretamente; cobre ajuste/final/estrutural pagos, snapshot, extras, pending sync, rollback, tenant, paridade de códigos.

Commit corretivo: `fix: enforce cycle financial invariants across routes` (não reescreve `55ebfd4`).

## 16. Próximo

Não iniciar Sprint 2D / GCal / Meu Ciclo sem nova autorização.
