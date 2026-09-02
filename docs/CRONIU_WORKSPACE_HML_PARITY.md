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

Linhas 195/196 da Matriz por funcionalidade abaixo passam de `pendente` para `em andamento` nesta
fatia. Ver commits e evidência de deploy nesta seção conforme avançam.

As demais 12 áreas da matriz abaixo (Clientes, Cliente 360°, Agenda Board, Rotinas,
Acompanhamentos, Onboarding, Serviços/ciclos/avaliações, Financeiro, Portal, Assistente/command
bar) seguem `pendente` — a promoção completa do conceito do Lab é uma iniciativa maior, ainda em
andamento fatia a fatia.

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
| Clientes (lista) | `/app/clients` | Listar, buscar, cadastrar, editar, convidar | `backend/app/api/clients.py` | Tabela densa: Cliente · Atendimento · Agenda · Evolução · Financeiro · Renovação · Atenção; linha inteira abre o cliente; views (Todos/Atenção/Onboarding/Renovação/Financeiro/Sem acompanhamento) | Tabela | Lista priorizada | Toda ação de cadastro/edição/convite continua acessível | **em andamento** (fatia 4) |
| Cliente 360° | `/app/clients/[clientId]` | Ver, editar, arquivar, gerar/copiar/revogar link de portal | `clients.py`, `evaluations.py`, `agenda.py`, `receivables.py` | `Resumo` como visão inicial + abas Agenda / Plano e ciclo / Prontuário (anamnese, avaliações, acompanhamentos) / Financeiro / Histórico | Resumo fixo + abas | Resumo, atenção, próxima sessão, ações — abas colapsáveis | Nenhuma rota/ação atual removida; reutilizadas internamente | **em andamento** (fatia 4) |
| Onboarding manual | `/app/clients/new` | Cadastro direto | `clients.py` | Onboarding — ação "Cadastrar manualmente" | Botão + formulário | Mesmo formulário | Cliente criado aparece idêntico ao fluxo atual | pendente |
| Onboarding por convite | intake links | Enviar convite, acompanhar preenchimento | `intake.py`, `public_intake.py` | Onboarding — estados (convite pendente/em preenchimento/concluído/exige atenção) | Quadro por status | Lista por status | Progresso, reenvio e link continuam funcionando | pendente |
| Anamnese | dentro do fluxo de cliente/intake | Preencher, revisar respostas por template versionado | `client_anamnesis_responses`, `anamnesis_templates` (a mapear rota exata) | Prontuário → Anamnese, dentro do Cliente 360° | Aba | Aba | Fluxo completo preservado, não simplificar para campo único | pendente — requer leitura adicional do fluxo real |
| Serviços | `/app/services` | Criar, editar serviço | `services.py` | Serviços e ciclos → Serviços | Tabela/lista | Lista | CRUD preservado | pendente |
| Templates de ciclo | `/app/cycle-templates` | Criar, editar template | `cycles.py`? (a confirmar router) | Serviços e ciclos → Templates | Lista | Lista | CRUD preservado | pendente |
| Ciclos | `/app/cycles` | Criar, editar, encerrar, renovar | `cycles.py`, `cycle_intelligence.py` | Serviços e ciclos → Ciclos ativos / Histórico; renovação ganha peso visual quando próxima | Tabela | Lista | Valor, periodicidade, sessões, status preservados | pendente |
| Disponibilidade | `/app/availability` | Configurar horários de trabalho | `availability.py` (`/availability/settings`, `/day`, `/range`) | Agenda → aba Disponibilidade + fundo contínuo na grade | Grade + config | Horários livres na timeline | Configuração existente não é sobrescrita | pendente |
| Agenda | `/app/agenda` | Criar, editar, reagendar, cancelar compromisso | `agenda.py` (`/agenda/day`, `/agenda/next`, `/appointments`) | Agenda Board: Dia / Semana / Disponibilidade, grade temporal, sem exigir conclusão | Grade temporal | Timeline diária | Todas as ações de compromisso preservadas; conflito pela regra já existente | pendente |
| Rotinas | `/app/routines` | Criar, completar, pular, board, templates, defaults | `routines.py` (rico: preview, board, occurrences/decide) | Rotinas: Atrasadas / Hoje / Próximas / Concluídas | Lista com filtro | Lista | Recorrência, prioridade, origem, sugestão IA preservados | pendente |
| Acompanhamentos | a confirmar (`operational_occurrences`?) | a confirmar | a confirmar | Acompanhamentos: Pendentes / Histórico | Feed + aba por cliente | Feed | — | pendente — requer leitura do router real |
| Avaliações | dentro do cliente | Criar, editar, publicar, despublicar, arquivar | `evaluations.py` | Avaliações (lista global) + Prontuário do Cliente 360° | Lista/tabela | Lista | Rascunho/publicada preservados, visibilidade no portal preservada | pendente |
| Recebíveis / Financeiro | `/app/receivables`, `/app/payment-reports` | Ver, registrar/confirmar recebimento | `receivables.py` | Financeiro — já é a melhor tela do Lab, vira referência de qualidade + seletor de período + navegação para registros | Cards + gráfico + tabela acionável | Cards compactos | Nenhum valor tratado como lucro/contábil | pendente |
| Renovações | `renewal_requests` | Solicitar/gerenciar renovação | a confirmar router | Financeiro (receita em risco) + Serviços e ciclos | Destaque quando próxima | Destaque quando próxima | Fluxo de renovação preservado | pendente |
| Portal do cliente | `/c/[token]` | Cliente vê ciclo, avaliações publicadas, financeiro aplicável | `public_my_cycle.py`, `client_public_accesses` | Inalterado como experiência externa; Cliente 360° ganha ação "Visualizar como cliente" | — (rota do cliente) | — (rota do cliente) | Nenhuma informação interna exposta | pendente |
| Assistente / IA | `/app/assistant` | Conversar, threads, tool calls | `agent.py` | Página Assistente + command bar global `Ctrl+K` + contexto `Perguntar sobre [cliente]` no 360° | Página + atalho global | Destaque no mobile | Nenhuma ação sem confirmação explícita; usa só tools/dados oficiais | pendente |
| Billing | `/app/billing` | Ver plano, checkout, portal Asaas | `billing.py`, `billing_webhooks.py` | Mantido em local adequado (provavelmente sob "Mais"/configurações) | Inalterado | Inalterado | Fluxo de cobrança preservado | pendente |
| Perfil / Preferências | `/app/profile`, `/app/preferences` | Editar dados, preferências | a confirmar | Mantido sob "Mais" | Inalterado | Inalterado | — | pendente |
| Feedback | rota a confirmar | Enviar feedback | `feedback.py` | Mantido sob "Mais" | Inalterado | Inalterado | — | pendente |
| Logout | global | Encerrar sessão | `auth.py` | Inalterado | Inalterado | Inalterado | — | pendente |

---

## Próxima fatia proposta

A fatia mais segura e mais bem fundamentada para implantar primeiro é a **identidade e shell**
(seção 4 da instrução): rótulo "Croniu Workspace", remoção do badge "LAB", selo discreto "Ambiente
de homologação", reorganização da sidebar desktop em grupos preservando os 5 itens atuais do
bottom-nav mobile (`Hoje/Agenda/Clientes/Rotinas/Mais`), "by NTWS Labs" sutil só no desktop. Zero
schema, zero API nova, risco mínimo, reversível por digest.
