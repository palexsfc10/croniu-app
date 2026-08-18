# Auditoria crítica das jornadas do cliente

Complementa [`JORNADA_CLIENTE_MAQUINA_DE_ESTADOS.md`](JORNADA_CLIENTE_MAQUINA_DE_ESTADOS.md).
Auditoria funcional lendo o código de ponta a ponta (não apenas inspeção
visual), por jornada, seguindo a lista pedida pelo owner.

## Jornada A — aluno por convite

| Passo | Verificado | Observação |
|---|---|---|
| Profissional cria/compartilha convite | Sim | Link permanente por organização (`/intake-link`), não por aluno |
| Novo aluno acessa e preenche anamnese | Sim | `POST /public/intake/{token}/submit`, idempotente por `idempotency_key` |
| Profissional recebe | Sim | Fila em `/app/clients/intake`, `status=pending_review` |
| Aprova/vincula | Sim | `approve_submission`; cria `ClientJourney` em `stage="approved"`, checklist inicial `{todo}` em todas as 7 etapas |
| Abre ficha | Sim | `GET /clients/{id}/journey` recomputa tudo ao vivo |
| Consulta respostas | **Corrigido nesta rodada** | Antes: sem forma de reabrir após "Concluído". Agora: link "Ver respostas" no perfil e no checklist, via `GET /intake-submissions?client_id=` |
| Executa etapas restantes | Sim | Cada etapa tem fonte de verdade própria (ver tabela do documento de estados) |
| Ativa acompanhamento | **Corrigido nesta rodada** | Antes: só marcava o JSON, `journey.stage` nunca saía de `approved`. Agora: transição real de estado |
| Ficha deixa de pedir preparação | **Corrigido nesta rodada** | Card "Acompanhamento pronto" substitui "Preparar acompanhamento" |

## Jornada B — aluno criado manualmente

| Passo | Verificado | Observação |
|---|---|---|
| Profissional cria aluno | Sim | `ensure_legacy_active_journey` cria jornada já `stage="active"` |
| Sistema apresenta etapas aplicáveis | Sim | Checklist completo, todas `todo` por padrão |
| Anamnese não é falsamente concluída | **Corrigido nesta rodada** | Regra antiga inferia `na` automaticamente por "sem submissão" — trocada por `todo` + decisão explícita, igual às demais etapas |
| Profissional consegue enviar convite | **Corrigido nesta rodada** | Ação da etapa de anamnese pendente agora oferece "Compartilhar link" quando não há submissão |
| Avaliação/plano/ciclo/agenda configurados | Sim | Cada um com ação própria já existente |
| Acompanhamento é ativado | Sim | Trivial — já nasce `active` |
| Resumo reflete conclusão | Sim | Mesmo card "Acompanhamento pronto" da Jornada A |

## Jornada C — plano

| Passo | Verificado | Observação |
|---|---|---|
| Sem plano → criar → rascunho → publicar | Sim | `protocols.py`, fluxo padrão versão draft/published |
| "Ver plano" | **Corrigido em rodada anterior + nesta** | Typo `tab=accompaniment` corrigido nos dois pontos que existiam |
| Editar plano publicado | **Achado novo, não corrigido — ver "Contradições"** | `update_protocol_draft`: `if protocol.status == "published": protocol.status = "draft"` — editar um plano publicado o reverte para rascunho |
| Portal do cliente | Não verificado nesta rodada (fora do escopo do bug relatado) | — |

## Jornada D — ciclo e agenda

| Passo | Verificado | Observação |
|---|---|---|
| Criar ciclo, dias/horários, materializar compromissos | Sim | `cycles/intelligent`, testado (`test_agenda_complete_only_counts_own_valid_distinct_lessons`) |
| Tratar conflitos | Sim | `SCHEDULE_CONFLICT` 409, atômico (testado) |
| Validar Agenda / Ficha | Sim | `agenda_complete` exige `appt_count >= expected` |
| Concluir aulas | Sim | Status `completed`/`no_show` contam para o total |
| Finalizar/renovar ciclo | **Achado novo, não corrigido — ver "Contradições"** | `pick_operational_cycle` só retorna ciclo **atual** ou **futuro** — um ciclo encerrado sem renovação ainda criada faz `checklist.cycle` e `checklist.agenda` regredirem para `todo` |
| "Não aceitar ciclo ativo sem agenda quando a configuração exige compromissos" | Parcialmente | `agenda_complete` exige `appt_count >= expected`, mas nada impede criar um ciclo com `lesson_count=0`/sem agendamento — não é um bloqueio de criação, é só refletido no checklist como incompleto |

## Jornada E — rotina

| Passo | Verificado | Observação |
|---|---|---|
| Configurar, ativar | Sim | `/routines` |
| Gerar ocorrência | Sim | `test_routines_occurrence_dedup.py` — sem duplicação por cliente/rotina |
| Exibir em Hoje/Agenda/Rotinas | Sim | Confirmado nesta sessão que Agenda já mostra via "Ações da rotina" |
| Concluir, não duplicar | Sim | Testado (`test_once_routine_completed_never_reappears`, etc.) |
| Checklist `routine` | Sim | Nunca é `fact_done` automaticamente (`fact_done=False` fixo) — só resolve por decisão explícita (`na`/`done`/`later`), consistente com o padrão agora aplicado à anamnese |

