# Relatório — ordem da análise, ficha e ciclos

## Veredito

INTAKE REVIEW BEFORE DECISION — APPROVAL MOVED AFTER ANAMNESIS — CLIENT FOLLOW-UP CARDS POLISHED WITH FUNCTIONAL ICONS — HUMANIZED DATES — CYCLES FILTERABLE BY STATUS, MONTH AND DATE RANGE — EXISTING SCHEDULE AND BILLING RULES PRESERVED — MOBILE HML READY FOR HUMAN REVIEW

## 1. Diagnóstico do vídeo

A análise do novo aluno abria no card **Decisão** (mensagem, Aprovar, ajuste, motivo interno, Recusar), ocupando a primeira dobra e adiando anamnese, alertas e consentimentos.

## 2. Ordem anterior

Cabeçalho → Decisão sticky → telefone/objetivo → AnamnesisReader → Consentimentos.

## 3. Ordem final

Cabeçalho compacto → Resumo do cadastro → Pontos de atenção → Possível duplicidade → Respostas (accordions) → Consentimentos → Finalizar análise.

## 4. Mudanças na decisão

Aprovar / Solicitar ajuste / Recusar só no final. Cada ação abre bottom sheet próprio. Motivo interno não fica visível na leitura. Recusa pede confirmação. Barra “Revisão concluída? / Decidir” rola até o bloco final (não sticky sobre a bottom nav).

## 5. Bloqueios de carregamento

Skeleton sem card de decisão. Erro: “Ainda não foi possível carregar as respostas” + retry + voltar à fila. Sem anamnese carregada não há Aprovar.

## 6–9. Resumo, alertas, duplicidade, consentimentos

Resumo com ícones da biblioteca (alvo, histórico, atividade, calendário, alerta, telefone). Alertas em âmbar, sem diagnóstico. Duplicidade com contato mascarado e “Ver cliente existente” se houver id. Consentimentos antes da decisão.

## 10–13. Ficha

Abas preservadas. Mensagem de portal só em Dados. Cards compactos (ciclo, plano, avaliações, rotinas) com uma ação principal. Plano publicado: Ver plano; Nova versão no menu. Datas via `formatHumanDateRange` (sem ISO `→`).

## 14–16. Ciclos

Filtro client-side sobre `GET /api/v1/cycles` (sem mutação): Em andamento / Próximos / Encerrados / Todos; Este mês / 30 dias / personalizado / mês com chevrons e Hoje. Sobreposição `start <= period.end && end >= period.start`. Timezone comercial via `local_today` da organização.

## 17–19. Filtros e regressão

Filtro de serviço em painel secundário. Excluir/editar permanece em “Mais”. Filtro não chama create/cancel/agenda/billing.

## 20–23. Testes

- `page.test.tsx` da análise (ordem, modal, bloqueio de erro, sem enums).
- `client-profile.test.tsx` (datas humanas, Ver plano sem Criar concorrente, portal fora do header).
- `date-format.test.ts` / `cycle-period` (overlap, sem mutação).
- Web: 141 testes. Typecheck ok. Lint da página ok.

## 24–27. HML / riscos

Sem migration nova. Head permanece `0022_form_template_pin`. Backup só se o deploy HML seguir o script existente (pg_dump). Prints sanitizados e smoke humano pendentes após CI verde. Agrupamento temporal fino (esta semana / este mês) ainda simples quando a lista é curta.

## 28. Validação humana

Fila → análise (rolar até decisão) → aprovar no sheet; ficha Acompanhamento; Ciclos (mês, 30 dias, intervalo, ciclo que atravessa o período) sem alterar aulas/valor.
