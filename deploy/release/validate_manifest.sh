#!/usr/bin/env bash
# Positive/negative validation of release-manifest.json shape (no network).
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --manifest PATH [--sha SHA] [--version VERSION] [--build-run-id ID]" >&2
  exit 2
}

MANIFEST="" EXPECTED_SHA="" EXPECTED_VERSION="" EXPECTED_BUILD_RUN=""
while (($#)); do
  case "$1" in
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --version) EXPECTED_VERSION="${2:-}"; shift 2 ;;
    --build-run-id) EXPECTED_BUILD_RUN="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$MANIFEST" && -f "$MANIFEST" ]] || usage

jq -e '
  (.sha|type=="string" and length>0)
  and (.version|type=="string" and length>0)
  and (.images.api|test("^ghcr\\.io/.+@sha256:[a-f0-9]{64}$"))
  and (.images.web|test("^ghcr\\.io/.+@sha256:[a-f0-9]{64}$"))
  and (.images.admin|test("^ghcr\\.io/.+@sha256:[a-f0-9]{64}$"))
  and (.images.api|contains(":latest")|not)
  and (.images.web|contains(":latest")|not)
  and (.images.admin|contains(":latest")|not)
' "$MANIFEST" >/dev/null

if [[ -n "$EXPECTED_SHA" ]]; then
  jq -e --arg sha "$EXPECTED_SHA" '.sha == $sha' "$MANIFEST" >/dev/null
fi
if [[ -n "$EXPECTED_VERSION" ]]; then
  jq -e --arg v "$EXPECTED_VERSION" '.version == $v' "$MANIFEST" >/dev/null
fi
if [[ -n "$EXPECTED_BUILD_RUN" ]]; then
  jq -e --arg r "$EXPECTED_BUILD_RUN" '(.build_run_id|tostring) == $r' "$MANIFEST" >/dev/null
fi

echo "manifest_ok=$(sha256sum "$MANIFEST" | awk '{print $1}')"
