# GO/NO-GO — Croniu PRD promotion readiness (RC1)

**Date (UTC):** 2026-08-10  
**Worktree:** `C:\projetos\croniu-release-prd-v1`  
**Branch:** `release/croniu-prd-v1`  
**Base HML SHA (running):** `e6649bacd3591a432a84e752c3bfe0ad50c3e981`  
**Repo target:** `https://github.com/palexsfc10/croniu-app`

## 1. Veredito

# NO-GO

Gates obrigatórios ainda abertos (bloqueadores):

1. **GitHub** — repositório estava vazio; push da branch de release / PR para `main` ainda precisa ser concluído e CI verde na plataforma.
2. **Imagens imutáveis no registry** — build/push GHCR (`build-release.yml`) ainda não executou; HML ainda roda tags `:local` sem labels OCI de revision.
3. **Rehearsal automatizado HML** — pipeline digest-based ainda não implantou a RC em HML (não rebuild no jarvis feito nesta etapa; rehearsal incompleto).
4. **Smoke autenticado completo** — não executado nesta etapa (login/ciclo/IA/billing/webhook/admin end-to-end).
5. **Rollback ensaiado** — script existe; ensaio com troca de digests não executado.
6. **Environments GitHub (`hml` / `production`) + secrets de deploy** — não configurados (SSH, paths, registry auth no runner se necessário).
7. **DNS / Asaas Production / Cloudflare PRD** — corretamente **não** alterados; permanecem pendências manuais únicas para cutover futuro.

Itens já provados (não bastam para GO):

- Identidade do código em HML = `e6649ba` (hashes de arquivos-chave batem com worktree e com o filesystem/imagem da API).
- Health público HML OK (API/web/admin).
- Alembic head único em HML: `0017_user_feedbacks`.
- Scaffold de CI/CD, version endpoints, deploy por digest, compose PRD isolado, docs ops e evidências HML criados nesta branch.

## 2–9. Inventário Git / GitHub / HML

| Item | Valor |
|------|--------|
| Árvore original | `C:\projetos\croniu` em `feature/billing-asaas-hosted` (**intacta**, dirty não-billing preservado) |
| Remote local original | **nenhum** (`git remote` vazio) — código só local + jarvis |
| GitHub `palexsfc10/croniu-app` | **vazio** (`isEmpty: true`, size 0) desde 2026-07-25 |
| Causa do vazio | projeto nunca enviado; não há outro remote ativo |
| Worktree release | `C:\projetos\croniu-release-prd-v1` |
| Branch release | `release/croniu-prd-v1` |
| SHA HML (SOURCE_SHA / DEPLOY_MARKER) | `e6649ba…` · feature=`cycle-agenda-integrity` · `20260808T003034Z` |
| Path HML real | `/home/palex/ntws/croniu-hml` (**não** `/srv/docker/croniu`) |
| Git no servidor HML | **ausente** (deploy por rsync/tarball) |
| Match código | `cycle_intelligence.py` / `cycle_schedule.py` SHA256 idênticos worktree ↔ HML FS ↔ container API |
| Billing em HML | presente (`backend/app/billing/*`, UI `/app/billing`) |
| Admin image age | mais antiga que web/api (created 2026-08-07 12:42 vs api/web ~21:32) — mesmo stack HML, sem OCI revision |

### Imagens em execução (HML)

| Serviço | Image | ID/Digest local |
|---------|-------|-----------------|
| api | `croniu-hml-api:local` | `sha256:e0800ce3…489459` |
| web | `croniu-hml-web:local` | `sha256:e7845058…7c4663c` |
| admin | `croniu-hml-admin:local` | `sha256:1dcd2320…99b0d9` |
| db | `postgres:16-alpine` | `sha256:57c72fd2…07777` (sem publish host) |

Labels OCI `revision/version/source`: **ausentes** nas imagens atuais.

Evidência: `docs/releases/croniu-prd-v1-rc1/evidence/HML_MANIFEST_20260810T222600Z.{md,json}`

## 10. Arquivos criados/alterados (release worktree)

Principais:

- `.github/workflows/{ci,build-release,promote-production}.yml`
- `deploy/release/*` (deploy, rollback, backup, preflight, smoke, lib)
- `deploy/prd/compose.prd.yaml`, `.env.prd.example`, README
- `docs/ops/*`, `docs/releases/croniu-prd-v1-rc1/evidence/*`
- `backend/app/api/health.py` (`/health/live`, `/health/ready`, `/version`)
- `backend/app/config.py` (`APP_VERSION`, `GIT_SHA`, `BUILD_TIME`)
- Dockerfiles API/web/admin com labels OCI + build-args
- `.gitignore` reforçado para secrets/backups
- `deploy/hml/compose.hml.yaml` — healthcheck → `/health/ready`; migrate one-off no pipeline (CMD alembic removido do compose da branch)

