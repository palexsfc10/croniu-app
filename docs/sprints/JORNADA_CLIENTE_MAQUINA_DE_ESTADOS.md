# Jornada do cliente — máquina de estados (verificado no código)

Origem: revisão crítica pós-entrega do PDF "JORNADA CLIENTES" — o owner apontou
que a validação anterior foi tela por tela, não como máquina de estados, e
pediu o modelo explícito antes de aceitar a correção do bug "Preparar
acompanhamento" com checklist 100% concluído.

Convenção: `IMPLEMENTADO` = confirmado lendo o código nesta revisão;
`LEGADO_MORTO` = existe no backend mas nenhuma rota do frontend atual o
aciona; `PENDENTE_DE_DECISÃO` = inconsistência real, não corrigida aqui por
estar fora do escopo desta branch.

## Dois mecanismos coexistindo

O cliente tem **dois** estados rastreados separadamente, e só um deles foi a
causa direta do bug relatado — mas os dois precisam ser entendidos juntos
porque um alimenta o outro:

1. **`ClientJourney.stage`** (`backend/app/services/journey.py`) — a máquina
   formal de 12 estados do ciclo de vida do cliente. Toda transição passa por
   `transition_journey()`, que valida contra `VALID_TRANSITIONS` e rejeita
   qualquer salto não permitido (`422 invalid_transition`).
2. **`ClientJourney.accompaniment_checklist`** (`backend/app/services/
   accompaniment.py`, função `resolve_accompaniment()`) — um checklist de 7
   etapas de preparação (anamnese, avaliação, plano, ciclo, agenda, rotina,
   ativação), recalculado **a cada leitura**, nunca lido direto do banco sem
   reprocessar contra o estado real (ciclos, avaliações, protocolos, etc.).

Antes desta correção, completar o checklist **não** avançava `stage` — as
duas máquinas ficavam dessincronizadas (ver seção "Causa raiz" abaixo).

## `journey.stage` — máquina formal

| Estado | Label PT | Pré-condição | Transições válidas | Fonte de verdade |
|---|---|---|---|---|
| `pending_registration` | Cadastro incompleto | Cliente iniciou cadastro público, não terminou | `pending_anamnesis`, `pending_review`, `archived` | `ClientIntakeSubmission` incompleta |
| `pending_anamnesis` | Anamnese pendente | Cadastro básico ok, formulário de saúde pendente | `pending_review`, `archived` | idem |
| `pending_review` | Aguardando análise | Submissão completa, aguardando o profissional | `approved`, `rejected`, `pending_anamnesis`, `archived` | `ClientIntakeSubmission.status` |
| `approved` | Cadastro aprovado | Profissional aprovou a submissão | `evaluation_pending`, `protocol_pending`, `ready_to_start`, **`active`**, `paused`, `archived` | `intake.approve_submission` |
| `evaluation_pending` | Avaliação pendente | *(caminho legado — ver nota)* | `protocol_pending`, `ready_to_start`, `active`, `paused`, `archived` | `journey.evaluation_decision` |
| `protocol_pending` | Protocolo pendente | *(caminho legado — ver nota)* | `ready_to_start`, `active`, `paused`, `archived` | `journey.protocol_decision` |
| `ready_to_start` | Pronto para iniciar | *(caminho legado — ver nota)* | `active`, `paused`, `archived` | idem |
| `active` | Em acompanhamento | Checklist de preparação com a etapa `activate` concluída **ou** cliente cadastrado manualmente (ver abaixo) | `review_due`, `paused`, `archived` | `accompaniment.apply_step` (etapa `activate`) |
| `review_due` | Revisão necessária | *(sem trigger automático encontrado nesta revisão — não confundir com o "plano precisa ser revisado" da checklist, que é um cálculo à parte)* | `active`, `protocol_pending`, `paused`, `archived` | — |
| `paused` | Pausado | Ação manual (endpoint não localizado no escopo desta revisão) | `active`, `archived` | — |
| `rejected` | Cadastro recusado | Profissional recusou a submissão | `pending_review`, `archived` | `intake.reject_submission` |
| `archived` | Arquivado | Terminal | — | — |

