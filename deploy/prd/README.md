# Production compose

Production configuration lives on the server at `/srv/docker/croniu-prd`. Copy
`.env.prd.example` there as `.env.prd` and populate it only on the server; do
not commit the resulting file.

Release deployments use immutable image references from a CI-generated manifest:

```bash
deploy/release/deploy.sh --environment prd --sha <sha> --manifest <manifest.json>
```

The script runs migrations as a one-off container, not from API startup.
