# Hotfix — Build genérico de HML perde Client ID do Google e metadados de versão

## Identificação

- Nome / ID: HML_BUILD_GOOGLE_VERSION_ARGS
- Branch: `fix/hml-build-google-version-args`, worktree `croniu-hml-build-fix`, a partir de
  `origin/main` @ `ea95a4d`.
- Autor: Claude Code (execução autônoma sob instrução direta do operador)
- Data de criação: 2026-08-31

## Estado

- [x] AUTORIZADA

> Autorização: instrução direta e explícita do operador nesta sessão (diagnóstico já confirmado
> por ele, causa raiz e escopo do hotfix detalhados na própria tarefa). Registrado aqui por
> exigência de `AGENTS.md` regra 1/9 — `AGENTS.md` em si não foi alterado.

## Objetivo

Corrigir `deploy/hml/deploy.sh` (o script de build/deploy genérico de HML) para que ele nunca mais
esqueça de passar `NEXT_PUBLIC_GOOGLE_CLIENT_ID` para o build do web nem os metadados de versão
(`GIT_SHA`/`APP_VERSION`/`BUILD_TIME`) para nenhuma das três imagens — restaurando o botão
"Continuar com Google" e a rastreabilidade de versão em HML, sem tocar banco, migrations ou dados.

## Diagnóstico (confirmado pelo operador e re-verificado nesta sessão)

- Google Auth foi mergeado em `main` pela PR #34 (commit `69c99a0`); `main` atual já contém o
  recurso.
- `.env.hml` em Jarvis já tem `GOOGLE_OAUTH_ENABLED=true`, `GOOGLE_OAUTH_CLIENT_ID` e
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` ambos `SET`, mesmo comprimento (72), e idênticos — não é problema
  de configuração nem de segredo ausente.
- `deploy/hml/deploy.sh::build_images()` nunca passava `--build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  nem `GIT_SHA`/`APP_VERSION`/`BUILD_TIME` para nenhum dos três `docker build` (api/web/admin) —
  os `Dockerfile`s dos três já suportavam esses `ARG`s (usados corretamente por
  `.github/workflows/build-release.yml`, que não tem esse bug).
- Consequência observada: `GET /version` em HML retornava `{"version":"0.0.0-dev","git_sha":"unknown"}`
  e labels OCI das 3 imagens locais mostravam `revision=unknown`/`version=0.0.0-dev`; o bundle web
  compilava com `NEXT_PUBLIC_GOOGLE_CLIENT_ID` vazio, então o componente do botão Google renderiza
  nada (`apps/web/src/lib/google-auth.ts`).
