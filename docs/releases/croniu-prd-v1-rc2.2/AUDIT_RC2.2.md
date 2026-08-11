# AUDIT RC2.2 — build-once / promote-many + dual identity

Operational successor to RC2.1 (`7cf3d5a`). Product/domain rules unchanged.
Scope: release workflows, release scripts, ops/audit docs, CI flake fixes for gates.

## Dual identity

| Item | Value |
|------|--------|
| **image_sha** | `c5503c08cd99a6d9222b47cb2ee5de52769077df` |
| **deploy_sha** / PR tip | `4a5cef2ab8b9c2d0ae0dc8fba368d948e4bf2094` |
| Version | `v1.0.0-rc2.2` |
| Main | `9bfbd4c92c04f2d17eaad6aeddd2375f0cf893ea` |

## Image artifact

| Item | Value |
|------|--------|
| Build run | `31452994104` |
| Artifact | `release-manifest-v1.0.0-rc2.2` / `9087002365` |
| Checksum | `40958e52b5de386b4513c2aa24764839870f89ed6f20dc39b713a3f95ce5f83d` |
| Images rebuilt after HML? | **No** |

## Deploy bundle artifact

| Item | Value |
|------|--------|
| Producer | CI job `package-deploy-bundle` on run `31455737695` |
| Artifact | `release-deploy-bundle-v1.0.0-rc2.2` / `9087944496` |
| Aggregate | `b3154120247aa2a68eae809cffca91d0a2998d1f13805061a34fa7819034f97d` |
| `deploy_sha` recorded | PR head (`github.event.pull_request.head.sha`), never merge commit |

## Promote production

- Inputs: `image_sha`, `deploy_sha`, `version`, `build_run_id`, `deploy_bundle_run_id`
- Downloads image manifest **and** deploy bundle
- Syncs **only** `deploy-bundle/deploy/`
- Does **not** checkout `image_sha` for sync
- Does **not** rebuild / retag
- Accepts producer workflow name `CI` or `Package deploy bundle`

## RC2.1 CI identity (historical)

| Item | Value |
|------|--------|
| Approved CI | `31450597423` |
| PR head | `e136330a77cd9a8b0fba091500c5cda80738dbe3` |
| Temporary merge commit | `8b4f00de59450807760f2e81765f47e711ff6b54` |
| Backend tests | 221 |
| Tree scan | 485 files |
| History/delta | 96 commits |

Do not equate merge commits with release tips.

## HML

See `HML_REHEARSAL_RC2.2.md`. Bundle byte-compare + redeploy + agenda/day 200 + Admin UI login OK.

## Explicit non-goals

- No merge to `main`
- No Promote production execution in this stage
- No DNS / Cloudflare / Resend / Asaas Production changes
