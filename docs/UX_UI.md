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

### Real hoje (`IMPLEMENTADO` — Sprint 2B)

| Item | Rota |
|------|------|
| Hoje | `/app` |
| Agenda | `/app/agenda` |
| Clientes | `/app/clients` |
| Ciclos | `/app/cycles` |
| Mais | `/app/profile` (+ Preferências, Locais, Serviços) |

Logout permanece em Mais. Wordmark homologado preservado.

## Home “Hoje”

Dados reais: compromissos do dia, ciclos encerrando, recebimentos, ação prioritária, hint contextual.  
Não é dashboard decorativo. Agenda não substitui dores comerciais.

## Barra contextual

| Regra | Status |
|-------|--------|
| Uma ação / contexto | `IMPLEMENTADO` |
| Sem carrossel automático | `IMPLEMENTADO` |
| Oculta sem ação | `IMPLEMENTADO` |
| Próximo compromisso | `IMPLEMENTADO` (prioridade: em andamento → próximas 2h → conflito → …) |

Usada no shell + detalhes de cliente/ciclo/recebível.

## Preferências / locais / agenda / ciclo

| Superfície | Status |
|------------|--------|
| Mais → Preferências (timezone IANA pesquisável) | `IMPLEMENTADO` |
| Mais → Locais | `IMPLEMENTADO` |
| Mais → Serviços (valor/aula) | `IMPLEMENTADO` |
| Mais → Modelos de ciclo | `IMPLEMENTADO` |
| Fluxo progressivo de ciclo inteligente | `IMPLEMENTADO` |
| Detalhe do ciclo → Editar valores (desconto/final) | `IMPLEMENTADO` (2C.1) |
| Confirmação + aviso “Agenda permanecerá igual” | `IMPLEMENTADO` |
| Bloqueio UX se pagamento confirmado | `IMPLEMENTADO` |
| Agenda diária (lista cronológica) | `IMPLEMENTADO` |
| Calendário mensal | `PLANEJADO` |

## Tokens / tipografia / cores

Design tokens em CSS (Tailwind 4 / variáveis `--color-*`). Tipografia e tokens: manter consistência com o wordmark; não introduzir Inter/Roboto/Arial como “marca”.

### Sistema cromático (`IMPLEMENTADO` — visual color refresh)

| Papel | Uso |
|-------|-----|
| Índigo (`--color-primary` / brand-700) | CTA, nav ativa, links, foco |
| Violeta (`--color-ai*`) | Somente Assistente / IA |
| Teal (`--color-progress*`) | Ciclo vigente, evolução, acompanhamento |
| Verde / âmbar / vermelho / azul info | Sucesso, atenção, perigo, informação |
| Neutros azulados | Fundo `#F8F9FC`, superfícies, bordas |

Wordmark permanece homologado (`#152033` / `#2f3f8f`). Dark mode não implementado; tokens deixam espaço futuro.

Componentes: `Button` (primary/secondary/outline/ghost/danger/success/ai), `Badge` semântico, trilhos `card-rail-*`.

## Estados de UI

Carregando · vazio · erro · sucesso · sem conexão · acesso negado · sessão expirada.

## Acessibilidade e responsividade

HTML semântico; teclado; foco; labels; contraste; toques ≥ 44px; `prefers-reduced-motion`; coluna única no mobile. Desktop (`md+`): sidebar com nav principal + Assistente/Manual; bottom nav só no mobile.

## Meu Ciclo (público)

`IMPLEMENTADO` — `/c/{token}`; BrandWordmark; sem nav do profissional; robots noindex.

## Dados

Mocks só em seed demo identificado (`[DEMO-CRONIU]`). Nunca mock disfarçado em HML/prod.
