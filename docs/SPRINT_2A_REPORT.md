# Relatório final — Sprint 2A (local)

> HML no Jarvis não foi executada por decisão do responsável pelo produto. A preparação remota será realizada após a aquisição e confirmação do domínio.

## Identidade

Baseline do wordmark **Croniu** preservada (sem redesign, sem reposicionar logo no login). Novas telas reutilizam `BrandWordmark` e o design system existente.

## Git / working tree

| Item | Valor |
|------|-------|
| Branch | `master` (repositório ainda sem commits iniciais no momento da entrega) |
| SHA local | *(sem HEAD — working tree não commitada)* |
| Escopo | Somente local; sem push, PR, merge ou deploy remoto |

## Funcionalidades entregues

- Clientes: listar, criar, detalhar, arquivar
- Serviços/planos: listar, criar (duração + valor)
- Ciclos `period`: criação guiada, listagem, detalhe
- Recebimentos manuais: criação junto ao ciclo, marcar como pago
- Home “Hoje”: ciclos encerrando, pagamentos pendentes, ação prioritária, hint contextual
- WhatsApp: preparar mensagem + URL `wa.me` (sem envio automático)
- Confirmação manual de contato no ciclo
- Admin: `clients_active_total` e contagens de clientes/ciclos por organização
- Seed demo idempotente: `python -m app.cli.seed_demo`

## Migration

- `0003_sprint2a_domain` (após `0002_platform_admin`)
- Tabelas: `clients`, `services`, `cycles`, `receivables`
- Testado: upgrade no schema atual (`croniu`) e do zero (`croniu_empty_2a`)
- Backup local pré-migração: `docker exec croniu-dev-db … /tmp/croniu_pre_2a.dump`

## Endpoints novos (`/api/v1`)

| Método | Path |
|--------|------|
| GET/POST | `/clients` |
| GET/PATCH | `/clients/{id}` |
| GET/POST | `/services` |
| GET/PATCH | `/services/{id}` |
| GET/POST | `/cycles` |
| GET | `/cycles/{id}` |
| POST | `/cycles/{id}/whatsapp-prep` |
| POST | `/cycles/{id}/confirm-contact` |
| GET/POST | `/receivables` |
| GET | `/receivables/{id}` |
| POST | `/receivables/{id}/mark-paid` |
| GET | `/home/summary` (enriquecido) |

## Regras de domínio (2A)

- Isolamento por `organization_id` da sessão
- Ciclo tipo `period`; `nearing_end` calculado (≤ 7 dias)
- Histórico: novos ciclos não sobrescrevem anteriores
- Recebimento manual (`pending` → `received`)
- WhatsApp apenas click-to-chat (URL gerada)

## Gates executados (evidência local)

### Backend
- ruff check/format: OK
- pytest: **21 passed**
- alembic upgrade head (DB atual + DB vazio): OK → `0003_sprint2a_domain`

### Web (`apps/web`)
- lint: OK (1 warning RHF `watch`, sem erro)
- typecheck: OK
- vitest: OK
- build: OK
- E2E auth: OK
- E2E Sprint 2A funcional: OK (`e2e/sprint2a.spec.ts`)
- QA visual: OK — capturas em `apps/web/e2e/artifacts/sprint2a/`

### Admin (`apps/admin`)
- lint / typecheck / vitest / build: OK

### Integração local
- Docker Postgres `croniu-dev-db`: OK
- API `8010` + web `3010`: OK
- Seed demo: OK (`demo.profissional@croniu.local`)
- OpenAPI: 25 paths (inclui domínio 2A)
- Isolamento multi-tenant: coberto em pytest

## Como rodar localmente

```powershell
# Postgres
docker compose up -d db

# API (backend/)
$env:DATABASE_URL="postgresql+psycopg://croniu:croniu_dev_password_change_me@localhost:5433/croniu"
$env:SECRET_KEY="dev-only-change-me-to-a-long-random-string-at-least-32-chars"
$env:CORS_ORIGINS="http://127.0.0.1:3010,http://localhost:3010,http://127.0.0.1:3002"
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Web (apps/web/)
$env:API_PROXY_TARGET="http://127.0.0.1:8010"
npm run build
npm run start -- --hostname 0.0.0.0 --port 3010

# Seed opcional (fictício)
python -m app.cli.seed_demo
```

URLs locais (configuráveis via env; sem domínio real):

- Web: `http://127.0.0.1:3010`
- API: `http://127.0.0.1:8010`
- Admin: `http://127.0.0.1:3002`

## Riscos / pendências

- Pausa de ciclo e edição avançada ficam para evolução
- Agenda ainda não entra na 2A
- Link público “Meu Ciclo” permanece Sprint 4
- Domínio/hostnames reais e HML Jarvis: etapa futura
- Repositório ainda sem commit inicial — recomenda-se commit local quando o responsável solicitar

## Plano futuro HML (não executar agora)

1. Adquirir e confirmar domínio
2. Revisar `deploy/hml` e hostnames
3. Credenciais/SSH Jarvis
4. Deploy controlado + healthchecks
5. Sem Cloudflare/DNS nesta sprint
