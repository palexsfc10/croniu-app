# Login com Google — arquitetura, operação, limites

Branch: `feature/google-auth-professional-onboarding` (a partir de
`hotfix/intake-link-existing-client-dedup`, o topo real de desenvolvimento — não de
`release/croniu-prd-v1`, que está 162 commits atrás e ainda não tem o onboarding
profissional). Ver [`ADR-044-google-auth.md`](./ADR-044-google-auth.md) para as decisões e por quê.

## 1. Arquitetura

```
Browser                         apps/web (Next.js)                 backend (FastAPI)
--------                        -------------------                 -----------------
"Continuar com Google"  ──►  Google Identity Services (accounts.google.com/gsi/client)
                                 renderButton() + initialize()
                                          │
                              credential (ID token assinado)
                                          │
                              POST /api/v1/auth/google  ──────►  verify_google_id_token()
                                 { credential }                    (google-auth lib: assinatura,
                                                                     issuer, audience, exp)
                                                                          │
                                                                    authenticate_with_google()
                                                                    (user_auth_identities lookup,
                                                                     register_owner reuse, ou
                                                                     409 google_link_required)
                                                                          │
                                                                    create_session() /
                                                                    set_session_cookie()
                              ◄────────── cookie croniu_session (mesmo mecanismo do /auth/login)
```

Não há OAuth "authorization code + PKCE" nesta entrega: o fluxo é o ID-token direto do Google
Identity Services (popup, sem redirect), validado inteiramente no backend antes de qualquer
sessão ser criada. Justificativa: o Croniu já é frontend + backend no mesmo domínio efetivo
(browser fala `/api` same-origin), não há necessidade de trocar um `code` por token via
backend-to-backend — o ID token do GIS já chega ao backend pronto para validação, com menos
superfície (nenhum redirect URI para proteger contra abuso).

## 2. Modelo de dados

### `user_auth_identities` (nova, migration `0025_user_auth_identities`)

| coluna | tipo | notas |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK `users.id` ON DELETE CASCADE | |
| `provider` | `varchar(32)` | `"google"` nesta entrega |
| `provider_subject` | `varchar(255)` | claim `sub` — **chave de identidade**, nunca o e-mail |
| `email` | `varchar(320)` | e-mail retornado pelo provider no último login |
| `email_verified` | `boolean` | claim `email_verified` do provider no último login |
| `display_name` | `varchar(200)` nullable | claim `name` |
| `avatar_url` | `varchar(500)` nullable | claim `picture` |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz nullable | atualizado a cada login |

`UNIQUE(provider, provider_subject)` — garante que a mesma conta Google nunca resolve para dois
usuários Croniu.

### `users.password_hash` — agora nullable

Contas exclusivamente Google gravam `NULL`. Nunca uma senha sintética/placeholder.
`authenticate_user()` recusa login por senha quando `password_hash IS NULL`, com a mesma
mensagem genérica (`invalid_credentials`) de qualquer outra tentativa inválida.

## 3. Fluxos de usuário

### Cenário A — conta nova via Google

1. Nenhuma `user_auth_identities` para o `sub`, nenhum `User` com aquele e-mail.
2. `register_owner(db, email=…, password=None, full_name=…, organization_name=…,
   skip_email_verification_dispatch=claims.email_verified)` — mesmo serviço do registro
   tradicional: cria `User`, `Organization`, `Membership(role="owner")`, `Subscription` (trial),
   tudo na mesma transação.
3. Se `claims.email_verified`: `user.email_verified_at` é setado direto (o Google já provou a
   posse do e-mail; não faz sentido mandar mais um e-mail de verificação Croniu). Senão, dispara
   o mesmo fluxo de verificação por e-mail do registro tradicional.
4. Cria `user_auth_identities` para o `sub`.
5. `organization.profession_code` fica `NULL` — nenhum nicho é presumido do e-mail/nome. O
   `ProfessionNudge` (`apps/web/src/components/app/profession-nudge.tsx`) cobre isso depois do
   primeiro login, exatamente como já cobre para contas tradicionais.

### Cenário B — identidade Google já conhecida (`sub` já vinculado)

Login direto: atualiza `email`/`email_verified`/`display_name`/`avatar_url`/`last_used_at` na
identidade, roda os mesmos `ensure_organization_not_disabled` / `ensure_email_verified` do login
tradicional, cria sessão.

### Cenário C — e-mail já existe como conta tradicional (sem identidade Google ainda)

- **Ambos os lados já verificados** (`claims.email_verified AND
  existing_user.email_verified_at is not None`): vincula automaticamente, loga.
