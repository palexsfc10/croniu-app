# Croniu Admin

Painel administrativo da **plataforma** Croniu (NTWS Labs).

Não confundir com o administrador da organização (profissional). Este app é exclusivo para operadores autorizados.

## Desenvolvimento

Pré-requisitos: API FastAPI rodando e Postgres disponível (ver README na raiz).

```bash
cd apps/admin
npm ci
npm run dev
```

Abre em http://localhost:3002

Variáveis:

- `NEXT_PUBLIC_API_URL` — ex.: `http://127.0.0.1:8010`

## Bootstrap do primeiro admin

```bash
cd backend
$env:PLATFORM_ADMIN_EMAIL="ops@example.com"
$env:PLATFORM_ADMIN_FULL_NAME="Operador NTWS"
$env:PLATFORM_ADMIN_PASSWORD="senha-forte-nao-versionada"
.\.venv\Scripts\python.exe -m app.cli.create_platform_admin
```

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Documentação

- `docs/PLATFORM_ADMIN.md`
- ADR-011 / ADR-012 em `docs/DECISIONS.md`

Hostname pretendido (a confirmar, sem DNS silencioso): `admin.croniu.com.br`
