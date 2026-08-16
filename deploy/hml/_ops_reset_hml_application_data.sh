#!/usr/bin/env bash
set -euo pipefail
# HML-only application data wipe. No down, no volumes, no drop database.
# Usage on Jarvis: RESET_HML_CONFIRM=croniu-hml bash deploy/hml/_ops_reset_hml_application_data.sh

ROOT=/home/palex/ntws/croniu-hml
HOST_EXPECT=jarvis
COMPOSE_PROJECT=croniu-hml
DB_CONTAINER=croniu-hml-db
API_CONTAINER=croniu-hml-api

if [[ "$(hostname)" != "$HOST_EXPECT" ]]; then
  echo "ABORT: hostname $(hostname) != $HOST_EXPECT" >&2
  exit 2
fi
if [[ "${RESET_HML_CONFIRM:-}" != "croniu-hml" ]]; then
  echo "ABORT: set RESET_HML_CONFIRM=croniu-hml" >&2
  exit 2
fi
test -f "$ROOT/deploy/hml/.env.hml"
set -a; source "$ROOT/deploy/hml/.env.hml"; set +a

cname=$(docker inspect -f '{{.Name}}' "$DB_CONTAINER" | tr -d /)
if [[ "$cname" != "$DB_CONTAINER" ]]; then
  echo "ABORT: unexpected db container $cname" >&2
  exit 2
fi
proj=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$DB_CONTAINER")
if [[ "$proj" != "$COMPOSE_PROJECT" ]]; then
  echo "ABORT: compose project $proj != $COMPOSE_PROJECT" >&2
  exit 2
fi

echo "=== identity ==="
hostname
docker inspect -f '{{.Name}} {{.Config.Image}} {{.State.Status}}' "$DB_CONTAINER" "$API_CONTAINER"
docker exec "$API_CONTAINER" python -c "import os; print('CRONIU_ENV', os.environ.get('CRONIU_ENV')); print('GIT_SHA', os.environ.get('GIT_SHA'))"
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user;"
docker exec "$API_CONTAINER" alembic current

export RESET_HML_CONFIRM
docker exec \
  -e RESET_HML_CONFIRM \
  -e CRONIU_ENV=hml \
  "$API_CONTAINER" \
  python /app/scripts/reset_hml_application_data.py

docker exec "$API_CONTAINER" alembic current
echo "=== health ==="
curl -fsS http://127.0.0.1:18080/api/v1/health || curl -fsS http://127.0.0.1:18080/health || true
echo
echo "DONE hml application reset"
