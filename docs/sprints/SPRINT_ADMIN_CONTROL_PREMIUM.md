# Sprint — Admin premium e controle operacional

Estado: AUTORIZADA — preparação de PR para revisão.

## Origem e reconciliação

Pedido explícito do usuário em 2026-09-04. A implementação original foi criada sobre `35ca1e6`, reutilizou `391d2de` e foi versionada e enviada ao remoto em `a38a6d5eb39901a46e0182dece222f7c9a102542`.

A PR #36 incorporou `391d2de` na main `9cfec30b806bd76277e9e6df720a19de9aafd6db`. A branch sucessora `feature/admin-control-premium-prd` parte dessa main e porta somente o incremento revisado de `a38a6d5`.

## Escopo autorizado

Navegação agrupada, busca global de organizações, dashboard com prioridades e todos os indicadores anteriores, listagens desktop/mobile, pesquisa/paginação na URL, estados de carregamento/erro/vazio, detalhe da organização e confirmações existentes. Preservar permissões, contratos de API e wordmark.

Autorizados: reconciliação, validação, documentação, commit, push e abertura de PR contra main; aguardar CI. Proibidos: merge, deploy, workflows de release/promoção, acesso a Jarvis/HML/PRD, backend, banco, migrations, contratos de API, billing e alterações em apps/web.

## Documentação legada

As referências de sprint em AGENTS.md e as seções antigas de PROJECT_STATE.md são históricas. A autorização explícita desta tarefa define o escopo atual. Regras de conta: PLATFORM_ADMIN.md. Não iniciar roadmap nem reclassificar regras de negócio.

## Gates sequenciais

Lint, typecheck, Vitest, build, E2E final com fixtures locais, E2E integrado se o ambiente local estiver disponível, verificação de secrets e revisão do diff contra main. Capturas e testes automatizados não equivalem a homologação manual. Relatório: `docs/reports/REPORT_ADMIN_CONTROL_PREMIUM_PRD.md`.
