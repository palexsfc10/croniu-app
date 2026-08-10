#!/usr/bin/env bash
set -Eeuo pipefail
# Offline syntax/idempotency checks for release scripts (no HML/PRD).
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fail=0
for f in deploy/release/*.sh; do
  bash -n "$f" || { echo "syntax fail: $f"; fail=1; }
done
if bash deploy/release/restore.sh --environment prd --backup /tmp/none.sql.gz >/dev/null 2>&1; then
  echo "restore should require --yes"; fail=1
else
  echo "restore refuse-without-yes: ok"
fi
TMP="$(mktemp -d)"
mkdir -p "$TMP/deploy/prd" "$TMP/backups"
cp deploy/prd/compose.prd.yaml "$TMP/deploy/prd/"
cp deploy/prd/.env.prd.example "$TMP/deploy/prd/.env.prd"
# Fill empty required keys with non-secret placeholders for compose config only.
sed -i \
  -e 's/^POSTGRES_USER=$/POSTGRES_USER=croniu/' \
  -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=placeholder_not_a_secret/' \
  -e 's/^POSTGRES_DB=$/POSTGRES_DB=croniu/' \
  -e 's/^SECRET_KEY=$/SECRET_KEY=placeholder-secret-key-with-32chars-min/' \
  "$TMP/deploy/prd/.env.prd"
grep -q '^API_HOST_PORT=.' "$TMP/deploy/prd/.env.prd" || echo 'API_HOST_PORT=18080' >>"$TMP/deploy/prd/.env.prd"
grep -q '^WEB_HOST_PORT=.' "$TMP/deploy/prd/.env.prd" || echo 'WEB_HOST_PORT=13000' >>"$TMP/deploy/prd/.env.prd"
grep -q '^ADMIN_HOST_PORT=.' "$TMP/deploy/prd/.env.prd" || echo 'ADMIN_HOST_PORT=13002' >>"$TMP/deploy/prd/.env.prd"

export DEPLOY_ROOT="$TMP" ENVIRONMENT=prd \
  COMPOSE_FILE="$TMP/deploy/prd/compose.prd.yaml" \
  MANIFEST="$TMP/manifest.json"
printf '{"images":{"api":"x","web":"y","admin":"z"}}\n' >"$MANIFEST"

printf 'POSTGRES_USER=x\n' >"$TMP/incomplete.env"
export ENV_FILE="$TMP/incomplete.env"
if bash deploy/release/preflight.sh >/dev/null 2>&1; then
  echo "preflight should fail on missing keys"; fail=1
else
  echo "preflight missing-keys: ok"
fi

export ENV_FILE="$TMP/deploy/prd/.env.prd"
export CRONIU_API_IMAGE=example/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export CRONIU_WEB_IMAGE=example/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export CRONIU_ADMIN_IMAGE=example/admin@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null; then
  echo "compose.prd config: ok"
else
  echo "compose.prd config: fail"; fail=1
fi
exit "$fail"
