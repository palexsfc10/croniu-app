# Promote HML to production

Build once, promote many. Two immutable identities travel together:

1. **image_sha** — GHCR digests in `release-manifest.json` (from **Build release images**).
2. **deploy_sha** — operational `deploy/` scripts in `release-deploy-bundle-*` (from **Package deploy bundle**).

Production never rebuilds or retags images, and never syncs `deploy/` by checking out
`image_sha` (that tip may predate ops fixes rehearsed on HML).

## GitHub Actions registration

Manual workflows (`Package deploy bundle`, `Promote production`, `Build release images`)
are only dispatchable when their workflow files exist on the repository **default**
branch. For RC2.3+ that default must be `main` (not a stale `release/croniu-prd-v1`
tip). `Package deploy bundle` also uses a path-filtered `push` indexer so GitHub
catalogs the workflow after it lands on the default branch; the package job itself
runs only on `workflow_dispatch` with immutable SHA inputs (never `latest` / never
branch names as identity).

## Flow

1. Confirm CI is green for the candidate PR head (`deploy_sha` tip).
2. Run **Build release images** once with:
   - `sha` = **image_sha** (digest candidate)
   - `version` = immutable label (for example `v1.0.0-rc2.2`)
   - `ci_run_id` / `expected_ci_head_sha` for that image candidate
3. Rehearse the **same** image digests on HML with the **same** ops scripts that will
   later ship in the deploy bundle.
4. Run **Package deploy bundle** once with:
   - `deploy_sha` = operational tip (exact SHA)
   - `image_sha` = the digest candidate above
   - `version`, `ci_run_id`, `expected_ci_head_sha` (= `deploy_sha`)
5. Keep both artifacts / checksums / digests unchanged.
6. Trigger **Promote production** with:
   - `image_sha`, `deploy_sha`, `version`
   - `build_run_id` of the successful Build release run
   - `deploy_bundle_run_id` of the successful Package deploy bundle run
   - optional artifact name overrides
7. Complete the protected `production` environment approval.
8. Promote downloads both artifacts, validates repository / SHAs / checksums /
   digests, SSHes to the host, syncs **only** `deploy-bundle/deploy/`, and runs
   `deploy.sh` with the image manifest. It does **not** call `build-release`,
   does **not** `docker build`, does **not** retag, and does **not** checkout
   `image_sha` for the sync path.

## Fail closed

Promotion must fail when:

- either artifact is missing;
- the Build release or Package deploy bundle run is not `completed`/`success`;
- `image_sha` / `deploy_sha` / version / repository diverge;
- deploy bundle aggregate or per-file checksums diverge;
- any image lacks `@sha256:<64 hex>` or is tag-only;
- workspace `deploy/` aggregate diverges from the bundle artifact.

Do not promote mutable tags or mutable branches. Do not rebuild after a successful
HML rehearsal. Do not treat `image_sha` as the source of ops scripts.