**Cliente cadastrado manualmente** (`POST /clients`, sem link de convite):
`journey_svc.ensure_legacy_active_journey()` cria a jornada **já em
`active`**, sem passar pelos estados de aprovação — não existe "cadastro" a
aprovar. Isso é intencional: um cliente adicionado manualmente pelo
profissional já está, por definição, em acompanhamento.

**Nota sobre `evaluation_pending`/`protocol_pending`/`ready_to_start`:**
esses três estados são alimentados por `journey.evaluation_decision` /
`journey.protocol_decision`, escritos por `set_evaluation_decision()` /
`set_protocol_decision()` (`backend/app/services/intake.py`). **Nenhuma rota
do frontend atual chama os endpoints `POST /journey/evaluation-decision` ou
`POST /journey/protocol-decision`** (confirmado por busca no código de
`apps/web`) — são `LEGADO_MORTO` do ponto de vista da UI hoje. O mesmo vale
para `prepare_start_checklist()` (`POST /clients/{id}/prepare-start`), a
única função que historicamente levava `ready_to_start → active`
automaticamente: também não é chamada pelo frontend. **Isto é a causa raiz
nível 2 do bug relatado** (ver seção seguinte) — sem este fix, um cliente
vindo por convite nunca tinha um caminho vivo para `stage="active"`.

## `accompaniment_checklist` — checklist de preparação

Recalculado do zero a cada leitura por `resolve_accompaniment()` — nunca é
"apenas" o que está gravado no banco. Precedência (da mais alta para a mais
baixa), igual para todas as 7 etapas:

1. **Fato real** (entidade existe/está completa) → sempre `done`, mesmo que
   o valor gravado diga outra coisa.
2. **Decisão explícita do profissional** gravada (`na`/`later`/`done`) →
   vale, se não houver fato real.
3. Nenhuma decisão registrada → `todo`.

| Etapa | Obrigatória? | Fonte do fato | Pode ser "não se aplica"? | Ação contextual | Efeito ao concluir |
|---|---|---|---|---|---|
| `anamnesis` | Sim (decisão explícita necessária) | `journey.anamnesis_reviewed_at` OU checklist=`done` | **Sim, só por decisão explícita do profissional** — nunca inferido de "cliente cadastrado manualmente" (ver correção abaixo) | Submissão pendente → "Marcar como analisada"; sem submissão → "Compartilhar link"; concluída → "Ver respostas" | Nada além do próprio checklist |
| `evaluation` | Opcional | `ClientEvaluation` existente OU `evaluation_decision` legado | Sim — decisão explícita (`na`) | Registrar avaliação | — |
| `plan` | Opcional | `Protocol.status=="published"` OU `protocol_decision` legado | Sim — decisão explícita (`na`) | Criar/ver plano | — |
| `cycle` | Opcional | `Cycle` ativo/atual existe | Sim — decisão explícita (`na`) | Criar/ver ciclo | Ciclo cancelado volta a `todo` (testado) |
| `agenda` | Opcional | Compromissos do ciclo ≥ `lesson_count` esperado | Implícito (sem ciclo, não se aplica) | Organizar agenda | — |
| `routine` | Opcional | Nunca detectado por fato (`fact_done=False` sempre) | Sim — decisão explícita (`na`) | Configurar rotina | — |
| `activate` | Sim (última etapa) | `journey.stage == "active"` OU checklist=`done` | Não (é a etapa que ativa) | Botão "Ativar acompanhamento" | **Agora também transiciona `journey.stage → "active"`** (antes só marcava o JSON) |

`progress_defined`/`progress_total` contam as 6 etapas antes de `activate`
(não incluem `activate` no denominador) — por isso a tela mostra "6 de 6"
mesmo com a etapa "Ativar acompanhamento" ainda pendente logo depois; o "7 de
7" só apareceria se o denominador incluísse `activate`, o que o backend
delibaradamente não faz (a etapa de ativação é o gatilho, não um item do
progresso a "preencher").

### "Não existe" vs "não se aplica" vs "concluído" — regra explícita

- **Não existe registro nenhum** (nunca houve decisão nem fato): `todo` —
  Pendente. Nunca deve aparecer como `done`.
