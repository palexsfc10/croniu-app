# Analytics — GTM/GA4 + Meta Pixel no app (`apps/web`)

## Visão geral

O app (`app.croniu.com.br`) agora carrega o **mesmo contêiner GTM**
(`GTM-NVQ74CPL`) já usado pelo site institucional (ver
`croniu-site/docs/ANALYTICS.md`), com GA4 configurado como tag **dentro**
dele, mais o **Meta Pixel** (`1560028922592261`) carregado separadamente
(Meta não tem um tag manager próprio aqui).

Diferença estrutural importante em relação ao site institucional: **HML e
PRD compartilham uma única imagem Docker já construída**
(`.github/workflows/build-release.yml` builda `apps/web` uma vez e promove a
mesma imagem para os dois ambientes — ver `docs/PROJECT_STATE.md` /
memória do agente sobre o fluxo de deploy). Isso significa que
`NEXT_PUBLIC_GTM_ID`/`NEXT_PUBLIC_META_PIXEL_ID` ficam **embutidos da mesma
forma nos dois ambientes** — ao contrário do site, onde "não passar a
variável de build" já bastava para desativar o GTM em não-produção, aqui
isso **não** é suficiente. O que efetivamente impede HML de mandar dados
para as contas produtivas do GA4/Meta é um **gate em runtime**, não a
ausência da variável de build.

## O gate HML/PRD

`CRONIU_ENV=hml` — já definido em `croniu-hml-web`
(`deploy/hml/compose.hml.yaml`) e deliberadamente ausente no serviço `web`
de `deploy/prd/compose.prd.yaml` (o mesmo sinal que já protege a rota
`/app/dev/design-system`). Lido uma vez em `apps/web/src/app/layout.tsx`:

```ts
const isHml = process.env.CRONIU_ENV === "hml";
```

