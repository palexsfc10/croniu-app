# Auditoria de UX — matriz de problemas

Data: 2026-08-18
Branch: `feature/ux-flow-review-and-polish`
Cenário sintético em HML: organização "UX Audit Synth Org" (2 alunos, ciclo
ativo com aula concluída e futuras, avaliação publicada, recebível atrasado,
renovação próxima, rotina ativa com fan-out, conversa com IA, convite de
cadastro, trial ativo). Removida ao final da validação.

Método: navegação real contra HML (browser) + leitura de código para
confirmar causa e escopo de cada achado. Cobertura não exaustiva das 12
áreas listadas na missão — priorizei achados com evidência concreta
(reproduzidos ao vivo ou confirmados no código) em vez de uma passada
superficial por todas as telas.

| Fluxo | Problema | Evidência | Severidade | Frequência | Esforço | Solução |
|---|---|---|---|---|---|---|
| Hoje (B) | Card de prioridade "Recebimento atrasado" mostra data crua `venceu em 2026-08-08` em vez de pt-BR | `domain.py:914` (+3 ocorrências análogas: 934, 944, 994) | P1 | Alta — card mais visível da tela mais visitada | Baixo | Trocar `.isoformat()` por `.strftime("%d/%m/%Y")` (convenção já usada no mesmo arquivo, linhas 667-668) |
| Agenda (C) | Cabeçalho de navegação de data mostra `2026-08-18` cru | `agenda/page.tsx:294` | P1 | Alta — único rótulo de data da tela | Baixo | Usar `formatHumanDate(day)`, já importado no arquivo |
| Financeiro (H) | Detalhe de recebível mostra `Vencimento: 2026-08-08` cru | `receivables/[receivableId]/page.tsx:72` | P1 | Média | Baixo | `formatDateBR(item.due_on)` |
| Ciclos (F) | Lista de recebimentos do ciclo mostra `status` cru (enum) e `due_on` cru | `cycles/[cycleId]/page.tsx:206` | P1 | Média | Baixo | `receivableStatusLabel(item.status)` + `formatDateBR(item.due_on)` |
| Ciclos (F) | Edição de ciclo mostra a mesma data formatada e crua na mesma linha (`{lastInclusiveIso(...)} · renovação {preview.ends_on}`) | `cycles/[cycleId]/edit/page.tsx:186` | P2 | Baixa (tela de edição) | Baixo | `formatIsoDayMonth(preview.ends_on)` ou equivalente |
| Planos (G) | Preview de marcos do plano mostra `due_on` cru | `clients/[clientId]/plans/new/page.tsx:336,342` | P3 | Baixa (preview antes de salvar) | Baixo | `formatDateBR` |
| Rotinas (I) | **Owner:** ao habilitar/ver pendências, ocorrências aparecem materializadas na própria tela de Rotinas, logo acima de "Criar rotina personalizada" — dá a impressão de que a tela está "criando registros" ali mesmo | Observado ao vivo; `routines-inner.tsx` (`{board.length ? <section>…</section> : null}` antes do botão) | P1 | Alta — confusão de modelo mental relatada diretamente pelo owner | Médio | Extrair pendências para link "Ver pendências" → página própria `/app/routines/pending`; manter "Criar rotina personalizada" exatamente como está |
| Rotinas (I) | **Owner:** abertura dos formulários (sheets) de rotina no mobile "tá ruim" | Código: sheet de ativação de sugestão (`routine-templates-panel.tsx`) não tem `max-h`/`overflow-y-auto`, ao contrário do sheet de rotina personalizada (`routines-inner.tsx`) que já tem — em telas curtas ou com teclado aberto o conteúdo pode ficar cortado sem rolagem | P1 | Média-alta em mobile | Baixo | Aplicar o mesmo `max-h-[min(36rem,calc(100dvh-7rem))] overflow-y-auto` já usado no outro sheet |
| Hoje (B) | "Suas ações de hoje" e "Precisa de atenção" mostram a mesma informação duas vezes ("Revisar plano" individual + "Revisão de planos: 2 para revisar") | Observado ao vivo; `today-board.tsx` `extraAttention` sintetiza cards a partir de contadores independentes da lista real de ocorrências | P2 | Alta | Baixo | Remover os cards sintéticos `plan_review_group`/`feedback_group` de `extraAttention` — `TodayActions` já cobre isso com mais detalhe (cliente, situação) desde a correção anterior |
| Detalhe do cliente (E) | Cliente cadastrado manualmente (sem link de convite) mostra "Próximo: Analisar formulário" — texto sugere revisar uma submissão que não existe | Observado ao vivo | P3 | A investigar — pode ser comportamento correto do estágio de jornada padrão | Médio | Documentado, não implementado nesta rodada — precisa de investigação da lógica de `client_journey` sem risco de regressão em fluxos de intake reais |

## Itens adiados (fora do escopo desta rodada)

- Investigação completa do texto "Analisar formulário" para clientes sem
  submissão de intake (P3, precisa de mais tempo para não arriscar regressão
  no fluxo de intake real).
- Auditoria visual completa (screenshots) em mobile: o ambiente de browser
  desta sessão não conseguiu compor frames para captura de tela (limitação de
  ferramenta, não do produto); a revisão mobile do sheet de Rotinas foi feita
  por leitura de código (classes Tailwind), não por inspeção visual direta.
  Recomenda-se validação visual manual pelo owner após o deploy em HML.
- Cobertura completa das 12 áreas (K — Portal do cliente, G — Avaliações
  edição/histórico, J — Assistente IA voz) não foi auditada em profundidade
  nesta rodada por tempo; nenhum problema P0 foi encontrado nas áreas
  parcialmente cobertas.
- Notificação push/local real na data e horário da rotina — confirmado com o
  owner que **não** entra nesta entrega; "notificar" aqui significa aparecer
  corretamente em Hoje/Agenda, já garantido pela correção anterior de
  Rotinas.

## Nenhum P0 encontrado

Não identifiquei bloqueio, perda de dados ou falha de segurança nos fluxos
auditados nesta rodada.
