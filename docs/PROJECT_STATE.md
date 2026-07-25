# Croniu — Estado do projeto (auditoria)

**Data da auditoria:** 2026-07-24 (Sprint 2A.1)  
**Este documento descreve o que existe hoje**, não o ideal.

## Git

| Item | Valor |
|------|-------|
| Branch | `master` |
| HEAD / SHA | *inexistente — repositório sem commits* |
| Working tree | Conteúdo completo untracked (`apps/`, `backend/`, `docs/`, …) |
| Remoto | Não configurado nesta auditoria |

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
| API | **8010** | Uvicorn |
| Web | **3010** (ou 3000) | Next; preferir proxy `/api` |
| Admin | **3002** | Next separado |

Domínio real **não adquirido/confirmado**. Hostnames (`croniu.com.br`, `app.`, `api.`, `admin.`) são apenas planejamento.

## Migration

- **Head:** `0003_sprint2a_domain`
- Cadeia: `0001_initial` → `0002_platform_admin` → `0003_sprint2a_domain`
- Tabelas de negócio 2A: `clients`, `services`, `cycles`, `receivables`

## Modelos (`backend/app/models`)

`User`, `Organization`, `Membership`, `Session`, `PlatformMembership`, `PlatformSession`, `AdminAuditLog`, `Client`, `Service`, `Cycle`, `Receivable`

## Endpoints principais (`/api/v1`)

**Auth:** register, login, logout, me  
**Home:** `/home/summary`, `/ping-auth`  
**Domínio:** clients, services, cycles (+ whatsapp-prep, confirm-contact), receivables (+ mark-paid)  
**Platform:** auth admin, overview, organizations, users (leitura)  
**Health:** `/health`

## Páginas web (`apps/web`)

`/`, `/login`, `/register`, `/app` (Hoje), `/app/clients`, `/app/clients/new`, `/app/clients/[id]`, `/app/services`, `/app/services/new`, `/app/cycles`, `/app/cycles/new`, `/app/cycles/[id]`, `/app/receivables/[id]`, `/app/profile`

**Nav real:** Hoje · Clientes · Ciclos · Mais (sem Agenda)

## Páginas admin (`apps/admin`)

`/`, `/login`, `/dashboard`, `/organizations`, `/organizations/[id]`, `/users` — **leitura**

## Componentes principais

- `BrandWordmark` (identidade homologada)
- `AuthScreen` / `AdminAuthScreen`
- `AppShell` / `AdminShell`
- `TodayBoard`, `ContextualBar`
- UI: `Button`, `TextField`, `EmptyState`

## Testes (auditoria 2A.1)

| Suite | Resultado |
|-------|-----------|
| Backend pytest | **21 passed** |
| Web vitest | **11 passed** |
| Admin vitest | **4 passed** |
| Backend ruff | OK |
| Web lint | OK (1 warning RHF `watch`) |
| Web/Admin typecheck | OK |

E2E e artefatos (entrega 2A): `apps/web/e2e/sprint2a.spec.ts`, `artifacts/sprint2a/`

## Seed

`python -m app.cli.seed_demo` — fictício, idempotente, **não** auto-executar em HML/prod. Marker `[DEMO-CRONIU]`.

## Funcionalidades reais

Auth org, multi-tenant, clientes (CRUD parcial UI), serviços (criar/listar; PATCH API), ciclos period (criar/listar/detalhe), recebimentos manuais, Hoje acionável, WhatsApp prep, confirmação de contato, admin métricas leitura, PWA básica, wordmark.

## Limitações conscientes

- Sem agenda / locais / Meu Ciclo público  
- Sem pause/edit avançado de ciclo  
- Sem session_count / hybrid  
- Sem CSRF dual-token / rate limit login  
- Sem Google Calendar  
- Admin sem mutações  
- Sem commits no git  

## Integrações externas

Nenhuma ativa. WhatsApp = URL `wa.me` gerada no browser.

## HML / produção

- Artefatos em `deploy/hml/` **preservados**; **não implantados**  
- Jarvis **não acessado** nesta linha de trabalho  
- Produção **inexistente/não configurada**  

## Débitos técnicos (documentais)

1. Repositório sem commit inicial  
2. Docs antigos (`VISION`/`PRD`) desatualizados vs código 2A — mitigados por PRODUCT_SPEC  
3. Duplicação BrandWordmark web/admin por limitação Turbopack  
4. Status `expected` em query de recebimentos sem fluxo de criação correspondente  
5. Warning ESLint `react-hook-form` watch no formulário de ciclo  
