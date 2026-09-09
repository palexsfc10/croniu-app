#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${ROOT_DIR}/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.hml"
COMPOSE_FILE="${ROOT_DIR}/compose.hml.yaml"
PROJECT_NAME="croniu-hml"

log() { printf '[croniu-hml] %s\n' "$*"; }
die() { printf '[croniu-hml] ERROR: %s\n' "$*" >&2; exit 1; }

require_file() {
  [[ -f "$1" ]] || die "Arquivo obrigatório ausente: $1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando não encontrado: $1"
}

load_env() {
  require_file "$ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${POSTGRES_USER:?}"
  : "${POSTGRES_PASSWORD:?}"
  : "${POSTGRES_DB:?}"
  : "${SECRET_KEY:?}"
  : "${API_HOST_PORT:?}"
  : "${WEB_HOST_PORT:?}"
  : "${ADMIN_HOST_PORT:?}"
  : "${NEXT_PUBLIC_API_URL:?}"
  : "${NEXT_PUBLIC_APP_URL:?}"
  : "${NEXT_PUBLIC_ADMIN_URL:?}"
  [[ "${#SECRET_KEY}" -ge 32 ]] || die "SECRET_KEY deve ter pelo menos 32 caracteres"
  portal_key="${CLIENT_PORTAL_SIGNING_KEY:-}"
  if [[ -z "$portal_key" || "${#portal_key}" -lt 32 ]]; then
    log "CLIENT_PORTAL_SIGNING_KEY=MISSING"
    die "CLIENT_PORTAL_SIGNING_KEY must be set (min 32 characters) in HML"
  fi
  log "CLIENT_PORTAL_SIGNING_KEY=SET"
  unset portal_key
  # Cartão off por padrão em HML até evidência Asaas sandbox Croniu
  if [[ "${BILLING_CARD_ENABLED:-false}" == "true" ]]; then
    log "WARN BILLING_CARD_ENABLED=true — confirme HML Asaas sandbox Croniu antes de liberar cartão"
  else
    log "OK BILLING_CARD_ENABLED=${BILLING_CARD_ENABLED:-false} (guard HML)"
  fi
  : "${PUBLIC_APP_BASE_URL:=${NEXT_PUBLIC_APP_URL}}"
  validate_google_oauth_contract
}

# Falha antes do build se o contrato do Google OAuth estiver inválido. Nunca
# imprime os valores dos Client IDs — só presença/ausência e comprimento.
validate_google_oauth_contract() {
  local enabled="${GOOGLE_OAUTH_ENABLED:-false}"
  log "GOOGLE_OAUTH_ENABLED=${enabled}"
  if [[ "$enabled" != "true" ]]; then
    return
  fi
  local server_id="${GOOGLE_OAUTH_CLIENT_ID:-}"
  local web_id="${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}"
  if [[ -n "$server_id" ]]; then
    log "GOOGLE_OAUTH_CLIENT_ID=SET len=${#server_id}"
  else
    log "GOOGLE_OAUTH_CLIENT_ID=MISSING"
  fi
  if [[ -n "$web_id" ]]; then
    log "NEXT_PUBLIC_GOOGLE_CLIENT_ID=SET len=${#web_id}"
  else
    log "NEXT_PUBLIC_GOOGLE_CLIENT_ID=MISSING"
  fi
  [[ -n "$server_id" ]] || die "GOOGLE_OAUTH_ENABLED=true mas GOOGLE_OAUTH_CLIENT_ID está vazio/ausente em .env.hml"
  [[ -n "$web_id" ]] || die "GOOGLE_OAUTH_ENABLED=true mas NEXT_PUBLIC_GOOGLE_CLIENT_ID está vazio/ausente em .env.hml"
  [[ "$server_id" == "$web_id" ]] || die "GOOGLE_OAUTH_CLIENT_ID e NEXT_PUBLIC_GOOGLE_CLIENT_ID precisam ser idênticos (contrato de build inválido) — o botão Google usa o mesmo Client ID no frontend e no backend"
  log "GOOGLE_OAUTH contrato OK (client ids idênticos)"
}

