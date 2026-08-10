#!/usr/bin/env bash
set -Eeuo pipefail
cid="$(docker ps -qf name=croniu-dev-db)"
[[ -n "$cid" ]] || { echo "croniu-dev-db not running"; exit 1; }
tmp="$(mktemp -d)"
backup="$tmp/rehearsal.sql.gz"
docker exec "$cid" sh -c 'pg_dump -U croniu croniu' | gzip -c >"$backup"
gzip -t "$backup"
sha256sum "$backup" >"$backup.sha256"
sha256sum -c "$backup.sha256"
docker exec "$cid" psql -U croniu -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS croniu_restore_rehearsal;'
docker exec "$cid" psql -U croniu -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE croniu_restore_rehearsal;'
gunzip -c "$backup" | docker exec -i "$cid" psql -U croniu -d croniu_restore_rehearsal -v ON_ERROR_STOP=1 >/dev/null
docker exec "$cid" psql -U croniu -d croniu_restore_rehearsal -tAc 'SELECT version_num FROM alembic_version LIMIT 1;'
docker exec "$cid" psql -U croniu -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS croniu_restore_rehearsal;'
rm -rf "$tmp"
echo "backup_restore_rehearsal=ok"
