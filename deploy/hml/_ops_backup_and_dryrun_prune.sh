#!/usr/bin/env bash
set -euo pipefail
docker exec croniu-hml-api printenv CRONIU_ENV
docker exec croniu-hml-api python - <<'PY'
from app.services.agent_threads import MAX_THREADS_PER_ORGANIZATION
print("MAX_THREADS_PER_ORGANIZATION=", MAX_THREADS_PER_ORGANIZATION)
PY
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP=/home/palex/ntws/croniu-hml/backups/pre-thread-limit-prune_${STAMP}.sql.gz
echo "Backing up to $BACKUP"
docker exec croniu-hml-db pg_dump -U croniu_hml -d croniu_hml | gzip -c > "$BACKUP"
sha256sum "$BACKUP"
ls -lh "$BACKUP"
echo "$BACKUP" > /tmp/last_thread_prune_backup.txt
bash /home/palex/ntws/croniu-hml/deploy/hml/_ops_prune_agent_threads.sh --dry-run
