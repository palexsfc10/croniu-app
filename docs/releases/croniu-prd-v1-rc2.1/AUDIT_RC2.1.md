# AUDIT RC2.1 — CI blockers only

Functional tip starts from RC2 `28057b0`. Scope: four proven CI failures only. No merge, HML, or PRD.

## Fixes

1. **Timezone test** — `test_client_service_cycle_receivable_flow` uses `America/Sao_Paulo` local date instead of UTC `date.today()`.
2. **Secret scan fixture** — fake OpenAI key assembled at runtime from fragments; never versioned as a full `sk-…` string. Tree/history/delta evidence uses candidate file count + commits scanned.
3. **Image smoke** — matches written to a temp file; fail only if `-s`; trap cleanup; ENV asserts `API_PROXY_TARGET=http://api:8000`.
4. **ShellCheck SC2155** — `deploy.sh` assigns `CRONIU_*_IMAGE` then exports separately.

## Local gates

- Backend: 221 passed
- ShellCheck `deploy/release` severity=warning: clean
- Compose + offline rehearse: ok
- Web/Admin lint+typecheck(+test)+build: ok
