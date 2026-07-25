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

- **Head:** `0006_sprint2c_cycle_intelligence`
- Cadeia: `0001` → `0002` → `0003` → `0004` → `0005` → `0006_sprint2c_cycle_intelligence`
- Tabelas: + `cycle_templates`; serviços com `default_duration_minutes`; ciclos com snapshot financeiro/aulas

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

Auth org, multi-tenant, clientes, serviços, ciclos period, recebimentos manuais, Hoje acionável, WhatsApp prep, confirmação de contato, **timezone org**, **locais**, **compromissos únicos**, **Agenda diária**, **barra contextual com próximo compromisso**, admin métricas leitura (incl. contagem agregada de compromissos), PWA básica, wordmark.

## Limitações conscientes

- Sem recorrência / Google Calendar / Meu Ciclo público  
- Sem override de conflito de agenda (bloqueio 409)  
- Sem pause/edit avançado de ciclo  
- Sem session_count / hybrid  
- Sem CSRF dual-token / rate limit login  
- Admin sem mutações de agenda  
- Sem remoto / push nesta linha  

## Integrações externas

Nenhuma ativa. WhatsApp = URL `wa.me` gerada no browser.

## HML / produção

- Artefatos em `deploy/hml/` **preservados**; **não implantados**  
- Jarvis **não acessado** nesta linha de trabalho  
- Produção **inexistente/não configurada**  

## Débitos técnicos (documentais)

1. Vocabulário receivable `received` / `expected` vs alvo `pending`/`paid` — mantido na 2B  
2. Warning ESLint `react-hook-form` watch no formulário de ciclo (não tocado na 2B)  
3. Duplicação BrandWordmark web/admin por limitação Turbopack  
4. Override de conflito = `PENDENTE_DE_DECISAO`  
