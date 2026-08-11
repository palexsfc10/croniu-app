#!/usr/bin/env bash
# Non-destructive HML audit: active cycles vs appointments (org preserved).
set -euo pipefail
test "$(docker exec croniu-hml-api printenv CRONIU_ENV)" = "hml"

docker exec -i croniu-hml-db psql -U croniu_hml -d croniu_hml <<'SQL'
\pset format aligned
\pset border 2

SELECT 'ENV' AS check, current_database() AS db,
       (SELECT timezone FROM organizations WHERE id = '985a32d2-fff5-44f4-9b09-6e5ea238100f') AS org_tz;

-- John / Jonh cycle detail
SELECT c.full_name, cy.id AS cycle_id, cy.status, cy.starts_on, cy.ends_on,
       cy.lesson_count, cy.weekdays, cy.default_starts_time, cy.weekly_frequency,
       cy.idempotency_key, cy.created_at, cy.updated_at,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id) AS appt_total,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'scheduled') AS scheduled,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'completed') AS completed,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'cancelled') AS cancelled
FROM cycles cy
JOIN clients c ON c.id = cy.client_id
WHERE cy.organization_id = '985a32d2-fff5-44f4-9b09-6e5ea238100f'
  AND (c.full_name ILIKE '%john%' OR c.full_name ILIKE '%jonh%' OR c.full_name ILIKE '%doe%');

-- Agenda local day 2026-08-06
SELECT c.full_name, a.status,
       (a.starts_at AT TIME ZONE 'America/Sao_Paulo') AS local_start,
       a.cycle_id
FROM appointments a
JOIN clients c ON c.id = a.client_id
WHERE a.organization_id = '985a32d2-fff5-44f4-9b09-6e5ea238100f'
  AND a.starts_at >= TIMESTAMPTZ '2026-08-06 00:00:00-03'
  AND a.starts_at <  TIMESTAMPTZ '2026-08-07 00:00:00-03'
ORDER BY a.starts_at;

-- Active cycles integrity summary
SELECT c.full_name,
       cy.id AS cycle_id,
       cy.lesson_count AS contracted,
       cy.weekdays,
       cy.default_starts_time,
       cy.starts_on,
       cy.ends_on,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id) AS found,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'scheduled') AS scheduled,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'completed') AS completed,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'cancelled') AS cancelled,
       (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id AND a.status = 'no_show') AS no_show,
       (SELECT count(*) FROM appointments a
         WHERE a.cycle_id = cy.id
           AND a.status = 'scheduled'
           AND a.starts_at < now()) AS past_pending,
       CASE
         WHEN cy.weekdays IS NULL OR cy.default_starts_time IS NULL THEN 'ambiguous_no_schedule'
         WHEN (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id)
              = COALESCE(cy.lesson_count, -1) THEN 'ok'
         WHEN (SELECT count(*) FROM appointments a WHERE a.cycle_id = cy.id)
              < COALESCE(cy.lesson_count, 0) THEN 'missing_appts'
         ELSE 'extra_or_drift'
       END AS integrity
FROM cycles cy
JOIN clients c ON c.id = cy.client_id
WHERE cy.organization_id = '985a32d2-fff5-44f4-9b09-6e5ea238100f'
  AND cy.status = 'active'
ORDER BY integrity DESC, c.full_name;
SQL
