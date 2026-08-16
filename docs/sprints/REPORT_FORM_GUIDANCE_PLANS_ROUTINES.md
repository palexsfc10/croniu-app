# Relatório — fechamento Playwright, recorrência e SHA único

Data: 2026-08-14  
Branch: `feature/client-intake-journey`  
SHA: *(preenchido no commit candidato)*  
CI: *(preenchido após o run no SHA final)*

## 1. Inventário das 9 falhas originais (2A–2D + smoke)

Nenhuma foi tratada como “antiga” sem causa. Classificação:

| Teste | Cenário | Último passo ok | Erro | Classe |
|---|---|---|---|---|
| `hml-smoke-final` persistência/duplicata | Calcular aulas | `getByText(/Validade/)` | Copy do ciclo | **C** — “Vigência”. Spec movida para `cycle-integrity.spec.ts` (local/candidato) e `playwright.hml.config.ts` (smoke HML). |
| `sprint2a-visual` | Salvar cliente | heading Cliente Visual | Nome obrigatório / “Adicionar” duplicado | **D/B** |
| `sprint2a` | Salvar cliente | heading Cliente S2A | Fixture sem nome | **D** |
| `sprint2b` local/compromisso | Salvar cliente | heading Ana Souza | Fixture sem nome | **D** |
| `sprint2c` ciclo inteligente | Salvar cliente | heading Ana Souza | Fixture sem nome | **D** |
| `sprint2c1` ×3 financeiro | Heading novo ciclo | `select` vazio / “Editar valores” | Wizard + `link` vs `button` | **D/B** |
| `sprint2d` renovação | POST ciclo | `cycle.ok()` false | Sem `starts_time` | **D** |

Nenhum teste foi removido com skip, timeout inflado do caso, ou assertiva afrouxada. `hml-smoke-final.spec.ts` foi **renomeado/repartido por ambiente**, não descartado.

Falhas posteriores nesta rodada (diagnóstico individual):

- Playwright contra Next em `localhost` IPv6 vs bundle antigo → alvo `127.0.0.1:3000` + `webServer`.
- Overlay `nextjs-portal` no `next dev` interceptando clique em Hoje → navegação `goto /app` (mesmo destino).
- Login GET nativo vazava e-mail/senha na query se o JS atrasasse → `method="post"` no form.
- “Verificando assinatura…” na 3ª rotina → espera de heading 15s (mesmo padrão dos helpers), sem subir o timeout do teste.
- Título do plano sobrescrito por `profession.nomenclature` da API → UI usa só `nomenclatureFor`.

## 2. Contrato produto vs teste

- Ciclo: combobox `Cliente`/`Serviço`/`Modelo` com `aria-label`; copy “recalcula vigência”.
- Serviço: label estável `Valor (R$)`.
- Financeiro: ação `Editar valores` via `getByRole("button")` (link+Button).
- Acompanhamento: `data-testid="accompaniment-plan-card"`; copy “plano de acompanhamento”; skeleton; erro + “Tentar novamente”.
- Rotina: `data-testid="routine-frequency"`; recorrência em `recurrence` + `filter_json` (sem migration).

## 3. Suítes por ambiente (`apps/web`)

| Comando | Alvo |
|---|---|
| `npm run test:e2e` / `test:e2e:functional` / `test:e2e:regression` | Candidato local (`playwright.config.ts`, `127.0.0.1:3000`, ignora `prd-smoke`) |
| `npm run test:e2e:hml` | `playwright.hml.config.ts` + `HML_BASE_URL` — só após deploy do **mesmo** SHA |
| `npm run test:e2e:prd` | `playwright.prd.config.ts` — não mistura com o gate do branch |

Gate do código: Playwright local 25/25 nesta máquina (2026-08-14). Smoke HML **não** entra no verde do candidato.

## 4. Cobertura das novas jornadas (Playwright)

`accompaniment-journey.spec.ts`: aba, quatro cards vazios, erro/retry, parcial (ciclo sem plano), completo (plano+avaliação), copy sem “Criar treino”, viewports 360/390/412, reload + logout/login.

`routines-journey.spec.ts`: weekly, biweekly, monthly dia fixo, monthly n-ésimo/última segunda, intervalo, once; complete avança `next_run_on`; once arquiva; reload + login; persistência `filter_json`.

## 5. Bordas de recorrência (sem migration)

Persistência: colunas existentes `routines.recurrence` + `routines.filter_json` (`month_mode`, `month_day`, `nth`, `nth_weekday`, `starts_on`, `no_end`, `last_occurrence_completed`).

Provas: `backend/tests/test_recurrence_edges.py` (31/30/29, fev bissexto/não, última segunda, 5ª inexistente, TZ `America/Sao_Paulo`, edição da regra, complete idempotente, concorrência, `no_end`, sem duplicar linha) e e2e API no spec de rotinas.

## 6. Gates locais (antes do commit)

- Backend pytest: 331 passed  
- Web lint: 0 errors (warnings pré-existentes)  
- typecheck: ok  
- vitest: 174 passed  
- Playwright local: 25 passed, 0 skipped  

## 7. HML

Bloqueado até CI verde neste SHA. Depois: backup HML; deploy só api+web+admin; `/version` = SHA; Alembic; `npm run test:e2e:hml`; prints/traces. Sem merge, Promote ou reset.
