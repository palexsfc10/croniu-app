#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${ROOT_DIR}/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.hml"
COMPOSE_FILE="${ROOT_DIR}/compose.hml.yaml"
PROJECT_NAME="croniu-hml"

log() { printf '[croniu-hml] %s\n' "$*"; }
die() { printf '[croniu-hml] ERROR: %s\n' "$*" >&2; exit 1; }

require_file() {
  [[ -f "$1" ]] || die "Arquivo obrigatório ausente: $1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando não encontrado: $1"
}

load_env() {
  require_file "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${POSTGRES_USER:?}"
  : "${POSTGRES_PASSWORD:?}"
  : "${POSTGRES_DB:?}"
  : "${SECRET_KEY:?}"
  : "${API_HOST_PORT:?}"
  : "${WEB_HOST_PORT:?}"
  : "${ADMIN_HOST_PORT:?}"
  : "${NEXT_PUBLIC_API_URL:?}"
  : "${NEXT_PUBLIC_APP_URL:?}"
  : "${NEXT_PUBLIC_ADMIN_URL:?}"
  [[ "${#SECRET_KEY}" -ge 32 ]] || die "SECRET_KEY deve ter pelo menos 32 caracteres"
  # Cartão off por padrão em HML até evidência Asaas sandbox Croniu
  if [[ "${BILLING_CARD_ENABLED:-false}" == "true" ]]; then
    log "WARN BILLING_CARD_ENABLED=true — confirme HML Asaas sandbox Croniu antes de liberar cartão"
  else
    log "OK BILLING_CARD_ENABLED=${BILLING_CARD_ENABLED:-false} (guard HML)"
  fi
  : "${PUBLIC_APP_BASE_URL:=${NEXT_PUBLIC_APP_URL}}"
}

compose() {
  docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

build_images() {
  log "Construindo imagem da API"
  docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "${REPO_ROOT}/backend/Dockerfile" "${REPO_ROOT}/backend"
  log "Construindo imagem do web"
  # Browser uses same-origin /api; rewrite target must be the docker service name.
  docker build \
    --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
    --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
    --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
    -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
    -f "${REPO_ROOT}/apps/web/Dockerfile" \
    "${REPO_ROOT}/apps/web"
  log "Construindo imagem do admin"
  docker build \
    --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
    --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_ADMIN_URL}" \
    -t "${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}" \
    -f "${REPO_ROOT}/apps/admin/Dockerfile" \
    "${REPO_ROOT}/apps/admin"
}

cmd="${1:-up}"
require_cmd docker
require_file "$COMPOSE_FILE"
load_env

case "$cmd" in
  up)
    build_images
    log "Subindo stack Croniu HML"
    compose up -d
    log "Aguardando healthchecks"
    sleep 5
    compose ps
    ;;
  build)
    build_images
    ;;
  down)
    log "Parando containers Croniu HML (volumes preservados)"
    compose down --remove-orphans
    ;;
  ps|logs|pull)
    compose "$@"
    ;;
  version)
    log "CRONIU_VERSION=${CRONIU_VERSION:-unknown}"
    log "API_IMAGE=${CRONIU_API_IMAGE:-croniu-hml-api:local}"
    log "WEB_IMAGE=${CRONIU_WEB_IMAGE:-croniu-hml-web:local}"
    log "ADMIN_IMAGE=${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}"
    if [[ -d "${REPO_ROOT}/.git" ]]; then
      git -C "$REPO_ROOT" rev-parse --short HEAD || true
    fi
    ;;
  *)
    die "Uso: $0 {up|build|down|ps|logs|version}"
    ;;
esac
