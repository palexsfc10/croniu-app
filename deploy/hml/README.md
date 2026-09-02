# Croniu HML — Jarvis

Homologação exclusiva do Croniu no servidor compartilhado **jarvis**.

Serviços: `croniu-hml-web`, `croniu-hml-admin`, `croniu-hml-api`, `croniu-hml-db`.

Hostname admin sugerido (a confirmar, sem DNS silencioso): `admin-hml.croniu.com.br`.

## Proteções

- Prefixo obrigatório: `croniu-hml-*`
- Não executar `docker system prune`
- Não parar/alterar Samba, UniFi ou outros projetos
- Não publicar PostgreSQL no host
- `.env.hml` apenas no servidor (nunca no Git)

## Artefatos

| Arquivo | Função |
|---------|--------|
| `compose.hml.yaml` | Stack HML |
| `.env.hml.example` | Modelo de variáveis |
| `deploy.sh` | Build + up (`up`/`build`); deploy só de `web` ou só de `api` (`up-web`/`build-web`, `up-api`/`build-api`, ver abaixo) |
| `healthcheck.sh` | Smokes técnicos |
| `rollback.sh` | Stop preservando volume / imagens anteriores |

## Preparação no Jarvis

1. Preflight de leitura (hostname, memória, portas, containers).
2. Criar `/srv/docker/croniu` se disponível.
3. Copiar repositório / artefatos.
4. `cp .env.hml.example .env.hml` e preencher segredos + portas livres.
5. `chmod +x deploy.sh healthcheck.sh rollback.sh`
6. `./deploy.sh up`
7. `./healthcheck.sh`

## Deploy só de frontend (`apps/web`)

`./deploy.sh up` reconstrói as 3 imagens (api/web/admin) a cada execução — `BUILD_TIME`/`GIT_SHA`
mudam o digest mesmo sem alteração de código, e como `croniu-hml-web` tem `depends_on:
croniu-hml-api: condition: service_healthy`, um `compose up -d croniu-hml-web` comum recria a API
também, mesmo que só o frontend tenha mudado.

Para uma mudança que toca só `apps/web`, use:

```
GIT_SHA=<sha-do-commit-implantado> ./deploy.sh up-web
```

`up-web`:
- builda **só** a imagem `croniu-hml-web` (`build-web` builda sem recriar o container, útil pra
  inspecionar antes de trocar).
- confirma, pela label OCI `org.opencontainers.image.revision` gravada na imagem, que o build
  corresponde exatamente ao `GIT_SHA` pedido — aborta antes de recriar o container se não bater.
- recria o container com `docker compose up -d --no-deps croniu-hml-web`, então `croniu-hml-api` e
  `croniu-hml-admin` nunca são tocados por causa de dependência.
- prova isso: captura `Id` e `StartedAt` de `croniu-hml-api`/`croniu-hml-admin` antes e depois, e
  aborta com erro se qualquer um dos dois mudar.
- os build-args do Google OAuth (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) são repassados normalmente a
  partir de `.env.hml` — nunca impressos, só validados por presença/tamanho em `load_env`.

Testado em 2026-09-02 nesta stack (rebuild do `croniu-hml-web` no commit `33ce895` da branch
`feature/croniu-workspace-hml`): imagem confirmada no SHA esperado, `croniu-hml-web` recriado,
`croniu-hml-api`/`croniu-hml-admin` preservados (mesmo `Id` de container e mesmo `StartedAt`).

## Deploy só de backend (`backend/`)

Mesmo princípio, espelhado para a API — necessário quando uma fatia adiciona endpoint(s) aditivo(s)
sem migration (ex.: fatia Clientes + Cliente 360°, que expôs `GET /clients/{id}/appointments`,
`GET /clients/{id}/receivables` e `GET /agenda/next-appointments`, todos read-only, sem alterar
schema). `croniu-hml-api` não é dependência de ninguém no compose, então não há o mesmo risco de
recriação em cascata do lado web — ainda assim `up-api` usa `--no-deps` e prova `web`/`admin`
intocados, pela mesma disciplina:

```
GIT_SHA=<sha-do-commit-implantado> ./deploy.sh up-api
```

`up-api`:
- builda **só** a imagem `croniu-hml-api` (`build-api` builda sem recriar o container).
- confirma pela mesma label OCI que o build bate com o `GIT_SHA` pedido.
- recria o container com `docker compose up -d --no-deps croniu-hml-api`.
- prova `Id`/`StartedAt` de `croniu-hml-web` e `croniu-hml-admin` inalterados antes/depois.

`up-web` e `up-api` são independentes — uma fatia que muda `apps/web` e `backend/` ao mesmo tempo
roda os dois, nunca `up`/`build` (que sempre recriam as 3 imagens).

## Domínios

Sugestões (confirmar antes de DNS/túnel):

- App: `hml.croniu.com`
- API: `api-hml.croniu.com`

Sem confirmação, usar acesso por IP/porta local documentada no `.env.hml`.

## Billing Asaas (sandbox Croniu)

Credenciais **exclusivas Croniu** — nunca reutilizar API key / webhook token / IDs do Kyvora.

| Variável | HML padrão |
|----------|------------|
| `ASAAS_ENVIRONMENT` | `sandbox` |
| `ASAAS_API_URL` | `https://sandbox.asaas.com/api/v3` |
| `BILLING_CARD_ENABLED` | **`false`** até evidência sandbox própria |
| `PUBLIC_APP_BASE_URL` | mesma origem do web HML (callbacks `/app/billing/return/*`) |
| Webhook URL | `https://<api-hml>/api/v1/billing/webhooks/asaas` (token no header Asaas) |

Checklist de evidências: `docs/sprints/EVIDENCE_BILLING_HML.md`.

`./healthcheck.sh` inclui smoke de entitlement (trial no register) e guard de cartão.

## Rollback

- Primeira versão: `./rollback.sh stop` (remove containers/rede Croniu; **preserva** volume do banco).
- Versões seguintes: `PREV_API_IMAGE=... PREV_WEB_IMAGE=... ./rollback.sh previous-image`

## Backup / restore (banco)

```bash
docker exec croniu-hml-db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
# restore
cat backup.sql | docker exec -i croniu-hml-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
