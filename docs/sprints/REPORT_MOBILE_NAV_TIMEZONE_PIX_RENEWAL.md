# Relatório — Mobile nav, timezone, Pix e renovação

**Branch:** `feature/mobile-nav-timezone-pix-renewal`  
**SHA base:** `1236958c409c11a84b634b862e7b9ad83a507746`  
**Baseline testes web:** 31 passed (antes da sprint) → 33 passed  
**Data:** 2026-08-04

## Diagnóstico inicial

1. Bottom nav mobile: só texto, pouca presença.
2. Card pagamentos: lista sem ícone/resumo.
3. Conflitos: `cycles/new` exibia ISO UTC bruto (`2026-08-14T12:00:00+00:00`); detecção correta, falha na apresentação.
4. Pix: já existia em payment-settings, mas aparecia no portal geral.
5. Renovação: interesse + prepare existiam; `renewalRequestId` não era enviado na criação do ciclo.
6. Comprovante: JPEG/PNG/WebP; PDF ausente.
7. Alembic head anterior: `0009_agent_foundation`.

## Causa do horário incorreto

O profissional informa `09:00` no fuso da org (`America/Sao_Paulo`). O backend persiste o instante UTC (`12:00Z` em agosto). A detecção de conflito compara instantes corretamente. O frontend do fluxo de ciclo listava `starts_at` sem `formatOrgDateTime`.

**Correção:** `formatConflictLine` / `formatConflictLines` com timezone IANA da organização (`me.organization.timezone` / preferences). Sem offset manual de −3h.

## Entregas

### Nav mobile
Ícones SVG locais (sem nova lib): Home, CalendarDays, UsersRound, RefreshCw, LayoutGrid. Ativo: primary + fundo sutil + `aria-current` + `aria-label`. Safe area preservada. Desktop sidebar inalterada na estrutura.

### Card pagamentos
Ícone Banknote, contagem, total real, CTA Revisar; vazio “Tudo certo por aqui”.

### Pix
Campo `institution`; checkbox “Disponibilizar Pix na etapa de renovação”. Portal: `payment_instructions` geral sem chave; `renewal_payment_instructions` só na etapa de renovação + Copiar chave.

### Renovação / aprovação
`IntelligentCycleCreate.renewal_request_id` → resolve renovação + `created_cycle_id` na mesma transação; idempotente. CTA “Confirmar pagamento e aprovar renovação”. `starts_on` preservado (teste `2026-09-01`).

### Comprovante
PDF/JPEG/PNG; storage privado existente; upload não confirma pagamento nem cria ciclo.

### Migration
`0010_pix_renewal_approval` — `institution`, `renewal_requests.created_cycle_id` (unique parcial).

## Testes

| Suite | Resultado |
|-------|-----------|
| Vitest web | 33 passed |
| typecheck / lint | PASS |
| pytest my_cycle + renewal | 8 passed |
| build | executar `next build --webpack` no ambiente Windows |

## Evidências chave

- Timezone: teste `formatConflictLine` 12:00Z → 09:00 SP.
- Idempotência: `test_renewal_approve_creates_one_cycle_and_is_idempotent`.
- Data preservada: assert `starts_on == 2026-09-01`.
- Pix fora do portal geral: assert `payment_instructions.configured is False`.
- Upload ≠ pagamento: fluxo 2D existente + PDF magic-byte.

## Não alterado

Billing Croniu, Asaas, WhatsApp, OCR, confirmação automática, Jarvis, produção.

## Pendências / riscos

- Homologação visual manual do rodapé e portal.
- Capturas before/after não geradas nesta sessão.
- Working tree ainda pode conter arquivos pré-existentes (avaliações/e2e/backend paralelo) não desta sprint.

## GO / NO-GO

**GO condicional** para homologação manual (nav, conflito de horário, renovação com Pix, aprovação). Pronto para billing SaaS somente após aceite visual/humano desta sprint.
