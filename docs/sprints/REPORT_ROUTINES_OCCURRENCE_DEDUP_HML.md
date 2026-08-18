# Relatório — correção de duplicação de ocorrências de Rotinas (validação HML)

Data: 2026-08-18
Branch: `fix/routines-occurrence-model-and-ux`
SHA: `0580d3d22c710703ddc8bc2008075802edae5ad0`
Diagnóstico: `docs/sprints/DIAGNOSIS_ROUTINES_DUPLICATION.md`
PR: #18 (draft)

## Deploy em HML (Jarvis)

- `image_sha` = `deploy_sha` = `0580d3d22c710703ddc8bc2008075802edae5ad0`
- `version` = `v1.0.0-routines-occurrence-fix.1`
- `build_run_id` = 32091381712, `ci_run_id` = 32090625176
- Executado via `deploy/release/deploy.sh --environment hml` no Jarvis (SSH direto,
  sem workflow HML no GitHub — HML não tem "Promote"; imagens e bundle vieram dos
  workflows `Build release images` / `Package deploy bundle`, manifest e bundle
  copiados manualmente para `/home/palex/ntws/croniu-hml`).
- `RELEASE_MANIFEST.json` (`result: success`), `RELEASE_LOG.jsonl` atualizado.
- `operator`: `local:claude-code-routines-fix`.

## Backup pré-deploy

- Arquivo: `/home/palex/ntws/croniu-hml/backups/hml-20260818T022452Z.sql.gz`
- `gzip -t`: OK
- SHA-256: `8d6b922a43880f1a2442fe817f6e6172dbbb22e84e1a839edc6481513c49e0d4`
- `RELEASE_MANIFEST.previous.json` preservado pelo `deploy.sh` para rollback de imagem.

## Alembic

- Antes: `0022_form_template_pin (head)`
- Depois: `0022_form_template_pin (head)` — sem migration nesta tarefa (confirmado).

## Health / versão

```
GET /health/ready  -> {"status":"ok","database":true}
GET /version       -> {"environment":"hml","version":"v1.0.0-routines-occurrence-fix.1",
                        "git_sha":"0580d3d22c710703ddc8bc2008075802edae5ad0", "status":"ok"}
```

Containers `croniu-hml-api`, `croniu-hml-web`, `croniu-hml-admin` healthy nas novas
imagens; `croniu-hml-db` e `croniu-hml-cloudflared` inalterados. Sem erros/exceções
nos logs da API nos 5 minutos após o deploy.

## Smoke — organização sintética

Organização: `Smoke Routines Fix Org` (`f31e4e7f-a666-48b0-8d69-50b5e538c8b7`),
usuário `smoke-routines-fix@example.com`, 2 clientes sintéticos.

**Fluxo D (execução única):** rotina `once` "Conferir acompanhamento smoke" criada
sem `starts_on`. Board lido 4 vezes seguidas → **1 única ocorrência** o tempo todo
(`occurrence_count: 1`). Este é exatamente o padrão que antes gerava 1 ocorrência
por dia da janela de 15 dias — confirmado corrigido em ambiente real.

**Fluxo B (rotina por aluno):** rotina calendário "Revisar plano smoke"
(`audience: all_active`) → **2 ocorrências**, uma por cliente ativo, `client_count: 2`
(sem "0 clientes"). Concluída a ocorrência do Aluno Um → some do board; a do
Aluno Dois permanece aberta e intocada (isolamento por cliente confirmado).

**Limpeza:** organização, clientes, rotinas e ocorrências sintéticas removidos por
`DELETE FROM organizations WHERE id = '<uuid>'` (cascade) + remoção do usuário
órfão (usuários não são filhos de `organizations` no schema). Contagens
confirmadas de volta ao valor anterior ao smoke.

| Métrica | Antes do smoke | Depois da limpeza |
|---|---|---|
| organizations | 245 | 245 |
| users | 249 | 249 |

## Reparo de dados legados (produção real de dados de HML, não sintéticos)

Antes de qualquer correção, HML já continha **1103 ocorrências abertas** de
rotina — evidência direta do impacto do bug em dados acumulados de HML.

`python -m app.cli.repair_routine_occurrence_duplicates` (dentro do container
`croniu-hml-api`):

- Dry-run: 1036 ocorrências duplicadas identificadas em 30 organizações, 0 grupos
  pulados (todas as definições de rotina ainda existiam).
- `--apply`: 1036 canceladas (auditável, `reason` preenchido), histórico
  concluído (18) preservado intacto, 69 ocorrências abertas canônicas restantes.
- Segunda execução de `--apply`: 0 canceladas — **idempotência confirmada em
  dados reais de HML**, não só em teste automatizado.

| Status | Antes do reparo | Depois do reparo |
|---|---|---|
| open | 1103 | 69 |
| completed | 18 | 18 (inalterado) |
| cancelled | 0 | 1036 |

## Rollback disponível

- Imagem: `deploy/release/rollback.sh` com `RELEASE_MANIFEST.previous.json`
  (aponta para o release anterior, SHA `bdd4074...`, versão
  `v1.0.0-ai-occurrence-hotfix-hml.3`).
- Dados: backup verificado acima; o reparo de duplicatas não usa `DELETE`
  (apenas `status=cancelled`), portanto é reversível por UPDATE caso necessário
  — não há downgrade automático, mas nenhum dado foi destruído.

## Escopo não coberto nesta validação

- Não validei visualmente via browser (Playwright) a renderização em HML —
  a verificação foi via API (fonte de verdade única para UI e IA, já confirmado
  no código) e via suíte automatizada local (Vitest/Playwright specs revisados
  por leitura, compatíveis com as mudanças, mas não reexecutados contra HML).
- Não testei o Assistente IA via conversa real neste ambiente; a suíte
  automatizada de regressão (`test_agent_occurrence_completion.py`, 11 testes)
  permanece verde após a mudança de modelo.

## PRD

Não alterada. Não promovida. Nenhum workflow de produção foi acionado nesta
tarefa.