# O checkout implantado em HML normalmente não tem .git (os scripts de ops
# extraem a árvore de um tarball/rsync sem .git) — por isso o SHA real
# precisa ser informado explicitamente pelo operador via GIT_SHA=<sha>,
# exceto quando este script roda de dentro de um checkout git de verdade.
resolve_git_sha() {
  if [[ -n "${GIT_SHA:-}" ]]; then
    printf '%s' "$GIT_SHA"
    return
  fi
  if [[ -d "${REPO_ROOT}/.git" ]]; then
    git -C "$REPO_ROOT" rev-parse HEAD
    return
  fi
  die "GIT_SHA não pôde ser determinado: ${REPO_ROOT} não é um checkout git e a variável de ambiente GIT_SHA não foi definida. Rode como: GIT_SHA=<sha-do-commit-implantado> $0 $cmd"
}

# Nunca cai silenciosamente em 0.0.0-dev: usa CRONIU_VERSION (.env.hml) por
# padrão, ou APP_VERSION se o operador exportar explicitamente um override.
resolve_app_version() {
  local v="${APP_VERSION:-${CRONIU_VERSION:-}}"
  if [[ -z "$v" ]]; then
    die "APP_VERSION não pôde ser determinado: defina CRONIU_VERSION em .env.hml ou exporte APP_VERSION explicitamente."
  fi
  printf '%s' "$v"
}

compose() {
  docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

build_api_image() {
  local git_sha="$1" app_version="$2" build_time="$3"
  log "Construindo imagem da API"
  docker build \
    --build-arg "GIT_SHA=${git_sha}" \
    --build-arg "APP_VERSION=${app_version}" \
    --build-arg "BUILD_TIME=${build_time}" \
    -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" \
    -f "${REPO_ROOT}/backend/Dockerfile" \
    "${REPO_ROOT}/backend"
}

# Nunca imprime NEXT_PUBLIC_GOOGLE_CLIENT_ID — só o repassa como build-arg.
# validate_google_oauth_contract (chamada em load_env, antes de qualquer
# build) já garantiu que a variável está presente e íntegra quando o Google
# OAuth está habilitado; aqui só preservamos o mesmo build-arg que build_images
# sempre usou, também no caminho web-only.
build_web_image() {
  local git_sha="$1" app_version="$2" build_time="$3"
  log "Construindo imagem do web"
  # Browser uses same-origin /api; rewrite target must be the docker service name.
  docker build \
    --build-arg "GIT_SHA=${git_sha}" \
    --build-arg "APP_VERSION=${app_version}" \
    --build-arg "BUILD_TIME=${build_time}" \
    --build-arg "NEXT_PUBLIC_APP_VERSION=${app_version}" \
    --build-arg "NEXT_PUBLIC_GIT_SHA=${git_sha}" \
    --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
    --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
    --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
    --build-arg "NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}" \
    -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
    -f "${REPO_ROOT}/apps/web/Dockerfile" \
    "${REPO_ROOT}/apps/web"
}

build_admin_image() {
  local git_sha="$1" app_version="$2" build_time="$3"
  log "Construindo imagem do admin"
  docker build \
    --build-arg "GIT_SHA=${git_sha}" \
    --build-arg "APP_VERSION=${app_version}" \
    --build-arg "BUILD_TIME=${build_time}" \
    --build-arg "NEXT_PUBLIC_APP_VERSION=${app_version}" \
    --build-arg "NEXT_PUBLIC_GIT_SHA=${git_sha}" \
    --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
    --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_ADMIN_URL}" \
    -t "${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}" \
    -f "${REPO_ROOT}/apps/admin/Dockerfile" \
    "${REPO_ROOT}/apps/admin"
}

build_images() {
  local git_sha app_version build_time
  git_sha="$(resolve_git_sha)"
  app_version="$(resolve_app_version)"
  build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "GIT_SHA=${git_sha}"
  log "APP_VERSION=${app_version}"
  log "BUILD_TIME=${build_time}"

  build_api_image "$git_sha" "$app_version" "$build_time"
  build_web_image "$git_sha" "$app_version" "$build_time"
  build_admin_image "$git_sha" "$app_version" "$build_time"
}

