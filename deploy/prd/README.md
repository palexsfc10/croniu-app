# Production compose

Production configuration lives on the server at `/srv/docker/croniu-prd`. Copy
`deploy/prd/env.prd.example` there as the persistent `config/.env.prd` (or the
legacy path `deploy/prd/.env.prd`) and populate secrets **only on the server**;
do not commit the resulting file.

(The Package deploy bundle excludes `.env*` files. `env.prd.example` is the
safe template that ships inside the immutable artifact.)

Release deployments use immutable image references from a CI-generated manifest:

```bash
deploy/release/deploy.sh --environment prd --sha <sha> --manifest <manifest.json>
```

`deploy.sh` loads `CRONIU_API_IMAGE` / `CRONIU_WEB_IMAGE` / `CRONIU_ADMIN_IMAGE`
from the release-manifest **before** preflight/`docker compose config`.

The script runs migrations as a one-off container, not from API startup.

## Services

| Compose service | Container            | Host bind (loopback)     | Internal URL        |
|-----------------|----------------------|--------------------------|---------------------|
| `db`            | `croniu-prd-db`      | (none)                   | `db:5432`           |
| `api`           | `croniu-prd-api`     | `127.0.0.1:${API_HOST_PORT}` → 8000 | `http://api:8000` |
| `web`           | `croniu-prd-web`     | `127.0.0.1:${WEB_HOST_PORT}` → 3000 | `http://web:3000` |
| `admin`         | `croniu-prd-admin`   | `127.0.0.1:${ADMIN_HOST_PORT}` → 3000 | `http://admin:3000` |
| `cloudflared`   | `croniu-prd-cloudflared` | (none; profile `edge`) | connector only   |

Default `docker compose up` / `deploy.sh` start **only** `db`, `api`, `web`, and
`admin`. The Cloudflare connector is **not** started unless profile `edge` is
requested explicitly.

## Cloudflare Tunnel (`profile: edge`)

### Contract

- Service: `cloudflared` / container `croniu-prd-cloudflared`
- Image: digest-pinned `cloudflare/cloudflared` (never `:latest`)
- External secret: `CLOUDFLARE_TUNNEL_TOKEN` in `.env.prd` (maps to process env `TUNNEL_TOKEN`)
- Token must never appear in images, evidence, argv, or logs
- Same Docker network `croniu-prd-network` (reaches `web` / `api` / `admin` by name)
- No published ports, no host network, no privileged mode, no Docker socket

### First deploy (loopback)

1. Leave `CLOUDFLARE_TUNNEL_TOKEN` empty (or unset).
2. Run `deploy.sh` as usual — **do not** pass `--profile edge`.
3. Validate app/api/admin on `127.0.0.1` host ports only.

### Later: enable the connector

1. Store a real token in the server `.env.prd` as `CLOUDFLARE_TUNNEL_TOKEN` (mode 600).
2. Configure remote Tunnel origins in Cloudflare (not in this compose):
   - `app.croniu.com.br` → `http://web:3000`
   - `api.croniu.com.br` → `http://api:8000`
   - `admin.croniu.com.br` → `http://admin:3000`
3. Ensure Cloudflare Access protects **admin** before publishing that hostname.
4. Prefer the fail-closed helper (checks SET/MISSING without printing the value):

```bash
ENV_FILE=/srv/docker/croniu-prd/config/.env.prd \
  COMPOSE_FILE=/srv/docker/croniu-prd/releases/<ver>/deploy/prd/compose.prd.yaml \
  /srv/docker/croniu-prd/releases/<ver>/deploy/prd/edge_up.sh
```

Or start manually:

```bash
docker compose -p croniu-prd --env-file /srv/docker/croniu-prd/config/.env.prd \
  -f /srv/docker/croniu-prd/releases/<ver>/deploy/prd/compose.prd.yaml \
  --profile edge up -d cloudflared
```

Compose interpolates the whole file even when `edge` is inactive, so the compose
mapping uses `${CLOUDFLARE_TUNNEL_TOKEN:-}` (empty allowed for loopback). Fail-closed
behavior for activation is enforced by `edge_up.sh`.

### Disable / rollback connector only

```bash
ENV_FILE=... COMPOSE_FILE=... ./deploy/prd/edge_down.sh
# or: docker compose ... --profile edge stop cloudflared
```

Application `rollback.sh` recreates **api/web/admin** only. It does **not** create,
destroy, or reconfigure Cloudflare Tunnel, DNS, or Access. Edge release upgrades are
independent: recreate `cloudflared` explicitly with `--profile edge` when the
connector image pin in compose changes.

### Token hygiene

- Status checks may report `CLOUDFLARE_TUNNEL_TOKEN=SET|MISSING` only — never the value
- Rotate/revoke the token in the Cloudflare dashboard, then update `.env.prd` and
  recreate the connector with `--profile edge`
- Disaster recovery: restore `.env.prd` from encrypted backup, pull the pinned
  cloudflared digest if missing, then `up -d` with `--profile edge` after app
  services are healthy on the internal network
