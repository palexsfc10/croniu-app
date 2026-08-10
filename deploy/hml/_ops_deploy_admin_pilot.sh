#!/usr/bin/env bash
# Deploy API + Admin for pilot ops panel (HML only). Does not recreate web by default.
set -euo pipefail
SHA="${1:?sha}"
ROOT=/home/palex/ntws/croniu-hml
TGZ=/tmp/croniu-admin-pilot.tgz
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

rm -rf /tmp/croniu-admin-pilot-extract
mkdir -p /tmp/croniu-admin-pilot-extract
tar -xzf "$TGZ" -C /tmp/croniu-admin-pilot-extract
SRC=/tmp/croniu-admin-pilot-extract
if [[ ! -d "$SRC/backend" ]]; then SRC=$(echo /tmp/croniu-admin-pilot-extract/*/ | head -1); fi

# Preserve secrets and tunnel config
rsync -a \
  --exclude 'deploy/hml/.env.hml' \
  --exclude 'deploy/hml/cloudflared' \
  --exclude 'deploy/hml/cloudflared-runtime' \
  --exclude 'node_modules' --exclude '.venv' --exclude '.next' --exclude '.git' \
  "$SRC/" "$ROOT/"
echo "$SHA" > "$ROOT/SOURCE_SHA.txt"

cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a

# Ensure CORS includes public admin hostname (idempotent)
python3 - <<'PY'
from pathlib import Path
p = Path("/home/palex/ntws/croniu-hml/deploy/hml/.env.hml")
text = p.read_text(encoding="utf-8")
lines = text.splitlines()
out = []
need = "https://admin-croniu-hml.ntws.cloud"
for line in lines:
    if line.startswith("CORS_ORIGINS="):
        val = line.split("=", 1)[1]
        parts = [x.strip() for x in val.split(",") if x.strip()]
        if need not in parts:
            parts.append(need)
        # also keep public web/api
        for extra in ("https://croniu-hml.ntws.cloud", "https://api-croniu-hml.ntws.cloud"):
            if extra not in parts:
                parts.append(extra)
        out.append("CORS_ORIGINS=" + ",".join(parts))
    elif line.startswith("NEXT_PUBLIC_ADMIN_URL="):
        out.append("NEXT_PUBLIC_ADMIN_URL=https://admin-croniu-hml.ntws.cloud")
    else:
        out.append(line)
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("cors_admin_origin=ok")
PY
chmod 600 .env.hml
set -a; source .env.hml; set +a

docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$ROOT/backend/Dockerfile" "$ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_ADMIN_URL:-https://admin-croniu-hml.ntws.cloud}" \
  -t "${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}" \
  -f "$ROOT/apps/admin/Dockerfile" "$ROOT/apps/admin"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
docker exec croniu-hml-api alembic current

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-admin
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-admin 2>/dev/null || echo missing)
  echo "admin_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done

# web must remain healthy without recreate
curl -sS -o /dev/null -w 'web_local=%{http_code}\n' http://127.0.0.1:13000/
curl -sS -o /dev/null -w 'api_local=%{http_code}\n' http://127.0.0.1:18080/health
curl -sS -o /dev/null -w 'admin_local=%{http_code}\n' http://127.0.0.1:13002/
WEB_IP=$(dig +short @1.1.1.1 croniu-hml.ntws.cloud A | head -1)
API_IP=$(dig +short @1.1.1.1 api-croniu-hml.ntws.cloud A | head -1)
ADM_IP=$(dig +short @1.1.1.1 admin-croniu-hml.ntws.cloud A | head -1)
curl -sS --resolve "croniu-hml.ntws.cloud:443:${WEB_IP}" -o /dev/null -w 'web_https=%{http_code}\n' https://croniu-hml.ntws.cloud/
curl -sS --resolve "api-croniu-hml.ntws.cloud:443:${API_IP}" -o /dev/null -w 'api_https=%{http_code}\n' https://api-croniu-hml.ntws.cloud/health
curl -sS --resolve "admin-croniu-hml.ntws.cloud:443:${ADM_IP}" -o /dev/null -w 'admin_https=%{http_code}\n' https://admin-croniu-hml.ntws.cloud/

printf '%s\n' "$SHA" "feature=admin-pilot-ops" "migration=none" "deployed_at=$STAMP" "web_preserved=true" > "$ROOT/DEPLOY_MARKER.txt"
echo DEPLOY_ADMIN_PILOT_DONE
