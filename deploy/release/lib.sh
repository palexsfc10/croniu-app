#!/usr/bin/env bash
set -Eeuo pipefail

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

if [[ "${ENVIRONMENT:-}" == "hml" ]]; then
  : "${API_SERVICE:=croniu-hml-api}"
  : "${WEB_SERVICE:=croniu-hml-web}"
  : "${ADMIN_SERVICE:=croniu-hml-admin}"
  : "${DB_SERVICE:=croniu-hml-db}"
else
  : "${API_SERVICE:=api}"
  : "${WEB_SERVICE:=web}"
  : "${ADMIN_SERVICE:=admin}"
  : "${DB_SERVICE:=db}"
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

load_env_file() {
  local env_file="${1:-${ENV_FILE:-}}"
  [[ -n "$env_file" && -f "$env_file" ]] || return 0
  # Export keys without printing values.
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

compose() {
  local project="croniu-prd"
  if [[ "${ENVIRONMENT:-}" == "hml" ]]; then
    project="croniu-hml"
  fi
  docker compose -p "$project" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_http() {
  local url="$1" attempts="${2:-30}"
  for ((i = 1; i <= attempts; i++)); do
    if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  die "Health check did not become ready: $url"
}

manifest_image() {
  local service="$1"
  jq -er --arg service "$service" '.images[$service]' "$MANIFEST"
}

append_release_log() {
  local result="$1"
  local log_file="${DEPLOY_ROOT}/RELEASE_LOG.jsonl"
  local operator="${RELEASE_OPERATOR:-${GITHUB_ACTOR:-${USER:-unknown}}}"
  jq -nc \
    --arg environment "${ENVIRONMENT:-}" \
    --arg sha "${SHA:-}" \
    --arg deployed_at "$(date -u +%FT%TZ)" \
    --arg operator "$operator" \
    --arg result "$result" \
    '{environment:$environment,sha:$sha,deployed_at:$deployed_at,operator:$operator,result:$result}' \
    >>"$log_file"
  chmod 600 "$log_file" 2>/dev/null || true
}
