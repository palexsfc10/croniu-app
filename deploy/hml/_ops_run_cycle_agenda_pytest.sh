#!/usr/bin/env bash
# Run cycle↔agenda integrity pytest suite against ephemeral DB on HML host.
set -euo pipefail
test "$(docker exec croniu-hml-api printenv CRONIU_ENV)" = "hml"

docker exec croniu-hml-db psql -U croniu_hml -d postgres -c "DROP DATABASE IF EXISTS croniu_hml_pytest WITH (FORCE);"
docker exec croniu-hml-db psql -U croniu_hml -d postgres -c "CREATE DATABASE croniu_hml_pytest OWNER croniu_hml;"

TEST_URL="$(docker exec croniu-hml-api printenv DATABASE_URL | sed 's#/croniu_hml$#/croniu_hml_pytest#')"
docker exec -e DATABASE_URL="$TEST_URL" croniu-hml-api alembic upgrade head

for f in test_cycle_agenda_integrity.py test_cycle_schedule.py test_cycle_intelligence_sprint2c.py \
         test_renewal_approval.py test_agent_thread_retention.py test_lesson_progress.py; do
  docker cp "/home/palex/ntws/croniu-hml/backend/tests/$f" "croniu-hml-api:/tmp/$f"
done

docker exec -e DATABASE_URL="$TEST_URL" croniu-hml-api pip install -q pytest httpx 2>/dev/null || true

docker exec -e DATABASE_URL="$TEST_URL" -e SECRET_KEY='test-secret-key-with-at-least-32-characters' \
  -e SESSION_COOKIE_SECURE=false -e CORS_ORIGINS='http://localhost:3000' -e OPENAPI_ENABLED=true \
  -w /app croniu-hml-api \
  pytest -q /tmp/test_cycle_agenda_integrity.py /tmp/test_cycle_schedule.py \
    /tmp/test_cycle_intelligence_sprint2c.py /tmp/test_renewal_approval.py \
    /tmp/test_agent_thread_retention.py /tmp/test_lesson_progress.py