- **Qualquer outro caso**: `409 google_link_required`. O frontend mostra um campo de senha
  inline (no próprio formulário de login/cadastro) e chama `POST /auth/google/link {credential,
  password}` — que só vincula depois de `authenticate_user` confirmar a senha da conta existente.
  Nenhuma vinculação acontece sem essa prova.

### Cenário D — onboarding interrompido

Não há estado "onboarding em progresso" a retomar além do que já existe: `profession_code`/
`profession_onboarding_done` em `Organization` são persistidos assim que preenchidos (nudge ou
registro), e o nudge simplesmente reaparece a cada carregamento do app até serem preenchidos ou
dispensados. Login por Google não reseta nem duplica esse estado — ele só resolve "quem é essa
pessoa" via `user_auth_identities`/e-mail, nunca recria `Organization`.

### Cenário E — conta/organização desativada

`ensure_organization_not_disabled` roda em todos os caminhos (login direto, link, conta nova)
antes de emitir sessão — bloqueios administrativos existentes continuam valendo para Google.

## 4. Endpoints

### `POST /api/v1/auth/google`

```json
{ "credential": "<google-id-token>" }
```

`404` se `GOOGLE_OAUTH_ENABLED=false` (a rota nem revela que existe). `401
invalid_google_token` para qualquer falha de validação do token (assinatura, emissor, audience,
expiração, `sub`/`email` ausentes — mensagem pública genérica, sem detalhar qual checagem
falhou). `409 google_link_required` no cenário C sem prova dupla. `200` com o mesmo shape de
`MeResponse` mais `is_new_user`, `onboarding_required`, `requires_email_verification`.

### `POST /api/v1/auth/google/link`

```json
{ "credential": "<google-id-token>", "password": "<senha-croniu-atual>" }
```

`401 invalid_credentials` se a senha não confere (mesma função `authenticate_user` do login).
`409 google_identity_conflict` se aquele `sub` já estiver vinculado a **outro** usuário (corrida
entre duas abas, por exemplo). `200` igual ao endpoint acima.

Nenhum dos dois aceita parâmetro de redirect — a navegação pós-login é sempre `/app`, decidida
no frontend, igual ao login tradicional. Sem open-redirect possível.

## 5. Variáveis de ambiente

| variável | onde | obrigatória quando |
|---|---|---|
| `GOOGLE_OAUTH_ENABLED` | backend | sempre presente, default `false` |
| `GOOGLE_OAUTH_CLIENT_ID` | backend | obrigatória se `GOOGLE_OAUTH_ENABLED=true` (boot falha sem ela — `validate_google_oauth_contract`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | frontend (build-time, `apps/web/Dockerfile`) | mesmo valor de `GOOGLE_OAUTH_CLIENT_ID`; vazio ⇒ botão não renderiza |

Não há client secret: o fluxo é ID-token do navegador, validado no backend por assinatura
pública do Google — `GOOGLE_OAUTH_CLIENT_ID` não é segredo (é o mesmo valor exposto ao
navegador), mas ainda assim vive fora do repositório (`.env.hml`/`.env.prd`, nunca commitado).

## 6. Google Cloud — o que falta o owner fazer

Nada disso foi criado por esta entrega — não há credencial real em lugar nenhum do repositório.

1. Google Cloud Console → criar um projeto (ou reaproveitar um existente) para o Croniu.
2. OAuth consent screen: nome "Croniu", logo, e-mail de suporte, domínio autorizado
   `croniu.com.br`.
3. Credentials → Create Credentials → OAuth client ID → tipo **Web application**.
4. **Authorized JavaScript origins** (só isso — o fluxo é popup, sem redirect URI):
   - `https://croniu-hml.ntws.cloud`
   - `https://app.croniu.com.br` (só quando for promovido para PRD — não habilitar antes)
   - `http://localhost:3000` (dev local, opcional)
5. Copiar o **Client ID** gerado (formato `xxxxx.apps.googleusercontent.com`) para
   `GOOGLE_OAUTH_CLIENT_ID` **e** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no `.env.hml` do servidor Jarvis
   (nunca commitar). Não existe client secret a proteger neste fluxo.
6. Scopes: nenhum além do padrão OpenID Connect (`openid email profile`) — não solicitar
   Calendar, Gmail, Drive, contatos ou qualquer escopo sensível.

## 7. Habilitar em HML

1. Completar a seção 6 acima (credenciais reais).
2. No servidor, editar `deploy/hml/.env.hml` (arquivo real, fora do Git):
   `GOOGLE_OAUTH_ENABLED=true`, `GOOGLE_OAUTH_CLIENT_ID=<client-id>`,
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client-id>`.
3. Rodar `deploy/hml/_ops_deploy_google_auth.sh <sha>` (segue exatamente o padrão dos outros
   scripts `_ops_deploy_*.sh`: backup do banco, extrai o tarball, rebuild api/web/admin,
   `alembic upgrade head`, healthcheck, smoke). Sem esses dois passos anteriores, o deploy sobe
   com a flag desligada (botão oculto) — comportamento seguro por padrão.
4. Smoke manual: cadastro novo via Google → confirma usuário/organização/trial únicos →
   onboarding de profissão aparece → logout → login novamente via Google → onboarding não
   reaparece → login por e-mail/senha continua funcionando.

## 8. Promoção futura para PRD (não incluída nesta entrega)

Só depois de HML validado e autorização explícita do owner: adicionar
`https://app.croniu.com.br` às Authorized JavaScript origins do **mesmo** Client ID (não criar
um segundo client — um Client ID pode ter múltiplas origens autorizadas, o que permite promover
a mesma imagem de `apps/web` para PRD sem rebuild, igual ao padrão já usado para
`NEXT_PUBLIC_API_URL`), depois `GOOGLE_OAUTH_ENABLED=true` no `.env.prd` real do servidor.

