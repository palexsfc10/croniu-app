# AUDIT RC2.1 — CI blockers only

Functional tip: `7cf3d5aea89322938d6fda2e28d7e296081c9710`.
PR head (tree-equivalent): `e136330a77cd9a8b0fba091500c5cda80738dbe3`.
Scope: four proven CI failures only. No merge, HML, or PRD in RC2.1.

## Fixes

1. **Timezone test** — `test_client_service_cycle_receivable_flow` uses `America/Sao_Paulo` local date instead of UTC `date.today()`.
2. **Secret scan fixture** — fake token assembled at runtime from fragments; never versioned as a full secret string.
3. **Image smoke** — fail only when match file is non-empty; ENV asserts `API_PROXY_TARGET=http://api:8000`.
4. **ShellCheck SC2155** — `deploy.sh` assigns `CRONIU_*_IMAGE` then exports separately.

## Evidence (final CI)

- Run: https://github.com/palexsfc10/croniu-app/actions/runs/31450597423
- Backend: **221 passed**
- Tree candidates: **485** files
- History/delta: **96** commits in checkout / **95** commits scanned (gitleaks log)
- Temporary Actions merge commit for that PR CI: `8b4f00de59450807760f2e81765f47e711ff6b54` (base `9bfbd4c` + head `e136330`); not a release tip.

Successor: `docs/releases/croniu-prd-v1-rc2.2/AUDIT_RC2.2.md` (build-once / promote-many).
