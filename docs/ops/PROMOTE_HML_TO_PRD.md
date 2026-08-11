# Promote HML to production

Build once, promote many. Digests are produced by **Build release images** and
stored in the immutable `release-manifest.json` artifact. Production never
rebuilds or retags those images.

## Flow

1. Confirm CI is green for the candidate PR head.
2. Run **Build release images** once with:
   - `sha` = candidate tip (or PR head when trees are equivalent)
   - `version` = immutable label (for example `v1.0.0-rc2.2`)
   - `ci_run_id` = approved CI run
   - `expected_ci_head_sha` = PR head SHA reported by that CI run
3. Rehearse the **same** artifact digests on HML via
   `deploy/release/deploy.sh --environment hml --sha <SHA> --manifest <file>`.
4. Keep the artifact / checksum / digests unchanged.
5. Trigger **Promote production** with:
   - `sha`, `version`
   - `build_run_id` of the successful Build release run
   - optional `manifest_artifact_name` (defaults to `release-manifest-<version>`)
6. Complete the protected `production` environment approval.
7. The promote workflow downloads the artifact from that build run, validates
   SHA/version/digests, SSHes to the host, and runs `deploy.sh`. It does **not**
   call `build-release`, does **not** `docker build`, and does **not** retag.

## Fail closed

Promotion must fail when:

- the artifact is missing;
- the source Build release run is not `completed`/`success`;
- SHA or version diverge from the manifest;
- any image lacks `@sha256:<64 hex>`;
- any image is tag-only (including `latest`).

Do not promote mutable tags. Do not rebuild after a successful HML rehearsal.
