# Croniu — UX / UI

Baseline **homologada** pelo responsável do produto (identidade). Fonte de produto: [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md).

## Direção visual

- Moderno · diferenciado · clean · sênior · mobile-first  
- Identidade própria; **sem** aparência de template  
- Orientado à rotina; leve; não dashboard genérico de gráficos  

### Wordmark oficial (`BrandWordmark`) — **protegido**

Canônico: `packages/brand` (+ cópias em `apps/*/src/components/brand`, manter sincronizadas).

| Regra | Detalhe |
|-------|---------|
| Visual | `Cron` negrito + `iu`, degradê ink→azul da marca (`#152033` → `#2f3f8f`), sem espaço |
| Acessível | Nome integral `Croniu` (`role="img"`; partes `aria-hidden`) |
| Auth | Logo à **direita**; título à esquerda |
| Admin | Wordmark + rótulo textual **Admin** (nunca dentro do logo) |
| Metadata | String integral `Croniu` |

**Proibido** alterar o wordmark homologado sem nova autorização de produto.

### Evitar (padrões proibidos)

Gradientes excessivos; cards demais; ícones sem função; “purple SaaS”; tabelas largas no mobile; menus complexos; copiar Arena Kyvora; botões mortos na nav.

## Navegação

### Planejada (produto)

Hoje · Agenda · Clientes · Ciclos · Mais

### Real hoje (`IMPLEMENTADO`)

| Item | Rota |
|------|------|
| Hoje | `/app` |
| Clientes | `/app/clients` |
| Ciclos | `/app/cycles` |
| Mais | `/app/profile` (+ serviços) |

**Agenda:** ausente da nav até existir módulo (`PLANEJADO`).

## Home “Hoje”

Dados reais: ciclos encerrando, recebimentos, ação prioritária, hint contextual.  
Não é dashboard decorativo.

## Barra contextual

| Regra | Status |
|-------|--------|
| Uma ação / contexto | `PARCIAL` |
| Sem carrossel automático | `IMPLEMENTADO` (não há carrossel) |
| Oculta sem ação | parcial (componente por página) |
| Próximo atendimento | `PLANEJADO` |

Usada em detalhes de cliente/ciclo/recebível + hint no `TodayBoard`.

## Tokens / tipografia / cores

Design tokens em CSS (Tailwind 4 / variáveis `--color-*`). Tipografia e tokens: manter consistência com o wordmark; não introduzir Inter/Roboto/Arial como “marca”.

## Estados de UI

Carregando · vazio · erro · sucesso · sem conexão · acesso negado · sessão expirada.

## Acessibilidade e responsividade

HTML semântico; teclado; foco; labels; contraste; toques ≥ 44px; `prefers-reduced-motion`; coluna única no mobile.

## Meu Ciclo (público)

`PLANEJADO` — simples, minimização LGPD.

## Dados

Mocks só em seed demo identificado (`[DEMO-CRONIU]`). Nunca mock disfarçado em HML/prod.
