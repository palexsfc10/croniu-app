#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backups}"
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
printf '%s\n' "$backup"
