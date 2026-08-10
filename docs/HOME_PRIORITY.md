# Home — regra canônica de prioridade e timeline

**Fonte única de seleção:** backend `build_home_summary` / `select_home_priority` em `backend/app/services/domain.py`.  
O frontend **não** recalcula prioridade — apenas renderiza `priority_action` e as listas já filtradas.

Instantes de compromisso: armazenados em **UTC**; “hoje” e rótulos usam `organizations.timezone` (IANA).

---

## Ordem determinística da ação prioritária

Primeiro match vence. Compromissos **nunca** viram `priority_action` (evitam repetir a timeline).

1. **Cobrança vencida ou pendente relevante**
   - Recebível overdue (`due_on < local_today`) → `pending_payment`
   - Senão informe de pagamento aguardando conferência → `payment_report_pending`
   - Senão recebível com `due_on == local_today` → `pending_payment`
2. **Ciclo encerrado sem renovação** → `cycle_ended_unrenewed`
   - `status == "ended"` **ou** `ends_on < local_today`
   - Sem renovação aberta do ciclo, sem renovação `resolved` com sucessor, sem sucessor ativo mesmo cliente+serviço
3. **Pedido de renovação (portal)** → `renewal_requested`
4. **Ciclo próximo do encerramento** → `cycle_nearing_end` (ativos `is_nearing_end` após suppress)
5. **Outra pendência operacional real** (nesta ordem):
   - conflito de agenda do dia → `agenda_conflict`
   - compromisso do dia com `ends_at <= now` ainda `scheduled` → `appointment_needs_outcome`
   - demais recebíveis pendentes (`due_on > local_today`) → `pending_payment`

Se nenhum match: `priority_action = null`. A UI mostra apenas estado positivo **discreto** (sem card grande artificial).

---

## Semântica temporal dos compromissos (dia local)

Somente `status == "scheduled"` entram na home. Histórico completo permanece na agenda/detalhe.

| Fase | Condição | Superfície |
|------|----------|------------|
| Futuro | `starts_at > now` | `upcoming_appointments` (timeline “Próximos”) |
| Em andamento | `starts_at <= now < ends_at` | `in_progress_appointments` (badge na timeline; **não** é “próximo”) |
| Encerrado sem desfecho | `ends_at <= now` | `appointments_needing_outcome` + atenção; **fora** de próximos/andamento |
| Outros status | completed / cancelled / no_show | Fora da home |

Ocultar da home **não** exclui nem altera o registro.

---

## Deduplicação entre seções

- A entidade de `priority_action` **não** aparece em `attention_items`.
- Futuros e em andamento **não** entram em atenção (desfecho só após `ends_at`).
- O mesmo item não deve figurar como ação em mais de uma seção.

Suppress de ciclos (nearing / ended) reutiliza as regras de `cycles_suppressed_from_home_attention` (renovação aberta, resolved com ciclo, contato confirmado, sucessor ativo).

---

## Kind reservado (IA — não emitido ainda)

`appointment_awaiting_confirmation` — futuro estado em que a IA pergunta se a aula foi realizada, cancelada ou remarcada.  
Nesta entrega: documentado e preparado na UI; **backend não emite**; **sem mock**.

Fluxo manual atual continua como `appointment_needs_outcome`.
