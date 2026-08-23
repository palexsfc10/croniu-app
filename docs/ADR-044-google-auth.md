# ADR-044 — Login com Google (OpenID Connect)

## Contexto

O Croniu quer oferecer "Continuar com Google" no cadastro e login, mantendo e-mail/senha
intacto, sem duplicar usuário/organização/trial e sem pular o onboarding profissional
(`profession_code`, `profession_onboarding_done` em `Organization`) para quem realmente precisa
dele. Detalhe funcional/técnico completo: [`GOOGLE_AUTH.md`](./GOOGLE_AUTH.md).

## Decisões

### 1. `sub`, nunca o e-mail, é a chave de uma identidade Google

`user_auth_identities` tem `UniqueConstraint(provider, provider_subject)`. Uma identidade Google
retornando é sempre resolvida por `provider_subject` (claim `sub`, estável e nunca reaproveitado
pelo Google), nunca por e-mail — e-mail pode mudar de dono ao longo do tempo em teoria, e usá-lo
como chave permitiria a um novo dono de um e-mail antigo assumir a conta Croniu de outra pessoa.

### 2. Vinculação automática só com prova dupla de posse do e-mail

Uma credencial Google cujo e-mail já existe como conta tradicional só é linkada automaticamente
quando **os dois lados já provaram posse do e-mail**: claim `email_verified=true` do Google **e**
`User.email_verified_at is not None` no Croniu. Qualquer ausência de uma das duas provas retorna
`409 google_link_required` sem tocar a conta — o frontend pede a senha atual e a vinculação só
acontece depois de `authenticate_user` confirmar (`POST /auth/google/link`). Isso é a mitigação
direta contra account takeover via um e-mail "quase igual" ou uma claim não verificada.

### 3. Backend reaproveita `register_owner`, não duplica a criação de conta

`register_owner` (usado por `/auth/register`) ganhou dois parâmetros aditivos —
`password: str | None` e `skip_email_verification_dispatch: bool` — em vez de o fluxo Google
reimplementar user→organization→membership→trial em paralelo. O caminho de conta nova em
`authenticate_with_google` chama a mesma função, só que sem senha e (quando o Google já
verificou o e-mail) sem disparar o e-mail de verificação próprio do Croniu. Único ponto de
criação de organização/trial no sistema — continua sendo assim.

### 4. `password_hash` vira nullable; nunca senha sintética

Migration 0025 relaxa `users.password_hash` para nullable. Contas 100% Google guardam `NULL`,
nunca uma senha aleatória "invisível" — `authenticate_user` recusa login por senha quando a
coluna é `NULL`, com a mesma mensagem genérica de credencial inválida (não dá para enumerar
contas Google-only tentando logar com senha).

### 5. Sessão, verificação de e-mail e bloqueio de organização são os mesmos do login tradicional

`authenticate_with_google` e `link_google_identity_with_password` terminam chamando
`create_session` / `set_session_cookie` / `ensure_organization_not_disabled` — as mesmas funções
do `/auth/login`. Não existe um mecanismo de sessão paralelo para Google. A única bifurcação é
para conta **nova**: em vez do `ensure_email_verified` (que lança 403 e bloqueia), o retorno traz
`requires_email_verification` e o router responde como o `/auth/register` responde hoje —
"conta criada, confirme seu e-mail" — porque criar a conta sem sessão nesse caso é o comportamento
já esperado pelo registro tradicional, não um erro.

### 6. Onboarding profissional não ganha uma segunda tela

Conta nova via Google não recebe nicho algum (não presumido a partir do e-mail/domínio). O
`ProfessionNudge` que já existe em `apps/web` (dispara quando `!profession_code &&
!profession_onboarding_done`) cobre o caso sem nenhuma tela nova — o mesmo padrão que "fazer
depois" já usa para contas tradicionais.

### 7. Feature flag fail-closed, um único Client ID promovido para HML e PRD

`GOOGLE_OAUTH_ENABLED` (default `false`) exige `GOOGLE_OAUTH_CLIENT_ID` preenchido — o backend
recusa subir (`validate_google_oauth_contract`) se a flag estiver ligada sem client ID. O mesmo
Client ID do Google (não é segredo) é usado em `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no frontend e
promovido como um único build-arg no `build-release.yml`/scripts de deploy HML — mesmo padrão já
usado para `NEXT_PUBLIC_API_URL` (imagem imutável promovida entre ambientes; só as origens
autorizadas no Google Cloud Console mudam por ambiente).
