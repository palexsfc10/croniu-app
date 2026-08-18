# Documentação Croniu

Fonte oficial do produto, estado do código e regras para humanos e agentes.

## Finalidade

Permitir que qualquer agente ou pessoa entenda o que o Croniu é, o que já existe, o que está planejado e o que **não** pode ser alterado sem autorização.

## Documento mestre

**[`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md)** — especificação canônica (produto, módulos, estados, rastreabilidade).

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) | Especificação mestre |
| [`PROJECT_STATE.md`](./PROJECT_STATE.md) | Retrato do código **hoje** |
| [`DOMAIN_RULES.md`](./DOMAIN_RULES.md) | Regras de domínio verificadas |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Arquitetura real + hosts planejados |
| [`UX_UI.md`](./UX_UI.md) | Baseline visual homologada |
| [`SECURITY.md`](./SECURITY.md) | Controles e lacunas |
| [`TEST_STRATEGY.md`](./TEST_STRATEGY.md) | Pirâmide e matriz de testes |
| [`ROADMAP.md`](./ROADMAP.md) | Entregue / próximo / futuro |
| [`DECISIONS.md`](./DECISIONS.md) | ADRs e decisões de produto |
| [`CLIENT_EVALS_AND_AGENT.md`](./CLIENT_EVALS_AND_AGENT.md) | Avaliações + fundação do agente |
| [`WORKFLOW.md`](./WORKFLOW.md) | Processo oficial de sprints |
| [`PLATFORM_ADMIN.md`](./PLATFORM_ADMIN.md) | Painel da plataforma (detalhe) |
| [`REFERRAL_PROGRAM.md`](./REFERRAL_PROGRAM.md) | Programa de indicação e cupom (regras, dados, API, billing, runbook, testes) |
| [`ADR-043-referral-coupon-program.md`](./ADR-043-referral-coupon-program.md) | Decisões arquiteturais do programa de indicação |
| [`sprints/`](./sprints/) | Template, histórico 2A–2C.1 |
| [`reports/`](./reports/) | Índice de relatórios |
| [`VISION.md`](./VISION.md) | Visão inicial (histórica; ver PRODUCT_SPEC) |
| [`PRD.md`](./PRD.md) | PRD inicial (histórica; ver PRODUCT_SPEC) |
| [`SPRINT_2A_REPORT.md`](./SPRINT_2A_REPORT.md) | Relatório de entrega 2A (preservado) |

## Ordem obrigatória de leitura para agentes

1. [`../AGENTS.md`](../AGENTS.md)
2. Este `docs/README.md`
3. [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md)
4. [`PROJECT_STATE.md`](./PROJECT_STATE.md)
5. Especificação da **sprint autorizada** (em `sprints/` — só se `AUTORIZADA`)
6. Documentos especializados afetados pela tarefa

## Estados de módulo (vocabulário oficial)

`IMPLEMENTADO` · `PARCIAL` · `PLANEJADO` · `FUTURO` · `FORA_DO_ESCOPO` · `PENDENTE_DE_DECISAO`

Não alterar estados silenciosamente. Divergência código ↔ doc deve ser registrada.
