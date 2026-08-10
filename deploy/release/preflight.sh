#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

for tool in docker jq curl gzip sha256sum flock; do
  require_command "$tool"
done

[[ -f "$MANIFEST" ]] || die "Manifest not found: $MANIFEST"
jq -e '.images.api and .images.web and .images.admin' "$MANIFEST" >/dev/null ||
  die "Manifest must contain images.api, images.web, and images.admin"
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "Environment file not found: $ENV_FILE"

docker info >/dev/null
compose config --quiet
log "Preflight passed for $ENVIRONMENT"