# Verifica que a imagem recém-construída foi de fato marcada com o GIT_SHA
# pedido pelo operador (label OCI gravada pelo Dockerfile a partir do
# build-arg GIT_SHA) — nunca troca o container em produção/HML por uma
# imagem cujo conteúdo não se pode provar que é o commit esperado.
assert_image_matches_git_sha() {
  local image="$1" expected_sha="$2" label revision
  label="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image" 2>/dev/null || true)"
  revision="${label:-}"
  [[ -n "$revision" ]] || die "Imagem ${image} não tem o label org.opencontainers.image.revision — build possivelmente falhou silenciosamente"
  [[ "$revision" == "$expected_sha" ]] || die "Imagem ${image} foi construída com GIT_SHA=${revision}, mas o commit esperado é ${expected_sha} — aborta antes de recriar o container"
  log "Imagem ${image} confirmada no commit ${revision}"
}

# Deploy de mudanças somente-frontend (apps/web): builda só a imagem web e
# recria só o container web com --no-deps, provando antes/depois que
# croniu-hml-api e croniu-hml-admin não foram tocados (Id do container e
# StartedAt idênticos). Existe porque `up`/`build` reconstroem as 3 imagens
# toda vez (BUILD_TIME/GIT_SHA novos mudam o digest mesmo sem mudança de
# código), e croniu-hml-web depende de croniu-hml-api via depends_on
# service_healthy — sem --no-deps, `compose up -d croniu-hml-web` recria a
# API também só porque o digest da imagem dela mudou.
deploy_web_only() {
  local git_sha app_version build_time
  git_sha="$(resolve_git_sha)"
  app_version="$(resolve_app_version)"
  build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "GIT_SHA=${git_sha}"
  log "APP_VERSION=${app_version}"
  log "BUILD_TIME=${build_time}"

  local api_id_before admin_id_before api_started_before admin_started_before
  api_id_before="$(docker inspect -f '{{.Id}}' croniu-hml-api)"
  admin_id_before="$(docker inspect -f '{{.Id}}' croniu-hml-admin)"
  api_started_before="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-api)"
  admin_started_before="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-admin)"

  build_web_image "$git_sha" "$app_version" "$build_time"
  assert_image_matches_git_sha "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" "$git_sha"

  log "Recriando somente croniu-hml-web (--no-deps — api/admin não são tocados)"
  compose up -d --no-deps croniu-hml-web
  log "Aguardando healthcheck do web"
  sleep 5
  compose ps croniu-hml-web

  local api_id_after admin_id_after api_started_after admin_started_after
  api_id_after="$(docker inspect -f '{{.Id}}' croniu-hml-api)"
  admin_id_after="$(docker inspect -f '{{.Id}}' croniu-hml-admin)"
  api_started_after="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-api)"
  admin_started_after="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-admin)"

  [[ "$api_id_before" == "$api_id_after" ]] || die "REGRESSÃO: container croniu-hml-api foi recriado (Id mudou) durante um deploy que deveria ser web-only"
  [[ "$admin_id_before" == "$admin_id_after" ]] || die "REGRESSÃO: container croniu-hml-admin foi recriado (Id mudou) durante um deploy que deveria ser web-only"
  [[ "$api_started_before" == "$api_started_after" ]] || die "REGRESSÃO: container croniu-hml-api reiniciou (StartedAt mudou) durante um deploy que deveria ser web-only"
  [[ "$admin_started_before" == "$admin_started_after" ]] || die "REGRESSÃO: container croniu-hml-admin reiniciou (StartedAt mudou) durante um deploy que deveria ser web-only"

  log "OK: croniu-hml-api e croniu-hml-admin preservados (mesmo Id de container e mesmo StartedAt de antes do deploy)"
}

