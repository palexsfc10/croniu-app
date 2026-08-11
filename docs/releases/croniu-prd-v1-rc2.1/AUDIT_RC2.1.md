# AUDIT RC2.1 â€” CI blockers only

Functional tip starts from RC2 `28057b0`. Scope: four proven CI failures only. No merge, HML, or PRD.

## Fixes

1. **Timezone test** â€” `test_client_service_cycle_receivable_flow` uses `America/Sao_Paulo` local date instead of UTC `date.today()`.
2. **Secret scan fixture** â€” fake OpenAI key assembled at runtime from fragments; never versioned as a full `sk-â€¦` string. Tree/history/delta evidence uses candidate file count + commits scanned.
3. **Image smoke** â€” matches written to a temp file; fail only if `-s`; trap cleanup; ENV asserts `API_PROXY_TARGET=http://api:8000`.
4. **ShellCheck SC2155** â€” `deploy.sh` assigns `CRONIU_*_IMAGE` then exports separately.

## Local gates

- Backend: 221 passed
- ShellCheck `deploy/release` severity=warning: clean
- Compose + offline rehearse: ok
- Web/Admin lint+typecheck(+test)+build: ok

## CI

https://github.com/palexsfc10/croniu-app/actions/runs/31450430623 — all required jobs green.
