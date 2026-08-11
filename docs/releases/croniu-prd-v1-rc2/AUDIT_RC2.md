# RC2 — Croniu production candidate audit

**Worktree:** `C:\projetos\croniu-prd-rc2`  
**Branch:** `release/croniu-prd-rc2`  
**Base HML SHA:** `e6649bacd3591a432a84e752c3bfe0ad50c3e981`  
**RC1 tip:** `9e9abf035780b9181df3a2866cbca72657fc4a62`

## Correções vs RC1

| Problema | Causa | Correção |
|----------|-------|----------|
| Secret scan CI vermelho | gitleaks-action intervalo inexistente / 0 bytes | Gitleaks 8.21.2 explícito; tree + history + delta; fixture planted deve falhar |
| Pytest travado | SessionLocal sem close + ValidationError antes de schedule_required | Timeout 60s; sanitize `ends_on`; fechar sessões |
| `ends_on` required | sanitize não calculava duração | `cycle_args.sanitize_cycle_propose_args` |
| Proof upload 409 | dois ciclos mesma org/horário | slots únicos por idempotency key |
| Web/Admin → localhost | Dockerfile/build URLs | same-origin `/api` + `API_PROXY_TARGET=http://api:8000` + alias `api` |
| Portas 0.0.0.0 | compose PRD | bind `127.0.0.1:` + preflight |
| E-mail soft-gate | sessão no cadastro | `EMAIL_VERIFICATION_REQUIRED` hard-gate; welcome pós-verify |
| Rate limit CF | peer único | `TRUST_PROXY` + CF-Connecting-IP só de peers confiáveis |
| Manifest manual | promote exigia stage | build artifact → scp automático + rsync deploy |
| SSH known_hosts | StrictHostKeyChecking sem hosts | `PRODUCTION_KNOWN_HOSTS` secret |

## Topologia de rede (PRD)

Cloudflare Tunnel (host) → `127.0.0.1:{API,WEB,ADMIN}_HOST_PORT` → containers.  
Web/Admin containers → DNS `api:8000` na network `croniu-prd-network`.  
DB sem publish. HML isolado (`croniu-hml-*`).

## Usuários existentes (HML)

`EMAIL_VERIFICATION_REQUIRED=false` em HML — sem bloqueio.  
Antes de PRD público: habilitar required=true e, se necessário, stamp `email_verified_at` para contas legadas.

## Veredito cutover

Ainda **NO-GO** para PRD até: CI verde no GitHub, digests GHCR, rehearsal HML digest, secrets/DNS/Resend/Asaas reais.
