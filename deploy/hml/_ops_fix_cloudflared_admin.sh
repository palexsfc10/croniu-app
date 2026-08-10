#!/usr/bin/env bash
# Restore broken cloudflared config.yml (dir) and expose admin HML hostname.
set -euo pipefail
ROOT=/home/palex/ntws/croniu-hml/deploy/hml
RUNTIME="$ROOT/cloudflared-runtime"
mkdir -p "$RUNTIME"
cat > "$RUNTIME/config.yml" <<'EOF'
tunnel: 01f63ea2-473f-46ad-bd2a-67eec32339f1
credentials-file: /home/nonroot/.cloudflared/01f63ea2-473f-46ad-bd2a-67eec32339f1.json
ingress:
  - hostname: croniu-hml.ntws.cloud
    service: http://127.0.0.1:13000
  - hostname: api-croniu-hml.ntws.cloud
    service: http://127.0.0.1:18080
  - hostname: admin-croniu-hml.ntws.cloud
    service: http://127.0.0.1:13002
  - service: http_status:404
EOF
chmod 644 "$RUNTIME/config.yml"

docker run --rm -v "$ROOT:/work" alpine sh -c '
  set -e
  if [ -d /work/cloudflared/config.yml ]; then
    mv /work/cloudflared/config.yml /work/cloudflared/config.yml.broken-dir
  fi
  mkdir -p /work/cloudflared
  cp /work/cloudflared-runtime/config.yml /work/cloudflared/config.yml
  chown -R 1000:1000 /work/cloudflared /work/cloudflared-runtime
  chmod 644 /work/cloudflared/config.yml
  echo FIXED
  cat /work/cloudflared/config.yml
'

echo "=== DNS admin ==="
docker run --rm --user 65532:65532 \
  -v /home/palex/cloudflared:/home/nonroot/.cloudflared \
  cloudflare/cloudflared:2025.7.0 \
  tunnel --origincert /home/nonroot/.cloudflared/cert.pem \
  route dns --overwrite-dns 01f63ea2-473f-46ad-bd2a-67eec32339f1 admin-croniu-hml.ntws.cloud 2>&1 | tail -8

cd "$ROOT"
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-cloudflared
sleep 6
docker ps --filter name=croniu-hml-cloudflared --format '{{.Names}} {{.Status}}'

WEB_IP=$(dig +short @1.1.1.1 croniu-hml.ntws.cloud A | head -1)
API_IP=$(dig +short @1.1.1.1 api-croniu-hml.ntws.cloud A | head -1)
ADM_IP=$(dig +short @1.1.1.1 admin-croniu-hml.ntws.cloud A | head -1)
echo "WEB_IP=$WEB_IP API_IP=$API_IP ADM_IP=$ADM_IP"
curl -sS --resolve "croniu-hml.ntws.cloud:443:${WEB_IP}" -o /dev/null -w 'web_https=%{http_code}\n' https://croniu-hml.ntws.cloud/
curl -sS --resolve "api-croniu-hml.ntws.cloud:443:${API_IP}" -o /dev/null -w 'api_https=%{http_code}\n' https://api-croniu-hml.ntws.cloud/health
curl -sS --resolve "admin-croniu-hml.ntws.cloud:443:${ADM_IP}" -o /dev/null -w 'admin_https=%{http_code}\n' https://admin-croniu-hml.ntws.cloud/ || echo 'admin_https=fail'
curl -sS -o /dev/null -w 'web_local=%{http_code}\n' http://127.0.0.1:13000/
curl -sS -o /dev/null -w 'admin_local=%{http_code}\n' http://127.0.0.1:13002/
docker ps --filter name=kyvora --format '{{.Names}} {{.Status}}' | head -3 || true
echo CLOUDFLARED_ADMIN_OK