# Deploy de mudanças somente-backend (backend/): builda só a imagem api e
# recria só o container api com --no-deps, provando antes/depois que
# croniu-hml-web e croniu-hml-admin não foram tocados. Espelha exatamente
# deploy_web_only — mesma prova por Id/StartedAt, mesmo aborto se a imagem
# não bater no GIT_SHA esperado. api não tem dependents no compose (nada
# depende dela via depends_on), então não há o mesmo risco de cascata que
# motivou --no-deps no lado web — mas o --no-deps e a prova ficam mesmo
# assim, para nunca depender de suposição.
deploy_api_only() {
  local git_sha app_version build_time
  git_sha="$(resolve_git_sha)"
  app_version="$(resolve_app_version)"
  build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "GIT_SHA=${git_sha}"
  log "APP_VERSION=${app_version}"
  log "BUILD_TIME=${build_time}"

  local web_id_before admin_id_before web_started_before admin_started_before
  web_id_before="$(docker inspect -f '{{.Id}}' croniu-hml-web)"
  admin_id_before="$(docker inspect -f '{{.Id}}' croniu-hml-admin)"
  web_started_before="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-web)"
  admin_started_before="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-admin)"

  build_api_image "$git_sha" "$app_version" "$build_time"
  assert_image_matches_git_sha "${CRONIU_API_IMAGE:-croniu-hml-api:local}" "$git_sha"

  log "Recriando somente croniu-hml-api (--no-deps — web/admin não são tocados)"
  compose up -d --no-deps croniu-hml-api
  log "Aguardando healthcheck da API"
  sleep 5
  compose ps croniu-hml-api

  local web_id_after admin_id_after web_started_after admin_started_after
  web_id_after="$(docker inspect -f '{{.Id}}' croniu-hml-web)"
  admin_id_after="$(docker inspect -f '{{.Id}}' croniu-hml-admin)"
  web_started_after="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-web)"
  admin_started_after="$(docker inspect -f '{{.State.StartedAt}}' croniu-hml-admin)"

  [[ "$web_id_before" == "$web_id_after" ]] || die "REGRESSÃO: container croniu-hml-web foi recriado (Id mudou) durante um deploy que deveria ser api-only"
  [[ "$admin_id_before" == "$admin_id_after" ]] || die "REGRESSÃO: container croniu-hml-admin foi recriado (Id mudou) durante um deploy que deveria ser api-only"
  [[ "$web_started_before" == "$web_started_after" ]] || die "REGRESSÃO: container croniu-hml-web reiniciou (StartedAt mudou) durante um deploy que deveria ser api-only"
  [[ "$admin_started_before" == "$admin_started_after" ]] || die "REGRESSÃO: container croniu-hml-admin reiniciou (StartedAt mudou) durante um deploy que deveria ser api-only"

  log "OK: croniu-hml-web e croniu-hml-admin preservados (mesmo Id de container e mesmo StartedAt de antes do deploy)"
}

cmd="${1:-up}"
require_cmd docker
require_file "$COMPOSE_FILE"
load_env

case "$cmd" in
  up)
    build_images
    log "Subindo stack Croniu HML"
    compose up -d
    log "Aguardando healthchecks"
    sleep 5
    compose ps
    ;;
  build)
    build_images
    ;;
  build-web)
    git_sha="$(resolve_git_sha)"
    app_version="$(resolve_app_version)"
    build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "GIT_SHA=${git_sha}"
    log "APP_VERSION=${app_version}"
    log "BUILD_TIME=${build_time}"
    build_web_image "$git_sha" "$app_version" "$build_time"
    assert_image_matches_git_sha "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" "$git_sha"
    ;;
  up-web)
    deploy_web_only
    ;;
  build-api)
    git_sha="$(resolve_git_sha)"
    app_version="$(resolve_app_version)"
    build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "GIT_SHA=${git_sha}"
    log "APP_VERSION=${app_version}"
    log "BUILD_TIME=${build_time}"
    build_api_image "$git_sha" "$app_version" "$build_time"
    assert_image_matches_git_sha "${CRONIU_API_IMAGE:-croniu-hml-api:local}" "$git_sha"
    ;;
  up-api)
    deploy_api_only
    ;;
  down)
    log "Parando containers Croniu HML (volumes preservados)"
    compose down --remove-orphans
    ;;
  ps|logs|pull)
    compose "$@"
    ;;
  version)
    log "CRONIU_VERSION=${CRONIU_VERSION:-unknown}"
    log "API_IMAGE=${CRONIU_API_IMAGE:-croniu-hml-api:local}"
    log "WEB_IMAGE=${CRONIU_WEB_IMAGE:-croniu-hml-web:local}"
    log "ADMIN_IMAGE=${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}"
    if [[ -d "${REPO_ROOT}/.git" ]]; then
      git -C "$REPO_ROOT" rev-parse --short HEAD || true
    fi
    ;;
  *)
    die "Uso: $0 {up|build|build-web|up-web|build-api|up-api|down|ps|logs|version}"
    ;;
esac
