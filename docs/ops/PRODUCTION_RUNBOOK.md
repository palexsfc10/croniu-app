# Operação de produção — Croniu

## Domínios

| Superfície | URL |
|------------|-----|
| Institucional (existente) | https://croniu.com.br |
| App (profissionais) | https://app.croniu.com.br |
| API | https://api.croniu.com.br |
| Admin (plataforma) | https://admin.croniu.com.br |

HML permanece isolado (`croniu-hml-*`, path `/home/palex/ntws/croniu-hml`). PRD usa `croniu-prd-*`.

## Primeira instalação (ações manuais inevitáveis)

1. Provisionar servidor PRD e path `/srv/docker/croniu-prd` (ou equivalente).
2. Clonar/sincronizar este repositório no host (somente `deploy/` + manifests).
3. Preencher `deploy/prd/.env.prd` a partir de `.env.prd.example` (**sem** versionar secrets).
4. Criar registros DNS/Cloudflare Tunnel para app/api/admin (institucional já existe).
5. Validar domínio no Resend (SPF/DKIM) e configurar DMARC no DNS.
6. Configurar webhook Asaas **production** apontando para `https://api.croniu.com.br/...` com token.
7. Configurar GitHub Environment `production` + secrets SSH (sem misturar HML).
8. Confirmar que o **default branch** do GitHub é `main` (workflows manuais só
   registram/disparam a partir do default; `release/croniu-prd-v1` é tip legado).
9. Executar **Build release images** uma única vez (`image_sha` + digests + `release-manifest`).
10. Empacotar **Package deploy bundle** uma única vez (`deploy_sha` + checksum agregado;
    workflow oficial no Actions — preview local não substitui o artifact).
11. Ensaiar em HML os **mesmos** digests com o **mesmo** pacote operacional.
12. Promover PRD com **Promote production** (`image_sha`, `deploy_sha`, `build_run_id`, `deploy_bundle_run_id`; sem rebuild; sem sync de `deploy/` a partir de `image_sha`).
13. Smoke humano final (login, billing production, admin login, reset e-mail).

## Secrets (somente nomes)

`SECRET_KEY`, `POSTGRES_PASSWORD`, `RESEND_API_KEY`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `OPENAI_API_KEY` (se AI on), `PRODUCTION_SSH_PRIVATE_KEY`, `PRODUCTION_KNOWN_HOSTS`, `PRODUCTION_HOST`, `PRODUCTION_USER`.

## Rede / Tunnel

- Serviços PRD escutam só em `127.0.0.1` no host (portas exclusivas **19080 / 14000 / 14002**; nunca 18080/13000/13002 do Pilot).
- Cloudflare Tunnel no host aponta para esses ports locais (não alterar Tunnel nesta release).
- Web/Admin fazem proxy interno para `http://api:8000` (alias DNS na network Docker).
- Bypass público da VPS é rejeitado pelo bind loopback + preflight.
- **Cold start:** se o volume `croniu-prd-postgres-data` ainda não existe, o deploy registra `COLD_START=1`, pula o backup pré-migration, sobe o Postgres, espera healthy, migra e sobe API/Web/Admin. Instalação existente (volume presente, mesmo com container parado) exige backup obrigatório.

## Known hosts SSH

O secret `PRODUCTION_KNOWN_HOSTS` deve conter a linha `ssh-ed25519`/`ecdsa` do host PRD. O workflow grava `~/.ssh/known_hosts` com `StrictHostKeyChecking=yes` (sem `ssh-keyscan` no deploy).

## GHCR pull no host

O host PRD precisa autenticar no GitHub Container Registry antes do primeiro
`compose pull` (pull anônimo retorna 401 para os pacotes atuais).

Conforme a documentação oficial do Container Registry
(https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry):

- Use um **Personal Access Token (classic)** — o GHCR **não** autentica Docker com fine-grained PAT.
- Escopo mínimo para pull: **`read:packages`**.
- Autentique apenas via stdin (nunca passe o token em argumento visível, log, commit ou chat):

  ```bash
  # Como usuário croniu-deploy no host — token só na memória/env da sessão
  printf '%s\n' "$CR_PAT" | docker login ghcr.io -u USERNAME --password-stdin
  ```

- Não grave o token em arquivo do repositório nem em `/srv/docker/croniu-prd`.
- A credencial fica apenas no store do Docker do usuário `croniu-deploy` após o login.
- Alternativa futura (decisão operacional separada): tornar os pacotes GHCR **públicos** e eliminar a credencial de pull no host.

Esta etapa **não** cria o PAT nem executa `docker login` — configurar antes do primeiro Promote.

## Resend

- Remetente: `EMAIL_FROM=Croniu <no-reply@send.croniu.com.br>` (domínio Resend verificado `send.croniu.com.br`).
- `EMAIL_REPLY_TO` pode ficar vazio no lançamento.
- Provider: `EMAIL_PROVIDER=resend` em PRD; `fake` em testes.
- Sem MX adicional além do necessário para autenticação de domínio no Resend.

## Deploy / health / backup / restore / rollback

| Ação | Comando |
|------|---------|
| Deploy | `deploy/release/deploy.sh --environment prd --sha <SHA> --manifest <file>` |
| Health | API `/health/ready`, `/version`; Web `/`; Admin `/` |
| Backup | automático no deploy; retenção `BACKUP_RETENTION_DAYS` (default 14) |
| Restore | `deploy/release/restore.sh --environment prd --backup <file.sql.gz> --yes` |
| Rollback imagens | `deploy/release/rollback.sh` — **não** reverte migration irreversível |
| Migration irreversível | restaurar backup `.sql.gz` verificado |

Registro: `RELEASE_MANIFEST.json` + append-only `RELEASE_LOG.jsonl` (sha, horário, operador, resultado).

## Admin

- Sem cadastro público; bootstrap via CLI `create_platform_admin`.
- Cookie `croniu_admin_session` separado; TTL curto.

## Checklist abertura pública

- [ ] CI verde na release (run registrado; head SHA documentado)
- [ ] Digests GHCR publicados **uma vez** + checksum do manifest
- [ ] Rehearsal HML com os **mesmos** digests (sem rebuild, sem PRD)
- [ ] Promote production sem job de build
- [ ] Cookies Secure + OpenAPI off + CORS produção
- [ ] Resend domínio validado + teste de reset/verify
- [ ] Asaas production webhook + idempotência
- [ ] Backup + restore ensaiados em ambiente isolado
- [ ] Rollback de imagens ensaiado
- [ ] Smoke autenticado humano
- [ ] Cadastro público **não** aberto no Admin

## Incidente

1. Congelar deploys (lock).
2. Capturar `/version` + logs rotacionados.
3. Se regressão de app: rollback de imagens.
4. Se corrupção de dados / migration má: restore do último backup verificado.
5. Desligar AI/billing emergencial: ver `docs/ops/DISABLE_AI_BILLING.md`.
