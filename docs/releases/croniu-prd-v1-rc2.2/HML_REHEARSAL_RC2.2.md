# HML rehearsal evidence — RC2.2 digests (`v1.0.0-rc2.2`)

Status: **rehearsal complete on HML** · **no merge** · **PRD not touched**

## Dual identity (build-once / promote-many)

| Identity | Value |
| --- | --- |
| **image_sha** | `c5503c08cd99a6d9222b47cb2ee5de52769077df` |
| **deploy_sha** | `4a5cef2ab8b9c2d0ae0dc8fba368d948e4bf2094` |
| Version | `v1.0.0-rc2.2` |
| PR tip (equals deploy_sha) | `4a5cef2ab8b9c2d0ae0dc8fba368d948e4bf2094` |

`image_sha` ≠ `deploy_sha` by design: GHCR digests were frozen at `c5503c08…`; ops scripts (`deploy.sh` migrate timeout, `rollback.sh` previous-manifest/pull/readiness, deploy-bundle packaging) landed afterward and are packaged separately.

## Image manifest (unchanged; not rebuilt)

| Field | Value |
| --- | --- |
| Build run | `31452994104` |
| Artifact | `release-manifest-v1.0.0-rc2.2` (id `9087002365`) |
| Manifest SHA-256 | `40958e52b5de386b4513c2aa24764839870f89ed6f20dc39b713a3f95ce5f83d` |
| CI for image build | `31452832847` |
| API | `ghcr.io/palexsfc10/croniu-api@sha256:7296b6c0c2599d3254f2e1eed89e3d8d55ef0aee8ae8176cca5c75373dd8f0d9` |
| Web | `ghcr.io/palexsfc10/croniu-web@sha256:5d0b79fb61093796534da25395e2f46650157bad1d19aca15f8d3dc98839af5f` |
| Admin | `ghcr.io/palexsfc10/croniu-admin@sha256:d6c1b3a5ef0c637800664541de80d38f267f2d78836655c86fa57bceecef8814` |

## Deploy bundle (immutable ops package)

| Field | Value |
| --- | --- |
| Artifact | `release-deploy-bundle-v1.0.0-rc2.2` |
| Artifact id | `9087944496` |
| Producer run (CI) | `31455737695` |
| Aggregate SHA-256 | `b3154120247aa2a68eae809cffca91d0a2998d1f13805061a34fa7819034f97d` |
| CI head / deploy_sha | `4a5cef2…` (PR head; **not** the ephemeral merge commit) |

Promote production downloads this artifact by `deploy_bundle_run_id` and syncs **only** `deploy-bundle/deploy/`. It never checks out `image_sha` for ops scripts. (`Package deploy bundle` workflow also exists for post-main dispatch.)

## Historical notes

| Item | Value |
| --- | --- |
| RC2.1 functional tip | `7cf3d5aea89322938d6fda2e28d7e296081c9710` |
| Earlier PR head (RC2.1 trees ≡) | `e136330a77cd9a8b0fba091500c5cda80738dbe3` |
| RC2.1 CI | `31450597423` |
| Main (intact) | `9bfbd4c92c04f2d17eaad6aeddd2375f0cf893ea` |
| Prior integrate tip (superseded) | `ce91555…` / `45b5cda…` — replaced by `4a5cef2` |

## HML prior → current

| Field | Before | After |
| --- | --- | --- |
| Images | `:local` then digests | **same three digests** |
| Alembic | `0017` → `0018` | remains `0018_email_verification` |
| Ops scripts | rehearsed fixes on host | **byte-identical** to deploy bundle for `deploy.sh` / `rollback.sh` / core release scripts before sync; then synced from validated bundle |

### Bundle revalidation (same mechanism as future PRD)

1. Downloaded artifact zip from run `31455737695`.
2. `validate_deploy_bundle.sh` OK (aggregate `b3154120…`).
3. Critical scripts MATCH vs HML before sync.
4. `rsync` from bundle only (no `.env`).
5. Image manifest checksum still `40958e52…`.
6. Redeploy digests + digest rollback + same-manifest redeploy → `digest_identity_ok`.

## Smokes (residual closed)

| Check | Result |
| --- | --- |
| `GET /api/v1/agenda/day?day=<local_today>` | **200**; appointment `ee87f9c4-…` present for cycle day `2026-08-11` |
| Platform login as rehearsal pro | **403** |
| Admin API login (platform) | **200** |
| Admin UI `/` | **200** |
| Admin overview via UI `/api` proxy | **200** |
| Admin logout | **200**; overview after logout **401** |

Rehearsal IDs: user `d82b0638-…`, org `0ddebcdb-…`, cycle `485fce4c-…`, appt `ee87f9c4-…`.

## Verdict

**GO** to *request* controlled merge of `integrate/croniu-prd-rc1` tip `4a5cef2…`, subject to human approval.

Still **do not** merge or run Promote from this document alone.
