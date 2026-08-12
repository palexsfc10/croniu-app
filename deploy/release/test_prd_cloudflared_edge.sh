#!/usr/bin/env bash
# Contract: PRD cloudflared is profile "edge", off by default, digest-pinned, no ports.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

COMPOSE="$ROOT/deploy/prd/compose.prd.yaml"
ENV_EX="$ROOT/deploy/prd/env.prd.example"
[[ -f "$COMPOSE" && -f "$ENV_EX" ]] || fail "missing prd compose/env example"

grep -q 'container_name: croniu-prd-cloudflared' "$COMPOSE" || fail "missing croniu-prd-cloudflared"
grep -q 'profiles: \["edge"\]' "$COMPOSE" || fail "missing profiles edge"
grep -q 'cloudflare/cloudflared@sha256:803b17adb5326a38ce397b9c9f374289ad290ee5526d204b5879a1423b6f5c3e' "$COMPOSE" \
  || fail "cloudflared image must be digest-pinned 2025.7.0 manifest"
grep -q 'TUNNEL_TOKEN: \${CLOUDFLARE_TUNNEL_TOKEN:-}' "$COMPOSE" || fail "CLOUDFLARE_TUNNEL_TOKEN mapping must use :- (Compose interpolates inactive profiles)"
grep -q '"--no-autoupdate"' "$COMPOSE" || fail "no-autoupdate required"
grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' "$ENV_EX" || fail "env.prd.example missing CLOUDFLARE_TUNNEL_TOKEN"
grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' "$ROOT/deploy/prd/.env.prd.example" || fail ".env.prd.example missing CLOUDFLARE_TUNNEL_TOKEN"
[[ -f "$ROOT/deploy/prd/edge_up.sh" ]] || fail "missing edge_up.sh"
[[ -f "$ROOT/deploy/prd/edge_down.sh" ]] || fail "missing edge_down.sh"
grep -q 'CLOUDFLARE_TUNNEL_TOKEN is MISSING' "$ROOT/deploy/prd/edge_up.sh" || fail "edge_up must fail closed without token"

cloud_line="$(grep -E '^\s+image: cloudflare/cloudflared' "$COMPOSE")"
[[ "$cloud_line" != *latest* ]] || fail "latest forbidden on cloudflared"

resolve_python() {
  local c
  for c in python3 python \
    "/c/Users/user/AppData/Local/Programs/Python/Python312/python.exe" \
    "/mnt/c/Users/user/AppData/Local/Programs/Python/Python312/python.exe"; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys' >/dev/null 2>&1; then
      printf '%s\n' "$c"
      return 0
    fi
    if [[ -x "$c" ]] && "$c" -c 'import sys' >/dev/null 2>&1; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  if command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
    printf '%s\n' "py"
    return 0
  fi
  return 1
}
PYBIN="$(resolve_python)" || fail "python required"
run_py() {
  if [[ "$PYBIN" == "py" ]]; then
    py -3 "$@"
  else
    "$PYBIN" "$@"
  fi
}

run_py - <<'PY' || fail "python inspect failed"
from pathlib import Path
text = Path("deploy/prd/compose.prd.yaml").read_text(encoding="utf-8")
start = text.index("\n  cloudflared:\n")
rest = text[start + 1 :]
end = None
for marker in ("\nvolumes:", "\nnetworks:"):
    i = rest.find(marker)
    if i != -1:
        end = i if end is None else min(end, i)
block = rest if end is None else rest[:end]
forbidden = [
    "ports:",
    "privileged:",
    "network_mode: host",
    'network_mode: "host"',
    "/var/run/docker.sock",
    "cap_add:",
    ":latest",
]
for f in forbidden:
    if f in block:
        raise SystemExit(f"forbidden in cloudflared block: {f}")
if "croniu-prd-network" not in block:
    raise SystemExit("cloudflared must join croniu-prd-network")
if "profiles:" not in block or "edge" not in block:
    raise SystemExit("edge profile missing in block")
for needle in (
    'ports: ["127.0.0.1:${API_HOST_PORT}:8000"]',
    'ports: ["127.0.0.1:${WEB_HOST_PORT}:3000"]',
    'ports: ["127.0.0.1:${ADMIN_HOST_PORT}:3000"]',
):
    if needle not in text:
        raise SystemExit(f"loopback binding missing: {needle}")