Passado como prop para os componentes de script. **Deliberadamente não** o
Host header da requisição (`next/headers`'s `headers()`): usar `headers()`
na raiz do layout marcaria toda a árvore de rotas como dinâmica —
verificado com `next build`: a maioria das rotas do app (incluindo
`/register`, `/login`, `/termos`, `/privacidade` e boa parte de `/app/*`) é
hoje estática (`○`), e usar `headers()` no layout raiz as tornava todas
`ƒ` (server-rendered a cada requisição). `CRONIU_ENV` é uma leitura de
env var — não é uma API dinâmica do Next, não tem esse custo.

Como segunda camada, independente e sem custo de build (roda só no
navegador, depois da hidratação): o próprio snippet do GTM
(`GtmContainerScript`, em `apps/web/src/components/analytics/gtm-scripts.tsx`)
e o componente do Meta Pixel (`MetaPixelScripts`) reconferem
`location.hostname.startsWith("croniu-hml")` antes de efetivamente
carregar/enviar qualquer coisa. Mesmo que `CRONIU_ENV` estivesse ausente ou
errado numa requisição que ainda assim resolvesse para o host de HML, nada
seria enviado.

`isGtmScriptAllowed(isHml)` / `isMetaPixelEnvAllowed(isHml)`
(`src/lib/analytics/gtm.ts`, `meta-pixel.ts`) exigem, além de `!isHml`: o id
correspondente estar definido e `NODE_ENV === "production"` (sempre
verdadeiro no runner do Docker — mantido por paridade com o site, não é o
que segura HML/PRD aqui).

## Diferença deliberada do site: `dataLayer.push` é incondicional

`trackPageView`/`trackSignUp` (`gtm.ts`) empurram para `window.dataLayer`
**independentemente** de `isGtmScriptAllowed`. No site institucional,
`push()` só funciona quando o GTM está habilitado — o suficiente lá, porque
"habilitado" já implica "é produção real". Aqui, como HML pode legitimamente
ter os ids embutidos (mesma imagem), gatear o push também gatearia a única
forma de **validar em HML sem nunca mandar nada a Google/Meta**: com o push
incondicional, `window.dataLayer` fica inspecionável no devtools de HML
(`https://croniu-hml.ntws.cloud`) mesmo com o contêiner nunca carregado —
zero risco de contaminar a propriedade GA4 produtiva, porque nada sai da
página sem o script do GTM carregado.

O Meta Pixel não tem esse padrão de "fila sempre presente" da mesma forma —
`window.fbq` só existe depois que o snippet carrega — então
`trackPixelCompleteRegistration()` é um no-op seguro (`typeof window.fbq ===
"function"`) quando o Pixel nunca foi injetado, o que é sempre o caso em
HML.

## Consentimento (LGPD + Consent Mode)

`src/lib/analytics/consent.ts` — mesmo modelo do site (necessários sempre
ativos, analytics e marketing como categorias opcionais, negado por
padrão), chave própria de `localStorage`
(`croniu_app_consent_v1`, diferente da do site: a escolha feita em
croniu.com.br não atravessa automaticamente para app.croniu.com.br — são
origens diferentes — então "respeitar o consentimento existente" aqui
significa nunca assumir "sim" sem uma decisão explícita nesta origem).

`ConsentBanner` (`src/components/analytics/consent-banner.tsx`) só renderiza
quando pelo menos um dos dois (GTM ou Pixel) poderia carregar
(`isGtmScriptAllowed || isMetaPixelEnvAllowed`) — nunca aparece em HML ou
em dev local.

A categoria **Marketing** do banner controla especificamente o Meta Pixel:
`MetaPixelScripts` só injeta o snippet depois de `marketing: true` estar
gravado (`isMetaPixelScriptAllowed`), reagindo em tempo real a uma mudança
de consentimento via o evento `croniu:app-consent-updated` — sem precisar
recarregar a página. O GTM segue o padrão de Consent Mode do Google: o
contêiner carrega sempre que permitido por `isGtmScriptAllowed` (host/env),
e é o **Consent Mode** (`consent default`/`update` no dataLayer) que decide,
dentro da tag GA4 configurada no próprio GTM, se o hit é de fato enviado.

> ⚠️ Mesma exigência do site: a tag GA4 (GA4 Configuration) dentro do GTM
> precisa ter **"Send a page view event when this configuration loads"**
> desmarcado — o `page_view` aqui é 100% manual
> (`route-pageview-tracker.tsx`), senão todo pageview seria contado em
> dobro.

## Rotas sensíveis: `/c/[token]` e `/entrar/[token]` nunca são rastreadas

Essas duas rotas carregam um **token de capacidade** (bearer) diretamente
no path — quem tiver a URL acessa o portal do cliente ou o link mágico de
entrada sem sessão nenhuma (ver as chamadas a
`/api/v1/public/my-cycle/:token` em `app/c/[token]/page.tsx`). É por isso
que `next.config.ts` já manda `Referrer-Policy: no-referrer` e
`X-Robots-Tag: noindex` para esses dois prefixos.

- `RoutePageviewTracker` nunca chama `trackPageView` para essas rotas
  (`isSensitiveTokenRoute`, `src/lib/analytics/sensitive-routes.ts`) — sem
  isso, `page_path`/`page_location` vazariam o token para o GA4.
- Um referrer same-origin apontando para uma dessas rotas é descartado
  (`sanitizeReferrer`) na página seguinte, para o token não vazar via
  `page_referrer` depois que o visitante sai da rota sensível.
- `MetaPixelScripts` nunca injeta o snippet enquanto a rota atual é uma
  dessas duas — o `PageView` automático do `fbq` lê `location.href` para o
  parâmetro `dl`, o que vazaria o token para o Meta mesmo com
  `Referrer-Policy: no-referrer` (essa política só governa o header HTTP
  `Referer`, não esse parâmetro construído pelo próprio snippet).

## Eventos implementados

| Evento | Onde dispara | Parâmetros | Observação |
|---|---|---|---|
| `page_view` | Carga inicial + toda mudança real de rota SPA (`RoutePageviewTracker`, via `usePathname`, guarda por `ref` contra duplicação), **exceto** `/entrar/[token]` e `/c/[token]` | `page_location`, `page_path`, `page_title`, `page_referrer?` | UTMs da LP preservados automaticamente: `page_location` usa `window.location.href`, que já carrega a query string intacta |
| `sign_up` | Só depois do backend confirmar a conta: `register-form.tsx` (após `POST /api/v1/auth/register` sem erro — inclusive quando `requires_email_verification` é true, a conta já existe), `register-form.tsx`/`login-form.tsx` (`POST /api/v1/auth/google` com `is_new_user: true`) | `method: "email"\|"google"`, `utm_source?`, `utm_medium?`, `utm_campaign?`, `utm_content?`, `utm_term?`, `gclid?` | Nunca dispara em erro, em `requires_email_verification` sozinho (a conta já existe, então dispara mesmo assim), nem quando o Google loga numa conta já existente (`is_new_user: false`) ou apenas vincula uma conta (`/api/v1/auth/google/link`) |
| `CompleteRegistration` (Meta Pixel) | Mesmo ponto exato do `sign_up` acima (`trackPixelCompleteRegistration`, chamado junto de `trackSignUp`) | — | No-op seguro se o Pixel nunca carregou (`window.fbq` indefinido) — sempre o caso em HML |

## Variáveis de ambiente (build-time)

| Variável | Onde | Valor |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | `apps/web/Dockerfile` (ARG/ENV do estágio `builder`), passada em `.github/workflows/build-release.yml` (build-args do job `web`) | `GTM-NVQ74CPL` |
| `NEXT_PUBLIC_META_PIXEL_ID` | idem | `1560028922592261` |

Ambas embutidas na **mesma** imagem promovida para HML e PRD — não são o
mecanismo de isolamento (ver "O gate HML/PRD" acima). O build ad-hoc de HML
(`deploy/hml/deploy.sh up-web`) não as define — herdam o default vazio do
Dockerfile, camada extra de proteção só nesse caminho de build específico.

## Como validar

**Em HML** (`https://croniu-hml.ntws.cloud`) — sem nunca enviar nada a
Google/Meta, por design (ver seção acima):
1. Abrir o devtools, navegar por `/register`, completar um cadastro de
   teste, navegar por algumas rotas do app.
2. Inspecionar `window.dataLayer` no console — confirmar exatamente um
   `page_view` por rota visitada, o `sign_up` aparecendo uma única vez logo
   após o cadastro, e nenhum evento para `/entrar/[token]`/`/c/[token]` se
   essas rotas forem visitadas no fluxo.
3. Confirmar que nenhuma requisição de rede para
   `googletagmanager.com`/`facebook.com`/`facebook.net` aparece na aba
   Network — o comportamento esperado em HML é dataLayer populado, zero
   tráfego de saída.

**Em produção** (`https://app.croniu.com.br`, após promoção autorizada):
1. GTM → modo **Preview**, apontando para `app.croniu.com.br`.
2. GA4 → **Tempo Real** e **DebugView**: confirmar `page_view` na carga
   inicial de `/register`, em pelo menos uma navegação SPA, e `sign_up` após
   um cadastro de teste — com os parâmetros documentados acima, sem nenhum
   campo de texto livre ou token.
3. Meta Events Manager → **Test Events**: confirmar `PageView` e
   `CompleteRegistration` na mesma jornada.
4. Confirmar que a mesma jornada testada em HML (passo anterior) não deixou
   nenhum rastro nessas ferramentas — só o teste feito diretamente em PRD
   deve aparecer.

## Testes automatizados

`src/lib/analytics/*.test.ts`, `src/components/analytics/*.test.tsx`, e as
asserções de `sign_up` adicionadas a `register-form.test.tsx` e
`login-form.test.tsx` cobrem: o gate HML/PRD, o payload exato de cada
evento, a dedupe de `page_view` por rota, a exclusão de
`/entrar/[token]`/`/c/[token]`, a sanitização de referrer, o consentimento
(inclusive não pré-marcar categorias opcionais), e o disparo de `sign_up`
apenas após confirmação do backend — email e Google, incluindo o caso de
Google logando numa conta existente (não deve disparar).

## Adicionando um evento novo

Mesma regra do site: tipo + helper em `gtm.ts` (ou `meta-pixel.ts` para o
Pixel), nunca `window.dataLayer.push`/`window.fbq` direto num componente;
teste confirmando o payload exato; documentar nesta tabela; criar o
gatilho/tag correspondente no GTM (fora deste repositório).
