# Auditoria RC1 — release/croniu-prd-rc1

**Worktree:** `C:\projetos\croniu-prd-rc1`  
**SHA HML validado:** `e6649bacd3591a432a84e752c3bfe0ad50c3e981`  
**Base inicial:** `bc93e8d70a428223c28d1817a082ece1f1978216` (`origin/release/croniu-prd-v1`)

## Ancestralidade

`merge-base(e6649ba, HEAD_inicial) = e6649ba` — **e6649ba é ancestral**.

## Delta e6649ba..bc93e8d (classificação)

| Commit | Classificação | Notas |
|--------|---------------|-------|
| `bc1f973` Prepare RC scaffolding | A+B+C + D mínima | Health/live/ready/version + help version display; sem migration; sem mudança de domínio |
| `bc93e8d` Update GO/NO-GO | C | Documentação |

Arquivos funcionais críticos (`cycle_intelligence`, `cycle_schedule`, `tools`, billing core, `main.py`): **MATCH** com e6649ba.

Migrations no delta original: **nenhuma**. Alembic head HML: `0017_user_feedbacks`.

## Commits prepare-production antigos

| Commit | Já em RC? | Necessário PRD? | Schema/regra? | Migration? | Testado? | Cherry-pick? | Decisão |
|--------|-----------|-----------------|---------------|------------|----------|--------------|---------|
| `65232f6` next_billing_at + deploy/production | Não | Não agora | Sim (billing sync) | Não (campo pode já existir; regra muda) | Parcial | Evitar | **DESCARTAR** até migration+cadeia Asaas+entitlement |
| `3dc95d8` tip SHA no relatório | Não | Não | Não | Não | N/A | Não | **DESCARTAR** |
| `144418f` aponta HEAD relatório | Não | Não | Não | Não | N/A | Não | **DESCARTAR** |

`deploy/production/*` da branch antiga é **substituído** por `deploy/prd` + `deploy/release` desta release.

## Delta funcional introduzido nesta RC (após HML)

1. **E-mail Resend + fake provider** — abstração, password-reset delivery, verificação de e-mail + welcome, migration `0018_email_verification`.
2. **Rate limit** em endpoints auth sensíveis.
3. **Infra PRD** — preflight (disk/env), backup retention, restore.sh, smoke web/admin, registry operador/resultado.
4. **Lint eslint-disable** em 3 hydrate mounts (sem mudança de comportamento) para CI.

Login **não** exige e-mail verificado (sem hard gate).

## Veredito operacional

Ainda **NO-GO para cutover PRD** (sem rehearsal digest HML, sem secrets GitHub production, sem DNS/Asaas/Resend reais).  
Candidata **pronta para PR → main** como base auditável, sem merge automático e sem deploy.