- Precedente: o mesmo bug de `GIT_SHA` ausente já tinha sido corrigido uma vez, mas só em um script
  pontual (`_ops_deploy_client_intake_journey.sh`), não no `deploy.sh` genérico — por isso regrediu.
  Da mesma forma, `_ops_deploy_google_auth.sh` (script pontual já existente no host) passava
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` corretamente, mas o deploy seguinte (`admin-premium-ux`, via
  `deploy.sh` genérico) sobrescreveu as imagens sem esse build-arg.

## Escopo

- `deploy/hml/deploy.sh`:
  - `validate_google_oauth_contract()` (nova): quando `GOOGLE_OAUTH_ENABLED=true`, exige
    `GOOGLE_OAUTH_CLIENT_ID` e `NEXT_PUBLIC_GOOGLE_CLIENT_ID` presentes e idênticos; falha (`die`)
    antes de qualquer build se o contrato for inválido. Não imprime os valores, só
    `SET/MISSING`+comprimento. Chamada a partir de `load_env()`, então roda para todo subcomando
    (mesmo padrão já usado para `CLIENT_PORTAL_SIGNING_KEY`).
  - `resolve_git_sha()` (nova): usa `GIT_SHA` exportado pelo operador se presente; senão
    `git rev-parse HEAD` se `REPO_ROOT` for um checkout git; senão falha com mensagem explícita —
    nunca grava `unknown` silenciosamente. (A árvore implantada em Jarvis normalmente não tem
    `.git`, ver `_ops_deploy_google_auth.sh`/`_ops_deploy_client_intake_journey.sh`, que excluem
    `.git` do rsync/tar — por isso o operador precisa poder informar o SHA explicitamente.)
  - `resolve_app_version()` (nova): usa `CRONIU_VERSION` de `.env.hml` por padrão, ou `APP_VERSION`
    se o operador exportar um override; falha se nenhum dos dois estiver definido — nunca cai em
    `0.0.0-dev` silenciosamente.
  - `build_images()`: passa `GIT_SHA`/`APP_VERSION`/`BUILD_TIME` para a API; os mesmos três mais
    `NEXT_PUBLIC_APP_VERSION`/`NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_APP_URL`/
    `API_PROXY_TARGET`/`NEXT_PUBLIC_GOOGLE_CLIENT_ID` para o web; e os cinco primeiros para o admin
    (o admin não usa Google, mas o `Dockerfile` já suporta os args de versão e sofria do mesmo
    `unknown`/`0.0.0-dev`).
- `.github/workflows/ci.yml`: novo step de ShellCheck (`compose-and-scripts`) restrito a
  `deploy/hml/deploy.sh` (os demais scripts `_ops_*`/`healthcheck.sh`/`rollback.sh` em `deploy/hml`
  ficam ignorados — nunca passaram por lint, fora de escopo deste hotfix).
- `backend/tests/test_deploy_hml_build_args.py` (novo, sem Docker/DB): checagem estática que lê
  `deploy/hml/deploy.sh` como texto e falha se qualquer um dos build-args exigidos desaparecer de
  novo, se o contrato do Google deixar de ser validado, se um valor de Client ID for logado, ou se
  `APP_VERSION` voltar a ter um fallback hardcoded para `0.0.0-dev`.

## Fora do escopo

Banco de dados, migrations, regras de autenticação, `deploy/release/*` (pipeline de imagem
digest-pinned para PRD/promoção — já passa `NEXT_PUBLIC_GOOGLE_CLIENT_ID`/`GIT_SHA`/`APP_VERSION`
corretamente via `build-release.yml`, não tinha esse bug), qualquer script `_ops_*.sh` pontual
(preservados como estão), PR #37 (disponibilidade inteligente) e PR #38 (planos com valor fixo) —
seguem bloqueadas até este hotfix ser mergeado, ir para HML e ser validado.

## Auditoria do fluxo de deploy das PR #37/#38

Ambas serão implantadas em HML pelo mesmo `deploy/hml/deploy.sh` genérico (é o único caminho usado
para todos os deploys recentes de HML, ver `DEPLOY_MARKER.txt`/`_ops_deploy_*.sh` no host). Depois
deste hotfix, `deploy.sh build`/`up` **não consegue mais** recompilar o frontend sem o Client ID
quando `GOOGLE_OAUTH_ENABLED=true`: `validate_google_oauth_contract()` roda dentro de `load_env()`,
que é chamado incondicionalmente antes do `case` que despacha para `build_images()` — se
`GOOGLE_OAUTH_CLIENT_ID`/`NEXT_PUBLIC_GOOGLE_CLIENT_ID` estiverem ausentes ou divergentes, o script
morre antes de qualquer `docker build`. Como `.env.hml` em Jarvis já está correto, os próximos
deploys (incluindo os das PR #37/#38) herdam a correção automaticamente, sem exigir nenhum passo
extra.

## Segurança

Nenhum valor de credencial impresso (`GOOGLE_OAUTH_CLIENT_ID`/`NEXT_PUBLIC_GOOGLE_CLIENT_ID`: só
`SET/MISSING`+comprimento). Nenhuma mudança em `organization_id`/isolamento multi-tenant. Nenhum
segredo novo introduzido ou lido de fora de `.env.hml`.

## Migrations

Nenhuma. `alembic current` em HML já está em `0025_user_auth_identities` (head de `main`), sem
migration pendente relacionada a este hotfix.

## Testes

- `bash -n deploy/hml/deploy.sh` — sintaxe OK.
- `backend/tests/test_deploy_hml_build_args.py` — 7 casos novos, verificados manualmente nesta
  sessão (Docker indisponível localmente, mesma limitação já registrada nas entregas anteriores);
  CI (`backend-tests`) é o executor de referência.
- ShellCheck via CI (`compose-and-scripts`), restrito a este arquivo.
- Regressão: CI completo (`backend-tests`, `web`, `migrations-check`, `compose-and-scripts`, etc.)
  — nenhuma migration nova, nenhuma mudança de frontend/TS, então os demais jobs não deveriam ser
  afetados; rodados mesmo assim como gate padrão do projeto.

## Gates

`bash -n`, ShellCheck (CI), `pytest -q` (CI), CI completo do repositório.

## Critérios de aceite

Ver a instrução original do operador (Etapa 2) — reproduzidos e verificados no relatório de
entrega, junto com o plano exato da Etapa 3 (restauração controlada de HML), que só executa após
autorização de merge.

## Rollback

Reverter os commits desta branch (ou `git revert`) restaura o `deploy.sh` anterior — nenhum dado,
migration ou container é afetado por este hotfix em si (ele só muda como as imagens HML são
*construídas*, não o estado do banco). Nenhuma ação adicional de rollback necessária.

## Autorização

| Campo | Valor |
|-------|-------|
| Autorizado por | Operador (palexsfc10), via instrução direta e detalhada nesta sessão |
| Data | 2026-08-31 |
| Notas | Diagnóstico completo (causa raiz, evidências, PR #34/commit `69c99a0`) fornecido pelo próprio operador na tarefa; escopo, etapas e critérios de validação explicitados na instrução original. |
