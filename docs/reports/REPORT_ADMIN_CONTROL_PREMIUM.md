# Histórico da entrega — Admin premium e controle operacional

Data: 2026-09-04. Branch: `feature/admin-control-premium`.

## Problema e resultado

A visão geral distribuía dezenas de métricas com o mesmo peso; localizar uma conta exigia voltar à listagem e as tabelas eram pouco práticas no celular. A entrega prioriza indicadores principais, pendências com acesso à área responsável e pesquisa de organizações disponível em qualquer tela.

Base: `35ca1e69ae8bb9282e16eb45a7bc49e751e133ff`, identificado nos labels da imagem do admin executada no Jarvis. Reaproveitamento visual: `391d2de35771257e85592409f4b7eea1e0560dfc`. As alterações desse commit foram aplicadas à base atual, sem substituí-la por uma branch antiga.

Local: `C:\projetos\croniu-admin-production-ready\.worktrees\admin-control-premium`.
A implementação local foi posteriormente versionada e enviada ao remoto no commit `a38a6d5eb39901a46e0182dece222f7c9a102542`; a promoção HML posterior está registrada abaixo. A pasta originalmente aberta e suas alterações preexistentes foram preservadas.

## Mudanças

- Navegação separada em Gestão e Operação/suporte, sidebar fixa durante rolagem no desktop, menu mobile com foco contido, Escape e retorno do foco.
- Busca global por organização/titular, atalho `/` fora de campos, ambiente real da sessão e perfil do operador visíveis.
- Visão geral: quatro indicadores principais, lista de categorias que exigem atenção, acessos rápidos e detalhamento dos demais indicadores. Números ausentes são identificados como indisponíveis. Nenhuma série temporal ou métrica nova foi inventada.
- Organizações/usuários: busca e paginação na URL, navegação de volta/recarregamento preservando contexto, 20/50 registros por página, estados de erro e nova tentativa. Respostas antigas de busca não sobrescrevem a busca atual.
- Listagens desktop e blocos mobile; conta e assinatura identificadas separadamente. Usuários têm acesso direto à organização vinculada.
- Detalhe da conta com atalhos Resumo/Uso/Teste/Histórico/Controle de acesso. Término de teste e fuso disponíveis no resumo. Confirmações existentes preservadas; perfil `platform_viewer` não abre formulários de mutação de conta. Autorização continua obrigatória no backend.
- Componentes reaproveitados de tabela, badge, botão, modal, skeleton e estado vazio aplicados às áreas existentes: parceiros, feedbacks, ciclo–agenda, IA e erros.
- Modal mantém foco ao digitar, limita altura em telas pequenas, bloqueia rolagem de fundo e fechamento enquanto uma confirmação está em andamento. Campos sem ID explícito recebem IDs únicos acessíveis.
- Falha de rede retorna erro apresentável para as telas administrativas, sem deixar promessas rejeitadas e botões aguardando indefinidamente.

## Revisão visual

As capturas históricas não foram versionadas. O preview HTML quebrado não foi portado. As capturas podem ser regeneradas pelo E2E local.

Capturas em `apps/admin/e2e/artifacts/admin-control-premium/`:

- `dashboard-desktop.png`
- `organizations-desktop.png`
- `dashboard-mobile.png`
- `organizations-mobile.png`
- `organization-detail.png`

As capturas são de testes locais com respostas simuladas e contas `[DEMO-CRONIU]`. Não contêm dados de clientes reais e não representam implantação no HML. Os fixtures existem apenas no teste, sem bypass de autenticação ou dados simulados no código do produto.

## Validação

- `npm run lint`: passou, sem erros.
- `npm run typecheck`: passou quando executado isoladamente.
- `npm test -- --maxWorkers=1`: passou — 8 arquivos, 21 testes.
- `npm run build`: passou — 15 rotas geradas.
- E2E local com fixtures: 6 de 7 cenários passaram na primeira execução; o sétimo tinha um seletor que capturava também o anúncio interno do Next.js e foi corrigido. A repetição sobre o build final não concluiu porque o ambiente ficou sem memória (aproximadamente 230 MB livres e vários processos Node/Chromium). Isso não é tratado como aprovação do E2E final.
- Capturas locais: dashboard desktop/mobile, organizações desktop/mobile e detalhe da organização.

