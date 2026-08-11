# Deployment architecture

CI validates the candidate. **Build release images** builds API, web, and admin
once into GHCR and uploads `release-manifest.json` with immutable
`ghcr.io/...@sha256:...` references, build run id, CI run id, and timestamps
keyed to **image_sha**. Deployment hosts keep their own `.env` files; manifests
contain no credentials.

**Package deploy bundle** freezes `deploy/` at an explicit **deploy_sha** (may
differ from image_sha when ops scripts land after the image build) into
`release-deploy-bundle-<version>` with per-file and aggregate SHA-256 checksums.

`deploy/release/deploy.sh` is the release entry point for HML and PRD. It locks
a single target, verifies compose and the manifest, detects **cold start** via
the exclusive Postgres volume name (`croniu-prd-postgres-data` /
`croniu-hml-postgres-data`) without creating that volume to decide, skips
pre-migration backup only on cold start, otherwise starts Postgres if needed and
requires a verified backup, pulls images by digest, runs Alembic once, recreates
API then Web/Admin, and writes `RELEASE_MANIFEST.json` only after health and
smoke checks pass.

**Promote production** downloads the image manifest by `build_run_id` and the
deploy bundle by `deploy_bundle_run_id`, validates both identities, and syncs
**only** the bundle’s `deploy/` tree. It never rebuilds or retags images, and
never checks out `image_sha` to obtain ops scripts (build-once / promote-many).

HML runs from `/home/palex/ntws/croniu-hml`; production is isolated at
`/srv/docker/croniu-prd`. Neither deployment assumes a live Git working tree for
runtime identity — digests in the image manifest plus the deploy-bundle checksum
are the source of truth.
