# Rollback

For an application-image rollback, use the previous server release state:

```bash
cd /srv/docker/croniu-prd
ENVIRONMENT=prd DEPLOY_ROOT="$PWD" COMPOSE_FILE=deploy/prd/compose.prd.yaml \
  ENV_FILE=deploy/prd/.env.prd API_HOST_PORT=<server-port> \
  deploy/release/rollback.sh
```

The script restores API, web, and admin images from
`RELEASE_MANIFEST.previous.json` and runs readiness/smoke checks. It does not
reverse Alembic migrations or restore data. For a data incident, stop and use a
verified backup under the approved recovery procedure.
