#!/usr/bin/env bash
# Contract guards for .github/workflows/package-deploy-bundle.yml
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WF="${ROOT}/.github/workflows/package-deploy-bundle.yml"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

[[ -f "$WF" ]] || fail "missing $WF"
command -v python >/dev/null 2>&1 || fail "python required for workflow contract test"

python - "$WF" <<'PY'
from pathlib import Path
import re
import sys

wf = Path(sys.argv[1])
text = wf.read_text(encoding="utf-8")
try:
    import yaml  # type: ignore
    data = yaml.safe_load(text)
except Exception:
    data = None

required_inputs = {
    "deploy_sha",
    "image_sha",
    "version",
    "ci_run_id",
    "expected_ci_head_sha",
}

if data is not None:
    if data.get("name") != "Package deploy bundle":
        print("unexpected workflow name", data.get("name"), file=sys.stderr)
        sys.exit(1)
    # PyYAML may coerce key 'on' -> True
    on = data.get("on")
    if on is None and True in data:
        on = data.get(True)
    if isinstance(on, dict):
        if "workflow_dispatch" not in on:
            print("missing workflow_dispatch", file=sys.stderr)
            sys.exit(1)
        inputs = (on.get("workflow_dispatch") or {}).get("inputs") or {}
        missing = required_inputs - set(inputs)
        if missing:
            print("missing inputs:", sorted(missing), file=sys.stderr)
            sys.exit(1)
        for key in required_inputs:
            if not inputs[key].get("required", False):
                print(f"input {key} must be required", file=sys.stderr)
                sys.exit(1)
        push = on.get("push") or {}
        paths = push.get("paths") or []
        if ".github/workflows/package-deploy-bundle.yml" not in paths:
            print("push paths must include this workflow file for Actions indexing", file=sys.stderr)
            sys.exit(1)
    jobs = data.get("jobs") or {}
    if "package" not in jobs or "index" not in jobs:
        print("expected jobs: index + package", file=sys.stderr)
        sys.exit(1)
    pkg_if = str((jobs["package"] or {}).get("if") or "")
    idx_if = str((jobs["index"] or {}).get("if") or "")
    if "workflow_dispatch" not in pkg_if:
        print("package job must run only on workflow_dispatch", file=sys.stderr)
        sys.exit(1)
    if "push" not in idx_if:
        print("index job must run only on push", file=sys.stderr)
        sys.exit(1)
    perms = data.get("permissions") or {}
    if perms.get("contents") != "read" or perms.get("actions") != "read":
        print("permissions must be contents:read actions:read", file=sys.stderr)
        sys.exit(1)

checks = [
    (r"(?m)^name:\s*Package deploy bundle\s*$", "workflow name"),
    (r"(?m)^\s*workflow_dispatch:\s*$", "workflow_dispatch"),
    (r"(?m)^\s*deploy_sha:\s*$", "input deploy_sha"),
    (r"(?m)^\s*image_sha:\s*$", "input image_sha"),
    (r"(?m)^\s*version:\s*$", "input version"),
    (r"(?m)^\s*ci_run_id:\s*$", "input ci_run_id"),
    (r"(?m)^\s*expected_ci_head_sha:\s*$", "input expected_ci_head_sha"),
    (r"package_deploy_bundle\.sh", "reuses package_deploy_bundle.sh"),
    (r"validate_deploy_bundle\.sh", "reuses validate_deploy_bundle.sh"),
    (r"release-deploy-bundle-\$\{\{\s*inputs\.version\s*\}\}", "artifact name with version input"),
    (r"actions/upload-artifact@", "upload-artifact"),
    (r"if:\s*github\.event_name\s*==\s*'workflow_dispatch'", "package gated on dispatch"),
    (r"if:\s*github\.event_name\s*==\s*'push'", "index gated on push"),
]
for pat, label in checks:
    if not re.search(pat, text):
        print(f"missing contract: {label}", file=sys.stderr)
        sys.exit(1)

forbidden = [
    (r"(?i)\.env\.prd\b", ".env.prd"),
    (r"(?i)docker\s+login", "docker login"),
    (r"(?i)promote-production", "promote-production"),
    (r"(?i)\bssh\b", "ssh"),
    (r"(?i)PRODUCTION_SSH", "PRODUCTION_SSH"),
]
for pat, label in forbidden:
    if re.search(pat, text):
        print(f"forbidden reference: {label}", file=sys.stderr)
        sys.exit(1)

if re.search(r"v1\.0\.0-rc2\.2", text) and "Refusing RC2.2" not in text:
    print("must not hardcode RC2.2 identities", file=sys.stderr)
    sys.exit(1)
if re.search(r"(?m)^\s*ref:\s*main\s*$", text):
    print("must not checkout mutable main as packaging identity", file=sys.stderr)
    sys.exit(1)

print("workflow contract OK")
PY
pass "YAML/structure + contract"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
chmod +x "$ROOT/deploy/release/package_deploy_bundle.sh" "$ROOT/deploy/release/validate_deploy_bundle.sh"

if bash "$ROOT/deploy/release/package_deploy_bundle.sh" \
  --source-dir "$ROOT/deploy" \
  --out-dir "$tmpdir/bad" \
  --deploy-sha "" \
  --image-sha "831f554bb5c8fae708afb2f3a58177bf3c0bdfa7" \
  --version "v1.0.0-rc2.3" 2>/dev/null; then
  fail "packager must reject empty deploy_sha"
fi
pass "packager rejects empty deploy_sha"

echo "ALL PASS: package deploy workflow contract"
