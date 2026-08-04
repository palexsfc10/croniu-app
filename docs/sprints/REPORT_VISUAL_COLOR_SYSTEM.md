# Relatório — Visual Color System Refresh

**Branch:** `feature/visual-color-system-refresh`  
**SHA base:** `c956ed7c86e4c7f7830a4195d2f72c7b7a355d45`  
**SHA final:** `f0bcfd533bbb9247f7640712320624bf0be3726a`  
**Data:** 2026-08-04  

## Diagnóstico inicial

- Shell já responsivo (sidebar `md+` / bottom nav mobile), mas aparência “cinza sobre branco”.
- `Button` sem hierarquia (todas as variantes = wash suave).
- Tokens incompletos (sem AI, subtles, info, progress).
- HEX / `bg-red-50` espalhados em auth e formulários.
- Estados de ciclo/pagamento comunicados só por texto.
- Portal com gradiente creme fora da identidade do painel.
- Wordmark homologado preservado (`#152033` / `#2f3f8f`).

## Referências / princípios

Todoist · Asana · Linear · Stripe · Material 3 · Atlassian — equilíbrio neutro + cor funcional.  
**Cor tem função.** ~80% neutros, marca controlada, estados semânticos com texto.

## Paleta primitiva (final)

Índigo brand-50…900 (primary = `#4338CA` / brand-700, AA em branco).  
Teal / violeta AI / verde `#15803D` / âmbar `#B45309` / vermelho `#B91C1C` / info `#0369A1` / slate neutros.  
Fundo app `#F8F9FC`.

## Tokens semânticos

Estruturais, marca, AI (`--color-ai*`), progress/teal, success/warning/danger/info/neutral (+ subtles).  
Aliases `--color-*` mantidos para compatibilidade.

## Matriz de domínio

| Situação | Tom | Complemento |
|----------|-----|-------------|
| Compromisso hoje | primary + rail | horário + texto |
| Ciclo vigente | progress / “Vigente” | badge |
| Ciclo terminando | warning / “Termina em breve” | badge + rail |
| Ciclo encerrado | neutral | badge |
| Pagamento pendente | warning | badge |
| Pagamento recebido | success | badge + superfície |
| Assistente | AI / violeta | badge “IA” + surface-ai |

## Arquivos principais

- `apps/web/src/app/globals.css`
- `components/ui/{button,badge,empty-state,text-field,text-area}.tsx`
- `lib/status-tone.ts`
- `components/app/{app-shell,today-board,contextual-bar}.tsx`
- Telas: cycles, agenda, receivables, assistant, portal, clients, auth alerts
- `docs/UX_UI.md`

## Mobile vs desktop

Mobile: header + Assistente violeta + bottom nav índigo ativo.  
Desktop: sidebar `app-sidebar`, item ativo em primary-subtle, Assistente com badge IA.

## Portal

Mesma identidade (teal/progress + badges); fundo acolhedor com tokens (não creme genérico). Sem mudança de auth/bearer.

## Fundação IA

Tokens `--color-ai*`, `btn-ai`, `badge-ai`, `surface-ai`, `card-rail-ai`; entrada Assistente marcada; sem chatbot falso.

## Gates

| Gate | Resultado |
|------|-----------|
| Vitest | PASS (suite web) |
| typecheck | PASS |
| lint | PASS |
| build | `next build --webpack` (Turbopack bloqueado no Windows — padrão do repo) |
| A11y automatizada | Sem ferramenta dedicada no repo; contraste AA validado na escolha dos tokens; foco via `--color-ring`; estados com texto+badge |
| Capturas before/after | Não geradas nesta sessão (sem browser MCP/servidor estável); revisar visualmente no `dev --webpack` |

## Backend / billing / Jarvis

**Não alterados nesta sprint visual.** (Working tree pode conter mudanças pré-existentes de sprints anteriores — preservadas.)

## Débitos

- Capturas visuais manuais ainda necessárias.
- Nem todas as telas densas (detalhe de cliente, templates) receberam rails.
- Admin não sincronizado com os novos tokens.
- Dark mode não implementado (proposital).

## GO / NO-GO billing

**GO condicional** para iniciar sprint de billing após revisão visual rápida (Hoje desktop/mobile, portal, Assistente) pelo product owner.  
Bloqueadores técnicos do color system: nenhum. Capturas e aceite visual humano ainda pendentes.
