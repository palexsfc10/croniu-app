#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --environment hml|prd --sha SHA --manifest /path/release-manifest.json" >&2
  exit 2
}

ENVIRONMENT="" SHA="" MANIFEST=""
while (($#)); do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --sha) SHA="${2:-}"; shift 2 ;;
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "$ENVIRONMENT" =~ ^(hml|prd)$ && -n "$SHA" && -n "$MANIFEST" ]] || usage

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_ROOT/deploy/$ENVIRONMENT/compose.$ENVIRONMENT.yaml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_ROOT/deploy/$ENVIRONMENT/.env.$ENVIRONMENT}"
RELEASE_STATE_FILE="$DEPLOY_ROOT/RELEASE_MANIFEST.json"
if [[ "$ENVIRONMENT" == "hml" ]]; then
  API_SERVICE="croniu-hml-api"
  WEB_SERVICE="croniu-hml-web"
  ADMIN_SERVICE="croniu-hml-admin"
  DB_SERVICE="croniu-hml-db"
else
  API_SERVICE="api"
  WEB_SERVICE="web"
  ADMIN_SERVICE="admin"
  DB_SERVICE="db"
fi
export ENVIRONMENT SHA MANIFEST DEPLOY_ROOT COMPOSE_FILE ENV_FILE RELEASE_STATE_FILE
export API_SERVICE WEB_SERVICE ADMIN_SERVICE DB_SERVICE
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_env_file "$ENV_FILE"

lock_file="$DEPLOY_ROOT/.release-${ENVIRONMENT}.lock"
exec 9>"$lock_file"
flock -n 9 || die "Another $ENVIRONMENT release is in progress"

rollback_on_failure() {
  status=$?
  log "Deployment failed (exit $status); attempting rollback"
  append_release_log "failed"
  if [[ -f "$DEPLOY_ROOT/RELEASE_MANIFEST.previous.json" ]]; then
    "$SCRIPT_DIR/rollback.sh" || log "Rollback also failed; operator intervention required"
  fi
  exit "$status"
}
trap rollback_on_failure ERR

"$SCRIPT_DIR/preflight.sh"
if [[ -f "$RELEASE_STATE_FILE" ]]; then
  cp "$RELEASE_STATE_FILE" "$DEPLOY_ROOT/RELEASE_MANIFEST.previous.json"
fi

"$SCRIPT_DIR/backup.sh"
CRONIU_API_IMAGE="$(manifest_image api)"
CRONIU_WEB_IMAGE="$(manifest_image web)"
CRONIU_ADMIN_IMAGE="$(manifest_image admin)"
export CRONIU_API_IMAGE CRONIU_WEB_IMAGE CRONIU_ADMIN_IMAGE

log "Pulling immutable release images for $SHA"
compose pull "$API_SERVICE" "$WEB_SERVICE" "$ADMIN_SERVICE"
log "Applying migrations as a one-off job (timeout ${MIGRATE_TIMEOUT_SECONDS:-300}s)"
# `timeout` cannot invoke a shell function; expand to docker compose explicitly.
project="croniu-prd"
if [[ "$ENVIRONMENT" == "hml" ]]; then
  project="croniu-hml"
fi
timeout "${MIGRATE_TIMEOUT_SECONDS:-300}" \
  docker compose -p "$project" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
  run --rm "$API_SERVICE" alembic upgrade head
log "Recreating API"
compose up -d --no-deps --force-recreate "$API_SERVICE"
wait_for_http "http://127.0.0.1:${API_HOST_PORT}/health/ready"
log "Recreating web and admin"
compose up -d --no-deps --force-recreate "$WEB_SERVICE" "$ADMIN_SERVICE"
wait_for_http "http://127.0.0.1:${WEB_HOST_PORT}/"
wait_for_http "http://127.0.0.1:${ADMIN_HOST_PORT}/"
"$SCRIPT_DIR/smoke_public.sh"

operator="${RELEASE_OPERATOR:-${GITHUB_ACTOR:-${USER:-unknown}}}"
tmp_state="$(mktemp)"
jq --arg environment "$ENVIRONMENT" \
  --arg sha "$SHA" \
  --arg deployed_at "$(date -u +%FT%TZ)" \
  --arg operator "$operator" \
  --arg result "success" \
  '. + {environment: $environment, sha: $sha, deployed_at: $deployed_at, operator: $operator, result: $result}' \
  "$MANIFEST" >"$tmp_state"
install -m 600 "$tmp_state" "$RELEASE_STATE_FILE"
rm -f "$tmp_state"
append_release_log "success"
trap - ERR
log "Release completed: $SHA"
