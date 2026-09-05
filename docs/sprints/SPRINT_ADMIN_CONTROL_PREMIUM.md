# Sprint — Admin premium e controle operacional

- Estado: AUTORIZADA, EM_ANDAMENTO.
- Autorização: pedido explícito do usuário em 2026-09-04 para reaproveitar o trabalho premium e melhorar a praticidade de controle.
- Branch: `feature/admin-control-premium`.
- Base confirmada no admin HML: `35ca1e69ae8bb9282e16eb45a7bc49e751e133ff`.
- Reaproveitamento: alterações de interface do commit `391d2de`, aplicadas sem commit sobre a base atual.

## Escopo

Admin: navegação agrupada, busca de organizações acessível de qualquer tela, visão geral com prioridades e atalhos, listagens legíveis em desktop/mobile, preservação de pesquisa/paginação na URL, estados de carregamento/erro e confirmação das ações existentes. Preservar todos os indicadores existentes, os contratos de API, permissões e wordmark.

Nenhuma migration, alteração de backend, mudança de regra de negócio, commit, push ou deploy integra esta entrega local.

## Documentação legada

AGENTS.md e PROJECT_STATE.md referenciam outras sprints históricas. Divergência já exposta ao usuário na auditoria; a autorização explícita desta tarefa define o escopo atual. As regras detalhadas atuais de gestão de conta estão em PLATFORM_ADMIN.md. Não reclassificar regras históricas nem iniciar roadmap.

## Gates

Admin: lint, typecheck, Vitest, build e E2E local com dados de teste identificados no relatório. Verificar busca, navegação por teclado/mobile, estados de erro/vazio e confirmações das ações existentes. Produzir screenshots de demonstração e relatório; não equivalem a homologação manual ou teste de integração no HML.
