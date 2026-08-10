#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_env_file "$ENV_FILE"

for tool in docker jq curl gzip sha256sum flock df; do
  require_command "$tool"
done

[[ -f "$MANIFEST" ]] || die "Manifest not found: $MANIFEST"
jq -e '.images.api and .images.web and .images.admin' "$MANIFEST" >/dev/null ||
  die "Manifest must contain images.api, images.web, and images.admin"
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "Environment file not found: $ENV_FILE"

missing=()
required_keys=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  API_HOST_PORT WEB_HOST_PORT ADMIN_HOST_PORT
  SECRET_KEY CORS_ORIGINS SESSION_COOKIE_SECURE OPENAPI_ENABLED
  PUBLIC_APP_BASE_URL APP_PUBLIC_URL API_PUBLIC_URL ADMIN_PUBLIC_URL
  EMAIL_PROVIDER EMAIL_FROM
)

for key in "${required_keys[@]}"; do
  if ! grep -Eq "^${key}=" "$ENV_FILE"; then
    missing+=("$key")
    continue
  fi
  value="$(grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2-)"
  if [[ -z "$value" ]]; then
    missing+=("$key")
  fi
done

if ((${#missing[@]})); then
  die "Missing required environment keys (names only): ${missing[*]}"
fi

if [[ "${ENVIRONMENT:-}" == "prd" ]]; then
  secure="$(grep -E '^SESSION_COOKIE_SECURE=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr '[:upper:]' '[:lower:]')"
  openapi="$(grep -E '^OPENAPI_ENABLED=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr '[:upper:]' '[:lower:]')"
  cors="$(grep -E '^CORS_ORIGINS=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
  [[ "$secure" == "true" || "$secure" == "1" ]] || die "SESSION_COOKIE_SECURE must be true in prd"
  [[ "$openapi" == "false" || "$openapi" == "0" ]] || die "OPENAPI_ENABLED must be false in prd"
  [[ "$cors" != *"localhost"* ]] || die "CORS_ORIGINS must not include localhost in prd"
fi

min_gb="${MIN_FREE_DISK_GB:-5}"
avail_kb="$(df -Pk "$DEPLOY_ROOT" | awk 'NR==2 {print $4}')"
need_kb=$((min_gb * 1024 * 1024))
((avail_kb >= need_kb)) || die "Insufficient disk space under $DEPLOY_ROOT (need ${min_gb}GiB)"

docker info >/dev/null
compose config --quiet
log "Preflight passed for $ENVIRONMENT"
