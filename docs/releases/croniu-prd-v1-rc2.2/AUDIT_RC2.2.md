# AUDIT RC2.2 — build-once / promote-many + digests rehearsal prep

Operational successor to RC2.1 (`7cf3d5a`). Product/domain rules unchanged.
Scope: release workflows, release scripts, and ops/audit docs only.

## Identity

| Item | Value |
|------|--------|
| RC2.1 functional tip | `7cf3d5aea89322938d6fda2e28d7e296081c9710` |
| RC2.1 PR head (trees ≡) | `e136330a77cd9a8b0fba091500c5cda80738dbe3` |
| Approved CI (RC2.1) | https://github.com/palexsfc10/croniu-app/actions/runs/31450597423 |
| CI event | `pull_request` |
| CI `head_sha` | `e136330a77cd9a8b0fba091500c5cda80738dbe3` |
| Temporary merge commit checked out by Actions | `8b4f00de59450807760f2e81765f47e711ff6b54` (= `9bfbd4c` + `e136330`) |
| Base `main` | `9bfbd4c92c04f2d17eaad6aeddd2375f0cf893ea` |
| Backend tests | 221 passed |
| Tree scan candidates | 485 files |
| History/delta commits (final run) | 96 (log: 95 commits scanned + checkout count) |

Do not equate `8b4f00d` with the release tip: it is only the ephemeral PR merge
commit used by GitHub Actions checkout for that green CI run. The candidate
tree is the PR head / RC tip.

## Fixes in RC2.2

1. **Promote production** no longer calls `build-release`. It downloads the
   existing `release-manifest.json` artifact by `build_run_id` and deploys
   those digests only.
2. **Build release images** requires an approved CI run id + expected CI head
   SHA before push; writes build/CI metadata into the manifest; refuses
   non-digest image refs.
3. CI guards: promote-no-rebuild check + positive/negative manifest schema
   validation (`deploy/release/validate_manifest.sh`).
4. Docs aligned to build-once → HML → same artifact → PRD.

## Explicit non-goals

- No merge to `main`
- No PRD promote in this stage until HML rehearsal GO
- No DNS / Cloudflare / Resend / Asaas Production changes
