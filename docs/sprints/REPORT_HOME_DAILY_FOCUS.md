# Relatório — Home daily focus

**Branch:** `feature/home-daily-focus`  
**SHA base:** `915ed66ae227b308e49700b6bce1f2cdc54cf698`  
**SHA final:** `9d2327cbe0cae58700b1ef590b5f814d962fcf3a`  
**Migration head:** `0011_renewal_whatsapp` (sem migration nesta sprint)

## 1. Diagnóstico inicial

A home repetia a mesma orientação operacional em três camadas:

- faixa `ContextualBar` (“Próximo”) com o título da prioridade;
- `contextual_hint` quantitativo azul;
- card “Ação prioritária” + listas por entidade (ciclos, renovações, pagamentos).

Compromissos `scheduled` cujo `ends_at` já havia passado continuavam na lista principal como se fossem “próximos”.  
“Tudo certo por aqui” podia aparecer no bloco de pagamentos mesmo com outras pendências.

## 2–4. Branch / SHA / baseline

| Item | Valor |
|------|--------|
| Branch | `feature/home-daily-focus` |
| SHA base | `915ed66` |
| Baseline | home/agenda 15 passed; ui/greeting 10 passed |

## 5. Componentes removidos ou reorganizados

| Antes | Depois |
|-------|--------|
| `ContextualBar` na home | Removida só da home |
| Hint quantitativo azul | `contextual_hint` sempre `null` no summary |
| Listas separadas (ciclos / renovações / pagamentos / empty “Tudo certo”) | Seção única **Precisa de atenção** |
| Header mobile com nome + Manual + Assistente + org | Croniu + Assistente compacto + menu de perfil |
| Grid 2 colunas genérico | Coluna principal (prioridade + agenda) + coluna atenção no desktop |

## 6. Regra final de priorização (backend)

Ordem determinística em `build_home_summary`:

1. compromisso em andamento  
2. compromisso nas próximas 2h  
3. conflito de agenda do dia  
4. renovação solicitada (portal)  
5. pagamento informado aguardando conferência  
6. recebimento atrasado  
7. ciclo encerrando **sem** renovação aberta do mesmo ciclo  
8. próximo compromisso restante do dia  
9. recebimento a vencer / ciclo aguardando contato (fallback)

## 7. Deduplicação

Se existe `renewal_request` para `source_cycle_id`, o ciclo **não** entra em `cycles_nearing_end` nem em `attention_items` como `cycle_nearing_end`. A renovação prevalece.

## 8. Compromissos passados

- `upcoming_appointments`: `scheduled` com `ends_at > now`  
- `appointments_needing_outcome`: `scheduled` com `ends_at <= now`  
- Não há auto-conclusão; CTA existente em `/app/appointments/{id}` (realizado / falta)  
- Passados sem desfecho entram em **Precisa de atenção** (`appointment_needs_outcome`)

## 9. Timezone

IANA da organização (`Organization.timezone`), via `agenda.org_local_today` / `ZoneInfo`. Saudação e horários usam o mesmo fuso.

## 10–11. Estrutura mobile / desktop

**Mobile:** saudação → ação prioritária → próximos → atenção; bottom nav preservada; `pb-28` + safe area.

**Desktop:** sidebar intacta; home em `lg:grid-cols-[1.4fr_1fr]` (agenda/prioridade | atenção).

## 12. Cabeçalho

- Identidade Croniu  
- Assistente acessível (compacto no mobile)  
- Menu de perfil (avatar/iniciais): org, papel, Conta, Manual  
- Manual também em Mais / rodapé da sidebar desktop

## 13. Estados vazios

| Situação | Mensagem |
|----------|----------|
| Home totalmente limpa | “Tudo organizado” |
| Sem próximos, com outras seções | “Nenhum outro compromisso hoje…” |
| Atenção vazia (com outras seções) | “Tudo certo por aqui…” (só nessa seção) |
| Sem prioridade e sem atenção | card “Seu dia está organizado” |
| Erro de load | alerta na página (não empty positivo) |

## 14. Endpoints / serviços

- `GET /api/v1/home/summary` enriquecido (`upcoming_appointments`, `appointments_needing_outcome`, `attention_items`, `cta_label`)  
- Sem novo endpoint; sem migration

## 15. Arquivos principais

- `backend/app/services/domain.py` (`build_home_summary`)  
- `backend/app/schemas/domain.py`  
- `apps/web/src/components/app/today-board.tsx`  
- `apps/web/src/components/app/app-shell.tsx`  
- `apps/web/src/lib/api.ts`  
- `backend/tests/test_home_daily_focus.py`

## 16–18. Testes e gates

| Gate | Resultado |
|------|-----------|
| Backend full | **115 passed** |
| Frontend vitest | **34 passed** |
| Lint | 0 errors (1 warning prévia `no-img-element` em BrandMark) |
| Typecheck | OK |
| Build (`next build --webpack`) | OK |

Novos testes: prioridade, passado≠próximo, renovação>ciclo, empty, isolamento tenant; UI sem hint redundante e sem empty contraditório.

## 19. Evidências visuais

Homologação visual manual pendente (mobile estreito / largo / tablet / desktop + cenários da spec). Ambiente local pronto; capturas devem usar dados fictícios.

## 20. Isolamento multi-tenant

Coberto por `test_home_summary_tenant_isolation` e suíte agenda existente.

## 21. Riscos / pendências

- Capturas visuais ainda humanas  
- Árvore ainda contém alterações **preexistentes** fora desta sprint (ícones/PWA, avaliações, e2e 2c, etc.) — preservadas, não misturadas no relatório como entrega desta sprint  
- `ContextualBar` permanece em detalhes; docs UX atualizados  
- Prioridade de conflito de agenda mantida (operacional) embora não listada explicitamente na ordem conceitual da spec

## 22. Roteiro curto de homologação

1. Login com org timezone `America/Sao_Paulo`  
2. Criar compromisso futuro → prioridade “próximo compromisso”  
3. Criar compromisso passado sem desfecho → some de “próximos”, aparece em atenção  
4. Ciclo encerrando + renovação do mesmo ciclo → só renovação  
5. Sem pendências → “Tudo organizado” / sem “Tudo certo” contraditório  
6. Mobile: header só marca + IA + avatar; Manual no menu  
7. Desktop: duas colunas; Assistente na sidebar  

## 23. Recomendação

**GO condicional** para merge da branch após homologação visual manual.  
**NO-GO** automático para produção/deploy (fora de escopo).  
Não iniciar etapa financeira.
