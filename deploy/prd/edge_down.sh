#!/usr/bin/env bash
# Stop croniu-prd-cloudflared without touching app/db or Cloudflare DNS/Access.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/compose.prd.yaml}"
ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f /srv/docker/croniu-prd/config/.env.prd ]]; then
    ENV_FILE=/srv/docker/croniu-prd/config/.env.prd
  elif [[ -f "$SCRIPT_DIR/.env.prd" ]]; then
    ENV_FILE="$SCRIPT_DIR/.env.prd"
  else
    echo "ERROR: ENV_FILE not found (set ENV_FILE=...)" >&2
    exit 2
  fi
fi

project="${COMPOSE_PROJECT_NAME:-croniu-prd}"
docker compose -p "$project" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  --profile edge stop cloudflared
echo "cloudflared_stopped=yes"
