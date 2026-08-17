#!/usr/bin/env bash
# Contract: deploy.sh must export digest-pinned CRONIU_*_IMAGE from the
# release-manifest BEFORE preflight/compose config (RC2.3 HML rehearsal gap).
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

[[ -f "$ROOT/deploy/release/deploy.sh" ]] || fail "missing deploy.sh"
[[ -f "$ROOT/deploy/release/preflight.sh" ]] || fail "missing preflight.sh"
[[ -f "$ROOT/deploy/prd/env.prd.example" ]] || fail "missing env.prd.example"
[[ -f "$ROOT/deploy/prd/compose.prd.yaml" ]] || fail "missing compose.prd.yaml"

# --- Static order guard: export_release_images_from_manifest before preflight.sh ---
deploy_src="$ROOT/deploy/release/deploy.sh"
export_line="$(grep -n 'export_release_images_from_manifest' "$deploy_src" | head -n1 | cut -d: -f1)"
preflight_line="$(grep -n 'preflight\.sh' "$deploy_src" | head -n1 | cut -d: -f1)"
[[ -n "$export_line" && -n "$preflight_line" ]] || fail "deploy.sh missing export or preflight call"
(( export_line < preflight_line )) || fail "preflight.sh must run AFTER export_release_images_from_manifest (lines $export_line vs $preflight_line)"
pass "static order: export images (L$export_line) before preflight (L$preflight_line)"

DIGEST_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
DIGEST_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
DIGEST_C="cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
API_IMG="ghcr.io/example/croniu-api@sha256:${DIGEST_A}"
WEB_IMG="ghcr.io/example/croniu-web@sha256:${DIGEST_B}"
ADMIN_IMG="ghcr.io/example/croniu-admin@sha256:${DIGEST_C}"

write_manifest() {
  local path="$1"
  # Use ${n-default} (not 🙂) so an explicit empty string is preserved for negative tests.
  local api="${2-$API_IMG}" web="${3-$WEB_IMG}" admin="${4-$ADMIN_IMG}"
  jq -nc --arg api "$api" --arg web "$web" --arg admin "$admin" \
    '{sha:"deadbeef",version:"v0.0.0-test",images:{api:$api,web:$web,admin:$admin}}' >"$path"
}

write_env() {
  local path="$1" email_provider="${2:-fake}" resend_key="${3:-}"
  cat >"$path" <<EOF
POSTGRES_USER=croniu
POSTGRES_PASSWORD=placeholder_not_a_secret
POSTGRES_DB=croniu
API_HOST_PORT=19080
WEB_HOST_PORT=14000
ADMIN_HOST_PORT=14002
CRONIU_ENV=production
SECRET_KEY=placeholder-secret-key-with-32chars-min
CLIENT_PORTAL_SIGNING_KEY=placeholder-portal-signing-key-32chars
SESSION_COOKIE_SECURE=true
CORS_ORIGINS=https://app.example.test,https://admin.example.test
OPENAPI_ENABLED=false
PUBLIC_APP_BASE_URL=https://app.example.test
APP_PUBLIC_URL=https://app.example.test
API_PUBLIC_URL=https://api.example.test
ADMIN_PUBLIC_URL=https://admin.example.test
EMAIL_PROVIDER=${email_provider}
RESEND_API_KEY=${resend_key}
EMAIL_FROM="Croniu <no-reply@example.test>"
EMAIL_VERIFICATION_REQUIRED=$([ "$email_provider" = "resend" ] && echo true || echo false)
ASAAS_ENVIRONMENT=production
ASAAS_API_URL=https://api.asaas.com/v3
BILLING_ENABLED=false
AI_ENABLED=false
EOF
}

setup_tree() {
  local base="$1"
  mkdir -p "$base/deploy/prd" "$base/deploy/release" "$base/manifests" "$base/bin"
  cp "$ROOT/deploy/prd/compose.prd.yaml" "$base/deploy/prd/"
  cp "$ROOT/deploy/prd/env.prd.example" "$base/deploy/prd/"
  cp "$ROOT/deploy/release/"*.sh "$base/deploy/release/"
  chmod +x "$base/deploy/release/"*.sh
  write_env "$base/deploy/prd/.env.prd" fake
  write_manifest "$base/manifests/release-manifest.json"
}

