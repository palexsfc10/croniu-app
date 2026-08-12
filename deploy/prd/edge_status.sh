#!/usr/bin/env bash
# Sanitized edge / tunnel secret status. Never prints token values.
set -euo pipefail

ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f /srv/docker/croniu-prd/config/.env.prd ]]; then
    ENV_FILE=/srv/docker/croniu-prd/config/.env.prd
  elif [[ -f "$(dirname "$0")/.env.prd" ]]; then
    ENV_FILE="$(dirname "$0")/.env.prd"
  else
    echo "ENV_FILE not found" >&2
    exit 2
  fi
fi

status_of() {
  local key="$1" line val
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo "${key}=MISSING"
    return
  fi
  val="${line#*=}"
  if [[ -z "$val" ]]; then
    echo "${key}=MISSING"
  else
    echo "${key}=SET"
  fi
}

status_of CLOUDFLARE_TUNNEL_TOKEN

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'croniu-prd-cloudflared'; then
  echo "cloudflared_container=running"
else
  echo "cloudflared_container=absent_or_stopped"
fi
