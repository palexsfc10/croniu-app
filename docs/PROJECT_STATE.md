# Croniu — Estado do projeto (auditoria)

**Data da auditoria:** 2026-07-24 (Sprint 2C.1)  
**Este documento descreve o que existe hoje**, não o ideal.

## Git

| Item | Valor |
|------|-------|
| Branch | `feature/sprint-2c1-cycle-financial-edit` |
| SHA-base 2C | `545148029442d89c08834195e30535dd06c93bfe` |
| Remoto | Não configurado |
| Merge em `main` | Não |

## Stack e versões

| Camada | Tecnologia |
|--------|------------|
| Web profissionais | Next.js **16.2.11**, React **19.2.4**, Tailwind 4, Vitest, Playwright |
| Admin plataforma | Next.js **16.2.11**, React **19.2.4** |
| API | Python **≥3.12**, FastAPI, SQLAlchemy 2, Alembic, Pydantic, pwdlib/Argon2 |
| DB | PostgreSQL 16 (Compose `postgres:16-alpine`) |
| Brand | `packages/brand` + cópias em `apps/*/src/components/brand` |

## Portas e serviços locais (configuráveis via env)

| Serviço | Porta típica | Notas |
|---------|--------------|-------|
| Postgres Croniu | **5433** → 5432 container | Host 5432 reservado a outro projeto |
| API | **8010**–**8012** | Uvicorn |
| Web | **3010**–**3015** | Next; preferir proxy `/api` |
| Admin | **3002** | Next separado |

Domínio real **não adquirido/confirmado**. Hostnames (`croniu.com.br`, `app.`, `api.`, `admin.`) são apenas planejamento.

## Migration

- **Head:** `0006_sprint2c_cycle_intelligence`
- Cadeia: `0001` → `0002` → `0003` → `0004` → `0005` → `0006`
- Sem migration nova na 2C.1

## Modelos (`backend/app/models`)

`User`, `Organization`, `Membership`, `Session`, `PlatformMembership`, `PlatformSession`, `AdminAuditLog`, `Client`, `Service`, `Cycle`, `CycleTemplate`, `Receivable`, `Location`, `Appointment`

## Endpoints principais (`/api/v1`)

**Auth:** register, login, logout, me  
**Home:** `/home/summary`, `/ping-auth`  
**Domínio:** clients, services, cycles (+ intelligent, preview, financial, whatsapp-prep, confirm-contact), cycle-templates, receivables (+ mark-paid)  
**Agenda:** locations, appointments, agenda/day, organization/preferences  
**Platform:** auth admin, overview, organizations, users (leitura)  
**Health:** `/health`

## Páginas web (`apps/web`)

`/`, `/login`, `/register`, `/app` (Hoje), `/app/agenda`, `/app/clients`, `/app/clients/new`, `/app/clients/[id]`, `/app/services`, `/app/services/new`, `/app/cycle-templates`, `/app/cycles`, `/app/cycles/new`, `/app/cycles/[id]`, `/app/cycles/[id]/financial`, `/app/receivables/[id]`, `/app/profile`, preferências/locais via Mais

**Nav real:** Hoje · Agenda · Clientes · Ciclos · Mais

## Páginas admin (`apps/admin`)

`/`, `/login`, `/dashboard`, `/organizations`, `/organizations/[id]`, `/users` — **leitura**

## Testes (pós-2C.1)

| Suite | Resultado |
|-------|-----------|
| Backend pytest | **72 passed** |
| Web vitest | **19 passed** |
| Admin vitest | **4 passed** |
| Backend ruff | OK |
| Web lint | OK (sem warning RHF `watch`) |
| Web/Admin typecheck / build | OK |
| E2E 2C.1 | **3 passed** (`e2e/sprint2c1.spec.ts`) |

## Seed

`python -m app.cli.seed_demo` — fictício, idempotente, **não** auto-executar em HML/prod. Marker `[DEMO-CRONIU]`.

## Funcionalidades reais

Auth org, multi-tenant, clientes, serviços (valor/aula), modelos de ciclo, ciclos inteligentes (preview + geração opcional), **edição financeira na UI** (desconto/final; bloqueio se pago), recebimentos manuais, Hoje acionável, WhatsApp prep, confirmação de contato, timezone org, locais, compromissos únicos, Agenda diária, barra contextual, admin métricas leitura, PWA básica, wordmark.

## Limitações conscientes

- Sem sync de agenda na edição de ciclo (ADR-024)  
- Sem recorrência / Google Calendar / Meu Ciclo público  
- Sem override de conflito de agenda (bloqueio 409)  
- Sem session_count / hybrid  
- Sem CSRF dual-token / rate limit login  
- Admin sem mutações de agenda  
- Sem remoto / push nesta linha  
- Vocabulário receivable `received` / `expected` mantido (não normalizado)

## Integrações externas

Nenhuma ativa. WhatsApp = URL `wa.me` gerada no browser.

## HML / produção

- Artefatos em `deploy/hml/` **preservados**; **não implantados**  
- Jarvis **não acessado** nesta linha de trabalho  
- Produção **inexistente/não configurada**  

## Débitos técnicos (documentais)

1. Vocabulário receivable `received` / `expected` vs alvo `pending`/`paid`  
2. Duplicação BrandWordmark web/admin por limitação Turbopack  
3. Override de conflito = `PENDENTE_DE_DECISAO`  
4. Sync de compromissos na edição de ciclo = planejado (ADR-024)  
