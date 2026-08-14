# Relatório — Onboarding operacional (serviços + modelos de ciclo + Manual)

Data: 2026-08-14  
Branch: `feature/client-intake-journey`  
Escopo: orientar criação de serviço e modelo de ciclo; Manual alinhado ao produto atual.  
Parar em HML. Sem merge. Sem PRD. Sem Promote.

## 1. Diagnóstico

- **Service**: `name`, `description`, `default_duration_days`, `default_duration_minutes`, `default_price_cents` (nullable), `status` `active|archived`. Tenant via `organization_id`. API `/api/v1/services`. UI `/app/services`, `/app/services/new`.
- **CycleTemplate**: `name`, `weekly_frequency` 1–7, `duration_type` `calendar_months|fixed_days`, `duration_value`, `status` `active|archived`. **Sem `service_id`**. API `/api/v1/cycle-templates`.
- **Ciclo inteligente (web)**: exige cliente + serviço + modelo + weekdays. API de preview permite duração sem modelo; a UI inteligente **não**.
- Tela Hoje: `TodayBoard`. Card de setup após saudação.
- Manual: `/app/manual`.
- Nenhuma migration. Nenhuma semente de dados.

## 2. Obrigatoriedade real (não inventada)

| Ação | Serviço ativo | Modelo ativo |
| --- | --- | --- |
| Explorar o app / login | Não | Não |
| Criar ciclo (fluxo inteligente web) | Sim | Sim |
| Criar ciclo via API `/cycles` legado | Sim | Não (duração pode ir no payload) |
| Criar modelo | Não (domínio) | — |

Valor e duração do atendimento: no **serviço**. Frequência/período: no **modelo**. Preço do ciclo: preview usa preço do serviço (0 se nulo). Modelo não vincula serviço.

## 3. Arquivos alterados (principais)

- `backend/app/schemas/domain.py`, `backend/app/services/domain.py`
- `backend/tests/test_initial_setup_flags.py`, `backend/tests/test_home_daily_focus.py`
- `apps/web/src/lib/api.ts`, `setup-copy.ts`
- `apps/web/src/components/app/initial-setup-card.tsx`, `today-board.tsx`
- `apps/web/src/app/app/setup/page.tsx`
- `apps/web/src/app/app/services/new/page.tsx`, `cycle-templates/new/page.tsx`, `cycles/new/page.tsx`
- `apps/web/src/app/app/profile/page.tsx`, `manual/page.tsx`
- Ícone `IconCheck`

## 4–6. Card, progresso, profissão

Card “Prepare seu Croniu” (personal: “Prepare seus serviços e ciclos”). Progresso 0/1/2 de 2. Exemplos por profissão só visuais. “Ver depois” recolhe via `sessionStorage` (não conclui etapas). Acesso permanente: Mais → Configuração inicial.

## 7–9. Serviços, modelos, ciclo

- Serviço: nome com placeholder; duração em chips; valor vazio (não mais `90,00`); gratuito = `0`; em branco = `null`. Após salvar no fluxo de setup, segue para modelo se ainda não houver.
- Modelo: nome vazio + chips de frequência/período. Sem serviço: aviso + CTA, formulário permanece habilitado.
- Ciclo sem serviço / sem modelo: estados contextuais; `clientId` e `returnTo` preservados (`safeReturnTo`).

## 10. returnTo

Somente paths `/app/...`. Sem URL externa.

## 11–12. Manual

Antes: seções curtas, “Meu Ciclo”, anamnese genérica.  
Agora: 19 capítulos (primeiros passos → FAQ), Portal do cliente, plano vs ciclo vs rotina, exemplos por profissão com o da conta em primeiro.

## 13–14. Segurança / multi-tenant

Flags no `HomeSummary` contam só `organization_id` da sessão + `status=active`. Arquivados não contam. Isolamento coberto em teste.

## 15–16. Testes / CI local

- Backend: `test_initial_setup_flags.py` + ajuste `test_home_empty_day_message`; home/cycle intelligence após correção da mensagem.
- Web: vitest 157 passed; tsc ok; eslint nos arquivos tocados ok.
- E2E Playwright completo / visual regression / secret scan: **não executados nesta máquina** (pendente no CI remoto se houver).
- Sem nova migration → Alembic HML permanece no head atual.

## 17–18. Backup / SHA HML

Preencher após o deploy HML desta entrega.

## 19. Evidências para revisão humana

Contas sintéticas HML (pós-reset, sem serviço/modelo): personal, tutor, consultor, esportes. Validar card 0/2, criar serviço, 1/2, criar modelo, conclusão, Mais, Manual, 320–412px.

## 20. Riscos residuais

- Modelo semanal (1–7) não cobre “sem frequência fixa” — domínio atual não tem esse enum.
- “Continuar de forma personalizada” na criação inteligente **não existe** na UI; o modelo é obrigatório nesse fluxo.
- “Ver depois” é por sessão do navegador, não por conta.
- Flash de hidratação possível no card vs `sessionStorage`.

## 21. Pendentes

- Deploy HML + smoke nas contas sintéticas + evidências visuais.
- CI remota completa se o pipeline não rodou localmente (admin build, e2e, secret scan).
