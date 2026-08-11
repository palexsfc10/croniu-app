#!/usr/bin/env bash
# Package deploy/ into an immutable release deploy bundle (no secrets, no dumps).
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --source-dir DIR --out-dir DIR --deploy-sha SHA --image-sha SHA --version VER [--repository owner/repo] [--ci-run-id ID] [--package-run-id ID]" >&2
  exit 2
}

SOURCE="" OUT="" DEPLOY_SHA="" IMAGE_SHA="" VERSION="" REPO="" CI_RUN="" PKG_RUN=""
while (($#)); do
  case "$1" in
    --source-dir) SOURCE="${2:-}"; shift 2 ;;
    --out-dir) OUT="${2:-}"; shift 2 ;;
    --deploy-sha) DEPLOY_SHA="${2:-}"; shift 2 ;;
    --image-sha) IMAGE_SHA="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --repository) REPO="${2:-}"; shift 2 ;;
    --ci-run-id) CI_RUN="${2:-}"; shift 2 ;;
    --package-run-id) PKG_RUN="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$SOURCE" && -d "$SOURCE" && -n "$OUT" && -n "$DEPLOY_SHA" && -n "$IMAGE_SHA" && -n "$VERSION" ]] || usage

require_command() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1" >&2; exit 1; }; }
require_command jq
require_command sha256sum
require_command find

rm -rf "$OUT"
mkdir -p "$OUT/deploy"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '*.env' \
    --exclude 'backups/' \
    --exclude 'RELEASE_*' \
    --exclude '*.sql' \
    --exclude '*.sql.gz' \
    --exclude '*.log' \
    --exclude 'logs/' \
    --exclude '__pycache__/' \
    --exclude '.DS_Store' \
    "$SOURCE"/ "$OUT/deploy/"
else
  tar -C "$SOURCE" \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='*.env' \
    --exclude='backups' \
    --exclude='RELEASE_*' \
    --exclude='*.sql' \
    --exclude='*.sql.gz' \
    --exclude='*.log' \
    --exclude='logs' \
    --exclude='__pycache__' \
    --exclude='.DS_Store' \
    -cf - . | tar -C "$OUT/deploy" -xf -
fi

while IFS= read -r -d '' link; do
  echo "Refusing symlink in deploy bundle: $link" >&2
  exit 1
done < <(find "$OUT/deploy" -type l -print0)

(
  cd "$OUT/deploy"
  LC_ALL=C find . -type f -print0 | LC_ALL=C sort -z | while IFS= read -r -d '' f; do
    rel="${f#./}"
    sum="$(sha256sum "$f" | awk '{print $1}')"
    printf '%s\t%s\n' "$rel" "$sum"
  done
) >"$OUT/files.sha256"

files_json="$(mktemp)"
jq -Rn '
  reduce inputs as $line ({};
    ($line | split("\t")) as $p
    | . + {($p[0]): $p[1]}
  )
' <"$OUT/files.sha256" >"$files_json"

aggregate="$(sha256sum "$OUT/files.sha256" | awk '{print $1}')"
built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg deploy_sha "$DEPLOY_SHA" \
  --arg image_sha "$IMAGE_SHA" \
  --arg version "$VERSION" \
  --arg repository "${REPO:-}" \
  --arg ci_run_id "${CI_RUN:-}" \
  --arg package_run_id "${PKG_RUN:-}" \
  --arg built_at "$built_at" \
  --arg aggregate_sha256 "$aggregate" \
  --slurpfile files "$files_json" \
  '{
    schema: "croniu-deploy-bundle/v1",
    deploy_sha: $deploy_sha,
    image_sha: $image_sha,
    version: $version,
    repository: (if $repository == "" then null else $repository end),
    ci_run_id: (if $ci_run_id == "" then null else $ci_run_id end),
    package_run_id: (if $package_run_id == "" then null else $package_run_id end),
    built_at: $built_at,
    aggregate_sha256: $aggregate_sha256,
    files: $files[0]
  }' >"$OUT/deploy-bundle-manifest.json"

rm -f "$files_json"
echo "deploy_bundle_aggregate_sha256=$aggregate"
echo "deploy_bundle_manifest=$OUT/deploy-bundle-manifest.json"
