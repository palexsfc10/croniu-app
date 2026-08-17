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

env_value() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d= -f2-
}

if [[ "${ENVIRONMENT:-}" == "prd" ]]; then
  secure="$(env_value SESSION_COOKIE_SECURE | tr '[:upper:]' '[:lower:]')"
  openapi="$(env_value OPENAPI_ENABLED | tr '[:upper:]' '[:lower:]')"
  cors="$(env_value CORS_ORIGINS)"
  email_provider="$(env_value EMAIL_PROVIDER | tr '[:upper:]' '[:lower:]')"
  verify_req="$(env_value EMAIL_VERIFICATION_REQUIRED | tr '[:upper:]' '[:lower:]')"
  asaas_env="$(env_value ASAAS_ENVIRONMENT | tr '[:upper:]' '[:lower:]')"
  asaas_url="$(env_value ASAAS_API_URL)"
  billing="$(env_value BILLING_ENABLED | tr '[:upper:]' '[:lower:]')"
  ai="$(env_value AI_ENABLED | tr '[:upper:]' '[:lower:]')"

  [[ "$secure" == "true" || "$secure" == "1" ]] || die "SESSION_COOKIE_SECURE must be true in prd"
  [[ "$openapi" == "false" || "$openapi" == "0" ]] || die "OPENAPI_ENABLED must be false in prd"
  [[ "$cors" != *"localhost"* ]] || die "CORS_ORIGINS must not include localhost in prd"
  # EMAIL_PROVIDER is the explicit enable/disable switch (matches backend factory):
  #   fake|test|noop → outbound email disabled (Resend not required)
  #   resend         → outbound email enabled (real RESEND_API_KEY required)
  [[ -n "$email_provider" ]] || die "EMAIL_PROVIDER must be set explicitly in prd"
  case "$email_provider" in
    fake|test|noop)
      log "EMAIL_PROVIDER=$email_provider — outbound email disabled; RESEND_API_KEY not required"
      ;;
    resend)
      resend_key="$(env_value RESEND_API_KEY)"
      [[ -n "$resend_key" ]] || die "RESEND_API_KEY must be set when EMAIL_PROVIDER=resend"
      # Reject obvious placeholders without printing the secret.
      resend_key_l="$(printf '%s' "$resend_key" | tr '[:upper:]' '[:lower:]')"
      if [[ "$resend_key_l" == *synthetic* || "$resend_key_l" == *placeholder* ||
            "$resend_key_l" == *changeme* || "$resend_key_l" == *example* ||
            "$resend_key_l" == *your_api* || "$resend_key_l" == *xxx* ]]; then
        die "RESEND_API_KEY looks like a placeholder; refuse when EMAIL_PROVIDER=resend"
      fi
      [[ -n "$(env_value EMAIL_FROM)" ]] || die "EMAIL_FROM must be set when EMAIL_PROVIDER=resend"
      email_from_l="$(printf '%s' "$(env_value EMAIL_FROM)" | tr '[:upper:]' '[:lower:]')"
      [[ "$email_from_l" == *"@send.croniu.com.br"* ]] ||
        die "EMAIL_FROM must use @send.croniu.com.br in prd (verified Resend domain)"
      [[ "$verify_req" == "true" || "$verify_req" == "1" ]] ||
        die "EMAIL_VERIFICATION_REQUIRED must be true when EMAIL_PROVIDER=resend"
      ;;
    *)
      die "EMAIL_PROVIDER must be fake (disabled) or resend (enabled) in prd"
      ;;
  esac
  # Compose/runtime also require exported digest-pinned images before config.
  require_digest_image_ref CRONIU_API_IMAGE "${CRONIU_API_IMAGE:-}"
  require_digest_image_ref CRONIU_WEB_IMAGE "${CRONIU_WEB_IMAGE:-}"
  require_digest_image_ref CRONIU_ADMIN_IMAGE "${CRONIU_ADMIN_IMAGE:-}"
  [[ "$asaas_env" == "production" ]] || die "ASAAS_ENVIRONMENT must be production in prd"
  [[ "$asaas_url" == *"api.asaas.com/v3"* ]] || die "ASAAS_API_URL must be https://api.asaas.com/v3"
  [[ "$asaas_url" != *"/api/v3"* ]] || die "ASAAS_API_URL must not use /api/v3 on api.asaas.com"
  [[ "$asaas_url" != *"sandbox"* ]] || die "ASAAS_API_URL must not be sandbox in prd"
  if [[ "$billing" == "true" || "$billing" == "1" || -z "$billing" ]]; then
    [[ -n "$(env_value ASAAS_API_KEY)" ]] || die "ASAAS_API_KEY required when billing enabled"
    [[ -n "$(env_value ASAAS_WEBHOOK_TOKEN)" ]] || die "ASAAS_WEBHOOK_TOKEN required when billing enabled"
  fi
  if [[ "$ai" == "true" || "$ai" == "1" ]]; then
    [[ -n "$(env_value OPENAI_API_KEY)$(env_value LLM_API_KEY)" ]] || die "AI_ENABLED requires OPENAI_API_KEY or LLM_API_KEY"
  fi

  # Ports must be loopback-bound in compose (reject 0.0.0.0 publishes).
  if grep -Eq '^[[:space:]]*-[[:space:]]*(")?[0-9]+:|"?[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:' "$COMPOSE_FILE"; then
    if ! grep -Eq '127\.0\.0\.1:\$\{(API|WEB|ADMIN)_HOST_PORT\}' "$COMPOSE_FILE"; then
      die "PRD compose must bind host ports to 127.0.0.1 only"
    fi
  fi
  if grep -Eq '0\.0\.0\.0:\$\{(API|WEB|ADMIN)_HOST_PORT\}' "$COMPOSE_FILE"; then
    die "PRD compose must not bind 0.0.0.0"
  fi

  for svc in api web admin; do
    img="$(jq -er --arg s "$svc" '.images[$s]' "$MANIFEST")"
    [[ "$img" == *"@sha256:"* ]] || die "Manifest image for $svc must be digest-pinned (@sha256:...)"
  done

  # Host ports: numeric, unique, loopback-only compose, never Pilot ports.
  validate_prd_host_ports \
    "$(env_value API_HOST_PORT)" \
    "$(env_value WEB_HOST_PORT)" \
    "$(env_value ADMIN_HOST_PORT)"
fi

if [[ "${ENVIRONMENT:-}" == "hml" || "${ENVIRONMENT:-}" == "prd" ]]; then
  portal_key="$(grep -E "^CLIENT_PORTAL_SIGNING_KEY=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  if [[ -z "$portal_key" || "${#portal_key}" -lt 32 ]]; then
    log "CLIENT_PORTAL_SIGNING_KEY=MISSING"
    die "CLIENT_PORTAL_SIGNING_KEY must be set (min 32 characters) in $ENVIRONMENT"
  fi
  log "CLIENT_PORTAL_SIGNING_KEY=SET"
fi

min_gb="${MIN_FREE_DISK_GB:-5}"
avail_kb="$(df -Pk "$DEPLOY_ROOT" | awk 'NR==2 {print $4}')"
need_kb=$((min_gb * 1024 * 1024))
((avail_kb >= need_kb)) || die "Insufficient disk space under $DEPLOY_ROOT (need ${min_gb}GiB)"

docker info >/dev/null
compose config --quiet
log "Preflight passed for $ENVIRONMENT"