## 9. Como desativar rapidamente

`GOOGLE_OAUTH_ENABLED=false` no `.env` do ambiente e reiniciar o container da API — os
endpoints voltam a responder `404` e o botão desaparece do frontend no próximo build/deploy (o
valor de `NEXT_PUBLIC_GOOGLE_CLIENT_ID` é build-time; para ocultar o botão **sem** rebuild,
`GOOGLE_OAUTH_ENABLED=false` já é suficiente do lado do backend — o clique no botão do frontend
resultaria em `404`, que o `GoogleAuthButton` trata como qualquer outro erro de rede). Nenhuma
identidade em `user_auth_identities` é apagada ao desativar — contas que já vincularam Google
continuam existindo, só não conseguem mais autenticar por esse caminho até a flag voltar.

## 10. Riscos conhecidos e limitações desta entrega

- **Sem Google One Tap** — só o botão explícito, por decisão de escopo (evita comportamento
  surpresa de login automático).
- **PWA standalone**: o fluxo usa popup (`ux_mode: "popup"`); não foi testado dentro do container
  de um PWA instalado neste ciclo (sem ambiente real para isso) — se o popup falhar em algum
  navegador/PWA específico, o `GoogleAuthButton` cai silenciosamente para "botão oculto" em vez
  de quebrar a tela, mas o fallback de **usar e-mail/senha continua sempre visível** ao lado.
- **Sem analytics de terceiros** — os eventos `google_auth_success` / `google_auth_started` /
  `google_link_required` / `google_account_linked` só existem como `logger.info` no backend
  (nunca token, senha ou e-mail completo em log), não há integração com GA4/Mixpanel nesta
  entrega.
- **CSP**: o repositório não tinha Content-Security-Policy antes desta mudança e continua sem
  — não foi introduzida uma CSP nesta entrega (risco de regressão maior que o benefício, fora do
  escopo pedido). Se uma CSP for adicionada no futuro, `script-src`/`frame-src`/`connect-src`
  precisam incluir `https://accounts.google.com` e `https://accounts.google.com/gsi/`.
- **Um único Client ID para HML e PRD**: ver ADR-044 §7 — decisão deliberada para reaproveitar o
  padrão de imagem imutável promovida; se o owner preferir Client IDs separados por ambiente,
  isso só exige trocar o valor da variável por ambiente, sem mudança de código.

## 11. Estratégia de testes

Backend (`backend/tests/test_google_auth.py`): conta nova cria user/org/trial únicos; retorno
por `sub` não duplica; token inválido/sem `sub`/emissor errado/expirado/audience errada são
rejeitados (mockando só a fronteira `google.oauth2.id_token.verify_oauth2_token`, nunca a lógica
própria); `EMAIL_VERIFICATION_REQUIRED=true` soft-gate para conta nova sem e-mail verificado pelo
Google; e-mail já existente sem prova dupla exige `/auth/google/link`; senha errada no link é
rejeitada e não cria identidade; organização desativada bloqueia; conta Google-only não loga por
senha; logout revoga sessão criada via Google; login tradicional continua funcionando depois de
tudo isso plugado.

Frontend: o botão só é montado quando `NEXT_PUBLIC_GOOGLE_CLIENT_ID` existe
(`isGoogleAuthConfigured`), fica oculto (não quebra layout) sem a variável, e o fluxo de
confirmação de senha (`google_link_required`) tem UI dedicada no próprio formulário.

Não cobertos nesta rodada (documentado, não escondido): teste automatizado de concorrência real
em nível de banco (duas requisições simultâneas colidindo na constraint) — a proteção existe
(`IntegrityError` → retry seguro em `_attach_identity`), mas não há teste de carga/concorrência
real; smoke real em HML com credencial Google genuína (depende da seção 6, ainda pendente do
owner).
