# Relatório — duplicidade de ciclos, contagem de Agenda e SHA de build

**Branch:** `feature/client-intake-journey`  
**Não mergear. Não Promote. Não PRD. Banco HML não limpo nesta rodada.**

## 1. Causa dos dois ciclos de Murilo (HML, SHA `3922da8`)

Dois ciclos **completos e ativos**, mesmo tenant/cliente/serviço/período/9 aulas/1 recebível cada, **idempotency keys diferentes**.

| Ordem | Prefixo ciclo | created_at UTC | key hash |
|---|---|---|---|
| 1 (canônico) | `fc819693` | ~02:51 | `db4d75e2` |
| 2 | `c11d129d` | ~03:50 | `f4788a8d` |

**Como a segunda criação foi permitida:** o backend só replayava a **mesma** idempotency key. Não havia regra semântica de “já existe ciclo operacional igual/sobreposto”. Duas confirmações na Web geram `web-${uuid}` distintas (~1 h de intervalo).

Respostas às perguntas:

1. Segunda criação = segundo POST `/api/v1/cycles/intelligent` com key nova; 201.
2. Não havia validação de ciclo atual/igual.
3. `_pick_cycle` na preparação considera ativo/pausado **incluindo início futuro**, mas isso só afetava checklist — **não bloqueava o POST**.
4. Ciclo futuro **não** era ignorado na ficha; a lista global “em andamento” filtrava `starts_on <= hoje` (divergência já relatada). O POST não consultava isso.
5. A preparação continuava oferecendo “Criar ciclo” se o profissional voltasse ao fluxo; não havia lock de UI entre sessões.
6. Sim: a UI gera key nova a cada `confirm()`.
7. Dois fluxos reais de criação (não retry da mesma operação).
8. O endpoint **permitia** dois ciclos ativos sobrepostos.
9. A ficha podia mostrar o primeiro; a lista global podia omitir ciclo futuro — o segundo POST não dependia disso.
10. Cache antigo não é necessário para explicar o caso; duas keys + ausência de guard bastam.

Não foram excluídos registros. IDs prefixados acima são evidência da regressão. Canônico = o mais antigo (`fc819693`).

## 2. Regra implementada

`backend/app/services/cycle_guard.py`, chamada em:

- `create_intelligent_cycle`
- `create_cycle_with_schedule`
- `domain.create_cycle`

Lock: `SELECT … FOR UPDATE` no **cliente** (Postgres) + leitura dos ciclos operacionais (`active`/`paused`) do mesmo tenant+cliente+serviço.

| Código | Quando |
|---|---|
| `DUPLICATE_CYCLE` | mesmo período (`starts_on`/`ends_on`) e `lesson_count` equivalente |
| `OVERLAPPING_CYCLE` | intervalo meio-aberto `starts_on < other.ends_on && other.starts_on < ends_on`, não idêntico |

`ends_on` é a data exclusiva de renovação (ciclos sequenciais com `starts_on == existing.ends_on` são permitidos).

- Serviços diferentes: **permitidos** em paralelo (horários ainda sujeitos a `SCHEDULE_CONFLICT`).
- Cancelado / encerrado: **não bloqueiam**.
- Outro tenant / outro cliente: **não interferem**.
- Renovação: o ciclo-fonte é `exclude_cycle_id`.
- Sem override silencioso.

Web: `CycleOverlapAlert` — ver ciclo existente; duplicata volta à ficha; sobreposição oferece ajustar período ou cancelar.

## 3. Concorrência

Duas sessões com keys distintas: o lock no cliente serializa; a segunda vê o ciclo já inserido e recebe 409. Teste `test_concurrent_identical_creates_single_cycle`.

## 4. Agenda (`d1e5ee5` + esta rodada)

`count_cycle_agenda_slots`: `organization_id` + `cycle_id` + status `{scheduled, completed, no_show}` + `count(distinct starts_at)`.

**Decisão:** um ciclo **não** gera duas ocorrências legítimas com o mesmo `starts_at` (`build_occurrences` é 1 aula/dia/slot; duplicata de instante é recusada). `distinct starts_at` trata clone corrompido, não sessões simultâneas. Se o domínio passar a permitir duas sessões no mesmo instante, a identidade deve ser o id da aula.

Não existe status `archived` em appointment; cancelado cobre retirada.

## 5. `/version`

Dockerfile já tinha `ARG/ENV GIT_SHA`. O deploy HML **não** passava `--build-arg`. Corrigido em `_ops_deploy_client_intake_journey.sh` (`GIT_SHA`, `APP_VERSION`, `BUILD_TIME`). CI image-build passa a falhar se o label/`GIT_SHA` for `unknown` ou ≠ `github.sha`. Teste de processo continua esperando `unknown` sem env; teste novo cobre injeção.

`DEPLOY_MARKER.txt` permanece.

## 6–20. Entrega operacional

Preenchido após CI verde, deploy HML e smoke no navegador (Playwright + passagem visual). Alembic: sem migration nova; head permanece `0022_form_template_pin`.
