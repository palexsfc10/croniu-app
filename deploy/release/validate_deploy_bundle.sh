#!/usr/bin/env bash
# Validate an immutable deploy bundle (checksums, identity, no extras/symlinks).
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --bundle-dir DIR [--deploy-sha SHA] [--image-sha SHA] [--version VER] [--repository owner/repo] [--aggregate SHA256] [--package-run-id ID]" >&2
  exit 2
}

BUNDLE="" EXPECT_DEPLOY="" EXPECT_IMAGE="" EXPECT_VERSION="" EXPECT_REPO="" EXPECT_AGG="" EXPECT_PKG=""
while (($#)); do
  case "$1" in
    --bundle-dir) BUNDLE="${2:-}"; shift 2 ;;
    --deploy-sha) EXPECT_DEPLOY="${2:-}"; shift 2 ;;
    --image-sha) EXPECT_IMAGE="${2:-}"; shift 2 ;;
    --version) EXPECT_VERSION="${2:-}"; shift 2 ;;
    --repository) EXPECT_REPO="${2:-}"; shift 2 ;;
    --aggregate) EXPECT_AGG="${2:-}"; shift 2 ;;
    --package-run-id) EXPECT_PKG="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$BUNDLE" && -d "$BUNDLE" ]] || usage

require_command() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1" >&2; exit 1; }; }
require_command jq
require_command sha256sum
require_command find

mf="$BUNDLE/deploy-bundle-manifest.json"
root="$BUNDLE/deploy"
[[ -f "$mf" && -d "$root" ]] || {
  echo "Missing deploy-bundle-manifest.json or deploy/" >&2
  exit 1
}

jq -e '
  .schema == "croniu-deploy-bundle/v1"
  and (.deploy_sha|type=="string" and length>=7)
  and (.image_sha|type=="string" and length>=7)
  and (.version|type=="string" and length>0)
  and (.aggregate_sha256|test("^[a-f0-9]{64}$"))
  and (.files|type=="object")
  and (.files|length>0)
' "$mf" >/dev/null

if [[ -n "$EXPECT_DEPLOY" ]]; then
  jq -e --arg s "$EXPECT_DEPLOY" '.deploy_sha == $s' "$mf" >/dev/null || {
    echo "deploy_sha mismatch" >&2
    exit 1
  }
fi
if [[ -n "$EXPECT_IMAGE" ]]; then
  jq -e --arg s "$EXPECT_IMAGE" '.image_sha == $s' "$mf" >/dev/null || {
    echo "image_sha mismatch" >&2
    exit 1
  }
fi
if [[ -n "$EXPECT_VERSION" ]]; then
  jq -e --arg v "$EXPECT_VERSION" '.version == $v' "$mf" >/dev/null || {
    echo "version mismatch" >&2
    exit 1
  }
fi
if [[ -n "$EXPECT_REPO" ]]; then
  jq -e --arg r "$EXPECT_REPO" '.repository == $r' "$mf" >/dev/null || {
    echo "repository mismatch" >&2
    exit 1
  }
fi
if [[ -n "$EXPECT_PKG" ]]; then
  jq -e --arg r "$EXPECT_PKG" '(.package_run_id|tostring) == $r' "$mf" >/dev/null || {
    echo "package_run_id mismatch" >&2
    exit 1
  }
fi

while IFS= read -r -d '' link; do
  echo "Refusing symlink in deploy bundle: $link" >&2
  exit 1
done < <(find "$root" -type l -print0)

listing="$(mktemp)"
(
  cd "$root"
  find . -type f -print0 | sort -z | while IFS= read -r -d '' f; do
    rel="${f#./}"
    sum="$(sha256sum "$f" | awk '{print $1}')"
    printf '%s\t%s\n' "$rel" "$sum"
  done
) >"$listing"

actual_agg="$(sha256sum "$listing" | awk '{print $1}')"
expected_agg="$(jq -er '.aggregate_sha256' "$mf")"
[[ "$actual_agg" == "$expected_agg" ]] || {
  echo "aggregate_sha256 mismatch: actual=$actual_agg expected=$expected_agg" >&2
  exit 1
}
if [[ -n "$EXPECT_AGG" && "$actual_agg" != "$EXPECT_AGG" ]]; then
  echo "aggregate does not match --aggregate" >&2
  exit 1
fi

on_disk_json="$(mktemp)"
jq -Rn '
  reduce inputs as $line ({};
    ($line | split("\t")) as $p
    | . + {($p[0]): $p[1]}
  )
' <"$listing" >"$on_disk_json"

jq -e --slurpfile disk "$on_disk_json" '
  (.files as $decl |
   ($disk[0] | keys) as $dkeys |
   ($decl | keys) as $ckeys |
   (($dkeys - $ckeys) | length == 0)
   and (($ckeys - $dkeys) | length == 0)
   and (reduce ($ckeys[]) as $k (true; . and ($decl[$k] == $disk[0][$k])))
  )
' "$mf" >/dev/null || {
  echo "deploy bundle file set / checksum divergence" >&2
  exit 1
}

rm -f "$listing" "$on_disk_json"
echo "deploy_bundle_ok aggregate=$expected_agg"
