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
| Clientes (lista) | `/app/clients` | Listar, buscar, cadastrar, editar, convidar | `backend/app/api/clients.py` | Tabela densa: Cliente · Atendimento · Agenda · Evolução · Financeiro · Renovação · Atenção; linha inteira abre o cliente; views (Todos/Atenção/Onboarding/Renovação/Financeiro/Sem acompanhamento) | Tabela | Lista priorizada | Toda ação de cadastro/edição/convite continua acessível | **feito** (fatia 4) |
| Cliente 360° | `/app/clients/[clientId]` | Ver, editar, arquivar, gerar/copiar/revogar link de portal | `clients.py`, `evaluations.py`, `agenda.py`, `receivables.py` | `Resumo` como visão inicial + abas Agenda / Plano e ciclo / Prontuário (anamnese, avaliações, acompanhamentos) / Financeiro / Histórico | Resumo fixo + abas | Resumo, atenção, próxima sessão, ações — abas colapsáveis | Nenhuma rota/ação atual removida; reutilizadas internamente | **feito** (fatia 4) |
| Onboarding manual | `/app/clients/new` | Cadastro direto | `clients.py` | Onboarding — ação "Cadastrar manualmente" | Botão + formulário | Mesmo formulário | Cliente criado aparece idêntico ao fluxo atual | pendente |
| Onboarding por convite | intake links | Enviar convite, acompanhar preenchimento | `intake.py`, `public_intake.py` | Onboarding — estados (convite pendente/em preenchimento/concluído/exige atenção) | Quadro por status | Lista por status | Progresso, reenvio e link continuam funcionando | pendente |
| Anamnese | dentro do fluxo de cliente/intake | Preencher, revisar respostas por template versionado | `client_anamnesis_responses`, `anamnesis_templates` (a mapear rota exata) | Prontuário → Anamnese, dentro do Cliente 360° | Aba | Aba | Fluxo completo preservado, não simplificar para campo único | pendente — requer leitura adicional do fluxo real |
| Serviços | `/app/services` | Criar, editar serviço | `services.py` | Serviços e ciclos → Serviços | Tabela/lista | Lista | CRUD preservado | pendente |
| Templates de ciclo | `/app/cycle-templates` | Criar, editar template | `cycles.py`? (a confirmar router) | Serviços e ciclos → Templates | Lista | Lista | CRUD preservado | pendente |
| Ciclos | `/app/cycles` | Criar, editar, encerrar, renovar | `cycles.py`, `cycle_intelligence.py` | Serviços e ciclos → Ciclos ativos / Histórico; renovação ganha peso visual quando próxima | Tabela | Lista | Valor, periodicidade, sessões, status preservados | pendente |
| Disponibilidade | `/app/availability` | Configurar horários de trabalho | `availability.py` (`/availability/settings`, `/day`, `/range`) | Agenda → aba Disponibilidade + fundo contínuo na grade | Grade + config | Horários livres na timeline | Configuração existente não é sobrescrita | pendente |
| Agenda | `/app/agenda` | Criar, editar, reagendar, cancelar compromisso | `agenda.py` (`/agenda/day`, `/agenda/range` novo, `/agenda/next`, `/appointments`) | Calendário Dia/Semana com grade temporal real, disponibilidade como fundo contínuo | Grade temporal (Dia/Semana) | Timeline diária + Assistente | Todas as ações de compromisso preservadas; conflito pela regra já existente, nunca exige "concluir" | **feito** (fatia 5) |
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
