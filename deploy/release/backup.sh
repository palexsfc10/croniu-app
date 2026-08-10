#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_env_file "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$BACKUP_DIR/${ENVIRONMENT}-${timestamp}.sql.gz"

db_container="$(compose ps -q "$DB_SERVICE")"
[[ -n "$db_container" ]] || die "Database container is not running"
log "Creating PostgreSQL backup $backup"
docker exec "$db_container" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -c >"$backup"
gzip -t "$backup"
sha256sum "$backup" >"$backup.sha256"
log "Backup verified: $backup"

# Prune old backups (names only logged).
find "$BACKUP_DIR" -type f -name "${ENVIRONMENT}-*.sql.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true
find "$BACKUP_DIR" -type f -name "${ENVIRONMENT}-*.sql.gz.sha256" -mtime "+${BACKUP_RETENTION_DAYS}" -delete || true

printf '%s\n' "$backup"
