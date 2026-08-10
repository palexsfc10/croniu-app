#!/usr/bin/env bash
# HML-only: prune agent_threads to max 5 per organization (hard delete + CASCADE).
# Usage:
#   dry-run:  bash deploy/hml/_ops_prune_agent_threads.sh --dry-run
#   execute:  bash deploy/hml/_ops_prune_agent_threads.sh --execute
set -euo pipefail

MODE="${1:---dry-run}"
MAX_KEEP=5
DB_CONTAINER="${DB_CONTAINER:-croniu-hml-db}"
DB_USER="${DB_USER:-croniu_hml}"
DB_NAME="${DB_NAME:-croniu_hml}"
API_CONTAINER="${API_CONTAINER:-croniu-hml-api}"

if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
  echo "Usage: $0 --dry-run | --execute" >&2
  exit 2
fi

ENV_VAL="$(docker exec "$API_CONTAINER" printenv CRONIU_ENV 2>/dev/null || true)"
if [[ "$ENV_VAL" != "hml" ]]; then
  echo "ABORT: CRONIU_ENV='$ENV_VAL' (expected hml). Refusing to continue." >&2
  exit 1
fi

HOST="$(hostname)"
if [[ "$HOST" != "jarvis" ]]; then
  echo "ABORT: hostname='$HOST' (expected jarvis)." >&2
  exit 1
fi

psql() {
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

echo "=== agent_threads prune ($MODE) env=$ENV_VAL host=$HOST ==="

psql -c "SELECT count(*) AS orgs_with_threads FROM (SELECT organization_id FROM agent_threads GROUP BY 1) s;"
psql -c "SELECT organization_id, count(*) AS threads FROM agent_threads GROUP BY 1 ORDER BY threads DESC;"

# Preview keep/drop per org
psql <<'SQL'
WITH ranked AS (
  SELECT
    t.id,
    t.organization_id,
    t.created_at,
    t.updated_at,
    t.title,
    (SELECT count(*) FROM agent_messages m WHERE m.thread_id = t.id) AS msg_count,
    ROW_NUMBER() OVER (
      PARTITION BY t.organization_id
      ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC
    ) AS rn,
    CASE
      WHEN (SELECT count(*) FROM agent_messages m WHERE m.thread_id = t.id) = 0 THEN true
      ELSE false
    END AS is_empty
  FROM agent_threads t
)
SELECT organization_id, id, rn, is_empty, msg_count, updated_at, left(title, 60) AS title,
       CASE
         WHEN is_empty THEN 'DROP_EMPTY'
         WHEN rn > 5 THEN 'DROP_EXCESS'
         ELSE 'KEEP'
       END AS fate
FROM ranked
ORDER BY organization_id, rn;
SQL

if [[ "$MODE" == "--dry-run" ]]; then
  echo "DRY-RUN complete — no deletes executed."
  exit 0
fi

echo "Executing transactional prune..."
psql <<'SQL'
BEGIN;

-- 1) Drop empty threads first (all orgs)
WITH empty_ids AS (
  SELECT t.id
  FROM agent_threads t
  WHERE NOT EXISTS (SELECT 1 FROM agent_messages m WHERE m.thread_id = t.id)
)
DELETE FROM agent_threads t
WHERE t.id IN (SELECT id FROM empty_ids);

-- 2) Drop excess beyond top 5 per organization
WITH ranked AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.organization_id
      ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC
    ) AS rn
  FROM agent_threads t
),
drop_ids AS (
  SELECT id FROM ranked WHERE rn > 5
)
DELETE FROM agent_threads t
WHERE t.id IN (SELECT id FROM drop_ids);

COMMIT;

SELECT organization_id, count(*) AS threads
FROM agent_threads
GROUP BY 1
ORDER BY threads DESC;

-- Orphan checks
SELECT 'orphan_messages' AS check, count(*) AS n
FROM agent_messages m
WHERE NOT EXISTS (SELECT 1 FROM agent_threads t WHERE t.id = m.thread_id)
UNION ALL
SELECT 'orphan_runs', count(*)
FROM agent_runs r
WHERE NOT EXISTS (SELECT 1 FROM agent_threads t WHERE t.id = r.thread_id)
UNION ALL
SELECT 'orphan_pending', count(*)
FROM agent_pending_actions p
WHERE p.thread_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_threads t WHERE t.id = p.thread_id)
UNION ALL
SELECT 'orphan_tool_calls', count(*)
FROM agent_tool_calls c
WHERE NOT EXISTS (SELECT 1 FROM agent_runs r WHERE r.id = c.run_id);
SQL

echo "EXECUTE complete."
