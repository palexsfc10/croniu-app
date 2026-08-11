#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_env_file "$ENV_FILE"

API_URL="${API_SMOKE_URL:-http://127.0.0.1:${API_HOST_PORT}/health/ready}"
VERSION_URL="${API_VERSION_URL:-http://127.0.0.1:${API_HOST_PORT}/version}"
WEB_URL="${WEB_SMOKE_URL:-http://127.0.0.1:${WEB_HOST_PORT}/}"
ADMIN_URL="${ADMIN_SMOKE_URL:-http://127.0.0.1:${ADMIN_HOST_PORT}/}"

wait_for_http "$API_URL"
wait_for_http "$VERSION_URL"
wait_for_http "$WEB_URL"
wait_for_http "$ADMIN_URL"
log "Public smoke checks passed (api/web/admin)"
