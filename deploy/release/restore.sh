#!/usr/bin/env bash
set -Eeuo pipefail

# Restore a verified gzip dump into the RUNNING database container.
# Destructive: replaces current DB contents. Never run against HML/PRD without approval.
# Usage: restore.sh --environment hml|prd --backup /path/file.sql.gz --yes

usage() {
  echo "Usage: $0 --environment hml|prd --backup /path/file.sql.gz --yes" >&2
  exit 2
}

ENVIRONMENT="" BACKUP="" CONFIRM=""
while (($#)); do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --backup) BACKUP="${2:-}"; shift 2 ;;
    --yes) CONFIRM=1; shift ;;
    *) usage ;;
  esac
done
[[ "$ENVIRONMENT" =~ ^(hml|prd)$ && -n "$BACKUP" && "$CONFIRM" == "1" ]] || usage

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_ROOT/deploy/$ENVIRONMENT/compose.$ENVIRONMENT.yaml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_ROOT/deploy/$ENVIRONMENT/.env.$ENVIRONMENT}"
if [[ "$ENVIRONMENT" == "hml" ]]; then
  DB_SERVICE="croniu-hml-db"
else
  DB_SERVICE="db"
fi
export ENVIRONMENT DEPLOY_ROOT COMPOSE_FILE ENV_FILE DB_SERVICE
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_env_file "$ENV_FILE"

[[ -f "$BACKUP" ]] || die "Backup not found: $BACKUP"
[[ -f "${BACKUP}.sha256" ]] || die "Missing checksum file: ${BACKUP}.sha256"
sha256sum -c "${BACKUP}.sha256"
gzip -t "$BACKUP"

db_container="$(compose ps -q "$DB_SERVICE")"
[[ -n "$db_container" ]] || die "Database container is not running"

log "Restoring $BACKUP into $ENVIRONMENT (destructive)"
gunzip -c "$BACKUP" | docker exec -i "$db_container" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
log "Restore completed"
