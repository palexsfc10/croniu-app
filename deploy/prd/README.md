# Production compose

Production configuration lives on the server at `/srv/docker/croniu-prd`. Copy
`deploy/prd/env.prd.example` there as `deploy/prd/.env.prd` and populate secrets
only on the server; do not commit the resulting file.

(The Package deploy bundle excludes `.env*` files. `env.prd.example` is the
safe template that ships inside the immutable artifact.)

Release deployments use immutable image references from a CI-generated manifest:

```bash
deploy/release/deploy.sh --environment prd --sha <sha> --manifest <manifest.json>
```

`deploy.sh` loads `CRONIU_API_IMAGE` / `CRONIU_WEB_IMAGE` / `CRONIU_ADMIN_IMAGE`
from the release-manifest **before** preflight/`docker compose config`.

The script runs migrations as a one-off container, not from API startup.
