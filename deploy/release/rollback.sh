#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_env_file "$ENV_FILE"

previous="$DEPLOY_ROOT/RELEASE_MANIFEST.previous.json"
[[ -f "$previous" ]] || die "No previous release state at $previous"

api_image="$(jq -er '.images.api' "$previous")"
web_image="$(jq -er '.images.web' "$previous")"
admin_image="$(jq -er '.images.admin' "$previous")"
export CRONIU_API_IMAGE="$api_image" CRONIU_WEB_IMAGE="$web_image" CRONIU_ADMIN_IMAGE="$admin_image"

log "Rolling back application containers to prior immutable images"
log "NOTE: rollback does not reverse irreversible Alembic migrations; restore from backup if schema changed."
# Pull only when the image is not already present locally (local tags / prior digests).
for img in "$api_image" "$web_image" "$admin_image"; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    log "Image already present locally; skip pull: ${img%%@*}"
  else
    log "Pulling image: ${img%%@*}"
    docker pull "$img"
  fi
done
compose up -d --no-deps --force-recreate "$API_SERVICE"
# Prefer readiness; fall back to live for ancestral images that only expose /health.
if ! curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:${API_HOST_PORT}/health/ready" >/dev/null 2>&1; then
  wait_for_http "http://127.0.0.1:${API_HOST_PORT}/health"
else
  wait_for_http "http://127.0.0.1:${API_HOST_PORT}/health/ready"
fi
compose up -d --no-deps --force-recreate "$WEB_SERVICE" "$ADMIN_SERVICE"
wait_for_http "http://127.0.0.1:${WEB_HOST_PORT}/"
wait_for_http "http://127.0.0.1:${ADMIN_HOST_PORT}/"
"$SCRIPT_DIR/smoke_public.sh"
cp "$previous" "$DEPLOY_ROOT/RELEASE_MANIFEST.json"
append_release_log "rollback"
log "Rollback completed"
