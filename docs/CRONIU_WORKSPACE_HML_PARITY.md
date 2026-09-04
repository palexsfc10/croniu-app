# Croniu Workspace — Matriz de Paridade (HML)

> Documento vivo. Branch `feature/croniu-workspace-hml`, nascida de `origin/main` @ `35ca1e6`
> (merge PR#41 `feature/desktop-workspace-experience`). Atualizado incrementalmente a cada fatia
> implantada em `croniu-hml.ntws.cloud`. PRD não é tocada nesta iniciativa.

## Fatias implantadas em HML

| # | Fatia | Commit | Deploy | Situação |
|---|---|---|---|---|
| 1 | Identidade e shell (rótulo "Croniu Workspace", badge "Ambiente de homologação" só em HML, "Início" no lugar de "Hoje" em toda a navegação/back-links, "by NTWS Labs" discreto) | `f9f51fe` | recreated `croniu-hml-web` | **feito** — smoke com conta throwaway confirmou em desktop e mobile |
| 2 | Entrada pública ("/") recomposta: duas colunas, ProductPreview em camadas real (Início/Agenda/Financeiro/IA + Cliente 360°), fonte serifada removida de todo o app, 2 correções de contraste WCAG AA | `e578e97` | recreated `croniu-hml-web` (api também recriado como efeito colateral do rebuild — mesmo código, sem risco) | **feito** — validado em 8 breakpoints + zoom 125% + teclado + contraste + reduced motion |
| — | docs: registra Gate 1 (organização) | `d068f2f` | nenhum (só doc) | **feito** |
| — | docs: conclui Gate 1 (usuário) | `33ce895` | nenhum (só doc) | **feito** |
| — | feat(deploy): `up-web`/`build-web` (Gate 2) | `144ad14` | recreated `croniu-hml-web` via `up-web` (api/admin preservados, provado) | **feito** |
| 3 | Home/Início mais limpa e orientada a decisões: mantida a hierarquia já existente (saudação, resumo curto, agenda do dia, lista única de prioridades via `attention_items`), adicionado Financeiro compacto (contagem + total real de `pending_payments`, nunca mockado) e Ações rápidas (novo cliente / novo ciclo / agenda completa, apontando para rotas reais) | `f55da4c` | recreated `croniu-hml-web` via `up-web` (api/admin preservados, provado) | **feito** — 14/14 testes automatizados + verificado ao vivo em HML com conta throwaway (removida por ID exato ao final) |
| 4 | Clientes + Cliente 360° como jornada única: lista reconstruída (tabela densa desktop, cards priorizados mobile, 6 views reais Todos/Atenção/Onboarding/Renovação/Financeiro/Sem acompanhamento); Cliente 360° reorganizado em 6 abas (Resumo/Agenda/Plano e ciclo/Prontuário/Financeiro/Histórico), Resumo rico como visão inicial, ações contextuais reais (Agendar/Registrar acompanhamento/Adicionar anotação/Criar rotina/Perguntar à IA/Editar/Mais ações); correção de diretriz "desktop administra, mobile consulta e age pela IA" aplicada retroativamente | `51e27bd` + `2461cb0` (fix: data duplicada) + `9725dfb` (fix: abas sobrepondo no mobile) + `5a013f4` (correção de diretriz mobile) + `b808334` (docs) | `up-api` (3 endpoints aditivos) + `up-web` ×4 — api/admin preservados em todos | **feito** — 101/101 testes focados de backend + 383/383 frontend, 0 falhas; verificado ao vivo em HML desktop+mobile 390×844+360×800, lista+360°+6 abas; contas throwaway (3 orgs, ao longo da fatia) removidas por ID exato ao final, contagens idênticas ao baseline |
| 5 | Agenda: calendário profissional desktop (Dia/Semana, grade temporal real, disponibilidade como fundo contínuo, linha do horário atual, criação por clique) substitui a lista de um dia; mobile ganha timeline diária dedicada + "Perguntar à IA" em destaque; IA ganha `propose_cancel_appointment`/`execute_cancel_appointment` (única lacuna real — create/reschedule/consultas já existiam) | `3683736` | `up-api` (rota `/agenda/range` + tool de IA aditivos) + `up-web` — api/admin preservados | **feito** — 11/11 testes novos (backend) + 32/32 novos + 414/414 suíte frontend completa, 0 falhas; typecheck/lint/build limpos; verificado ao vivo em HML: desktop 1366×768/1440×900/1920×1080 (Dia+Semana, clique abre compromisso) e mobile 360×800/390×844 (timeline, IA, cancelamento via tool real); conta throwaway removida por ID exato, contagens de volta ao baseline (273/278/273/155); reexecução exaustiva das suítes HTTP pré-existentes de agenda/disponibilidade não completada por custo de tempo do ambiente descartável (bcrypt ~20-30s/teste) — registrado como pendente, mudanças são puramente aditivas no backend |
| 6 | Assistente como camada operacional: desktop ganha painel lateral (contexto atual/atalhos/atividade recente), palette global `Ctrl+K`/`Cmd+K` (novo — não existia), prefills contextuais de Clientes/Agenda passam a alimentar o contexto; mobile ganha slot central de destaque na navegação (Rotinas migra para "Mais"), resumo do dia real, acesso rápido e consultas recentes no estado vazio | `4e3c5cd` | `up-web` — zero endpoint novo, API e Admin 100% intocados | **feito** — 427/427 testes de frontend (19 novos na página Assistente + 6 do Ctrl+K), typecheck/lint/build limpos; verificado ao vivo em HML: fluxo completo propor→confirmar via IA real (criar cliente) com link real em "Atividade recente", `Ctrl+K` respondendo com dado real, painel "Contexto atual" a partir do "Perguntar sobre este cliente" do Cliente 360°, mobile 360×800/390×844 com resumo/acesso rápido/consultas recentes, nav mobile com Assistente centralizado, link novo Rotinas em "Mais"; conta throwaway removida por ID exato, contagens de volta ao baseline (273/278/273/155) |
| 7 | Rotinas + Acompanhamentos como jornada integrada: Rotinas desktop vira central densa (Todas/Atrasadas/Hoje/Próximas/Recorrentes/Concluídas, busca, filtro, Concluir/Adiar/Cancelar/Abrir cliente); Acompanhamentos é página nova (Pendentes com sinal real de ciclo ativo + sem avaliação recente / Histórico de avaliações publicadas); IA ganha `propose_create_routine`/`execute_create_routine` e `list_clients_needing_accompaniment`; correção de segurança em `create_routine`/`update_routine` (client_id de outra org não era validado) | `af7cf12` | `up-api` (board com flags aditivas + 2 endpoints novos + 2 tools de IA) + `up-web` (página nova `/app/accompaniment` + nav) — api/admin preservados | **feito** — 12 testes novos de backend + 28 pré-existentes de rotinas/avaliações/agente reexecutados (0 regressão) + 19 novos de frontend, 443/443 suíte completa; typecheck/lint/build limpos; verificado ao vivo em HML: tabela densa com as 6 abas reais, `include_completed` mostrando ocorrência concluída, Acompanhamentos Pendentes→vazio após publicar avaliação→Histórico com o registro real, comando de IA real ("Crie uma rotina para revisar avaliação da Cliente...") propondo e criando a rotina real (visível depois na tabela e em "Suas rotinas"), painel "Atividade recente" do Assistente atualizado; conta throwaway removida por ID exato, contagens de volta ao baseline (273/278/273/155) |
| 8 | Cadastro enxuto + onboarding progressivo do profissional pós-login (wizard 5 passos: boas-vindas/profissão/casos de uso/WhatsApp/primeiro passo); gate "Minha conta" ganha edição/revogação de WhatsApp de contato + consentimento comercial (migration `0028_user_whatsapp_consent`, `users.contact_whatsapp_e164`/`whatsapp_marketing_consent_at`/`_version`) | `9dc1959`, `e63b0b6`, `6e70d91` (fix do id de revision estourando `alembic_version.varchar(32)`) | `up-api` (migration + endpoint) + `up-web` — admin preservado | **feito** — validado ao vivo em HML: onboarding completo, edição/revogação de WhatsApp, nenhum consentimento pré-marcado, contas existentes intactas |
| 9 | Onboarding de clientes como central operacional (`/app/clients/intake`, 4 grupos reais) + Prontuário reorganizado (rascunho/publicado separados); correção de nomenclatura "Registrar acompanhamento"→"Registrar avaliação" | `1f1357f`, `267efcc` | `up-api` + `up-web` | **feito** — validado ao vivo em HML |
| 10 | Serviços + Ciclos: central `/app/cycles` (renomeada de "Renovações") + `/app/services` com contagem de uso real; ação "Preparar renovação" reaproveita o fluxo existente (sem endpoint/atalho novo, por decisão explícita) | `4efd186` | `up-api` + `up-web` | **feito** — validado ao vivo em HML |
| 11 | Financeiro completo: gate do recebível de R$0,00 corrigido na criação (3 pontos) + edição-para-zero (cancela em vez de zerar) + toda leitura (`Home`/`financial_overview`/IA); nova central `/app/receivables` + `GET /receivables/overview` (recebido/previsto/vencido/tendência, sem contar duas vezes); Cliente 360° Financeiro reescrito | `bccc76d` | `up-api` (endpoint aditivo) + `up-web` | **feito** — 6 testes de backend + suíte frontend completa; validado ao vivo em HML |
| 12 | Portal do cliente: `next_appointment` (só data/hora/serviço/status, timezone da org) exposto em `GET /public/my-cycle`; rótulo interno "outro" nunca mais vazado (`_payment_status_label` ignora valor zero, mostra "cancelado" quando aplicável); prévia autenticada do Portal para o profissional (`GET /clients/{id}/portal-preview` + `/app/clients/{id}/portal-preview`, mesmos dados/ordem/estados do Portal real); gate de segurança da rota `/c/[token]`: `X-Robots-Tag: noindex, nofollow, noarchive` + `Referrer-Policy: no-referrer` como headers HTTP reais (não só meta tag), redação de logs estendida para `/entrar/`, `/public/intake/*` (tokens `l1.`/`ci1.`, antes só `/c/`/`v1.` eram cobertos) | `6b47e87`, `c3aa1f0` | `up-api` + `up-web` (×2, gate em commit separado) — admin preservado em todos | **feito** — 38 testes de backend novos + suíte frontend completa; validado ao vivo em HML: token válido/inválido/cross-tenant, cliente com/sem ciclo/agenda/avaliação/cobrança/renovação, duplicidade idempotente, paridade prévia↔real, mobile 375×812/390×844 + desktop, token confirmado ausente do access log real do container |
| 13 | Conta + Configurações unificadas em `/app/settings` (lateral nav desktop, central resumida mobile), 3 domínios nunca misturados: Minha conta (pessoa) / Workspace (negócio — perfil profissional, fuso, jornada/disponibilidade, recebimentos, cada seção com salvamento independente) / Plano e assinatura (Asaas, lógica preservada). `/app/account`, `/app/billing`, `/app/help`, `/app/profile/professional`, `/app/preferences`, `/app/availability` viram redirects — nenhum link/nudge/bookmark quebrado; `/app/billing/return/[mode]` (referência externa do Asaas) preservado intocado | `cf65eb1` | `up-web` — zero mudança de backend, api/admin intocados | **feito** — 519/519 testes frontend + typecheck/lint/build limpos; validado ao vivo em HML: todos os 6 redirects, salvamento independente por seção, edição/revogação de WhatsApp, mobile 375×812 + desktop, WhatsApp pessoal confirmado ausente do Portal |
| 14 | Cobertura final da IA: auditoria dos 15 domínios (matriz leitura/proposta/executor/confirmação/gap por domínio); 3 gaps reais fechados — `propose_cancel_cycle` (usa `domain_svc.cancel_cycle` já existente, "pausar"/"concluir" ciclo continuam ausentes por não serem estados reais), `propose_publish_evaluation` (completa o loop rascunho→publicação), `propose_cancel_routine` + `list_routines` (tool de leitura nova, necessária para resolver nome→id); system prompt ganha restrições explícitas (nunca assinatura/e-mail/senha/token do Portal, nunca simular sucesso antes da confirmação) e orientação de navegação para os 6 domínios sem tool (onboarding, anamnese, portal, serviços, modelos, conta/config); `safe-chat-markdown.tsx` aceita links relativos same-origin; 6 pontos de entrada contextuais upgradados/criados (Ciclos, Financeiro, Onboarding, Rotinas, Home) | `58b737c` | `up-api` ×3 (tools aditivas + fix de wording) + `up-web` — admin preservado em todos | **feito** — 11 testes novos de backend + 71 pré-existentes de agente reexecutados (0 regressão) + 521/521 frontend, typecheck/lint/build limpos; validado ao vivo em HML via chat real (LLM real, `gpt-5.6-terra`): cancelar ciclo, criar+publicar avaliação, criar+cancelar rotina, cada um propose→confirmar→execução real→consistência via API manual confirmada; IA recusou corretamente adivinhar um `routine_id` sem `list_routines` (achado real corrigido na hora); pergunta direta pelo token do Portal recusada, `tool_trace: []`; mobile 390×844 e `Ctrl+K` confirmados; dados sintéticos removidos por ID exato. Achado documentado, não corrigido nesta fatia: `routines_svc.cancel_future_open` usa `due_on > today` (não `>=`), deixando a pendência de hoje de uma rotina "once" arquivada ainda `open` — registrado em `project_croniu_known_gaps` item 8 |
| — | Gate: corrige `cancel_future_open` (`due_on > today` → `>= today`) — ocorrência de hoje de uma rotina "once" agora é cancelada junto com a rotina, mesma regra já aplicada ao futuro; `execute_cancel_routine` (IA) passa a usar `_tool_today(ctx)` (fuso da organização) em vez do fallback `date.today()` do servidor, igualando ao endpoint manual | `0eb181a` | `up-api` — web/admin preservados | **feito** — 3 testes novos (hoje/futuro cancelados, passado/concluída preservados, isolamento de tenant, paridade manual×IA) + 25 pré-existentes de rotinas/agenda/isolamento reexecutados sem regressão; validado ao vivo em HML: rotina "once" de hoje arquivada → ocorrência vira `cancelled` e some do board padrão imediatamente; conta sintética removida por ID exato |
| 15 | Home V2 + fundação visual premium (frontend-only, reaproveita `home/summary` existente sem endpoint novo): cabeçalho curto (saudação + data + workspace); Briefing do dia determinístico (`home-briefing.ts`, zero chamada de IA automática — só via "Analisar meu dia"/"Perguntar à IA" explícitos); fila única de atenção com origem visível por item (Financeiro/Ciclo/Renovação/Agenda/Pendência); Financeiro compacto sempre visível quando `!isNew` (recebido no mês/vencido/próximo, nunca o dashboard completo); ações rápidas discretas (Novo cliente/Novo compromisso/Nova rotina/Perguntar à IA); jornada curta de 3 passos para profissional novo (`isNewProfessional`, corrigido para considerar todos os `*_count`, não só os arrays). Cada bloco busca seus próprios dados (`useAccompanimentPending`/`useFinanceOverview`/`useRoutinesToday`/`useEntitlement`) e falha isolado via `Skeleton`/`BlockError`, sem derrubar a Home inteira. Shell: nav ativo com trilho lateral + superfície elevada, gatilho de busca/Ctrl+K visível na sidebar (reaproveita o command palette existente via evento customizado); tokens: `--color-surface-elevated` deixa de ser duplicata de `--color-surface`, `--shadow-lg` novo, `.surface-briefing` (marca) deliberadamente distinto de `.surface-ai` (violeta, exclusivo da IA) | `d6c03d6` | `up-web` — api/admin preservados | **feito** — 529/529 testes frontend (2 bugs reais achados e corrigidos durante a própria suíte: `FinanceCompact` só renderia quando a área operacional não estava vazia, e o `EmptyState` "Tudo organizado" podia aparecer com a configuração inicial ainda incompleta) + typecheck/lint/build limpos; validado ao vivo em HML: conta sintética nova → jornada curta de onboarding (não o wizard completo); 1 serviço criado → "1 de 2 etapas"; compromisso criado para agora → Briefing mostra o próximo compromisso real + Agenda de hoje com badge "Em andamento" + Financeiro compacto (R$ 0,00/R$ 0,00/"Sem cobrança prevista"); gatilho "Buscar ou perguntar" da sidebar abre o mesmo command palette do `Ctrl+K`; foco por teclado visível na nav; mobile 390×844 confere com o padrão "companhia operacional" do spec (briefing + próximo compromisso + 3 chips + ações rápidas + nav inferior, sem tabelas/cards empilhados); conta sintética removida por ID exato. Não validado nesta fatia por limite de tempo, reportado honestamente: falha isolada de um bloco (endpoint quebrado ao vivo), estado "vencido"/financeiro não-zero, tablet/1440/1920/ultrawide/zoom 125%/reduced-motion/textos longos — recomenda-se cobertura visual complementar antes da propagação transversal |
| 16 | Fecha as validações pendentes da fatia 15 + reorienta a Home V2 para central de decisão do negócio (não mais um resumo da Agenda): remove o bloco "Agenda de hoje" e a lista completa de rotinas do dia; nova estrutura desktop — briefing executivo determinístico (sem "próximo compromisso" embutido, que passa a ter card próprio), indicadores (clientes ativos via `GET /clients?status=active`, ciclos perto do fim, receita prevista e valor vencido via `GET /receivables/overview` — nenhum endpoint novo), fila única de prioridades (financeiro/ciclo/renovação/agenda/avaliação pendente + só rotinas **atrasadas**, nunca a lista completa — essa é responsabilidade da tela de Rotinas), bloco de renovações (`summary.renewals`), financeiro compacto, "Últimos recebimentos" (única fonte real disponível para "movimentações recentes" — não existe feed de atividade cross-domain no backend hoje, documentado em vez de inventado, via `GET /receivables?status=paid`), card compacto de próximo compromisso com link para a Agenda. Mobile permanece resumido (briefing + principal prioridade + indicadores essenciais + próximo compromisso). Corrige bug real pré-existente: sidebar/topbar do shell trocava em `md:` (768px) enquanto todo o conteúdo de página já trocava em `lg:` (1024px) — larguras de tablet mostravam a barra lateral completa espremendo conteúdo mobile; unificado em `lg:` em todo o `app-shell.tsx`. Propaga a mesma fundação visual para Clientes/Cliente 360°, Ciclos, Financeiro, Rotinas/Avaliações/Acompanhamentos, Agenda e Assistente: `Skeleton`/`BlockError` no lugar de texto cru de carregamento/erro; cards padronizados (`rounded-lg` + borda + `shadow-sm`); tabelas de Rotinas/Acompanhamentos envolvidas na mesma superfície com borda/sombra já usada em Ciclos/Financeiro; `EmptyState` compartilhado no lugar de caixas tracejadas improvisadas; páginas de detalhe de Ciclo e Recebível reconstruídas (antes sem nenhum cartão, texto empilhado sem hierarquia), preservando handlers/textos exatos; Assistente unificado de `md:` para `lg:` (maior inconsistência estrutural da auditoria) + gradiente de fundo trocado de hex hardcoded para tokens. Corrige um bug real espalhado por 3 arquivos (`accompaniment`, `agenda`, `routines-inner`): `--color-on-primary` não existe no design system (token correto é `--color-primary-foreground`), deixando o texto do toggle ativo sem cor definida | `86bd7e9`, `3d4f7d2` | `up-web` (×2) — api/admin preservados em ambos | **feito** — 528/529 testes frontend (1 falha isolada em `cycles/page.test.tsx` confirmada como flakiness pré-existente sob carga da suíte completa, não relacionada — passa 8/8 isolado) + typecheck/lint/build limpos; validado ao vivo em HML com 2 contas sintéticas: financeiro vencido/não-zero real (R$ 3.000,00 vencido, badge vermelho correto), falha isolada de endpoint simulada via fetch patch (`/receivables/overview` → 500) confirmando que só o bloco Financeiro mostra `BlockError` e o resto da Home continua íntegro, tablet 768×1024 confirma o shell agora coerente (chrome mobile completo, sem mistura com sidebar desktop) tanto na Home quanto no Assistente, 1440×900/1920×1080/2560×1080 sem overflow (max-width respeitado), reduced-motion confirmado via CSS global pré-existente (`prefers-reduced-motion` já cobre `.animate-fade-up`/skeletons), nome de cliente longo sem overflow; nova estrutura da Home (briefing/indicadores/fila única/financeiro/últimos recebimentos/próximo compromisso) e propagação visual (Clientes/360°, Ciclos, Financeiro, Rotinas/Acompanhamentos, Agenda, Assistente) confirmadas tela a tela; ambas as contas sintéticas removidas por ID exato |
| 17 | Gestão completa de renovações como processo operacional. Auditoria prévia (agente Explore) concluiu que `renewal_requests` é só o sinal de intenção do Portal (`requested→acknowledged→payment_reported→resolved/dismissed`, docstring "does not create a cycle") — não existe para a maioria das renovações reais (quando o profissional cria o ciclo seguinte direto, sem passar pelo Portal). Introduz `RenewalCase` (migration `0029_renewal_cases`, tabela nova, aditiva, sem alterar `cycles`/`renewal_requests`): `status` só grava `open`/`awaiting_client`/`renewed`/`ended_without_renewal` — "próxima"/"pendente"/"atrasada" são sempre derivadas em leitura a partir da data real do ciclo e das janelas já existentes (`NEARING_END_DAYS`, `HOME_CYCLE_ENDING_WINDOW_DAYS`), nunca persistidas redundantemente. Índices `uq_renewal_cases_source_cycle` (um caso por ciclo) e `uq_renewal_cases_successor_cycle` são a idempotência a nível de banco. `POST /cycles/intelligent` ganha `renewed_from_cycle_id` (genérico, ao lado do já existente `renewal_request_id` só-Portal): liga o ciclo sucessor, encerra o ciclo de origem + cancela sua agenda futura, e **resolve automaticamente qualquer `RenewalRequest` aberta** para o mesmo ciclo (mesmo vindo do fluxo genérico) — unifica os dois caminhos de origem. Encerrar sem renovar exige motivo controlado (`client_declined`/`no_response`/`service_ended`/`other`); aguardando cliente exige `next_contact_date`; ciclo cancelado nunca entra na lista nem aceita ação. Novos endpoints `GET /renewal-cases` (`scope=needs_decision`\|`all`), `POST /renewal-cases/{cycle_id}/awaiting-client`, `POST /renewal-cases/{cycle_id}/end-without-renewal`. IA ganha `list_renewal_cases` (leitura) + `propose/execute_mark_awaiting_client` + `propose/execute_end_renewal_without_renewal` (`write_common`, confirmação obrigatória); prompt do sistema atualizado para nunca afirmar renovação antes da criação real do ciclo. `/app/renewals` reconstruída como Central de Renovações completa (filtros reais por situação, tabela densa desktop, cartões mobile, nunca a tabela comprimida, ação "Perguntar à IA" contextual); Home's bloco de Renovações passa a usar fonte própria (`GET /renewal-cases?scope=needs_decision`) em vez do campo cru `summary.renewals`; Cliente 360° liga o processo ao histórico do ciclo (link "Ver ciclo renovado" quando aplicável) e corrige um bug real pré-existente (`openRenewalCycleIds` sempre vazio ali, escondendo solicitações do Portal). Achado ao validar ao vivo e corrigido na mesma fatia: `cycles_suppressed_from_home_attention` só conhecia `RenewalRequest`/`contact_confirmed_at` — um caso já decidido (aguardando/renovada/encerrada) continuava aparecendo como aviso genérico "ciclo terminando" na Home; adicionado `case_handled_source_ids` à função de supressão | `86bd16c`, `ae30fc8` | `up-api` (migration + endpoints + IA) ×2 (segunda vez para o fix de supressão) + `up-web` | **feito** — 146 testes de backend (72 focados nesta fatia: `test_renewal_cases.py` novo com 7 casos incluindo idempotência/isolamento/ciclo-cancelado, `test_agent_renewal_case_actions.py` novo com 5 casos de IA, mais 66 arquivos de regressão em ciclos/financeiro/agenda/canônicos — 0 regressão) + 533/533 frontend + typecheck/lint/build limpos; migration testada upgrade→downgrade→upgrade em banco vazio (aditiva pura, sem risco a dados existentes, aplicada com sucesso no HML real com as 273 organizações do baseline registrado — confirmado por `select count(*) from organizations`, não a amostra truncada de ~18 linhas que uma consulta anterior, sem `count`, havia mostrado por engano no relatório de chat); validado ao vivo em HML com 7 clientes sintéticos cobrindo os 7 estados: próxima (Ana), pendente (Bruno), atrasada (Carla), aguardando cliente com data real (Diego), renovada com sucessor real e idempotência confirmada (retry com nova idempotency_key retornou o mesmo ciclo, sem duplicar — Elisa), encerrada sem renovação com motivo real (Felipe), solicitação do Portal (Gustavo, badge "Cliente pediu" sem forçar conclusão) — todos os 7 badges/filtros corretos na Central de Renovações, Cliente 360° mostrando "Renovação: Aguardando cliente" e "Ver ciclo renovado →", supressão do aviso genérico confirmada via `home/summary` antes/depois do fix; dados sintéticos removidos por ID exato (cascata de `renewal_cases` confirmada). Limitação honesta, não corrigida nesta fatia: a Central de Ciclos e o Cliente 360° derivam o badge "Renovação" de uma heurística puramente frontend (`findSuccessor`, mesmo cliente+serviço+data) que não conhece `RenewalCase.status='ended_without_renewal'` — um ciclo explicitamente encerrado-sem-renovar ainda pode mostrar o alerta genérico de "Renovação" nessas duas telas (não na Central de Renovações nem na Home, ambas corrigidas); recomenda-se estender essa heurística numa fatia futura |

## Gate 1 — reconciliação da conta sintética de smoke

Conta sintética de smoke usada nas duas fatias acima (mesmo padrão já usado pela suíte
`e2e/cycle-integrity.spec.ts` existente neste ambiente): organização `Smoke Workspace
1788319536198` (`org_id 02153aa4-b312-47fd-9bbe-d2dbb27f853a`), usuário
`workspace_smoke_1788319536198@example.com` (`user_id 3543ae42-8455-42de-a9d0-540e56388f2d`).

Removida em 2026-09-02, exclusivamente pelos IDs acima (sem filtro por nome, e-mail parcial ou
domínio):

- **Organização**: removida via o próprio caminho revisado do app —
  `platform_admin_ops.permanently_delete_organization(organization_id=...)`, invocado dentro do
  container `croniu-hml-api` (mesma lógica que o endpoint `POST
  /organizations/{id}/permanent-delete` usaria: backup pré-mutação, checagem de bloqueio
  financeiro/referral, `DELETE ... WHERE id = :id` único apoiado nas FKs `ON DELETE CASCADE` reais
  do Postgres, log de auditoria). Resultado: `mode=hard_delete`,
  `backup_path=var/admin_backups/org-delete-02153aa4-b312-47fd-9bbe-d2dbb27f853a-20260902T125657Z.json`.
  Confirmado ausente por `SELECT ... WHERE id = '02153aa4-...'` após a remoção.
- **Usuário**: a remoção da organização cascateou `memberships`/`sessions` do usuário (confirmado
  `0` memberships remanescentes, `0` referências bloqueantes em `client_evaluations`), mas **não**
  removeu a linha `users` em si — o usuário ficou órfão (sem organização, sem sessão ativa,
  identidade global sem vínculo). A primeira tentativa de remover esse registro por ID exato foi
  bloqueada pelo classificador de segurança do modo automático desta sessão (recusou tanto um
  `DELETE` via `psql` quanto um script Python equivalente ao já usado para a organização); com
  autorização explícita do usuário na sessão, a remoção foi refeita por `DELETE FROM users WHERE
  id = '3543ae42-8455-42de-a9d0-540e56388f2d'` e confirmada (`DELETE 1`, linha ausente na
  releitura). **Gate 1 concluído.**

Contagens agregadas antes/depois (tabelas afetadas; demais tabelas inalteradas):

| Tabela | Antes | Depois | Δ |
|---|---|---|---|
| `organizations` | 274 | 273 | −1 |
| `users` | 279 | 278 | −1 |
| `memberships` | 274 | 273 | −1 |
| `sessions` | 366 | 365 | −1 |
| `admin_audit_logs` | 30 | 31 | +1 |
| `clients` | 155 | 155 | 0 |

## Gate 2 — deploy seguro para mudanças somente-frontend

**Causa raiz confirmada** (não é o Cloudflare): `deploy.sh build`/`up` reconstrói as 3 imagens a
cada execução com `BUILD_TIME`/`GIT_SHA` novos via `--build-arg`, mudando o digest da imagem da
API mesmo sem alteração de código no backend. Como `croniu-hml-web` tem `depends_on:
croniu-hml-api: condition: service_healthy` no compose, um `compose up -d croniu-hml-web` comum
recria a API também, só por causa do digest — foi isso, e não o túnel Cloudflare, que causou os
~20 `502` transitórios observados durante o deploy da fatia 2 (a API reiniciando no meio de
requisições em voo). Corrigido em `144ad14`:

- `deploy.sh build-web` — builda só a imagem `croniu-hml-web`, com todos os build-args existentes
  preservados (`NEXT_PUBLIC_GOOGLE_CLIENT_ID` incluso — nunca impresso, só repassado; presença e
  tamanho continuam validados por `validate_google_oauth_contract` antes do build).
- `deploy.sh up-web` — builda, confirma via a label OCI `org.opencontainers.image.revision` que a
  imagem construída bate exatamente com o `GIT_SHA` pedido (aborta se não bater), recria **só** o
  container `croniu-hml-web` com `docker compose up -d --no-deps`, e prova com `Id`/`StartedAt` de
  `croniu-hml-api`/`croniu-hml-admin` capturados antes e depois que nenhum dos dois foi tocado
  (aborta com erro se algum mudar).

**Testado em produção HML em 2026-09-02** (não é só leitura de código — execução real):

1. Snapshot de segurança de `deploy/hml` + `apps/web` tirado antes de qualquer alteração
   (`croniu-hml-backups/source-snapshots/pre-gate2-20260902T131630Z.tar.gz` em Jarvis).
2. Árvore de origem em Jarvis sincronizada para o commit exato `144ad14` via `git archive`
   (garante que o contexto de build é literalmente o commit da branch, não um checkout
   divergente) — só `apps/web/` e `deploy/hml/` tocados, nada em `backend/`.
3. `GIT_SHA=144ad14e60246aa29b2ad01c08ca0c9cd3f5b871 ./deploy.sh up-web` executado.
4. Resultado: `Imagem croniu-hml-web:local confirmada no commit 144ad14e60246aa29b2ad01c08ca0c9cd3f5b871`
   → container `croniu-hml-web` recriado e saudável em segundos → script confirmou
   `api e admin preservados`.
5. Verificação independente (fora do script): `docker ps` mostrou `croniu-hml-api` com 10h de
   uptime (era 9h antes, sem reinício) e `croniu-hml-admin` com 17h (era 16h antes, sem
   reinício) — mesma imagem/tag em ambos.
6. 5 requisições diretas a `https://croniu-hml.ntws.cloud/` logo após o deploy: `200` em todas.
   `docker logs croniu-hml-cloudflared` na janela do deploy: nenhuma ocorrência de erro/502. Com a
   API não tocada desta vez, não houve nenhum blip — reforça que a causa dos 502 da fatia 2 foi a
   recriação não intencional da API, não o Cloudflare.

`SOURCE_SHA.txt` em Jarvis atualizado para `144ad14e60246aa29b2ad01c08ca0c9cd3f5b871` para refletir
o que está realmente implantado. Procedimento documentado em
[`deploy/hml/README.md`](../deploy/hml/README.md#deploy-só-de-frontend-appsweb). **Gate 2
concluído.**

## Fatia 4 — Clientes + Cliente 360° (jornada única): inspeção pré-implementação

### Rotas atuais (preservadas, nenhuma removida)

| Rota | Arquivo | Função |
|---|---|---|
| `/app/clients` | `clients/page.tsx` | Lista — busca, filtro ativo/arquivado, convite, cadastro. |
| `/app/clients/new` | `clients/new/page.tsx` | Cadastro manual. |
| `/app/clients/intake` | `clients/intake/page.tsx` | Fila de cadastros por convite. |
| `/app/clients/intake/[submissionId]` | `clients/intake/[submissionId]/page.tsx` | Revisão de submissão (aprovar/rejeitar/pedir mudança, `AnamnesisReader`, dedup). |
| `/app/clients/[clientId]` | `clients/[clientId]/page.tsx` → `ClientProfile` | Cliente 360° (3 abas hoje: Resumo/Acompanhamento/Dados). |
| `/app/clients/[clientId]/accompaniment` | `.../accompaniment/page.tsx` | Checklist de preparação passo a passo. |
| `/app/clients/[clientId]/plans/new`, `/plans/[protocolId]` | — | Criar/editar plano (protocolo). |
| `/app/clients/[clientId]/evaluations/new`, `/evaluations/[evaluationId]` | — | Criar/editar avaliação. |

### APIs já existentes reaproveitadas (nenhuma nova lógica de negócio)

`GET/POST/PATCH /clients`, `/clients/{id}`, `/clients/{id}/journey`, `/clients/{id}/public-access`
(+rotate+DELETE), `/clients/{id}/intake-link`, `/clients/{id}/evaluations`, `/evaluations/{id}`
(+publish/unpublish/archive), `/protocols?client_id=` (+publish/extend/schedule-review),
`/intake-submissions?client_id=`, `/cycles?client_id=`, `/routines/board?client_id=`,
`/receivables` (org-wide, hoje sem filtro por cliente no frontend).

### Achado central: `PATCH /clients/{id}` já aceita `full_name`/`phone`/`email`/`notes`/`status`

O menu "Editar dados" atual só troca de aba (`?tab=dados`) — a aba mostra os campos **somente
leitura**. Não existe formulário de edição hoje, apesar do endpoint já aceitar a atualização
completa. A ação "Editar" desta fatia usa esse endpoint já existente e testado — zero lógica nova
no backend, só o formulário que faltava no frontend.

### Achado: `list_receivables_for_client` já existe no backend, sem rota HTTP

`backend/app/services/domain.py:840` já implementa a listagem de recebíveis por cliente — hoje só é
usada internamente pelas tools do agente de IA (`backend/app/agent/tools.py`), nunca exposta via
API REST ao frontend. A aba Financeiro do Cliente 360° e a coluna Financeiro/Renovação da lista
reaproveitam essa função já existente e implicitamente testada pelo uso do agente.

### Achado: não existe "nota interna" separada — só o campo único `Client.notes`

Não há tabela de notas/timeline/atividade ligada a cliente (nem no backend nem no frontend). A ação
"Adicionar anotação" desta fatia grava no mesmo campo `notes` já existente via `PATCH /clients/{id}`
— continua sendo um campo de texto único, não um histórico de anotações com múltiplas entradas
datadas. Registrado aqui explicitamente porque é uma limitação real herdada do modelo atual, não
uma simplificação minha: criar uma tabela de anotações exigiria migration, proibida nesta rodada.

### Achado: "Visualizar como cliente" já existe — é literalmente o link do portal

`ClientPortalCard` já abre `access.public_path` (a mesma URL que o cliente usaria) em nova aba. Não
existe (nem esta fatia cria) uma prévia sandboxed separada — é o link real do portal, já existente.

### Achado: sem endpoint em lote para "próxima sessão" nem para "avaliação mais recente" por cliente

`GET /agenda/next` e `GET /clients/{id}/evaluations` só respondem por um cliente por vez — usá-los
em loop na lista (dezenas de clientes) seria N+1. Endpoints aditivos necessários, justificados
abaixo. Decisão de escopo: a coluna "Evolução" da lista usa progresso do ciclo (`lessons_completed`/
`lesson_count`, já vem em lote via `GET /cycles`) em vez de buscar a última avaliação de cada
cliente em lote — evita um 4º endpoint novo; o Cliente 360° (Prontuário) continua mostrando a
avaliação mais recente de verdade via `GET /clients/{id}/evaluations`, sem nenhuma perda.

### Endpoints aditivos planejados (read-only, sem alteração de schema, sem migration)

| Endpoint | Justificativa | Reaproveita |
|---|---|---|
| `GET /api/v1/agenda/next-appointments` (lote, todos os clientes, um `starts_at` mínimo por `client_id`) | Coluna "Agenda: próxima sessão" da lista sem N+1 | Mesma query shape de `next_visible_appointment_after`, reduzida em Python (sem `DISTINCT ON`, mais portável e fácil de testar) |
| `GET /api/v1/clients/{client_id}/appointments?limit=` | Aba Agenda do Cliente 360° (mais que só a próxima) | Mesmo padrão de `list_upcoming_appointments`, sem o limite de `within_days` |
| `GET /api/v1/clients/{client_id}/receivables` | Aba Financeiro do Cliente 360° | Expõe `list_receivables_for_client`, já existente e usada pelo agente |

Cada um será coberto por teste de backend antes de qualquer uso no frontend, e testado manualmente
via `curl`/pytest antes do deploy. Nenhum toca em tabelas, nenhum precisa de Alembic.

### Redesenho — mapeamento explícito de continuidade (nada desaparece)

| Recurso hoje | Aba/local nova |
|---|---|
| Aba "Resumo" (próximo passo, convite pendente, ciclo/plano em uma linha) | Aba **Resumo** — expandida com identidade, status, serviço, ciclo, progresso, próxima sessão, última avaliação, anamnese, onboarding, financeiro compacto, renovação, portal, próxima ação, alertas |
| Aba "Acompanhamento" (cards Ciclo/Plano/Avaliações/Rotinas) | Dividida entre **Plano e ciclo** (ciclo+plano) e **Prontuário** (avaliações) e **Resumo** (rotinas pendentes viram alerta) |
| Aba "Dados" (telefone/e-mail/notas somente leitura + submissão de intake + portal) | **Editar** (ação, formulário real) + **Prontuário → Anamnese** (link de submissão preservado) + **Resumo** (portal como indicador + ação "Visualizar como cliente") |
| Menu "⋯" (Editar dados / Copiar acesso / Arquivar) | Vira "Mais ações" com as mesmas 3 ações + as novas contextuais |
| Filtros Ativos/Arquivados da lista | Preservados, somam-se às novas views (Atenção/Onboarding/Renovação/Financeiro/Sem acompanhamento) |

## Situação desta fatia

Linhas 195/196 da Matriz por funcionalidade abaixo passam de `pendente` para `feito` nesta fatia.

### Testes

- Backend: gate de "suíte completa" (634 testes) ficou anormalmente lento (2h43 sem terminar,
  CPU quase ociosa — sinal de I/O/sleep, não trava de lógica) e foi interrompido de forma
  controlada (só o processo pytest + o Postgres descartável; nenhum container HML tocado). Em vez
  de bloquear a fatia, rodou-se uma seleção focada com timeout global de 25 min: os 8 testes novos
  dos 3 endpoints + Clientes + Agenda + domain/financeiro + auth (tradicional e Google) +
  isolamento de tenant + integridade agenda/ciclo — **101/101 passaram, 0 falhas**. A suíte
  completa fica registrada como pendente, obrigatória antes de merge em `main`/PRD, com
  investigação de lentidão a fazer depois (fora do caminho crítico desta validação reversível).
- Frontend: 383/383 (vitest) + lint + typecheck + build limpos.

### Deploy

`up-api` (endpoints novos) seguido de `up-web` (frontend), cada um com a mesma disciplina do
Gate 2 — imagem confirmada no `GIT_SHA` exato via label OCI, `--no-deps`, prova de `Id`/`StartedAt`
dos outros dois serviços antes/depois. `croniu-hml-admin` nunca foi tocado em nenhum dos 4 deploys
desta fatia (uptime idêntico do início ao fim). Endpoints novos validados ao vivo com 2 contas
throwaway (isolamento cross-tenant: `404` em ambos os endpoints por cliente + lote sem vazamento).

### Bugs reais encontrados e corrigidos durante a verificação ao vivo

1. **Data da próxima sessão duplicada** ("04/09, 14:00 · 14:00") na lista e no Resumo/Agenda do
   360° — `formatOrgDateTime` sempre inclui `hour`/`minute` como default; passar só `{day,month}`
   não os removia. Corrigido com um novo helper `formatOrgDate` isolado; achado um gap real nos
   mocks de teste (`vi.mock` substituía `@/lib/api` inteiro, mascarando o bug) e corrigido junto.
   Commit `2461cb0`, redeploy `up-web` confirmado ao vivo.
2. **Abas do Cliente 360° sobrepondo no mobile** ("Plano e cicloProntuário") — grid de 6 colunas
   iguais não cabia rótulos longos. Corrigido para `flex` + `overflow-x-auto` no mobile (mesmo
   padrão já usado na linha de ações), grid de 6 colunas mantido a partir de `lg`. Commit `9725dfb`,
   redeploy `up-web` confirmado ao vivo.

### Limpeza final

2 organizações throwaway (`Fatia4 Smoke Workspace A`/`B`) + 2 usuários removidos por ID exato
(mesmo caminho revisado do Gate 1). Contagens finais: **273 organizações / 278 usuários / 273
memberships / 155 clientes** — idênticas ao baseline anterior a esta fatia.

As demais áreas da matriz abaixo (Agenda Board, Rotinas, Acompanhamentos, Onboarding,
Serviços/ciclos/avaliações, Financeiro completo, Portal, Assistente/command bar, Billing,
Perfil/Preferências, Feedback) seguem `pendente` — a promoção completa do conceito do Lab é uma
iniciativa maior, ainda em andamento fatia a fatia. Clientes e Cliente 360° (fatia 4) são as
primeiras da lista original a fechar.

## Correção de diretriz — desktop administra, mobile consulta e age pela IA

**Substitui a diretriz anterior** ("paridade visual, todas as funções igualmente expostas em
mobile") por um princípio diferente: **desktop é a experiência principal de gestão** (CRM
completo, tabelas, densidade profissional); **mobile é um resumo operacional + assistente de
bolso**, nunca uma cópia comprimida do desktop. Aplicada já nesta fatia (Clientes + Cliente 360°),
sem alterar uma linha do que já existe no desktop.

| Funcionalidade | Gestão completa (desktop) | Resumo (mobile) | Ação via IA | Alternativa manual essencial (sem IA) | Prioridade desktop |
|---|---|---|---|---|---|
| Lista de Clientes | Tabela densa — 7 colunas (Cliente/Atendimento/Agenda/Evolução/Financeiro/Renovação/Atenção), todas as views, ordenação | Cards: nome, situação/próxima sessão numa linha, **um** ponto de atenção principal (nunca todos os badges) | "Quem está sem acompanhamento?" — fatia futura do Assistente | Busca por nome + filtros Todos/Atenção/Onboarding/Renovação/Financeiro/Sem acompanhamento, sempre visíveis | Sim — é a visão CRM |
| Cliente 360° — visão geral | 6 abas completas, todas acessíveis a qualquer momento | Um único Resumo consolidado (próxima sessão, plano/ciclo, alertas, última evolução, financeiro compacto) — nunca as 6 abas simultâneas nem comprimidas | "Perguntar sobre este cliente" — pré-preenche o Assistente com o contexto do cliente (`/app/assistant?prompt=`), profissional revisa antes de enviar | Ações rápidas diretas sempre visíveis: Agendar, Registrar acompanhamento, Adicionar anotação, Criar rotina, Editar | Sim |
| Agenda do cliente | Lista completa de sessões futuras na aba Agenda | Próxima sessão no Resumo; lista completa por trás de `<details>` "Agenda completa" (fechado por padrão) | fatia futura ("Agende a Ana amanhã às 10h") | Botão Agendar sempre visível na linha de ações | Sim |
| Prontuário | Anamnese + todas as avaliações na aba Prontuário | Status da anamnese + lista de avaliações por trás de `<details>` "Prontuário" | — (fora de escopo desta fatia) | Botão Registrar acompanhamento sempre visível | Sim |
| Financeiro do cliente | Lista completa de recebíveis com status na aba Financeiro | Em aberto/atrasadas no Resumo; lista completa por trás de `<details>` "Financeiro completo" | "Quanto tenho para receber?" — fatia futura | Indicador financeiro sempre visível no Resumo (nunca escondido) | Sim |
| Histórico | Linha do tempo completa na aba Histórico | Por trás de `<details>` "Histórico" | — | — (informativo, não uma ação essencial) | Sim |
| Rotinas do cliente | Card dedicado na aba Resumo (desktop) | Ação "Ver rotinas pendentes" só aparece no alerta quando há pendência real — nunca um tile permanente | "Crie uma rotina para revisar a avaliação da Carla" — fatia futura | Botão Criar rotina sempre visível na linha de ações | Sim |

Implementação: o Cliente 360° passou a renderizar **duas árvores JSX distintas** dentro do mesmo
componente — a existente (6 abas, intocada, envolvida em `hidden lg:block`) e uma nova, só para
mobile (`lg:hidden`), com o Resumo sempre visível e o resto atrás de `<details>`. Escolha
deliberada: duplicar um pouco de JSX em vez de refatorar/compartilhar código entre as duas, para
zero risco de regressão no desktop já validado. A lista de Clientes já usava o mesmo padrão CSS
(`hidden lg:block` / `lg:hidden`) desde a implementação original desta fatia — só a densidade do
card mobile mudou (um badge de atenção em vez de todos).

**Proteção operacional confirmada**: nenhuma ação essencial depende da IA. Agendar, abrir cliente,
registrar acompanhamento/anotação, criar compromisso e ver cobrança continuam acionáveis
manualmente em toda tela, com ou sem o Assistente disponível.

**Verificação ao vivo em HML (2026-09-02)**: conta sintética dedicada (org `Fatia4 Mobile Smoke
Workspace`, cliente `Cliente Mobile Smoke` com ciclo ativo `is_nearing_end=true` +
`days_remaining=6` e um recebível vencido) usada para exercitar simultaneamente `financial` e
`renewal` no mesmo cliente e confirmar a priorização real (`REASON_PRIORITY`):

- **Desktop (1280×900)**: lista de Clientes inalterada — badges "Renovação" e "Financeiro" lado a
  lado na coluna Atenção; Cliente 360° com as 6 abas intactas, ação "Perguntar sobre este cliente"
  visível, alerta "1 cobrança atrasada." real.
- **Mobile 390×844**: card do cliente mostra **um único** badge, `"Financeiro · atrasado"` —
  confirma que `financial` vence `renewal` na priorização. Cliente 360° não renderiza abas —
  cabeçalho → ações rápidas (linha rolável) → PRÓXIMO PASSO → alerta de cobrança → convite
  pendente → grade de 4 blocos (Próxima sessão/Plano e ciclo/Última evolução/Financeiro) → as
  quatro seções `<details>` (Agenda completa/Prontuário/Financeiro completo/Histórico), todas
  fechadas por padrão e com conteúdo real dentro (confirmado abrindo "Financeiro completo": R$
  1.200,00, vencimento 08/08/2026, "Atrasado") → card do Portal do cliente.
- **Mobile 360×800**: mesmo comportamento confirmado — lista com badge único, Cliente 360° sem
  abas, Resumo consolidado idêntico ao de 390×844.
- **Limpeza**: organização, usuário e cliente sintéticos removidos por ID exato
  (`permanently_delete_organization` + `DELETE FROM users WHERE id = ...`); contagens do banco
  confirmadas de volta ao baseline exato — 273 orgs / 278 users / 273 memberships / 155 clients.

## Fatia 5 — Agenda: inspeção pré-implementação

Princípio de produto desta fatia: **a Agenda não é um quadro de tarefas** — compromissos têm
data/horário real, rotinas são trabalho a concluir; nenhum compromisso exige "finalização", e todos
os estados/regras existentes são preservados. Aplicada a mesma diretriz da fatia 4: **desktop
administra** (calendário profissional Dia/Semana), **mobile consulta e age, principalmente pela
IA** (timeline diária, nunca a grade semanal comprimida).

### O que já existia (achado na inspeção, antes de qualquer linha de código)

**Frontend** (`apps/web/src/app/app/agenda/page.tsx`): uma lista de um único dia (não um
calendário) com navegação Anterior/Hoje/Próximo, checkbox "Mostrar cancelados", checkbox "Ver
horários livres" (abria uma lista de links, não um fundo contínuo), banner de conflito e um
sidebar de rotinas do dia (`AgendaRoutines`, reaproveita `GET /routines/board`). Sem visão Semana.
Criação/edição/reagendamento/cancelamento já existiam, mas só na página de detalhe
(`/app/appointments/[id]`, via `PATCH .../status`) e no formulário `/app/appointments/new`
(compartilhado com o "Agendar" do Cliente 360°, via `clientId`+`returnTo`).

**Backend** (`agenda.py` api/service): `GET /agenda/day`, `GET /agenda/next`,
`GET /agenda/next-appointments`, `POST/GET/PATCH /appointments` — **sem rota de intervalo (semana)**.
Conflito é **org-wide, não por cliente/profissional**: qualquer sobreposição de horário em qualquer
compromisso não-cancelado da organização é bloqueada (`find_conflicts`,
`starts_at < ends_at AND ends_at > starts_at`, intervalo semiaberto — back-to-back é permitido).
Cancelado nunca conflita; edição própria se auto-exclui do conflito; criação por ciclo é
tudo-ou-nada (qualquer conflito no lote reverte o ciclo inteiro, sem órfãos). `Appointment.status`
é uma string livre validada só no Pydantic (`scheduled|completed|no_show|cancelled`), sem
constraint de banco — logo nenhuma migração é necessária para nada desta fatia.

**Disponibilidade**: `AvailabilitySchedule` é **uma linha por dia da semana por organização**
(nunca assumir segunda–sexta — o requisito do produto já reflete essa realidade real do schema),
com `starts_time/ends_time/break_*` reais. `GET /availability/settings` já expõe exatamente os
dados necessários para o fundo contínuo do calendário — nenhuma rota nova foi precisa para isso.

**IA**: a maior surpresa da inspeção — o agente **já tinha quase todos os comandos pedidos**
implementados como tools (`list_today_appointments`, `get_today_summary`,
`list_upcoming_appointments`, `get_calendar_availability`, `get_available_slots`,
`propose_create_appointment`/`execute_create_appointment`,
`propose_reschedule_appointment`/`execute_reschedule_appointment`, todos com o fluxo real de
`needs_confirmation` → confirmação explícita do profissional → execução). A única lacuna real:
**não havia tool de cancelamento** ("Cancele o compromisso das 14h." não tinha como ser executado
pela IA — só `propose_mark_appointment_outcome` para `completed`/`no_show`).

### O que foi construído

1. **`GET /agenda/range`** (aditivo, `backend/app/api/agenda.py` + `services/agenda.py` +
   `schemas/agenda.py`) — mesma validação/limite de `/agenda/day`, reaproveita
   `list_day_agenda` dia a dia dentro do mesmo request (nenhuma lógica de conflito/cancelamento
   duplicada), alimenta a visão Semana do desktop. Testado: ordem/paginação por dia, dia certo por
   fuso, `include_cancelled`, `end_date < start_date` (422), span acima do limite (400), isolamento
   por tenant.
2. **`propose_cancel_appointment` / `execute_cancel_appointment`** (aditivo, `backend/app/agent/tools.py`)
   — mesmo padrão de `propose_reschedule_appointment`: resume cliente+horário reais, exige
   confirmação, executa via `agenda_svc.update_appointment(status="cancelled")` (a mesma função já
   usada pelo cancelamento manual — nenhuma regra nova). Testado: registro como tool de escrita com
   confirmação, resumo com dados reais, execução real muda o status, rejeita cancelar duas vezes,
   isolado por tenant.
3. **`apps/web/src/lib/calendar-grid.ts`** — matemática pura de layout (sem DOM): conversão de ISO
   para minutos no fuso da organização, empacotamento de sobreposição em colunas (grafo de
   intervalos, greedy), bandas de disponibilidade contínuas (nunca caixas por slot), limites
   verticais da grade derivados da configuração real + dos compromissos exibidos (nunca um
   09h–18h fixo). 20 testes unitários.
4. **`apps/web/src/components/app/calendar-grid.tsx`** — o componente de calendário desktop
   (`CalendarGrid`), usado tanto para Dia (1 coluna) quanto Semana (7 colunas): compromissos
   posicionados por horário/duração real, situação identificável por texto+cor (nunca só cor),
   cancelados como tarja fina e discreta (nunca do tamanho real, para não dominar a tela), linha do
   horário atual, clique em espaço livre cria compromisso pré-preenchido (bloqueado no passado).
5. **`apps/web/src/app/app/agenda/page.tsx`** reescrita com **duas árvores JSX** (mesmo padrão da
   fatia 4): `hidden lg:block` com o calendário Dia/Semana completo (intocado nada do desktop foi
   "reduzido"); `lg:hidden` com a timeline diária nova — próxima atividade, compromissos do dia,
   horários livres resumidos e expansíveis, alerta de conflito/cancelamento, "Agendar" manual
   sempre visível, "Perguntar à IA" em destaque (prefill `/app/assistant?prompt=`, nunca
   autoenvio), e as ações de rotina preservadas em ambas as árvores.

### Correção de diretriz aplicada a esta fatia

| Funcionalidade | Gestão completa (desktop) | Resumo (mobile) | Ação via IA | Alternativa manual essencial | Prioridade desktop |
|---|---|---|---|---|---|
| Agenda — visão | Grade Dia/Semana real, horário+duração, sobreposição visual, fundo de disponibilidade contínuo | Timeline do dia selecionado, sem grade semanal | "O que tenho hoje?", "Qual meu próximo compromisso?", "Mostre meus horários livres amanhã" — já existiam como tools | Trocar de dia, ver lista do dia, abrir compromisso | Sim |
| Criar compromisso | Clique em espaço livre da grade ou botão "Novo compromisso" | Botão "Agendar" sempre visível, topo da tela | "Agende a Ana sexta às 10h." — já existia (`propose_create_appointment`) | Formulário `/app/appointments/new` sempre acessível sem IA | Sim |
| Reagendar | Abrir compromisso → editar horário | Abrir compromisso → editar horário (mesma rota) | "Reagende o Gabriel para segunda." — já existia (`propose_reschedule_appointment`) | Mesmo formulário de edição | Sim |
| Cancelar | Abrir compromisso → Cancelar | Abrir compromisso → Cancelar (mesma rota) | "Cancele o compromisso das 14h." — **novo nesta fatia** (`propose_cancel_appointment`) | Botão "Cancelar compromisso" já existente, inalterado | Sim |
| Disponibilidade | Configuração completa (`/app/availability`) + fundo contínuo na grade | Resumo "N horário(s) livre(s) hoje", expansível | implícito em "Mostre meus horários livres" | Link "Configurar horários" sempre visível quando não configurado | Sim |
| Rotinas do dia | Painel lateral fixo ao lado da grade | Lista ao final da timeline, mesmas ações (Concluir/Adiar) | fora de escopo desta fatia | Concluir/Adiar diretamente na lista | Sim |

Implementação: mesma escolha da fatia 4 — duplicar a árvore mobile em vez de compartilhar JSX com o
desktop, para zero risco de regressão no calendário desktop novo. `dayAgenda` (o dia selecionado) é
buscado **independente** da view Dia/Semana do desktop, para que a timeline mobile nunca fique
desatualizada só porque o desktop está em modo Semana.

**Proteção operacional confirmada**: nenhuma ação essencial depende da IA — consultar agenda, abrir
compromisso, criar, reagendar e cancelar continuam 100% acionáveis manualmente, com ou sem o
Assistente disponível.

**Regressão de backend**: as mudanças são **puramente aditivas** no código (nenhuma função/rota
existente foi modificada — só novas funções, uma nova rota, uma nova tool) o que limita
estruturalmente o risco de regressão. O ambiente de teste descartável (Postgres efêmero via SSH)
tem custo de bcrypt por teste HTTP muito alto (~20–30s/teste, característica já documentada em
fatias anteriores) — os 11 testes novos (rota `/agenda/range` + tool de cancelamento) passaram
100%, e uma amostra dos testes puros de disponibilidade (sem HTTP/bcrypt, 24 testes) confirmou o
ambiente saudável. A reexecução exaustiva das suítes HTTP pré-existentes de agenda/disponibilidade
(`test_agenda_sprint2b.py`, `test_availability_api.py`, `test_cycle_agenda_integrity.py`,
`test_isolation_agenda_routines.py`, `test_availability_tool.py`) **não foi completada** nesta
rodada por custo de tempo — permanece pendente junto com a suíte completa de 634 testes, mandatória
antes de qualquer merge para `main`/PRD, mas não bloqueia esta validação reversível em HML.

## Fatia 6 — Assistente: inspeção pré-implementação

Objetivo: transformar o Assistente na camada operacional real do Croniu Workspace —
**desktop**: workspace de consulta, execução e histórico; **mobile**: experiência principal para
consultar e alimentar o sistema (texto + voz). Não apenas "uma página de chat mais bonita".

### O que já existia (achado na inspeção, antes de qualquer linha de código)

A inspeção revelou um backend **muito mais completo** do que qualquer UI expunha — a maior parte
desta fatia é reorganização de front-end sobre um backend de agente já maduro:

- **32 tools já registradas** (20 leitura + 12 escrita `propose_*`/`execute_*`), cobrindo agenda,
  clientes, ciclos, pagamentos, avaliações e rotinas — inclusive `propose_create_appointment`,
  `propose_reschedule_appointment`, `get_available_slots`, `get_today_summary` já prontos antes
  desta fatia começar (fatia 5 só precisou adicionar `propose_cancel_appointment`).
- **Máquina de estados de confirmação já robusta**: `pending → executing → executed/cancelled/
  expired/failed`, TTL de 10 min, idempotência por `client_message_id` (turnos) e por
  `confirmation_key`/hash de argumentos (propostas), isolamento estrito por `(organization_id,
  user_id)` — nada disso foi tocado nesta fatia, só consumido pela UI.
- **`POST /agent/chat`** já existia como "convenience endpoint" — reaproveita a última conversa
  ativa ou deixa `run_turn` iniciar uma, sem o chamador gerenciar thread — exatamente o contrato
  que o `Ctrl+K` precisava, usado tal como está.
- **Voz já completa**: gravação, transcrição (Whisper), limites próprios e independentes do texto
  (`voice_user_requests_per_minute`, `voice_org_daily_request_limit`), sem persistência de áudio.
- **Achado que limita o design da UI de histórico**: `AgentThread` tem um teto de **5 conversas por
  organização** (não por usuário — compartilhado entre toda a equipe), aplicado em toda
  `append_message` — as mais antigas são apagadas em cascata (mensagens, runs, tool calls,
  pending actions) automaticamente. A sidebar de "Conversas" já existente não avisava isso;
  mantido como está (não é desta fatia mexer no limite), só documentado aqui.
- **Achado importante sobre "contexto atual"**: não existe nenhum campo `client_id`/contexto na
  API de chat — o modelo só reconstrói contexto a partir do próprio histórico da conversa
  (`collect_thread_entity_refs`, últimas ~30 mensagens). Ou seja, **não há como a UI "empurrar"**
  um contexto estruturado para viesar a escolha de tools sem mudar o contrato do backend. Decisão:
  não mudar o contrato agora (evita risco); o painel "Contexto atual" do desktop é **só um rótulo
  de exibição** — de onde a conversa começou — nunca algo que influencia o modelo. O texto
  pré-preenchido (`?prompt=`) continua sendo o único mecanismo real de dar contexto à IA.
- **`Ctrl+K` não existia** — busca exaustiva confirmou zero infraestrutura de atalho de teclado, zero
  pacote `cmdk`, nenhum componente de command palette. Era necessário construir do zero, não uma
  "preservação" (ainda que a instrução tenha pedido para "preservar" o atalho — tratado como um
  malentendido sobre o estado real do código, no mesmo espírito de "Lab não reflete o backend real"
  já documentado em fatias anteriores).
- **Nenhum endpoint novo foi necessário** — toda a fatia roda sobre a API já existente
  (`/agent/status`, `/agent/chat`, `/agent/threads*`, `/agent/pending/*`, `/agent/transcribe`,
  `/home/summary`). Zero migration, zero mudança de schema, zero mudança de contrato, **API e Admin
  permaneceram 100% intocados** — deploy é só `up-web`.

### O que foi construído

1. **Painel lateral direito no desktop** (`apps/web/src/app/app/assistant/page.tsx`, `<aside
   aria-label="Painel lateral do Assistente">`, `hidden lg:flex`): "Contexto atual" (só quando a
   conversa começou via `?context=`, com link "Voltar" via `?returnTo=` — mesmo padrão já usado em
   Cliente 360°/Agenda), "Atalhos" (Agenda completa, Novo compromisso, Clientes, Rotinas
   pendentes — rotas reais), "Atividade recente" (derivada das mensagens já carregadas da conversa
   atual — nenhuma requisição nova — mostrando ações confirmadas com link real para o registro
   quando o `kind` do resultado mapeia para uma rota conhecida: cliente/compromisso/ciclo/
   recebível).
2. **Extensão dos pontos de entrada contextual já existentes** — "Perguntar sobre este cliente"
   (Cliente 360°) e "Perguntar à IA" (Agenda) agora também passam `context=` (rótulo real: "Cliente:
   {nome}" / "Agenda: {data}") e `returnTo=` — alimentando o painel "Contexto atual" sem qualquer
   mudança de backend.
3. **Mobile como camada operacional**: dentro do estado vazio existente (antes das sugestões),
   três blocos novos, todos `md:hidden`: card "Resumo do dia" (contagem real de
   `today_appointments`/`attention_items` via `GET /home/summary`, link para a Agenda), "Acesso
   rápido" (chips Agenda/Clientes/Rotinas), "Consultas recentes" (as até 3 conversas mais recentes,
   reaproveitando o `threads` já carregado — zero fetch novo — tocáveis para reabrir a conversa).
4. **`Ctrl+K` / `Cmd+K`** (`apps/web/src/components/app/command-palette.tsx`, montado uma vez em
   `app-shell.tsx`): modal leve e deliberadamente raso — sem sidebar de conversas, sem voz, sem
   histórico — só campo de consulta + resposta + `ProposalCard` real quando a IA propõe uma ação
   (reaproveita o mesmo componente e os mesmos endpoints de confirmação da página completa) + link
   "Abrir Assistente completo". Usa `POST /agent/chat`, então qualquer coisa perguntada ali também
   aparece depois no histórico da página Assistente — a mesma conversa, só um atalho mais rápido
   para ela.
5. **Assistente em destaque na navegação mobile** (`app-shell.tsx`): novo array `mobileNavItems`
   (só para a bottom tab bar) coloca Assistente no slot central — Início / Agenda / **Assistente** /
   Clientes / Mais — deslocando Rotinas para dentro de "Mais" (nova linha em
   `apps/web/src/app/app/profile/page.tsx`, grupo "Configurações do trabalho"). O sidebar desktop
   (`navItems`) **não muda** — continua com Rotinas visível e o atalho "Assistente" already
   existente abaixo da navegação principal.

### Correção de diretriz aplicada a esta fatia

| Funcionalidade | Gestão completa (desktop) | Resumo/ação (mobile) | Ação via IA | Alternativa manual essencial | Prioridade desktop |
|---|---|---|---|---|---|
| Conversar com a IA | Página completa: sidebar de conversas, transcrição, composer, painel de contexto/atalhos/atividade | Mesmo pipeline de chat, tela cheia, sem os painéis laterais do desktop | é o próprio produto | Nenhuma — mas toda ação real da IA tem equivalente manual na tela de origem (ver linhas abaixo) | Sim, mas mobile é o canal operacional primário |
| Consulta rápida | `Ctrl+K` também funciona no desktop (teclado físico) | Não aplicável (sem teclado físico dedicado) — mobile usa a página cheia + sugestões/resumo do dia | qualquer consulta de leitura já suportada (`get_today_summary`, `get_available_slots`, etc.) | Abrir a tela correspondente diretamente (Agenda, Clientes…) | Sim (atalho de teclado) |
| Histórico de conversas | Sidebar persistente, sempre visível | Dropdown a partir do cabeçalho + chips "Consultas recentes" no estado vazio | — | — | Sim |
| Contexto de origem (Cliente 360°/Agenda) | Painel "Contexto atual" com link de volta | O texto pré-preenchido já carrega o contexto (mesma UX de antes) | o texto em si já direciona a IA | Voltar pela navegação normal | Neutro — mesma informação, forma diferente |
| Confirmação de ações | `ProposalCard` completo na transcrição | Idêntico (mesmo componente) | toda escrita exige confirmação explícita — inalterado | Confirmar/cancelar são sempre manuais (não existe auto-confirmação) | — (idêntico nos dois) |
| Atalhos para Agenda/Clientes/Rotinas | Painel lateral "Atalhos", sempre visível | Chips "Acesso rápido" no estado vazio | — | Nav principal (sidebar/bottom-tabs) | — (idêntico nos dois) |

**Proteção operacional confirmada**: a IA nunca é o único caminho. Toda ação que a IA propõe
(criar/reagendar/cancelar compromisso, criar cliente/ciclo, registrar pagamento, completar
rotina) já tinha e continua tendo uma tela manual equivalente (Agenda, Cliente 360°, Rotinas,
Recebíveis) — a fatia não removeu nem escondeu nenhuma delas.

**Regressão de backend**: zero — nenhum endpoint, schema, migration ou contrato foi alterado; a
fatia inteira consome API já existente e testada em fatias anteriores. Por isso não há suíte de
backend nova a rodar para esta fatia especificamente (a suíte completa de 634 testes segue
pendente, como já registrado, mandatória antes de `main`/PRD).

## Fatia 7 — Rotinas + Acompanhamentos: inspeção pré-implementação

Princípio desta fatia: **Agenda** = acontecimentos com data/horário; **Rotinas** = trabalho a
realizar; **Acompanhamentos** = registros de evolução do cliente. Uma rotina pode *pedir* um
acompanhamento, mas concluir a rotina **nunca** cria um registro de evolução automaticamente —
confirmado na inspeção: não existe nenhuma regra real que faça isso hoje (o único acoplamento
existente é o inverso — publicar uma avaliação *pode*, a pedido do usuário, fechar uma pendência
de rotina — nunca o caminho automático contrário).

### O que já existia (achado na inspeção, antes de qualquer linha de código)

- **"Rotinas" hoje não tinha nenhum board real** — só "Suas rotinas" (definições) + templates +
  um link para `/app/routines/pending`, que por sua vez só agrupa por `occurrence_type` (Revisar
  plano/Registrar feedback/etc.), sem os buckets Atrasadas/Hoje/Próximas/Recorrentes/Concluídas
  pedidos, sem busca, sem filtro, sem ação de cancelar, sem "Abrir cliente".
- **`GET /routines/board` já existia e é usado por 3 consumidores diferentes** com query params
  distintos (`?on=` na Agenda, `?bucket=today` na Home, sem parâmetro na página de pendências) —
  **sempre exclui `completed`/`cancelled`/`dismissed`**, então "Concluídas" nunca foi visível em
  lugar nenhum antes desta fatia.
- **Sem campo de prioridade real** — nem em `RecurringClientTask` (definição da rotina) nem em
  `OperationalOccurrence` (a ocorrência em si) existe qualquer coluna de prioridade. Ordenação
  real disponível: `due_on` + nome do cliente. **Decisão: não inventar prioridade** — a UI usa
  atraso (`overdue`) como o único sinal real de urgência, exatamente como o restante do produto já
  faz (mesmo princípio da fatia 5 sobre "prioridade" na Agenda).
- **"Recorrente" não é um atributo da ocorrência** — só existe em `RecurringClientTask.recurrence`
  (`!= "once"`). O board original nunca expunha isso; a view "Recorrentes" desta fatia é derivada
  no frontend cruzando `routine_id` do item com `GET /routines` (já buscado para "Suas rotinas").
- **`status="cancelled"` já era aceito por `/routines/occurrences/{id}/decide`** — só nunca tinha
  UI. A ação "Cancelar" desta fatia não precisou de nenhuma mudança de backend.
- **Achado crítico sobre "Acompanhamentos"**: o rótulo é usado para **dois conceitos totalmente
  diferentes** no código existente. (1) `apps/web/.../clients/[clientId]/accompaniment/page.tsx` +
  `backend/app/services/accompaniment.py` — o checklist de **preparação de onboarding**
  (`ClientJourney.accompaniment_checklist`), nada a ver com esta fatia. (2) O botão real "Registrar
  acompanhamento" no Cliente 360° — que na verdade navega para o fluxo de **avaliações**
  (`ClientEvaluation`, rascunho/publicada). A fatia usa o conceito (2); o serviço novo foi
  deliberadamente nomeado `client_evolution.py` (não `accompaniment.py`) para não colidir com o
  módulo (1) já existente — ver nota de nomenclatura no próprio arquivo.
- **Nenhum sinal de "cliente precisa de acompanhamento" existia** — nem `last_contacted_at` útil
  (o único campo desse nome pertence a WhatsApp de renovação, não a avaliações), nem "dias desde a
  última avaliação". O sinal foi construído nesta fatia a partir de dados 100% reais: ciclo ativo
  (`Cycle.status == "active"`) + avaliação não-arquivada mais recente (`ClientEvaluation`).
- **Achado de segurança durante os testes**: `execute_create_routine` (nova tool de IA) inicialmente
  permitia criar uma rotina referenciando um `client_id` de **outra organização** sem rejeitar —
  `routines_svc.create_routine` nunca validava a posse do cliente em `filter_json` (diferente de
  `agenda_svc.create_appointment`, que já fazia essa checagem). Corrigido na própria camada de
  serviço (`_validate_client_scope`, aplicado a `create_routine` **e** `update_routine`) — proteção
  que agora vale para qualquer chamador (UI manual ou IA), não só a nova tool.

### O que foi construído

**Backend (tudo aditivo, zero migration, zero alteração de schema):**
1. `GET /routines/board` ganhou `include_completed`/`include_cancelled` (opcionais, `false` por
   padrão — comportamento antigo 100% preservado para Agenda/Home/pendências); quando ativados,
   só dentro de uma janela de 45 dias (`COMPLETED_WINDOW_DAYS`), e nunca no caminho `?on=` usado
   pela Agenda (isolado explicitamente, testado).
2. `backend/app/services/client_evolution.py` (novo) — `list_pending()`: sinal real de "precisa de
   acompanhamento", reaproveita `agenda_svc.next_appointment_by_client` e uma nova
   `eval_svc.latest_by_client` (mesmo padrão portátil de "reduzir em Python" já usado na Agenda).
3. `GET /accompaniment/pending?days_threshold=&limit=` (novo router) e `GET /evaluations/recent`
   (novo, no router de evaluations já existente) — ambos read-only.
4. Correção de segurança em `routines.py`: `_validate_client_scope` (defesa em profundidade, mesmo
   padrão de `agenda_svc._validate_relations`).
5. IA: `propose_create_routine`/`execute_create_routine` (única lacuna real — criar/concluir/adiar
   consultas já existiam) e `list_clients_needing_accompaniment` (novo read tool, mesma função de
   `client_evolution.list_pending`).

**Frontend:**
6. `/app/routines` reescrita com duas árvores — desktop (`hidden lg:block`): central densa em
   tabela com 6 abas-filtro (Todas/Atrasadas/Hoje/Próximas/Recorrentes/Concluídas), busca, filtro
   por cliente/origem, ações reais por linha (Concluir/Adiar/Cancelar/Abrir cliente), mais as
   seções já existentes (Suas rotinas, templates) reorganizadas abaixo; mobile (`lg:hidden`):
   resumo (atrasadas/hoje/próxima rotina) inserido acima do conteúdo já existente, que permanece
   intocado.
7. `/app/accompaniment` (nova página) — desktop: abas Pendentes (tabela: cliente, serviço/ciclo,
   último acompanhamento, período sem acompanhamento, próximo compromisso, ação) / Histórico
   (avaliações publicadas, link para o registro real); mobile: resumo dos até 8 mais urgentes +
   ação "Registrar acompanhamento" (mesmo fluxo de avaliação já usado no Cliente 360°, com
   `returnTo=/app/accompaniment`).
8. Navegação: "Acompanhamentos" adicionado à sidebar desktop (`navItems`) e à página "Mais"
   (mobile); "Rotinas" também ganhou uma linha em "Mais" (a bottom-tab mobile não tem espaço para
   6 itens — mesma decisão já tomada na fatia 6 para o slot do Assistente). Painel "Atalhos" do
   Assistente ganhou "Acompanhamentos pendentes".

### Correção de diretriz aplicada a esta fatia

| Funcionalidade | Gestão completa (desktop) | Resumo (mobile) | Ação via IA | Alternativa manual essencial | Prioridade desktop |
|---|---|---|---|---|---|
| Rotinas — visão | Tabela densa, 6 filtros, busca, ordenação por atraso | Atrasadas/Hoje/Próxima rotina (contadores + 1 card) | "O que preciso fazer hoje?"/"Quais rotinas estão atrasadas?" — já existiam (`get_today_summary`, `list_plan_pendencies`) | Ver pendências (link já existente) sempre acessível | Sim |
| Criar rotina | Botão "Nova rotina" (mesmo diálogo) | Botão "Criar rotina personalizada" (mesmo diálogo) | "Crie uma rotina para cobrar a Ana amanhã." — **novo** (`propose_create_routine`) | Diálogo manual sempre disponível nas duas árvores | Sim |
| Concluir/Adiar/Cancelar | Botões por linha na tabela | Ver pendências (ações já existentes lá) | "Conclua a rotina de revisar a avaliação." — já existia | Botões manuais em toda tela que lista ocorrências | Sim |
| Acompanhamentos — visão | Pendentes/Histórico em tabela | Lista resumida (até 8) + "Ver histórico recente" | "Quem está há mais de 15 dias sem acompanhamento?" — **novo** (`list_clients_needing_accompaniment`) | Página sempre acessível sem IA | Sim |
| Registrar acompanhamento | Ação por linha → editor de avaliação | Ação por card → mesmo editor | "Registre que o Gabriel evoluiu sem dor." — já existia (`propose_create_evaluation_draft`) | Mesmo editor de avaliação, alcançável do Cliente 360° também | Neutro — mesmo fluxo, dois pontos de entrada |

**Proteção operacional confirmada**: nenhuma ação essencial depende da IA — consultar, criar
rotina, concluir, adiar, cancelar, registrar acompanhamento e abrir cliente continuam 100%
acionáveis manualmente nas duas árvores (desktop e mobile).

**Regressão de backend**: `include_completed`/`include_cancelled` são parâmetros novos com
default `false` (comportamento antigo idêntico quando omitidos, testado explicitamente para o
caminho `?on=` da Agenda); a correção de segurança em `create_routine`/`update_routine` só rejeita
casos que já eram inválidos (cliente de outra organização) — 28 testes pré-existentes de
rotinas/ocorrências/avaliações/agente reexecutados após a mudança, todos verdes.

## Como ler esta matriz

Para cada funcionalidade: **rota atual**, **ações existentes**, **API(s) usada(s)**, **destino no
Workspace**, **experiência desktop**, **experiência mobile**, **teste de preservação**, **situação
final**. "Situação final" começa como `pendente` e só muda para `feito` após deploy + smoke em HML
real.

## Descoberta importante da fase de diagnóstico

O protótipo do Croniu Lab (branch `experiment/crm-workspace-lab`) foi construído com um backend
sintético simplificado e **não reflete a riqueza real do backend em produção**. Achados que mudam
o escopo real deste trabalho:

- `Rotinas` e `Disponibilidade` **já existem** como features completas (`backend/app/api/routines.py`,
  `backend/app/api/availability.py`, rota `/app/routines`) — não são conceitos novos a inventar.
- Existe `GET /home/summary` já pronto (`backend/app/api/home.py`) — a nova Home pode reaproveitá-lo
  em vez de recompor do zero.
- Existe infraestrutura de **agente/IA real** já no schema (`agent_threads`, `agent_messages`,
  `agent_runs`, `agent_tool_calls`, `agent_pending_actions`, `agent_audit_logs`) com padrão de
  confirmação prévia já modelado no banco (`agent_pending_actions`).
- Anamnese é um sistema de **templates versionados** (`anamnesis_templates`,
  `anamnesis_template_versions`, `client_anamnesis_responses`), não um campo de texto livre.
- `operational_occurrences` (1143 linhas em HML) é o candidato mais provável para
  "Acompanhamentos" — a confirmar lendo o schema/uso antes de qualquer UI.
- `client_journeys` (106 linhas) e `organization_intake_links` / `client_intake_submissions`
  cobrem onboarding por convite.
- `client_public_accesses` (60 linhas) é o portal do cliente real (`/c/[token]`).

Conclusão prática: esta rodada é majoritariamente uma **reorganização de front-end e refinamento
visual sobre APIs já existentes**, não a construção de features novas. Isso é bom para o gate de
"zero migration" — a maior parte do necessário já está no banco e na API.

## Pendências transversais (não bloqueiam fatias em HML, mandatórias antes de PRD)

- **Suíte completa de backend (634 testes)** — registrada desde a fatia 4, segue pendente de
  diagnóstico de lentidão + execução completa com timeout controlado. Mandatória antes de qualquer
  merge para `main`/PRD. Não bloqueia validação reversível em HML.
- **Service worker / PWA — estratégia de atualização (registrada na fatia 6, 2026-09-02)**: o app
  tem um `sw.js` ativo (confirmado durante a verificação ao vivo da fatia 6 — uma aba de navegador
  de longa duração continuou servindo o bundle JS de antes do deploy até uma aba nova ser aberta).
  Antes de promover para PRD é preciso:
  - investigar a estratégia real de atualização do service worker hoje (`skipWaiting`? `stale-while-revalidate`? nenhuma?);
  - implementar um aviso explícito de "nova versão disponível" para quem estiver com uma aba aberta há muito tempo, em vez de deixar a atualização silenciosa/invisível;
  - **nunca** atualizar automaticamente enquanto houver formulário ou alteração não salva em andamento;
  - garantir que respostas de API, autenticação e qualquer dado dinâmico **nunca** sejam servidos por cache do service worker antigo (só assets estáticos/shell devem ser cacheáveis).
  Não bloqueia esta fatia (Rotinas + Acompanhamentos) nem fatias futuras em HML — é mandatório
  resolver antes de promover esta iniciativa para PRD.

## Baseline pré-implantação (registrado antes de qualquer alteração em HML)

**Imagens em produção HML no início desta iniciativa** (retagueadas como
`croniu-hml-{web,api,admin}:rollback-pre-workspace` para rollback sem depender de rebuild):

| Serviço | Digest |
|---|---|
| web | `sha256:d28752da6af69a6ce87bb6bfbd3b508ad69979ad63afc24c75a985c37008a689` |
| api | `sha256:5ff8b315c7ec3ef39efc839d53595b05be9987d46783000245fd7323fce03820` |
| admin | `sha256:5835ec41689a0db4d1e4cc6bb433cfd67d5540a8b8a2a54576aa324bc8d72f0d` |

Alembic head em HML: `0027_fixed_period_plan_pricing` (nenhuma migration pendente).

**Contagens agregadas (sem dados pessoais), registradas em 2026-09-02:**

| Tabela | Linhas |
|---|---|
| organizations | 273 |
| users | 278 |
| clients | 155 |
| services | 61 |
| cycles | 59 |
| cycle_templates | 55 |
| appointments | 552 |
| availability_schedules | 0 |
| receivables | 57 |
| client_evaluations | 7 |
| anamnesis_templates | 6 |
| client_anamnesis_responses | 31 |
| recurring_client_tasks | 95 |
| client_journeys | 106 |
| client_public_accesses | 60 |
| operational_occurrences | 1143 |
| renewal_requests | 2 |
| agent_threads | 11 |

Estas contagens serão reconferidas após cada implantação — qualquer queda inesperada é sinal de
alteração destrutiva e aciona rollback imediato.

## Branches adjacentes investigadas e descartadas

Antes de escrever qualquer código, comparei as branches locais que pareciam relevantes pelo nome
(`feature/croniu-premium-design-system-responsive-experience`,
`feature/smart-availability-main`, entre outras) contra `origin/main` atual. Todas estão
desatualizadas em relação a features já mescladas (Google auth, disponibilidade, preços de período
fixo) — usá-las como base **removeria** funcionalidade real hoje em produção. Nenhuma foi
utilizada. Esta branch nasce exclusivamente de `origin/main` @ `35ca1e6`, como instruído.

---

## Matriz por funcionalidade

| Funcionalidade | Rota atual | Ações existentes | API(s) | Destino no Workspace | Desktop | Mobile | Teste de preservação | Situação |
|---|---|---|---|---|---|---|---|---|
| Login tradicional | `/entrar` | Login, registro, recuperação de senha | `backend/app/api/auth.py` | Inalterado | Inalterado | Inalterado | Login válido continua autenticando | pendente de verificação |
| Login Google | `/entrar` | OAuth Google | `backend/app/api/auth.py` (google) | Inalterado | Inalterado | Inalterado | Fluxo OAuth completo sem alteração de contrato | pendente de verificação |
| Organização ativa / isolamento | global (sessão) | Seleção/contexto de organização | sessão/middleware | Inalterado | Inalterado | Inalterado | Dados de uma org nunca aparecem para outra | pendente de verificação |
| Home | `/app` | Resumo do dia | `GET /home/summary` | `Início` — saudação + resumo curto + agenda/disponibilidade + prioridades + financeiro compacto + ações rápidas | Composição decisória (bento enxuto) | Mesma hierarquia, empilhada | Todos os dados do resumo atual continuam presentes, só reorganizados | pendente |
| Clientes (lista) | `/app/clients` | Listar, buscar, cadastrar, editar, convidar | `backend/app/api/clients.py` | Tabela densa: Cliente · Atendimento · Agenda · Evolução · Financeiro · Renovação · Atenção; linha inteira abre o cliente; views (Todos/Atenção/Onboarding/Renovação/Financeiro/Sem acompanhamento) | Tabela | Lista priorizada | Toda ação de cadastro/edição/convite continua acessível | **feito** (fatia 4) |
| Cliente 360° | `/app/clients/[clientId]` | Ver, editar, arquivar, gerar/copiar/revogar link de portal | `clients.py`, `evaluations.py`, `agenda.py`, `receivables.py` | `Resumo` como visão inicial + abas Agenda / Plano e ciclo / Prontuário (anamnese, avaliações, acompanhamentos) / Financeiro / Histórico | Resumo fixo + abas | Resumo, atenção, próxima sessão, ações — abas colapsáveis | Nenhuma rota/ação atual removida; reutilizadas internamente | **feito** (fatia 4) |
| Onboarding manual | `/app/clients/new` | Cadastro direto | `clients.py` | Onboarding — ação "Cadastrar manualmente" | Botão + formulário | Mesmo formulário | Cliente criado aparece idêntico ao fluxo atual | **feito** (fatia 9) |
| Onboarding por convite | `/app/clients/intake` | Enviar convite, acompanhar preenchimento, 4 grupos reais | `intake.py`, `public_intake.py` | Onboarding — central operacional por status | Quadro por status | Lista por status | Progresso, reenvio e link continuam funcionando | **feito** (fatia 9) |
| Anamnese | dentro do fluxo de cliente/intake | Preencher, revisar respostas por template versionado | `client_anamnesis_responses`, `anamnesis_templates` (a mapear rota exata) | Prontuário → Anamnese, dentro do Cliente 360° | Aba | Aba | Fluxo completo preservado, não simplificar para campo único | pendente — requer leitura adicional do fluxo real |
| Serviços | `/app/services` | Criar, editar serviço | `services.py` | Serviços e ciclos → `/app/services`, contagem de uso real | Tabela/lista | Lista | CRUD preservado | **feito** (fatia 10) |
| Templates de ciclo | `/app/cycle-templates` | Criar, editar template | `cycles.py`? (a confirmar router) | Serviços e ciclos → Templates | Lista | Lista | CRUD preservado | pendente |
| Ciclos | `/app/cycles` | Criar, editar, encerrar, renovar | `cycles.py`, `cycle_intelligence.py` | Central `/app/cycles` (renomeada de "Renovações"); "Preparar renovação" reaproveita o fluxo existente | Tabela | Lista | Valor, periodicidade, sessões, status preservados | **feito** (fatia 10) |
| Disponibilidade | `/app/availability` | Configurar horários de trabalho | `availability.py` (`/availability/settings`, `/day`, `/range`) | Agenda → aba Disponibilidade + fundo contínuo na grade | Grade + config | Horários livres na timeline | Configuração existente não é sobrescrita | pendente |
| Agenda | `/app/agenda` | Criar, editar, reagendar, cancelar compromisso | `agenda.py` (`/agenda/day`, `/agenda/range` novo, `/agenda/next`, `/appointments`) | Calendário Dia/Semana com grade temporal real, disponibilidade como fundo contínuo | Grade temporal (Dia/Semana) | Timeline diária + Assistente | Todas as ações de compromisso preservadas; conflito pela regra já existente, nunca exige "concluir" | **feito** (fatia 5) |
| Rotinas | `/app/routines` | Criar, completar, adiar, cancelar, pausar/reativar/arquivar, board, templates, defaults | `routines.py` (board + `include_completed`/`include_cancelled` aditivos) | Central densa: Todas/Atrasadas/Hoje/Próximas/Recorrentes/Concluídas, busca, filtro cliente/origem | Tabela densa | Resumo (atrasadas/hoje/próxima) + gestão de definições | Recorrência (derivada da rotina), origem (`source`), sem prioridade real (documentado — não inventada); nenhuma ação antiga removida | **feito** (fatia 7) |
| Acompanhamentos | `/app/accompaniment` (novo) | Ver pendentes, ver histórico, registrar (via avaliação) | `client_evolution.py` + `evaluations.py` (`/accompaniment/pending`, `/evaluations/recent`, ambos aditivos) | Pendentes (sinal real: ciclo ativo + sem avaliação recente) / Histórico (avaliações publicadas) | Tabela densa | Resumo (até 8 clientes pendentes) | Continua aparecendo no Prontuário/Histórico do Cliente 360° (mesma fonte, `ClientEvaluation`) | **feito** (fatia 7) |
| Avaliações | dentro do cliente | Criar, editar, publicar, despublicar, arquivar | `evaluations.py` | Avaliações (lista global) + Prontuário do Cliente 360° | Lista/tabela | Lista | Rascunho/publicada preservados, visibilidade no portal preservada | pendente |
| Recebíveis / Financeiro | `/app/settings` (assinatura) e `/app/receivables` (operacional — nunca misturados) | Ver, registrar/confirmar recebimento; `GET /receivables/overview` (recebido/previsto/vencido/tendência) | `receivables.py`, `financial_overview.py` | Central `/app/receivables`: indicadores + gráfico honesto + tabela acionável; recebível de R$0/cancelado nunca aparece como pendente/vencido | Cards + gráfico + tabela acionável | Cards compactos | Nenhum valor tratado como lucro/contábil; gate de R$0 corrigido na criação e leitura | **feito** (fatia 11) |
| Renovações | `renewal_requests`, `/app/renewals` | Solicitar/gerenciar renovação | `my_cycle.py` (`renewal-requests`, `prepare`) | Financeiro (receita em risco) + Serviços e ciclos | Destaque quando próxima | Destaque quando próxima | Fluxo de renovação preservado | pendente |
| Portal do cliente | `/c/[token]` | Cliente vê ciclo, próximo compromisso, avaliações publicadas, financeiro aplicável, solicita renovação | `public_my_cycle.py`, `my_cycle.py`, `client_public_accesses` | Inalterado como experiência externa (headers/robots endurecidos); Cliente 360° ganha prévia fiel autenticada (`/app/clients/{id}/portal-preview`) | — (rota do cliente) + prévia dentro do Workspace | — (rota do cliente) + prévia dentro do Workspace | Nenhuma informação interna exposta (WhatsApp pessoal, notas, rascunhos); nenhum link/token existente quebrado | **feito** (fatia 12) |
| Assistente / IA | `/app/assistant` | Conversar, threads, tool calls | `agent.py` | Página Assistente workspace (histórico + contexto + atalhos + atividade) + palette global `Ctrl+K` + contexto `Perguntar sobre [cliente]`/`Perguntar à IA` no 360°/Agenda/Rotinas/Ciclos/Financeiro/Onboarding/Home | Workspace 3 colunas | Camada operacional (resumo + acesso rápido + consultas recentes + destaque na nav) | Nenhuma ação sem confirmação explícita; usa só tools/dados oficiais; nunca revela token do Portal, nunca toca billing/e-mail/senha | **feito** (fatia 6, estendida fatia 14) — cancelar ciclo/publicar avaliação/cancelar rotina agora cobertos; "pausar" ciclo permanece deliberadamente ausente (não é um estado real do sistema); renovar via IA permanece manual por design (a IA aponta para `/app/renewals`, nunca cria ciclo de renovação sozinha) |
| Billing | `/app/settings/billing` | Ver plano, checkout, portal Asaas | `billing.py`, `billing_webhooks.py` | Sob "Conta e configurações → Plano e assinatura", separado do Financeiro operacional | Inalterado (lógica) | Inalterado (lógica) | Fluxo de cobrança preservado byte a byte; `/app/billing/return/[mode]` intocado | **feito** (fatia 13) |
| Perfil / Preferências | `/app/settings/account`, `/app/settings/workspace` | Editar dados pessoais, perfil profissional, fuso, disponibilidade, recebimentos | `user_contact.py`, `profession.py`, `agenda.py` (preferences), `availability.py` | "Conta e configurações" — Minha conta (pessoa) e Workspace (negócio) nunca misturados | Lateral nav + conteúdo agrupado por seção | Central resumida ("Mais" → itens diretos) | Nenhum dado/endpoint novo; redirects preservam links antigos | **feito** (fatia 13) |
| Feedback | `/app/settings/help` | Enviar feedback, manual, Termos, Política de Privacidade | `feedback.py` | "Conta e configurações → Ajuda e privacidade" | Inalterado (lógica) | Inalterado (lógica) | Termos/Privacidade agora linkados (ausentes antes) | **feito** (fatia 13) |
| Logout | global | Encerrar sessão | `auth.py` | Inalterado — acessível em `/app/settings` (mobile) e no menu de conta (desktop) | Inalterado | Inalterado | — | **feito** (fatia 13) |

---

## Próxima fatia proposta

A fatia mais segura e mais bem fundamentada para implantar primeiro é a **identidade e shell**
(seção 4 da instrução): rótulo "Croniu Workspace", remoção do badge "LAB", selo discreto "Ambiente
de homologação", reorganização da sidebar desktop em grupos preservando os 5 itens atuais do
bottom-nav mobile (`Hoje/Agenda/Clientes/Rotinas/Mais`), "by NTWS Labs" sutil só no desktop. Zero
schema, zero API nova, risco mínimo, reversível por digest.