## Jornada F — acompanhamento completo

| Passo | Verificado | Observação |
|---|---|---|
| Todas as etapas obrigatórias concluídas | Sim | Testado ponta a ponta (`test_checklist_fully_done_clears_next_action_and_activates_stage_invite_client`) |
| Progresso correto | Sim | `progress_defined`/`progress_total` recalculado ao vivo |
| Acompanhamento ativado | **Corrigido nesta rodada** | Transição real de `journey.stage` |
| Resumo não pede preparação | **Corrigido nesta rodada** | "Acompanhamento pronto" |
| Próximo passo operacional coerente | Sim | Reutiliza os checks já existentes de plano vencendo/revisão/rascunho, agora alcançáveis (antes eram mascarados pelo bug) |
| Estado sem ação mostra mensagem apropriada | Sim | "Tudo em dia com {nome}." como fallback final |

## Jornada G — edição/regressão

| Cenário | Resultado observado | Correto? |
|---|---|---|
| Plano publicado é editado | `protocol.status` volta a `draft` → `checklist.plan` regride para `todo` | **Questionável — não corrigido, ver abaixo** |
| Ciclo é encerrado (sem renovação ainda) | `checklist.cycle` e `checklist.agenda` regridem para `todo` | **Questionável — não corrigido, ver abaixo** |
| Compromisso é cancelado | `agenda_complete` recalcula com base em `status.in_(scheduled, completed, no_show)` — cancelado não conta | Correto, testado (`test_schedule_conflict_leaves_no_partial_cycle`) |
| Rotina é desativada | Sai de `yours` (filtro `status active/paused`), some da lista "Suas rotinas" | Correto, comportamento esperado |
| Avaliação é arquivada | Não localizado endpoint de arquivamento de avaliação nesta revisão | Não verificado |
| Anamnese é atualizada (nova submissão) | `has_intake_submission` já era True; comportamento de reabertura não teve reanálise automática | Não verificado a fundo — fora do escopo do bug relatado |
| Cliente é arquivado | `Client.status="archived"`; `journey.stage` não tem transição correspondente automática | Não verificado a fundo |

## Contradições e riscos encontrados

### P1 — checklist pode regredir silenciosamente (ciclo e plano)

**Descrição:** Duas etapas do checklist (`cycle`/`agenda` e `plan`) são
**puramente derivadas de fato**, sem nunca gravar `done` explicitamente no
banco. Quando o fato deixa de ser verdadeiro — ciclo passa a `ends_on` sem
renovação ainda aprovada, ou plano publicado é editado (o que o sistema
trata como "voltar a rascunho") — o checklist volta a `todo` e o card
"Acompanhamento pronto" reverte para "Continue a preparação", mesmo que o
profissional não tenha "desfeito" nada intencionalmente.

**Por que não foi corrigido nesta rodada:** é uma decisão de produto, não um
bug de implementação isolado. Duas leituras válidas e conflitantes:
1. O checklist deveria refletir o estado *atual* (ciclo ativo agora? plano
   publicado agora?) — comportamento atual, correto sob essa leitura.
2. O checklist deveria refletir se a etapa *já foi cumprida ao menos uma
   vez* — exigiria um campo persistido "cumprida historicamente", separado
   do estado operacional atual, e uma resposta explícita para "o que
   significa 'Acompanhamento pronto' voltar a pedir ciclo três dias após o
   fim do plano, antes mesmo da renovação vencer".

**Recomendação:** decisão do owner. Se optar pela leitura 2, o fix é
adicionar um campo `ever_completed` por etapa (ou usar `later`/`done`
persistido como piso, nunca rebaixado por fato ausente) — mudança de
schema, fora do escopo de um ajuste de UI.

### P2 — validação de "avaliação arquivada" e "cliente arquivado" não auditadas

Não foram localizados, nesta revisão, os pontos exatos de arquivamento de
avaliação nem o efeito de arquivar um cliente sobre `journey.stage`. Não é
um achado de bug — é uma lacuna de cobertura desta auditoria específica,
registrada para not ficar "batida como verificada" sem tê-lo sido.

### Já corrigidos nesta rodada (ver relatório principal)

- `next_action` obsoleto após checklist completo.
- `journey.stage` nunca chegava a `active` para clientes de convite.
- Anamnese inferida `na` automaticamente por ausência de submissão.
- Badge do checklist antes da ação em vez de depois.
- `!activeCycle` como gatilho redundante e contraditório com o checklist.

## Riscos multi-tenant / multi-aluno

Não identificado nenhum novo risco de isolamento nesta auditoria — todas as
consultas em `accompaniment.py`/`journey.py` já filtram por
`organization_id` explicitamente, e os testes de tenant isolation
pré-existentes (`test_tenant_cannot_patch_other_client`, etc.) continuam
verdes. As duas correções desta rodada (transição de estágio, resolução de
anamnese) são por-cliente e não introduzem consulta nova sem filtro de
organização.