# Docker/curl stubs: prove compose config sees images; optionally stop after config.
install_docker_stub() {
  local bin="$1" mode="${2:-ok}"
  mkdir -p "$bin"
  cat >"$bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
PROOF="${CRONIU_TEST_PROOF:?}"
MODE="${CRONIU_TEST_DOCKER_MODE:-ok}"
args=("$@")
joined="${args[*]}"
record() { printf '%s\n' "$*" >>"$PROOF"; }

if [[ "${args[0]:-}" == "info" ]]; then
  record "docker info"
  exit 0
fi
if [[ "${args[0]:-}" == "volume" && "${args[1]:-}" == "inspect" ]]; then
  record "docker volume inspect"
  exit 1
fi
if [[ "${args[0]:-}" == "compose" ]]; then
  if [[ "$joined" == *" config"* ]]; then
    record "compose config"
    : "${CRONIU_API_IMAGE:?CRONIU_API_IMAGE missing at compose config}"
    : "${CRONIU_WEB_IMAGE:?CRONIU_WEB_IMAGE missing at compose config}"
    : "${CRONIU_ADMIN_IMAGE:?CRONIU_ADMIN_IMAGE missing at compose config}"
    [[ "$CRONIU_API_IMAGE" == *@sha256:* ]] || exit 1
    [[ "$CRONIU_WEB_IMAGE" == *@sha256:* ]] || exit 1
    [[ "$CRONIU_ADMIN_IMAGE" == *@sha256:* ]] || exit 1
    [[ "$CRONIU_API_IMAGE" != *latest* && "$CRONIU_WEB_IMAGE" != *latest* && "$CRONIU_ADMIN_IMAGE" != *latest* ]] || exit 1
    printf '%s\n' "$CRONIU_API_IMAGE" >"${PROOF}.api"
    printf '%s\n' "$CRONIU_WEB_IMAGE" >"${PROOF}.web"
    printf '%s\n' "$CRONIU_ADMIN_IMAGE" >"${PROOF}.admin"
    record "compose config OK with images"
    if [[ "$MODE" == "stop_after_config" ]]; then
      record "STOP_AFTER_CONFIG"
      exit 42
    fi
    exit 0
  fi
  record "compose other: $joined"
  exit 0
fi
record "docker unhandled: $joined"
exit 0
STUB
  chmod +x "$bin/docker"
  cat >"$bin/curl" <<'CURL'
#!/usr/bin/env bash
exit 0
CURL
  chmod +x "$bin/curl"
  # Persist requested mode for child processes.
  printf '%s\n' "$mode" >"$bin/.docker_mode"
}

run_deploy() {
  local base="$1" mode="${2:-stop_after_config}"
  (
    cd "$base"
    export PATH="$base/bin:$PATH"
    export CRONIU_TEST_PROOF="$base/proof.txt"
    export CRONIU_TEST_DOCKER_MODE="$mode"
    : >"$CRONIU_TEST_PROOF"
    bash deploy/release/deploy.sh \
      --environment prd \
      --sha deadbeefdeadbeefdeadbeefdeadbeefdeadbeef \
      --manifest "$base/manifests/release-manifest.json"
  )
}

# --- 1) Happy path: images exported; compose config sees them ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
setup_tree "$TMP/ok"
install_docker_stub "$TMP/ok/bin" stop_after_config
set +e
run_deploy "$TMP/ok" stop_after_config
ec=$?
set -e
grep -q 'compose config OK with images' "$TMP/ok/proof.txt" || fail "compose config did not see images"
grep -q 'STOP_AFTER_CONFIG' "$TMP/ok/proof.txt" || fail "expected stop after config"
[[ "$(cat "$TMP/ok/proof.txt.api")" == "$API_IMG" ]] || fail "API image mismatch"
[[ "$(cat "$TMP/ok/proof.txt.web")" == "$WEB_IMG" ]] || fail "WEB image mismatch"
[[ "$(cat "$TMP/ok/proof.txt.admin")" == "$ADMIN_IMG" ]] || fail "ADMIN image mismatch"
# exit 42 from stub triggers rollback trap → non-zero; that is expected after proof
pass "manifest válido → imagens exportadas → compose config recebe digests"

# --- Helper: expect export/preflight failure without needing full docker path ---
expect_fail_export() {
  local label="$1"
  local base="$2"
  set +e
  (
    cd "$base"
    export PATH="$base/bin:$PATH"
    export CRONIU_TEST_PROOF="$base/proof.txt"
    : >"$CRONIU_TEST_PROOF"
    # Call export path the same way deploy does
    # shellcheck disable=SC1091
    ENVIRONMENT=prd SHA=deadbeef \
      MANIFEST="$base/manifests/release-manifest.json" \
      DEPLOY_ROOT="$base" \
      COMPOSE_FILE="$base/deploy/prd/compose.prd.yaml" \
      ENV_FILE="$base/deploy/prd/.env.prd" \
      bash -c 'source deploy/release/lib.sh; export_release_images_from_manifest'
  )
  ec=$?
  set -e
  (( ec != 0 )) || fail "$label should fail closed"
  pass "$label"
}

