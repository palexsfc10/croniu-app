# Relatório — Portal do cliente estável (rebase na main atual)

**Branch:** `fix/client-portal-stable-access-current-main`  
**PRD_UNCHANGED:** yes  
**Merge main nesta rodada:** não  
**Promote:** não

## Fase 1 — Ancestralidade (auditoria)

| Item | Valor |
|---|---|
| `origin/main` usado como base | `487b35e7a598988e437ef62a230cff95ca6d5bac` (hotfix Promote chmod, PR #14) |
| Merge-base antigo `4f7dd253` ∩ `origin/main` | `bfa3a8959b56079c703ffacfd4b723d5a7a9e6a6` (ponta antiga de billing) |
| `origin/main` era ancestral de `4f7dd253`? | **não** |
| Pai de `4f7dd253` | `bfa3a89` (`feature/billing-asaas-hosted`) |
| Causa do Alembic 0012 | A implementação foi criada a partir da branch antiga de billing, cujo head de migration era `0012_billing_asaas`. Não havia 0013–0022 nessa linha. |
| SHA `4f7dd253` | Commit de implementação (“Fix client portal access so an active link stays stable and copyable.”) |
| SHA `60f3655` | Commit **somente docs** após `4f7dd253` (“Record the client portal stable-access delivery SHA in the sprint report.”). Não é a implementação. |

A branch antiga **não** foi mergeada em `main`. O delta foi reaplicado seletivamente.

## Fase 2–3 — Branch limpa

| Item | Valor |
|---|---|
| Branch nova | `fix/client-portal-stable-access-current-main` |
| Ancestral | `origin/main` (`487b35e`) é ancestral do candidato |
| Alembic heads | `0022_form_template_pin` (único) |
| `alembic current` (local `croniu`) | `0022_form_template_pin` |
| `alembic check` | `No new upgrade operations detected` |
| Migrations 0013–0022 | presentes (`0013` … `0022`) |
| Promote chmod hotfix | **intacto** (`git diff origin/main -- .github/workflows/promote-production.yml` vazio) |

Diff contra `origin/main`: correção do portal (HMAC, GET estável, card, clipboard, WhatsApp), testes, preflight da chave, documentação associada. Sem migrations antigas, sem compose antigo, sem billing antigo, sem stash WIP.

`CLIENT_PORTAL_SIGNING_KEY`: definição documental vazia em `.env.example`. Valor nunca commitado. Relatórios só SET/MISSING.

## Fase 4 — Testes na base correta

| Suite | Resultado |
|---|---|
| Backend pytest | **381 passed** (948s) |
| Web vitest | **195 passed** (47 files) |
| Admin vitest | **13 passed** (4 files) |
| Web typecheck | ok |
| Admin typecheck | ok |
| Web build | ok |
| Admin build | ok |
| Alembic heads/current/check | `0022` / `0022` / no new ops |
| `deploy/release/rehearse_offline.sh` | ok (restore refuse, preflight missing-keys, compose.prd) |
| Secret scan (git grep padrão CI) | nenhum match de chaves live |
| HMAC / legado / rotate / revoke / tenant / logs | `tests/test_portal_token.py` + `tests/test_client_public_access.py` **passed** |
| E2E `client-portal-access.spec.ts` | **1 passed** (34.6s) — API `127.0.0.1:8010` + Web Playwright + Postgres local |
| E2E `sprint2d.spec.ts` | **3 passed** |

E2E real (não só spec): criar acesso; GET/reload/logout-login mesma URL; copiar; WhatsApp contém URL; abrir portal; rotacionar invalida anterior; revogar invalida; recriar acesso.

## Fase 5 — HML Jarvis

Preenchido após implantação. Sem esta seção completa, **não** declarar HML READY.

## Rollback HML

Backup gzip + SHA256 antes do deploy. Rollback: imagens anteriores + restore do dump se necessário. Volume do banco preservado. PRD não tocada.
