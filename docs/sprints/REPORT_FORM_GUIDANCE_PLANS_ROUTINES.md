# Relatório — formulários orientados, plano de acompanhamento e recorrência

Data: 2026-08-14  
Branch: `feature/client-intake-journey`  
SHA: `4b4f56c`  
CI: https://github.com/palexsfc10/croniu-app/actions/runs/31827765412 (sucesso)

## 1. Diagnóstico da aba Acompanhamento vazia

Causa combinada:

1. O painel só montava com `tab === "acompanhamento" && item`. Troca de aba via `router.replace` podia renderizar a aba nova **antes** do cliente hidratar de novo → painel nulo (cabeçalho ainda visível da pintura anterior / tabs).
2. `formatCycleVigencyCard(starts_on, ends_on)` chamava `.slice` em `ends_on` nulo e derrubava o render do painel.

Correção: painel da aba monta sempre que `tab === acompanhamento` (não exige `item` no mesmo tick); `min-height`; skeleton; erro + “Tentar novamente”; **quatro cards sempre visíveis**; próxima ação do cabeçalho repetida na aba; `formatCycleVigencyCard` tolera `ends_on` nulo.

## 2. Nomenclaturas

Removido como promessa de produto: “plano de treino”, “treino” como nome do plano, “Revisar/trocar treino ou plano” como tipo padrão, “Criar treino”.

| Área | Plano |
|---|---|
| Fallback / nutri / personal | Plano de acompanhamento |
| Professor de esportes | Estratégia do período |
| Professor particular | Plano de ensino/acompanhamento |
| Consultor / mentor | Plano de ação |

Sessão do personal continua podendo se chamar “treino” (o atendimento), sem editor interno.

## 3. Recorrência

Persistida em `recurrence` + `filter_json` (sem migration). Tipos: weekly, biweekly, monthly, bimonthly, quarterly, interval, once.

Concluir ocorrência avança `next_run_on` e **não** arquiva a série (exceto `once`). Encerrar a série = `status=archived`. Preview humano via `POST /routines/preview`. TZ da organização.

## 4. Exemplos por profissão

Centralizados em `apps/web/src/lib/form-guidance.ts` (`evaluationGuidance`, `planGuidance`, `routineTypes`).

## 5. Persistência

Testes: `test_weekly_complete_advances_without_archiving` (uma linha, duas conclusões, sem duplicar); ocorrência única arquiva.

## Riscos

- Recorrência quinzenal/mensal por posição depende de `starts_on` bem preenchido.
- Playwright da suíte 2A–2D antiga continua frágil em rótulos.
- Sem deploy HML nesta rodada até CI.