# --- 2/3/4) Missing service images ---
for svc in api web admin; do
  b="$TMP/missing-$svc"
  setup_tree "$b"
  case "$svc" in
    api) write_manifest "$b/manifests/release-manifest.json" "" "$WEB_IMG" "$ADMIN_IMG" ;;
    web) write_manifest "$b/manifests/release-manifest.json" "$API_IMG" "" "$ADMIN_IMG" ;;
    admin) write_manifest "$b/manifests/release-manifest.json" "$API_IMG" "$WEB_IMG" "" ;;
  esac
  # empty string in jq still writes ""; require_digest should fail
  expect_fail_export "CRONIU_${svc}_IMAGE ausente/inválida" "$b"
done

# --- 5) latest rejected ---
b="$TMP/latest"
setup_tree "$b"
write_manifest "$b/manifests/release-manifest.json" \
  "ghcr.io/example/api:latest" "$WEB_IMG" "$ADMIN_IMG"
expect_fail_export "latest rejeitado" "$b"

# --- 6) abbreviated / malformed digest ---
b="$TMP/short"
setup_tree "$b"
write_manifest "$b/manifests/release-manifest.json" \
  "ghcr.io/example/api@sha256:abcd" "$WEB_IMG" "$ADMIN_IMG"
expect_fail_export "digest abreviado rejeitado" "$b"

# --- 7) manifest ausente ---
b="$TMP/nomf"
setup_tree "$b"
rm -f "$b/manifests/release-manifest.json"
expect_fail_export "manifest ausente rejeitado" "$b"

# --- 8) email disabled + Resend absent → preflight OK (with images exported) ---
b="$TMP/email-off"
setup_tree "$b"
write_env "$b/deploy/prd/.env.prd" fake ""
install_docker_stub "$b/bin" ok
(
  cd "$b"
  export PATH="$b/bin:$PATH"
  export CRONIU_TEST_PROOF="$b/proof.txt"
  export CRONIU_TEST_DOCKER_MODE=ok
  : >"$CRONIU_TEST_PROOF"
  ENVIRONMENT=prd SHA=deadbeef \
    MANIFEST="$b/manifests/release-manifest.json" \
    DEPLOY_ROOT="$b" \
    COMPOSE_FILE="$b/deploy/prd/compose.prd.yaml" \
    ENV_FILE="$b/deploy/prd/.env.prd" \
    bash -c 'source deploy/release/lib.sh; load_env_file "$ENV_FILE"; export_release_images_from_manifest; bash deploy/release/preflight.sh'
) || fail "email disabled should allow preflight without Resend"
pass "e-mail desabilitado (EMAIL_PROVIDER=fake) sem Resend → preflight OK"

# --- 9) email enabled + Resend absent → preflight rejects ---
b="$TMP/email-on"
setup_tree "$b"
write_env "$b/deploy/prd/.env.prd" resend ""
install_docker_stub "$b/bin" ok
set +e
(
  cd "$b"
  export PATH="$b/bin:$PATH"
  export CRONIU_TEST_PROOF="$b/proof.txt"
  export CRONIU_TEST_DOCKER_MODE=ok
  ENVIRONMENT=prd SHA=deadbeef \
    MANIFEST="$b/manifests/release-manifest.json" \
    DEPLOY_ROOT="$b" \
    COMPOSE_FILE="$b/deploy/prd/compose.prd.yaml" \
    ENV_FILE="$b/deploy/prd/.env.prd" \
    bash -c 'source deploy/release/lib.sh; load_env_file "$ENV_FILE"; export_release_images_from_manifest; bash deploy/release/preflight.sh'
)
ec=$?
set -e
(( ec != 0 )) || fail "email enabled without Resend must fail"
pass "e-mail habilitado sem Resend → preflight rejeita"

# synthetic key rejected when resend
b="$TMP/email-synth"
setup_tree "$b"
write_env "$b/deploy/prd/.env.prd" resend "rehearsal_synthetic_deadbeef"
install_docker_stub "$b/bin" ok
set +e
(
  cd "$b"
  export PATH="$b/bin:$PATH"
  export CRONIU_TEST_PROOF="$b/proof.txt"
  export CRONIU_TEST_DOCKER_MODE=ok
  ENVIRONMENT=prd SHA=deadbeef \
    MANIFEST="$b/manifests/release-manifest.json" \
    DEPLOY_ROOT="$b" \
    COMPOSE_FILE="$b/deploy/prd/compose.prd.yaml" \
    ENV_FILE="$b/deploy/prd/.env.prd" \
    bash -c 'source deploy/release/lib.sh; load_env_file "$ENV_FILE"; export_release_images_from_manifest; bash deploy/release/preflight.sh'
)
ec=$?
set -e
(( ec != 0 )) || fail "synthetic Resend key must fail"
pass "Resend sintético rejeitado quando EMAIL_PROVIDER=resend"

