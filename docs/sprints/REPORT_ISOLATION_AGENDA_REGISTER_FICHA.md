# Relatório — rotinas, próxima aula, login, isolamento e ciclo

Data: 2026-08-14  
Branch: `feature/client-intake-journey`

## Causa comprovada do login

Não foi “o link estava dentro do form”. Evidência de Playwright + DOM:

1. **Submit do login lia o estado vazio do React Hook Form**, não o valor do DOM. O `setValue` no `onSubmit` não sincronizava antes do `handleSubmit`. Resultado visível: `E-mail inválido` / `Informe a senha` com os campos preenchidos na tela. Correção: autenticar com `FormData` do `<form>`.
2. O botão **Mostrar senha** (`aria-label` contendo “Senha”) competia com o campo Senha (`getByLabel('Senha')` resolvia 2 elementos). Correção: `Mostrar valor` / `Ocultar valor`.
3. **Entrar** no cadastro é `<a href="/login">` fora do `<form>` (`closest("form") === null`); clique não dispara POST de register (unitário + e2e nas duas etapas).
4. `preventDefault` + `stopPropagation` no submit da etapa 1; avanço de etapa usa o mesmo `FormData`.
5. Origem `127.0.0.1` vs `localhost` no Next 16 bloqueia `/_next` e deixa a UI em “Carregando sua sessão…” — Playwright local usa `http://localhost:3000`.

Sessão existente: `LoginForm` consulta `/api/v1/auth/me` e redireciona a `/app`. Cookie `croniu_session` confirmado após login.

## Semântica clientes vs ocorrências

- `client_count` = `count(distinct client_id)`
- `occurrence_count` / `count` = marcos reais
- UI: `{n} ocorrências · {m} clientes`
- Resumo: próxima ocorrência por cliente; demais em `<details>`
- Concluir um id não conclui os outros (`test_one_client_two_occurrences_are_preserved`: 21/08 e 21/09)
- Filtro da ficha: `?client_id=` / `?clientId=`; 404 se o cliente não é da org

## Próxima aula

Empty state: “Nenhuma aula em {dia}”; “Próxima aula: {nome} · {dia}, {hora}”; CTA **Ver próxima aula** é `<a href="/app/agenda?day=YYYY-MM-DD">` (sem botão aninhado). TZ `America/Sao_Paulo`; status `scheduled|completed|no_show`.

## Ciclo → compromisso → Agenda

`test_cycle_appointments_next_lesson_cancel_and_session`: `lesson_count` = aulas persistidas; 14/08 vazio; next = primeira aula; cancel some do dia; next salta; logout/login preserva.

## Isolamento

- Org B: cliente A, board `client_id` A, agenda/home/IA → 404 ou vazio
- Troca de ficha: `key={clientId}` no perfil e nas rotinas
- Logout limpa cookie + `sessionStorage`
- Playwright: `two tenants cannot read each other clients after logout` PASS
- Não há React Query; fetch é por montagem com `clientId` na URL

## Gates locais (antes do commit)

- Backend pytest: **321 passed**
- Web: lint (0 errors), typecheck, vitest **170 passed**
- Playwright isolamento (localhost): **3 passed**, incluindo login nas duas etapas, ficha/CTAs/`?day=` e tenants

## Aceite

ROUTINE OCCURRENCES PRESERVED — CLIENT COUNTS CORRECT — CLIENT FILTER PERSISTENT — NEXT LESSON OPENS THE CORRECT DATE — LOGIN VERIFIED FROM BOTH REGISTRATION STEPS — NO CROSS-TENANT OR STALE CLIENT CONTEXT — ACCOMPANIMENT CTAS STANDARDIZED — FULL CI AND REAL BROWSER SMOKE GREEN
