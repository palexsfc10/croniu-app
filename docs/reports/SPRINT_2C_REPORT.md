# Sprint 2C — Relatório de entrega

**Data:** 2026-07-24  
**Branch:** `feature/sprint-2c-cycle-intelligence`  
**SHA-base:** `b8ef0b980f54571328d716ea0424731449bca92b`

## Preflight

| Item | Valor |
|------|--------|
| Branch origem | `feature/sprint-2b-agenda-core` @ `b8ef0b9` |
| Working tree | limpa |
| Migration anterior | `0005_sprint2b_agenda` |
| Remoto | ausente |

## Decisões de domínio

| Tema | Decisão |
|------|---------|
| Money | Integer cents (mantido) |
| Serviço | `default_duration_minutes` (aula) + `default_duration_days` legado |
| Modelo | `calendar_months` ≠ `fixed_days` |
| `ends_on` inteligente | Renovação exclusiva |
| Legado | `is_legacy=true`; sem backfill financeiro |
| Edição × agenda | Sem sync de compromissos (ADR-024) |
| Conflito na geração | Bloqueio total atômico |
| Receivable | Vocabulário atual `pending`/`received` |

## Models / migration

- `0006_sprint2c_cycle_intelligence`
- `cycle_templates`
- `services.default_duration_minutes`
- Campos inteligentes em `cycles` (+ idempotency)

## API

- CRUD `/cycle-templates`
- `POST /cycles/preview`
- `POST /cycles/intelligent`
- `PATCH /cycles/{id}/intelligent`
- Serviços com duração em minutos

## Frontend

- Mais → Serviços / Modelos de ciclo
- Fluxo progressivo `/app/cycles/new`
- Listagem/detalhe com aulas e composição

## Cálculo

Enumeração real de datas `[starts_on, ends_on)`; `subtotal = aulas × unit`; ajuste ou final derivado.

## Gates

| Gate | Resultado |
|------|-----------|
| Ruff / pytest | OK / **51 passed** |
| Web lint/typecheck/vitest/build | OK (**16** testes) |
| Admin lint/typecheck/vitest/build | OK |
| Migration empty↔head + downgrade | OK |
| E2E 2C | **1 passed** |

## Pendências

- Sync de agenda na edição de ciclo
- Override de conflito
- Normalização `expected`/`received`
- UI rica de edição financeira no detalhe

## Próxima sprint sugerida

Homologação 2B+2C **ou** Google Calendar RO — não iniciar sem autorização.