# --- 10) packaging includes env.prd.example, excludes .env.prd ---
b="$TMP/pack"
mkdir -p "$b/src" "$b/out"
cp -a "$ROOT/deploy/." "$b/src/"
# Plant a fake secret env that must be excluded
printf 'LEAKED_PACK_TOKEN=should-not-appear-in-bundle-xyz\n' >"$b/src/prd/.env.prd"
bash "$ROOT/deploy/release/package_deploy_bundle.sh" \
  --source-dir "$b/src" \
  --out-dir "$b/out" \
  --deploy-sha 537ab5efc265dbb698ff80b47f8055cf56d3937e \
  --image-sha 831f554bb5c8fae708afb2f3a58177bf3c0bdfa7 \
  --version v0.0.0-test-pack \
  --repository test/croniu \
  --package-run-id LOCAL_TEST
[[ -f "$b/out/deploy/prd/env.prd.example" ]] || fail "env.prd.example missing from package"
[[ ! -f "$b/out/deploy/prd/.env.prd" ]] || fail ".env.prd must not be packaged"
[[ ! -f "$b/out/deploy/prd/.env.prd.example" ]] || fail ".env.prd.example must remain excluded by .env.* filter"
# Token is planted only in .env.prd; ensure it did not leak into packaged prd tree.
if grep -RniF 'LEAKED_PACK_TOKEN' "$b/out/deploy/prd" >/dev/null 2>&1; then
  fail "packaged prd tree contains planted secret token"
fi
if find "$b/out/deploy" \( -name '.env' -o -name '.env.*' \) | grep -q .; then
  fail "packaged tree must not contain .env* files"
fi
if grep -RniE 'v1\.0\.0-rc2\.2' "$b/out/deploy/release/deploy.sh" "$b/out/deploy/release/preflight.sh" "$b/out/deploy/release/lib.sh" >/dev/null; then
  fail "release scripts must not hardcode RC2.2"
fi
if grep -RniE '(^|[^@])latest([^a-z]|$)' "$b/out/deploy/release/deploy.sh" "$b/out/deploy/release/lib.sh" >/dev/null; then
  # allow comments that say "never latest"
  if grep -RniE 'CRONIU_.*=.*latest|:latest|@latest' "$b/out/deploy/release/deploy.sh" "$b/out/deploy/release/lib.sh" >/dev/null; then
    fail "release scripts must not use latest tags"
  fi
fi
pass "empacotamento: env.prd.example presente; .env.prd ausente; sem secrets"

# --- 11) order regression: if preflight precedes export, static check already covers;
#          also prove integrated path records compose config only after export by
#          ensuring proof file has export log line from deploy before config ---
grep -q 'Exported immutable CRONIU_\*_IMAGE\|Exported immutable' "$TMP/ok/"*.log 2>/dev/null || true
# From happy-path deploy stdout captured? We didn't capture stdout. Re-run capturing:
b="$TMP/order-log"
setup_tree "$b"
install_docker_stub "$b/bin" stop_after_config
set +e
(
  cd "$b"
  export PATH="$b/bin:$PATH"
  export CRONIU_TEST_PROOF="$b/proof.txt"
  export CRONIU_TEST_DOCKER_MODE=stop_after_config
  : >"$CRONIU_TEST_PROOF"
  bash deploy/release/deploy.sh \
    --environment prd \
    --sha deadbeefdeadbeefdeadbeefdeadbeefdeadbeef \
    --manifest "$b/manifests/release-manifest.json" >"$b/out.txt" 2>&1
)
set -e
grep -q 'Exported immutable CRONIU_\*_IMAGE refs from release-manifest\|Exported immutable' "$b/out.txt" || \
  grep -q 'Exported immutable' "$b/out.txt" || fail "deploy must log image export before preflight"
# Ensure export log appears before compose config proof chronologically in combined view:
# proof only has docker lines; out.txt has export log — both must exist.
grep -q 'compose config OK' "$b/proof.txt" || fail "order integration missing compose proof"
pass "ordem integrada: export log + compose config com imagens"

echo "ALL PASS: cold-start preflight image export contract"