db_start = text.index("\n  db:\n")
api_start = text.index("\n  api:\n")
db_block = text[db_start:api_start]
if "ports:" in db_block:
    raise SystemExit("db must not publish ports")
print("static_compose_ok")
PY
pass "static compose/env contract"

if grep -nE -- '--profile(=| )edge|COMPOSE_PROFILES=.*edge' deploy/release/deploy.sh deploy/release/rollback.sh; then
  fail "deploy/rollback must not activate edge profile"
fi
pass "deploy/rollback do not activate edge"

if grep -RE 'CLOUDFLARE_TUNNEL_TOKEN=eyJ' deploy/prd/; then
  fail "real-looking token in prd examples"
fi
pass "no secret tokens in examples"

command -v docker >/dev/null 2>&1 || { echo "SKIP compose config (no docker)"; exit 0; }
docker compose version >/dev/null 2>&1 || { echo "SKIP compose config (no docker compose)"; exit 0; }

TMP="$ROOT/.tmp-cloudflared-edge-test-$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
cp "$COMPOSE" "$TMP/compose.prd.yaml"
cat >"$TMP/.env.prd" <<'EOF'
POSTGRES_USER=croniu
POSTGRES_PASSWORD=placeholder_not_a_secret
POSTGRES_DB=croniu
API_HOST_PORT=19080
WEB_HOST_PORT=14000
ADMIN_HOST_PORT=14002
CRONIU_API_IMAGE=ghcr.io/palexsfc10/croniu-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
CRONIU_WEB_IMAGE=ghcr.io/palexsfc10/croniu-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CRONIU_ADMIN_IMAGE=ghcr.io/palexsfc10/croniu-admin@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
CLOUDFLARE_TUNNEL_TOKEN=
EOF

unset COMPOSE_PROFILES || true
export COMPOSE_PROFILES=""

docker compose --env-file "$TMP/.env.prd" -f "$TMP/compose.prd.yaml" config --format json \
  >"$TMP/cfg_default.json" 2>"$TMP/err_default" \
  || { cat "$TMP/err_default" >&2; fail "compose config without profile failed"; }

(
  cd "$TMP"
  run_py - <<'PY'
import json
from pathlib import Path
cfg=json.loads(Path("cfg_default.json").read_text(encoding="utf-8"))
services=set(cfg.get("services") or {})
assert "cloudflared" not in services, services
for req in ("db","api","web","admin"):
    assert req in services, req
print("default_services", ",".join(sorted(services)))
PY
)
pass "compose config default excludes cloudflared"

export COMPOSE_PROFILES=edge
# Ephemeral dummy for interpolation only — not a real credential.
CLOUDFLARE_TUNNEL_TOKEN='dummy_edge_token_not_a_real_secret' \
  docker compose --env-file "$TMP/.env.prd" -f "$TMP/compose.prd.yaml" config --format json \
  >"$TMP/cfg_edge.json" 2>"$TMP/err_edge" \
  || { cat "$TMP/err_edge" >&2; fail "compose config with edge+token failed"; }

(
  cd "$TMP"
  run_py - <<'PY'
import json
from pathlib import Path
cfg=json.loads(Path("cfg_edge.json").read_text(encoding="utf-8"))
services=set(cfg.get("services") or {})
assert "cloudflared" in services, services
svc=cfg["services"]["cloudflared"]
assert not svc.get("ports"), svc.get("ports")
img=svc.get("image","")
assert "@sha256:" in img and "latest" not in img, img
cmd=svc.get("command") or []
joined=" ".join(cmd) if isinstance(cmd,list) else str(cmd)
assert "dummy_edge_token" not in joined, "token leaked into command"
nets=svc.get("networks")
assert nets is not None
print("edge_service_ok")
PY
)
pass "compose config with edge includes cloudflared without ports/latest"

# edge_up.sh fails closed without token (no docker up)
if ENV_FILE="$TMP/.env.prd" COMPOSE_FILE="$TMP/compose.prd.yaml" \
  bash "$ROOT/deploy/prd/edge_up.sh" >"$TMP/edge_up_out.txt" 2>"$TMP/edge_up_err.txt"; then
  fail "edge_up should fail without token"
fi
grep -q 'MISSING' "$TMP/edge_up_err.txt" || { cat "$TMP/edge_up_err.txt" >&2; fail "edge_up should report MISSING"; }
pass "edge_up fails closed without token"

unset COMPOSE_PROFILES
echo "ALL cloudflared edge contract checks passed"