Ocorrências durante os gates:

1. Primeiro build não baixou Manrope no sandbox. Reexecutado com acesso à rede; a fonte existente foi preservada.
2. Execução simultânea de build e typecheck esgotou memória da máquina. Checks passaram a ser sequenciais; nenhuma verificação foi desabilitada.
3. Os mocks unitários do shell foram atualizados para a navegação e media query adicionadas.
4. Um seletor E2E de alerta também selecionava o anúncio interno do Next.js. Foi restringido ao conteúdo principal; o erro de rede da aplicação já era apresentado corretamente.
5. A repetição do E2E final foi bloqueada por memória do ambiente, não por falha de aplicação.

## Limites

- Backend, banco, migrations, regras de billing, autenticação, isolamento e wordmark não foram modificados. Nenhuma dependência foi acrescentada.
- Testes de UI com fixtures não substituem testes de integração com API/banco nem homologação manual. As suítes E2E antigas de conta/parceiros tiveram os seletores/confirmadores atualizados, mas sua execução exige ambiente integrado e não integra a evidência local acima.
- A autorização original consta dos documentos da branch de origem. A autorização da reconciliação consta da sprint e do relatório da sucessora.
- Na conclusão inicial local, HML ainda estava na imagem anterior; a autorização e promoção posteriores estão registradas abaixo.

## Promoção HML

Autorizada explicitamente pelo usuário após a revisão local. Em 2026-09-05 UTC, o pacote foi enviado ao Jarvis e somente `croniu-hml-admin` foi recriado. API, web e banco não foram reconstruídos nem reiniciados.

- Admin HML: saudável; `admin_local=200`; `admin_public=200` em `https://admin-croniu-hml.ntws.cloud/`.
- Imagem nova: `sha256:698bfeaa5a0227045735b95fbe1852f51f1e1279aa6edd3cadfd1f1bb42801ee`.
- Label da imagem: `revision=admin-premium-20260904`, `version=v1.0.0-rc2.3-admin-premium`.
- Deploy concluído em `20260905T004947Z`.
- Tag de rollback preservada: `croniu-hml-admin:pre-admin-premium-20260904` (`sha256:fe2d3453e75acefc6bf2920496b488dd1221d036ba8fc9d5cb17c34893e3250b`).
- API permaneceu saudável em `sha256:fbc94aa37c513b718068d714605c034c6c2ec4ed36d4917cf05ee255dbb7f466`; web permaneceu saudável em `sha256:e46e6c513ecdf17fc43150aa0f91b51e44a41b29ce3ef3484b6fcd84a622ff17`.

Esta promoção altera o estado do HML. Não é homologação manual completa: ainda requer conferir login, navegação autenticada e fluxos críticos no endereço público.

## Solicitação de promoção PRD

O pedido de promoção para PRD foi recebido, mas não executado. O processo oficial (`docs/ops/PROMOTE_HML_TO_PRD.md`) exige `image_sha` imutável no GHCR, `deploy_sha` do pacote operacional, `build_run_id` e `deploy_bundle_run_id`, além de CI verde e rehearsal HML com os mesmos digests. Naquele momento, a versão tinha alterações locais não commitadas e foi construída diretamente no Jarvis para HML com `admin-premium-20260904`, sem artefato GHCR correspondente. O commit posterior `a38a6d5` não cria retroativamente uma identidade GHCR para aquela imagem.

PRD não foi alterado. Uma promoção futura exige aprovação da reconciliação por PR e, em etapa separadamente autorizada, os workflows oficiais e rehearsal dos mesmos artefatos. A tarefa atual autoriza somente preparação e abertura da PR. O build direto com `:local` em PRD foi deliberadamente recusado pelo preflight e pelo runbook.
