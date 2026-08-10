# Deployment architecture

CI builds API, web, and admin images in GHCR with OCI revision, version, and
creation labels. The build artifact `release-manifest.json` records immutable
`image@sha256:...` references. Deployment hosts retain their own `.env` files;
manifests contain no credentials.

`deploy/release/deploy.sh` is the release entry point. It locks a single target,
verifies compose and its manifest, creates a checked PostgreSQL backup, pulls
images by digest, runs Alembic once, performs a rolling app recreation, and
writes `RELEASE_MANIFEST.json` only after health and smoke checks pass.

HML currently runs from `/home/palex/ntws/croniu-hml`; production is isolated at
`/srv/docker/croniu-prd`. Neither deployment assumes a Git checkout on the host.
