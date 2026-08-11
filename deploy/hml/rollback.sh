#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.hml"
COMPOSE_FILE="${ROOT_DIR}/compose.hml.yaml"
PROJECT_NAME="croniu-hml"

log() { printf '[croniu-hml-rollback] %s\n' "$*"; }
die() { printf '[croniu-hml-rollback] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || die "Missing $COMPOSE_FILE"

compose() {
  docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

MODE="${1:-stop}"

case "$MODE" in
  stop)
    log "Primeira implantação: parando apenas containers/rede do Croniu; volume do banco preservado"
    compose down --remove-orphans
    log "Rollback (stop) concluído. Volume croniu-hml-postgres-data preservado."
    ;;
  previous-image)
    : "${PREV_API_IMAGE:?Defina PREV_API_IMAGE}"
    : "${PREV_WEB_IMAGE:?Defina PREV_WEB_IMAGE}"
    export CRONIU_API_IMAGE="$PREV_API_IMAGE"
    export CRONIU_WEB_IMAGE="$PREV_WEB_IMAGE"
    log "Recriando com imagens anteriores"
    compose up -d
    ;;
  *)
    die "Uso: $0 {stop|previous-image}"
    ;;
esac
