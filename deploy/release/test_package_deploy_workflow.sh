#!/usr/bin/env bash
# Contract guards for .github/workflows/package-deploy-bundle.yml
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WF="${ROOT}/.github/workflows/package-deploy-bundle.yml"

# Windows Git Bash + native Python: convert /c/foo -> C:/foo for open().
python_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
    return
  fi
  if [[ "$p" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    echo "${BASH_REMATCH[1]^}:/${BASH_REMATCH[2]}"
    return
  fi
  echo "$p"
}

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

[[ -f "$WF" ]] || fail "missing $WF"
command -v python >/dev/null 2>&1 || fail "python required for workflow contract test"
WF_PY="$(python_path "$WF")"

# Fail closed: PyYAML must be importable and the workflow must parse as a mapping.
# Regex checks below are defense-in-depth only — never a substitute for real parsing.
python - "$WF_PY" <<'PY'
from pathlib import Path
import re
import sys

wf = Path(sys.argv[1])
text = wf.read_text(encoding="utf-8")

try:
    import yaml  # type: ignore
except ImportError as exc:
    print(
        "FAIL: PyYAML is required for package-deploy-bundle workflow contract "
        f"(pip install 'PyYAML==6.0.3'): {exc}",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    data = yaml.safe_load(text)
except yaml.YAMLError as exc:
    print(f"FAIL: workflow YAML parse error: {exc}", file=sys.stderr)
    sys.exit(1)

if not isinstance(data, dict):
    print(
        "FAIL: workflow YAML must parse to a mapping/dict, "
        f"got {type(data).__name__}",
        file=sys.stderr,
    )
    sys.exit(1)

required_inputs = {
    "deploy_sha",
    "image_sha",
    "version",
    "ci_run_id",
    "expected_ci_head_sha",
}

if data.get("name") != "Package deploy bundle":
    print("unexpected workflow name", data.get("name"), file=sys.stderr)
    sys.exit(1)

# PyYAML may coerce key 'on' -> True
on = data.get("on")
if on is None and True in data:
    on = data.get(True)
if not isinstance(on, dict):
    print("FAIL: workflow 'on' must be a mapping/dict", file=sys.stderr)
    sys.exit(1)
if "workflow_dispatch" not in on:
    print("missing workflow_dispatch", file=sys.stderr)
    sys.exit(1)
inputs = (on.get("workflow_dispatch") or {}).get("inputs") or {}
if not isinstance(inputs, dict):
    print("FAIL: workflow_dispatch.inputs must be a mapping/dict", file=sys.stderr)
    sys.exit(1)
missing = required_inputs - set(inputs)
if missing:
    print("missing inputs:", sorted(missing), file=sys.stderr)
    sys.exit(1)
for key in required_inputs:
    if not inputs[key].get("required", False):
        print(f"input {key} must be required", file=sys.stderr)
        sys.exit(1)
push = on.get("push") or {}
if not isinstance(push, dict):
    print("FAIL: push trigger must be a mapping/dict", file=sys.stderr)
    sys.exit(1)
paths = push.get("paths") or []
if ".github/workflows/package-deploy-bundle.yml" not in paths:
    print("push paths must include this workflow file for Actions indexing", file=sys.stderr)
    sys.exit(1)

jobs = data.get("jobs")
if not isinstance(jobs, dict):
    print("FAIL: jobs must be a mapping/dict", file=sys.stderr)
    sys.exit(1)
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
perms = data.get("permissions")
if not isinstance(perms, dict):
    print("FAIL: permissions must be a mapping/dict", file=sys.stderr)
    sys.exit(1)
if perms.get("contents") != "read" or perms.get("actions") != "read":
    print("permissions must be contents:read actions:read", file=sys.stderr)
    sys.exit(1)

# Defense-in-depth regex checks (complement parsing; do not replace it).
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
pass "YAML/structure + contract (fail-closed parse)"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Negative: invalid YAML must be rejected by the same fail-closed parser.
bad_wf="$tmpdir/invalid-workflow.yml"
printf '%s\n' 'name: Package deploy bundle' 'jobs: [' >"$bad_wf"
bad_wf_py="$(python_path "$bad_wf")"
if python - "$bad_wf_py" <<'PY'
import sys
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError as exc:
    print(f"FAIL: PyYAML required for negative YAML test: {exc}", file=sys.stderr)
    sys.exit(2)

text = Path(sys.argv[1]).read_text(encoding="utf-8")
try:
    yaml.safe_load(text)
except yaml.YAMLError as exc:
    print(f"invalid YAML rejected: {exc}")
    sys.exit(0)

print("FAIL: invalid YAML was accepted by yaml.safe_load", file=sys.stderr)
sys.exit(1)
PY
then
  pass "invalid YAML rejected (negative)"
else
  fail "negative invalid-YAML check did not fail closed"
fi

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
