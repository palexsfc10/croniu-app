#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

API_URL="${API_SMOKE_URL:-http://127.0.0.1:${API_HOST_PORT}/health}"
VERSION_URL="${API_URL%/health}/version"
wait_for_http "$API_URL"
wait_for_http "$VERSION_URL"
log "Public smoke checks passed"
