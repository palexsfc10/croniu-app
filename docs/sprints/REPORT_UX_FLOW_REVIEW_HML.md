# Relatório — auditoria de UX e correções (validação HML)

Data: 2026-08-18
Branch: `feature/ux-flow-review-and-polish`
SHA: `36d3cc8d2e0f3607aedd8ad186f9084c1299174a`
Auditoria: `docs/sprints/AUDIT_UX_FLOW_REVIEW.md`
PR: #19 (draft)

## Deploy em HML (Jarvis)

- `image_sha` = `deploy_sha` = `36d3cc8d2e0f3607aedd8ad186f9084c1299174a`
- `version` = `v1.0.0-ux-flow-review.1`
- `build_run_id` = 32098568086, `ci_run_id` = 32098192441
- `deploy/release/deploy.sh --environment hml` — `Release completed`.

## Alembic

Antes: `0022_form_template_pin (head)`. Depois: igual — sem migration nesta
tarefa (confirmado; a migração one-off rodou sem alterações de schema).

## Health / versão

```
GET /version -> {"environment":"hml","version":"v1.0.0-ux-flow-review.1",
                  "git_sha":"36d3cc8d2e0f3607aedd8ad186f9084c1299174a","status":"ok"}
GET /health/ready -> {"status":"ok","database":true}
```

`croniu-hml-api/web/admin` healthy nas novas imagens; `croniu-hml-db` e
`croniu-hml-cloudflared` inalterados.

## Smoke — verificação ao vivo de cada correção

Organização sintética "UX Audit Synth Org" (2 alunos, ciclo com aula
concluída, avaliação publicada, plano publicado, recebível pendente,
rotina com fan-out).

| Correção | Antes (observado) | Depois (confirmado ao vivo) |
|---|---|---|
| Data crua no Hoje/Agenda/Recebível/Ciclo | `2026-08-08`, `2026-08-18` | `08/08/2026`, `18 ago.` |
| Status cru do recebível no Ciclo | `pending` | `Pendente` |
| Pendências de Rotinas na própria tela | ocorrências listadas acima de "Criar rotina personalizada" | link "Ver pendências · 3" → `/app/routines/pending` |
| Próximo passo travado em "Analisar formulário" | `Próximo: Analisar formulário` (mesmo com ciclo/avaliação/plano prontos) | `Próximo: Configurar rotina` |
| Card "Ciclo atual" sem progresso | só botão "Ver ciclo" | barra de progresso, `aria-valuenow="11"` (1 de 9 aulas) |
| Card "Avaliações" pouco informativo | contagem crua (`1`) | `Publicado · 1` |
| Card "Rotinas" com rótulo estático | `"Quadro"` sem dado real | `2 pendentes` / `2 ocorrências aguardando ação` |

Dados sintéticos removidos ao final (organização, 2 clientes, ciclo,
avaliação, plano, rotina, thread de IA — cascade via `DELETE FROM
organizations`, mais o usuário órfão removido à parte, já que `users` não é
filho de `organizations` no schema).

| Métrica | Antes do smoke | Depois da limpeza |
|---|---|---|
| organizations | 245 | 245 |
| users | 249 | 249 |

## Testes

- Backend completo: **406 passed** (404 herdados + 2 novos: formato de
  data pt-BR nas prioridades do Hoje, anamnese não trava mais para cliente
  cadastrado manualmente).
- Frontend: build, typecheck, lint (0 erros), Vitest 195 testes.
- CI da PR: 8/8 checks verdes.
- Playwright E2E não reexecutado neste ambiente; specs existentes revisadas
  por leitura e confirmadas compatíveis com as mudanças de UI.

## Rollback

`deploy/release/rollback.sh` com `RELEASE_MANIFEST.previous.json` (aponta
para `v1.0.0-routines-occurrence-fix.1`, sha `0580d3d`). Backup pré-deploy
verificado pelo próprio `deploy.sh` (mandatório em release não-cold-start).

## PRD

Não alterada. Não promovida.