## 11. Migrations

| | |
|--|--|
| Current HML | `0017_user_feedbacks` (alembic current = heads) |
| Heads | **único** `0017_user_feedbacks` |
| Compatibilidade | Sem migration nova nesta RC de scaffolding; Alembic no container HML ainda sobe com `alembic && uvicorn` (compose live). Pipeline novo prevê migrate one-off + rollback **só de imagens** (expand/contract). |

## 12–23. Suites / rehearsal / smokes

| Gate | Resultado |
|------|-----------|
| Pytest local Docker | **não executado** (Docker Desktop indisponível nesta máquina) |
| CI GitHub | **pendente** (repo ainda sem código no remote no momento do relatório) |
| Lint/typecheck/build web/admin | **pendente CI** (`node_modules` ausente no worktree) |
| Secret scan local (git grep padrões live) | sem credenciais live; hits apenas scripts que checam `OPENAI_API_KEY=` vazio |
| Backup automático digesto pipeline | script pronto; **não** executado no ensaio |
| Rehearsal HML digest-based | **não** executado |
| Smoke público HML (estado atual) | API/web/admin **200** / health `ok` |
| Smoke autenticado | **não** executado |
| Agenda/ciclos regressão | código `e6649ba` contém invariante + testes; **não** re-rodados aqui |
| IA / billing / admin / auth e2e | **não** re-validado nesta etapa |
| Rollback ensaiado | **não** executado |

## 24. Secrets necessários (somente nomes)

GitHub Environments:

- `hml`, `production` (approval obrigatório em production)

Secrets/vars típicos (valores **somente no servidor/GitHub Secrets**):

- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`, `DEPLOY_PATH`
- No servidor HML/PRD: `SECRET_KEY`, `POSTGRES_*`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_API_URL`, `ASAAS_ENVIRONMENT`, `OPENAI_API_KEY`, `DATABASE_URL` (ou composição), `SESSION_*`, `CORS_ORIGINS`, `PUBLIC_APP_BASE_URL`, `NEXT_PUBLIC_*` URLs, Cloudflare tunnel token (fora do git)

## 25. DNS necessário (não alterar agora)

Candidatos a validar (sem mudança nesta etapa):

- `croniu.com.br` — site institucional (**preservar**)
- `app.croniu.com.br` — app
- `api.croniu.com.br` — API
- `admin.croniu.com.br` — admin

HML atual permanece em `*.ntws.cloud`.

## 26. Pendências manuais únicas

1. Push `release/croniu-prd-v1` → GitHub + criar `main` vazio/PR.
2. Configurar Environments + secrets de deploy.
3. Rodar `build-release` para SHA da RC → GHCR digests.
4. Rehearsal HML com `deploy/release/deploy.sh --environment hml`.
5. Smoke autenticado + ensaio de rollback.
6. Só então: workflow `Promote to Production` com approval.

## 27. Riscos residuais

- Admin image em HML dessincronizada temporalmente de web/api.
- Deploy histórico por rsync sem git no servidor dificulta auditoria; pipeline novo corrige isso.
- `prepare-production` worktree paralelo existe com dirty — **não** usado como fonte HML.
- Token local `gh` sem scope `write:packages`; Actions `GITHUB_TOKEN` com `packages:write` no workflow deve bastar **após** o código estar no GitHub.
- Compose HML live ainda embute `alembic && uvicorn`; branch RC remove do compose em favor de one-off — exige rehearsal cuidadoso.

## 28. Promoção futura (quando GO)

1. CI verde na SHA candidata.
2. `workflow_dispatch` → **Build release images** (`sha`, `version=v1.0.0-rcN`).
3. Baixar artifact `release-manifest-*.json`.
4. Rehearsal: `deploy/release/deploy.sh --environment hml --sha <SHA> --manifest <manifest>`.
5. Após GO: **Promote to Production** (environment `production` approval) com o **mesmo** manifest/digests.

## 29. Confirmações explícitas

- **PRD não foi tocado**
- **DNS não foi alterado**
- **Asaas Production não foi ativado**
- **Nenhum segredo foi commitado ou exibido** (apenas nomes)
- **Árvore original `C:\projetos\croniu` não foi usada como destino de merge/force**
- **Nenhum `docker system prune` / Samba / UniFi / outros projetos**
