# Deployment architecture

CI validates the candidate. **Build release images** builds API, web, and admin
once into GHCR and uploads `release-manifest.json` with immutable
`ghcr.io/...@sha256:...` references, build run id, CI run id, and timestamps.
Deployment hosts keep their own `.env` files; manifests contain no credentials.

`deploy/release/deploy.sh` is the release entry point for HML and PRD. It locks
a single target, verifies compose and the manifest, creates a checked PostgreSQL
backup, pulls images by digest, runs Alembic once, recreates API then Web/Admin,
and writes `RELEASE_MANIFEST.json` only after health and smoke checks pass.

**Promote production** downloads the existing build artifact by `build_run_id`
and deploys those exact digests. It never rebuilds or retags images
(build-once / promote-many).

HML runs from `/home/palex/ntws/croniu-hml`; production is isolated at
`/srv/docker/croniu-prd`. Neither deployment assumes a live Git working tree for
runtime identity — digests in the manifest are the source of truth.
