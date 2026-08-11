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

compose_project_name() {
  if [[ "${ENVIRONMENT:-}" == "hml" ]]; then
    printf '%s\n' "croniu-hml"
  else
    printf '%s\n' "croniu-prd"
  fi
}

# Named Docker volume for Postgres. Overridable in tests only.
postgres_volume_name() {
  if [[ "${ENVIRONMENT:-}" == "hml" ]]; then
    printf '%s\n' "${HML_POSTGRES_VOLUME_NAME:-croniu-hml-postgres-data}"
  else
    printf '%s\n' "${PRD_POSTGRES_VOLUME_NAME:-croniu-prd-postgres-data}"
  fi
}

# Cold start = exclusive Postgres volume does not exist yet.
# Does NOT create the volume. A stopped container with an existing volume is NOT cold start.
postgres_volume_exists() {
  local vol
  vol="$(postgres_volume_name)"
  docker volume inspect "$vol" >/dev/null 2>&1
}

is_cold_start() {
  if postgres_volume_exists; then
    return 1
  fi
  return 0
}

compose() {
  local project
  project="$(compose_project_name)"
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

# Start Postgres and wait until the compose healthcheck reports healthy.
ensure_postgres_healthy() {
  local service="${1:-$DB_SERVICE}"
  local attempts="${2:-36}"
  local i status cid
  log "Ensuring Postgres service is up ($service)"
  compose up -d "$service"
  for ((i = 1; i <= attempts; i++)); do
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    [[ -n "$cid" ]] || {
      sleep 2
      continue
    }
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
      log "Postgres is healthy"
      return 0
    fi
    if [[ "$status" == "running" ]]; then
      # Images without Health block: fall back to pg_isready inside the container.
      if docker exec "$cid" sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
        log "Postgres is ready (pg_isready)"
        return 0
      fi
    fi
    sleep 2
  done
  die "Postgres did not become healthy in time (service=$service)"
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

# PRD host-port contract (loopback publish values). Safe to unit-test without Docker.
validate_prd_host_ports() {
  local api_port="$1" web_port="$2" admin_port="$3"
  local label port
  for label_port in "API_HOST_PORT:$api_port" "WEB_HOST_PORT:$web_port" "ADMIN_HOST_PORT:$admin_port"; do
    label="${label_port%%:*}"
    port="${label_port#*:}"
    [[ -n "$port" ]] || die "$label must not be empty in prd"
    [[ "$port" =~ ^[0-9]+$ ]] || die "$label must be numeric in prd"
    ((10#$port >= 1 && 10#$port <= 65535)) || die "$label out of TCP range in prd"
  done
  if [[ "$api_port" == "$web_port" || "$api_port" == "$admin_port" || "$web_port" == "$admin_port" ]]; then
    die "API/WEB/ADMIN host ports must be unique in prd"
  fi
  for pilot in 18080 13000 13002; do
    if [[ "$api_port" == "$pilot" || "$web_port" == "$pilot" || "$admin_port" == "$pilot" ]]; then
      die "PRD must not reuse Pilot host port $pilot (use 19080/14000/14002)"
    fi
  done
  [[ "$api_port" == "19080" ]] || die "API_HOST_PORT must be 19080 in prd (got non-Pilot but non-canonical value)"
  [[ "$web_port" == "14000" ]] || die "WEB_HOST_PORT must be 14000 in prd"
  [[ "$admin_port" == "14002" ]] || die "ADMIN_HOST_PORT must be 14002 in prd"
}
