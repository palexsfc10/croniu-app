# HML rehearsal evidence — RC2.2 digests (`v1.0.0-rc2.2`)

Status: **rehearsal complete on HML** · **no merge** · **PRD not touched**

## Identity

| Field | Value |
| --- | --- |
| Digest candidate SHA | `c5503c08cd99a6d9222b47cb2ee5de52769077df` |
| Version | `v1.0.0-rc2.2` |
| CI run (approved for build) | `31452832847` |
| Build workflow run | `31452994104` |
| Manifest artifact name | `release-manifest-v1.0.0-rc2.2` |
| Manifest artifact id | `9087002365` |
| Manifest SHA-256 | `40958e52b5de386b4513c2aa24764839870f89ed6f20dc39b713a3f95ce5f83d` |
| Integrate tip after ops-only fixes (tree ≠ digests SHA) | `45b5cda3e5300a82638f92cce56ba11fb427de29` |
| Functional tip used for images | `c5503c08…` (ops scripts after this SHA were synced to HML without rebuild) |
| RC2.1 functional tip (historical) | `7cf3d5aea89322938d6fda2e28d7e296081c9710` |
| Earlier PR head before RC2.2 | `e136330a77cd9a8b0fba091500c5cda80738dbe3` |
| Main (intact) | `9bfbd4c92c04f2d17eaad6aeddd2375f0cf893ea` |
| Post-ops CI on integrate tip | `31453509131` success |

## Digests (immutable; not rebuilt after HML)

- API: `ghcr.io/palexsfc10/croniu-api@sha256:7296b6c0c2599d3254f2e1eed89e3d8d55ef0aee8ae8176cca5c75373dd8f0d9`
- Web: `ghcr.io/palexsfc10/croniu-web@sha256:5d0b79fb61093796534da25395e2f46650157bad1d19aca15f8d3dc98839af5f`
- Admin: `ghcr.io/palexsfc10/croniu-admin@sha256:d6c1b3a5ef0c637800664541de80d38f267f2d78836655c86fa57bceecef8814`

## Build-once / promote-many

- `build-release.yml` builds once, writes `release-manifest.json`, publishes artifact.
- `promote-production.yml` downloads the artifact by `build_run_id`; **no** `build` job; **no** call to `build-release`; **no** retag/push.
- CI guard asserts promote does not rebuild.

## HML prior state

| Field | Value |
| --- | --- |
| Prior SHA | `e6649bacd3591a432a84e752c3bfe0ad50c3e981` |
| Prior images | `croniu-hml-{api,web,admin}:local` |
| Alembic before | `0017_user_feedbacks` |
| `/health` | ok |
| `/health/ready`, `/version` | 404 on ancestral image |

## Backup

| Backup | Notes |
| --- | --- |
| `backups/pre-rc22-20260811T024205Z.sql.gz` | Pre-deploy; size ~32 783 bytes; `gzip -t` ok |
| Checksum | `4cfe74aee00f82799417e8f735f08458fe9e16abd2c3b4932815f8beb722c11c` |
| Later deploy backups | `hml-20260811T024*`, `hml-20260811T030006Z`, `hml-20260811T030141Z` preserved (not deleted) |

## Deploy

- Preflight: passed
- Pull by digest: passed
- Migration: `0017_user_feedbacks` → `0018_email_verification` (head)
- API ready before Web/Admin: enforced by `deploy/release/deploy.sh`
- `.env.hml` secrets preserved; `EMAIL_VERIFICATION_REQUIRED=false` kept
- No `docker compose down -v`; DB not recreated

## Smokes

### Public / technical

| Check | Result |
| --- | --- |
| API `/health` | ok |
| API `/health/ready` | ok |
| API `/version` | `environment=hml`, `version=v1.0.0-rc2.2`, `git_sha=c5503c08…` |
| Web HTTP | 200 |
| Admin HTTP | 200 |
| Web → `/api` same-origin rewrite | 422 validation JSON from API (not HTML) on empty login POST |
| Admin → `/api` same-origin rewrite | same |
| `API_PROXY_TARGET` | `http://api:8000` (web + admin) |
| Containers | exact `@sha256` digests (not tag-only) |
| Cloudflare tunnel | `croniu-hml-cloudflared` up |
| Other Jarvis stacks | nexxtin + kyvora containers still running (11 names counted) |

### Auth / functional rehearsal

| Check | Result |
| --- | --- |
| Register rehearsal user | 201 — user `2d09c30e-…`, org `d3547f59-…`, email `rc22.rehearsal.<ts>@example.com` |
| Client | 201 — `95d2f047-…` |
| Service | 201 |
| Cycle | 201 — `38f4c446-…` |
| Home / dashboard | 200 |
| Agenda (`GET /api/v1/appointments`) | **405** (wrong method/path for this API; day agenda is `/agenda/day`) — residual |
| Receivables | 200 |
| Assistant threads | 200 |
| Logout | 200 |
| Platform admin login as rehearsal pro | **403** (isolation ok) |
| Real Asaas charge / Resend / mass OpenAI | **not** executed |
| Billing | Sandbox config preserved; no live charge |

Temporary rehearsal rows left identified by email/org name; no broad TRUNCATE.

## Isolated restore

- Backup used: `backups/hml-20260811T024914Z.sql.gz` (checksum `3735d1688cdb5ab897b0c8680c617edeed0ebb94f74bf153ff4aa5be96263102`)
- Restored into throwaway DB `croniu_hml_rc22_restore_*` (never onto live HML)
- Alembic in dump: `0017_user_feedbacks`; public table count 36
- Throwaway DB dropped after validation

## Rollback

### Ancestral local images (`e6649ba` / `:local`)

**Not executed against live HML smoke contract.**

Reason: compose healthcheck and release smoke require `/health/ready` and `/version`, which ancestral images return 404. Attempting `compose up` with `:local` hung on health. Migration `0018` is additive and was **not** reversed.

### Digest rollback (executed)

1. Staged `RELEASE_MANIFEST.previous.json` = digest manifest.
2. Ran `deploy/release/rollback.sh` (skip pull when image present locally).
3. Result: containers back on the three digests; public smoke passed; `/version` coherent.

### Same-manifest redeploy (no rebuild)

- `deploy.sh --manifest manifests/c5503c08….json`
- Digests byte-identical to manifest (`digest_identity_ok`)
- Alembic remains `0018_email_verification`

## Residual risks

1. Agenda smoke used wrong endpoint (405); day agenda not re-probed in this pass.
2. Full Admin UI login with platform credentials not exercised (isolation probe only).
3. Ancestral image rollback remains incompatible with current HML compose healthcheck until those images are retired or healthcheck is dual-path.
4. `.env.hml` still lists `CRONIU_*_IMAGE=*:local` as defaults; release scripts **must** export digest overrides after `load_env_file` (deploy/rollback do).
5. Integrate tip `45b5cda` includes ops-only script fixes after digest SHA; images were **not** rebuilt (correct).

## Verdict for controlled merge request

**Conditional GO** for *requesting* controlled merge of the integrate branch **after** product owner review:

- Build-once / promote-many fixed and guarded
- Single GHCR build + immutable manifest + HML running exact digests
- Backup, migration, public smoke, auth smoke (core), isolated restore, digest rollback + same-manifest redeploy: **passed**
- Main and PRD untouched; no Promote production run

**Still do not merge or promote from this document alone.** Residual agenda endpoint smoke and ancestral-rollback incompatibility should be acknowledged in the merge request checklist.
