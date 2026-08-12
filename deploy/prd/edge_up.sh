#!/usr/bin/env bash
# Start croniu-prd-cloudflared with Compose profile edge.
# Fails closed if CLOUDFLARE_TUNNEL_TOKEN is missing/empty. Never prints the token.
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

[[ -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] || {
  echo "ERROR: missing compose or env file" >&2
  exit 2
}

line="$(grep -E '^CLOUDFLARE_TUNNEL_TOKEN=' "$ENV_FILE" | tail -n1 || true)"
val="${line#CLOUDFLARE_TUNNEL_TOKEN=}"
if [[ -z "$line" || -z "$val" ]]; then
  echo "ERROR: CLOUDFLARE_TUNNEL_TOKEN is MISSING — refuse to start profile edge" >&2
  exit 1
fi

project="${COMPOSE_PROJECT_NAME:-croniu-prd}"
echo "CLOUDFLARE_TUNNEL_TOKEN=SET"
echo "Starting cloudflared with profile edge (no token displayed)"
docker compose -p "$project" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  --profile edge up -d cloudflared
