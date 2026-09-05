# Admin Control Premium — reconciliação para revisão

## Escopo e identidade

Tarefa de preparação segura: reconciliar, validar, fazer commit/push e abrir PR; parar após o CI. Sem autorização para merge, deploy ou workflows de release/promoção.

- Remoto confirmado por fetch completo: `https://github.com/palexsfc10/croniu-app`.
- Main/base: `9cfec30b806bd76277e9e6df720a19de9aafd6db`.
- Fonte: `a38a6d5eb39901a46e0182dece222f7c9a102542`, em `origin/feature/admin-control-premium`.
- Sucessora: `feature/admin-control-premium-prd`, criada diretamente de main em worktree isolada e inicialmente limpa.
- Divergência: main contém `391d2de` e seu merge `9cfec30` (PR #36); a fonte contém `a38a6d5`, ambos derivados de `35ca1e6`.
- A pasta inicial estava em `feature/admin-production-ready` (`d523eaa`) com modificações preexistentes, incluindo backend. Nada dessa pasta foi incorporado ou descartado. A worktree da fonte estava limpa.

## Reconciliação

A PR [#36](https://github.com/palexsfc10/croniu-app/pull/36) é o baseline: componentes visuais, badges semânticos, tabelas, skeletons, drawer, confirmações explícitas de conta, timeline/IDs copiáveis e correções de tokens. O porte aplicou apenas o delta revisado entre main e a fonte em `apps/admin`, sem cherry-pick integral e sem resolução global ours/theirs.

Incrementos: navegação agrupada; busca global e atalho `/`; dashboard priorizado; diretórios com pesquisa/paginação na URL, 20/50 itens, links para organizações e apresentação mobile; atalhos no detalhe; formulários de conta ocultos para viewer; abort de leituras obsoletas; erros de rede apresentáveis; foco estável, bloqueio de fechamento durante confirmação e alvos de toque maiores.

A adaptação de erros de rede exigiu preservar o comportamento seguro do logout: se o servidor não confirmar o encerramento, a interface informa a falha e permite nova tentativa, sem fingir que revogou a sessão. Nenhum endpoint, cookie ou regra de autenticação foi alterado.

## Revisão do baseline

| Superfície | Evidência |
|---|---|
| Dashboard | Os 24 campos numéricos anteriores continuam presentes; `generated_at` permanece e ambiente continua visível no shell via sessão. Sem séries ou valores fictícios no produto. |
| Navegação/busca | Todas as oito rotas preservadas; teclado, drawer, retorno do foco e busca global cobertos no E2E. |
| Organizações/usuários | Status da conta e assinatura separados; e-mails mascarados; login versus atividade explícitos; contexto de pesquisa preservado na URL. |
| Detalhe e confirmações | Extensão, desativação, reativação, prévia e confirmação dupla de exclusão, timeline e IDs copiáveis preservados. |
| Parceiros, feedbacks, ciclo–agenda, IA, erros | Arquivos de página idênticos à main/PR #36; apenas componentes compartilhados recebem o incremento. |
| Perfis | Admin mantém controles existentes; viewer não abre formulários de conta. Autorização server-side permanece intacta. |
| Desktop/mobile | Capturas locais inspecionadas; testes de viewport e teclado. Isso não é homologação manual do produto. |

Não foi identificada perda de funcionalidade da PR #36 na revisão do código e nos cenários executados. As limitações de integração abaixo delimitam essa conclusão.

## Higiene

- `deploy/hml/promote-admin-premium.sh` não foi portado: é um script pontual de HML com identidades/caminhos específicos, sem necessidade nesta PR.
- `ADMIN_PREMIUM_PREVIEW.html` referenciava capturas ignoradas pelo Git; não foi portado e sua referência foi removida do relatório histórico. O E2E regenera cinco capturas em `apps/admin/e2e/artifacts/admin-control-premium/`.
- Relatório original corrigido para distinguir entrega local, commit/push `a38a6d5` e promoção HML histórica. Nenhum acesso ao HML foi feito nesta tarefa para revalidar aquele histórico.
- Fixtures identificados como DEMO existem apenas em `e2e/`; sem dados simulados nem bypass de autenticação no código de produção.
- Documentação de sprint atualizada para esta autorização. Não foram reclassificadas regras históricas de negócio.

## Gates

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm test -- --maxWorkers=1`: passou — 8 arquivos, 21 testes.
- `npm run build`: passou — 15 rotas geradas.
- E2E final com fixtures locais: passou — 13/13 cenários, um worker, build final; cobertura de desktop/mobile, busca/paginação, estados de erro/vazio, confirmações, viewer, logout sem confirmação e ausência de overflow.
- Capturas locais: dashboard desktop/mobile, organizações desktop/mobile e detalhe da organização; inspecionadas visualmente.
- E2E integrado: não executado; API/PostgreSQL/virtualenv local indisponíveis.
- Verificação de secrets: Gitleaks 8.21.2 foi obtido, mas a varredura da árvore completa foi interrompida por pressão de memória após mais de um minuto. A verificação direcionada dos arquivos alterados será executada antes do commit; o job de CI permanece obrigatório.
- `git diff --check`: passou.

CI da PR #42 (run `33937730365`) terminou com 7 jobs aprovados e `backend-tests` reprovado. A falha ficou restrita a três testes preexistentes de agenda em `tests/test_cycle_agenda_integrity.py`: `test_past_day_agenda_still_lists_scheduled` recebeu HTTP 400 em `/api/v1/agenda/day`; `test_cancelled_hidden_unless_include_cancelled` e `test_org_isolation_agenda_day` receberam resposta sem `appointments`. O diff desta PR não toca backend, agenda ou contratos de API, portanto a falha foi registrada e não corrigida fora do escopo.

O CI da PR deve ser consultado no head exato; este relatório não autoriza promoção.

## Limites e riscos

Ambiente integrado local indisponível: portas 8010 (API) e 5433 (PostgreSQL) sem serviço e ausência de `backend/.venv/Scripts/python.exe` na worktree. Portanto, as suítes existentes de autenticação, conta e parceiros que exigem API/banco não foram executadas localmente. Não foram substituídas por uma alegação de integração baseada em fixtures. O seletor de data no E2E de conta foi ajustado para a seção `#teste`, pois o resumo agora também exibe a data.

A apresentação de parceiros e feedbacks conserva os controles existentes do baseline; a autorização de mutações permanece no backend. A suíte local com fixtures não comprova enforcement server-side; os testes de backend existentes rodam no CI, sem alteração de código.

A máquina apresentou cerca de 227 MB de memória física livre durante os primeiros gates; os gates foram mantidos sequenciais e com um worker nos testes. Nenhuma verificação foi desabilitada.

## Invariantes e operação

Confirmado no diff contra main: zero backend; zero migration; zero contrato de API; zero billing; zero apps/web; zero wordmark; zero deploy/workflows. Não houve merge, acesso ao Jarvis/HML/Cloudflare/DNS/produção, deploy ou dispatch de workflow de release/promoção. PRD não foi alterado.

A abertura da PR dispara o CI existente. Esse CI inclui builds sem push e um job legado de empacotamento de artefato, sem deploy; nenhum workflow de release ou promoção será acionado manualmente nesta etapa.