- **Não se aplica**: só existe por **decisão explícita** do profissional
  (botão dedicado, disponível em toda etapa, inclusive anamnese desde esta
  correção). Nunca inferido de contexto (ex.: "cliente foi cadastrado
  manualmente, então não se aplica" — essa inferência foi removida nesta
  revisão por criar falso-positivo de progresso).
- **Concluído**: fato real confirmado, ou decisão explícita de marcar
  concluído sem fato (ex.: analisar anamnese recebida por outro canal).

## Causa raiz do bug relatado (checklist 100% + "Preparar acompanhamento")

Duas causas independentes, as duas corrigidas nesta revisão:

1. **`journey.next_action` ficava obsoleto.** `apply_step()` gravava o
   literal `"prepare_accompaniment"` como fallback sempre que
   `resolve_accompaniment()` não tinha mais nada a reportar
   (`next_action=None`, ou seja, checklist concluído) — e a leitura
   (`_journey_out`) preferia esse valor obsoleto ao invés do `None` fresco.
   Corrigido: `_journey_out` agora confia 100% no cálculo ao vivo quando ele
   roda; `apply_step` grava `None` de verdade em vez do fallback.
2. **`journey.stage` nunca chegava a `"active"` para clientes vindos de
   convite.** Marcar a etapa "Ativar acompanhamento" só gravava um JSON —
   `journey.stage` ficava travado em `"approved"` para sempre (nenhuma rota
   viva avança esse estado, ver nota acima). Como o resumo do cliente também
   checava `journey?.stage === "approved"` como gatilho para "Prepare o
   acompanhamento", o card ficava permanentemente errado mesmo depois da
   correção nº 1. Corrigido: `apply_step()`, ao marcar `activate` como
   `done`, agora chama `transition_journey(..., to_stage="active")` de
   verdade; `VALID_TRANSITIONS` foi ampliado para permitir esse salto direto
   a partir de `approved`/`evaluation_pending`/`protocol_pending` (o
   checklist de 7 etapas é hoje o portão de prontidão real — mais rico que o
   antigo par evaluation/protocol_decision — então o salto direto é
   consistente com a regra de negócio atual, não um bypass arbitrário).

Testes de regressão: `backend/tests/test_accompaniment_persistence.py::
test_checklist_fully_done_clears_next_action_and_activates_stage_manual_client`
e `..._invite_client` — o segundo reproduz o fluxo completo de convite →
aprovação → checklist → ativação, ponta a ponta, contra uma leitura fresca
(`GET /journey`), não apenas a resposta do PATCH.

## Efeito em outras telas

| Tela | O que lê | Consistente após a correção? |
|---|---|---|
| Resumo do cliente (`client-profile.tsx`) | `journey.next_action` (fresco) | Sim — "Acompanhamento pronto" substitui "Preparar acompanhamento" quando não há pendência |
| Checklist "Preparar acompanhamento" (`accompaniment/page.tsx`) | `journey.accompaniment_checklist` (fresco) | Sim, já era recalculado por leitura |
| Badge de status no cabeçalho da ficha | `clientStatusLabel(item.status)` (nunca `journey.stage`, `Client.status` é independente) | Não afetado pelo bug |
| Lista de Alunos | Não lê `journey.stage` diretamente (usa `Client.status` + ciclo) | Não afetado |
| Agenda → "Ações da rotina" | Ocorrências de rotina, não `journey` | Não afetado |

## Débito técnico conhecido, fora do escopo desta correção

- `evaluation_decision`/`protocol_decision` e os estados
  `evaluation_pending`/`protocol_pending`/`ready_to_start` são
  `LEGADO_MORTO` do ponto de vista do frontend atual — o checklist de 7
  etapas os substituiu como fonte de verdade prática, mas o código antigo
  continua no backend (testado, mas inacessível pela UI). `PENDENTE_DE_
  DECISÃO`: remover ou reintegrar formalmente.
- `journey.preparation_status` é gravado uma vez (`"in_progress"`, na
  aprovação) e nunca atualizado depois — campo exposto na API mas não lido
  por nenhum componente do frontend. `PENDENTE_DE_DECISÃO`: remover ou
  passar a refletir o estado real.
- Não foi localizado, nesta revisão, nenhum endpoint que leve `stage` a
  `paused` ou `review_due` a partir da UI atual — ambos os estados existem
  na máquina formal mas parecem inacessíveis na prática hoje.
