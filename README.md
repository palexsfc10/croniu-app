# Croniu

SaaS mobile-first (PWA) da **NTWS Labs** — assistente de rotina, ciclos e renovações para profissionais com clientes recorrentes.

> Slogan: *Sua rotina. Seus ciclos. Tudo sob controle.*

Esta entrega inclui documentação viva (Sprint 2A.1), fundação (auth + multi-tenant), painel admin de leitura, **Sprint 2A local** (clientes, serviços, ciclos, recebimentos, Hoje acionável) e artefatos de HML. Agenda, “Meu Ciclo” público e HML no Jarvis **não** estão nesta etapa.

**Agentes e humanos:** leia [`AGENTS.md`](./AGENTS.md) e o índice [`docs/README.md`](./docs/README.md). Especificação mestre: [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md).

## Pré-requisitos

- Node.js 22+
- Python 3.12+
- Docker + Docker Compose
- Git

## Estrutura

```
croniu/
├── apps/web/       # Next.js 16 PWA (profissionais)
├── apps/admin/     # Next.js painel da plataforma
├── backend/        # FastAPI + SQLAlchemy + Alembic
├── docs/           # PRODUCT_SPEC, estado, regras, sprints…
├── deploy/hml/     # Homologação Jarvis
└── compose.yaml    # Desenvolvimento local
```

## Variáveis de ambiente

```bash
cp .env.example .env
```

Ajuste segredos antes de qualquer ambiente compartilhado. O arquivo `.env` não deve ir para o Git.

## Inicialização local

### 1) Banco

```bash
docker compose up -d db
```

Porta padrão: `5432`. Se estiver ocupada, altere `POSTGRES_PORT` no `.env` e em `DATABASE_URL`.

### 2) API

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
# ou: pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: http://localhost:8000/health  
- OpenAPI: http://localhost:8000/docs  

### 3) Web (profissionais)

```bash
cd apps/web
npm ci
npm run dev
```

App: http://localhost:3000

### 4) Admin (plataforma)

```bash
cd apps/admin
npm ci
npm run dev
```

Admin: http://localhost:3002

Bootstrap do primeiro administrador (sem senha padrão / sem seed):

```bash
cd backend
# Windows PowerShell
$env:PLATFORM_ADMIN_EMAIL="ops@example.com"
$env:PLATFORM_ADMIN_FULL_NAME="Operador NTWS"
$env:PLATFORM_ADMIN_PASSWORD="senha-forte-nao-versionada"
.\.venv\Scripts\python.exe -m app.cli.create_platform_admin
```

Documentação: `docs/PLATFORM_ADMIN.md`. Hostname pretendido (a confirmar): `admin.croniu.com.br`.

### Compose completo (db + api + web)

```bash
docker compose up --build
```

## Migrations

```bash
cd backend
alembic upgrade head
alembic downgrade -1   # se necessário
```

## Testes

```bash
# Backend (requer Postgres acessível; cria DB croniu_test se possível)
cd backend
pytest

# Frontend unit
cd apps/web
npm run test

# E2E (API + web rodando)
npx playwright install chromium
npm run test:e2e
```

## Lint / typecheck / build

```bash
# Backend
cd backend
ruff check app tests
ruff format --check app tests
# Nota: `black --check` pode falhar em Python 3.12.5 (bug de AST);
# o projeto usa `ruff format` como formatador canônico.

# Frontend
cd apps/web
npm run lint
npm run typecheck
npm run build
```

## Seed

Nenhum seed automático nesta fundação. Dados de demonstração serão adicionados em sprint futura, idempotentes e nunca em produção.

## Portas

| Serviço | Porta padrão |
|---------|--------------|
| Web (profissionais) | **3000** (ou **3010** se ocupada) |
| Admin (plataforma) | **3002** |
| API (dev Croniu) | **8010** |
| Postgres (dev Croniu) | **5433** (5432 no host estava ocupada) |

## Desligar

```bash
docker compose down
# volumes locais do Postgres: docker compose down -v   (cuidado: apaga dados de DEV)
```

## HML (Jarvis)

Ver `deploy/hml/README.md`. Não implantar sem preflight remoto e gates locais verdes.

## Documentação

- `docs/VISION.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_RULES.md`
- `docs/UX_UI.md`
- `docs/ROADMAP.md`
- `docs/SECURITY.md`
- `docs/TEST_STRATEGY.md`
- `docs/DECISIONS.md`
- `docs/PLATFORM_ADMIN.md`

## Solução de problemas

- **CORS / cookie:** confirme `CORS_ORIGINS` e `NEXT_PUBLIC_API_URL`; requests usam `credentials: "include"`.
- **Migration falha:** verifique `DATABASE_URL` e se o container `db` está healthy.
- **Porta ocupada:** não mate processos de outros projetos; mude a porta no `.env`.
- **Testes backend sem DB:** suba `docker compose up -d db` antes do `pytest`.
