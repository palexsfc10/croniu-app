# Sprint 2B — Relatório de entrega (Agenda Core)

**Data:** 2026-07-24  
**Branch:** `feature/sprint-2b-agenda-core`  
**SHA-base:** `e77905da6f6665ad69225d2902e646fa824844bc`

## Preflight

| Item | Valor |
|------|--------|
| Branch | `feature/sprint-2b-agenda-core` |
| Working tree inicial | limpa |
| Remoto | ausente |
| Divergência | Auth text citava head `0003`; real era `0004_password_reset` → nova `0005_sprint2b_agenda` |

## Implementação

| Área | Resultado |
|------|-----------|
| Timezone IANA | `organizations.timezone` default `America/Sao_Paulo`; Preferências em Mais |
| Locais | CRUD + arquivamento; busca |
| Compromissos | único; edição; cancelamento; resultado opcional |
| Conflitos | bloqueio 409 `appointment_conflict`; half-open; override `PENDENTE_DE_DECISAO` |
| Agenda | visão diária + nav |
| Hoje | compromissos reais do dia |
| Barra contextual | próximo compromisso / prioridade revisada |
| Navegação | Hoje · Agenda · Clientes · Ciclos · Mais |

## Banco

- Migration `0005_sprint2b_agenda`
- Tabelas: `locations`, `appointments`; coluna `organizations.timezone`
- Upgrade atual → head OK; empty DB → head OK; downgrade → `0004` → upgrade OK

## API

- `GET/PATCH /api/v1/organization/preferences`
- `GET/POST /api/v1/locations`, `GET/PATCH /api/v1/locations/{id}`
- `POST /api/v1/appointments`, `GET/PATCH /api/v1/appointments/{id}`
- `GET /api/v1/agenda/day`
- Home summary enriquecido; admin overview com contagem agregada

## Testes / gates

| Gate | Resultado |
|------|-----------|
| Ruff | OK |
| pytest | **37 passed** |
| Web lint | OK (warning RHF pré-existente em cycles/new) |
| Web typecheck / vitest / build | OK (**14** testes) |
| Admin lint / typecheck / vitest / build | OK (**4** testes) |
| E2E Sprint 2B | **2 passed** (fluxo + isolamento) |
| Migration empty↔head | OK |

## Segurança

- Isolamento tenant locais/compromissos (pytest + E2E)
- Sessão define org; UUID cruzado negado
- Observações internas só na área profissional
- Admin: métrica agregada + timezone; sem editar agenda

## Git

- Commits locais somente em `feature/sprint-2b-agenda-core`
- Sem push; sem merge em `main`; sem remoto

## Pendências

- Override de conflito com confirmação explícita
- Recorrência / Google Calendar / Meu Ciclo
- Normalização receivable `expected`/`received` (mantida)
- Warning RHF em cycles/new (não tocado)

## Próxima sprint sugerida

Endurecimento de Agenda **ou** Google Calendar RO — **não iniciar** sem autorização.
