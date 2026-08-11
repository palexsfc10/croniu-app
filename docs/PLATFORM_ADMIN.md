# Croniu — Painel Administrativo da Plataforma

## Separação de papéis

| Papel | Escopo |
|-------|--------|
| Administrador da **organização** | Somente sua org (clientes, ciclos, agenda, etc.) |
| Administrador da **plataforma** | Operação SaaS NTWS Labs/Croniu |

Um owner de organização **nunca** se torna admin da plataforma via frontend, perfil ou API de autoatendimento.

## Aplicação

- App separado: `apps/admin` (deploy e origem distintos de `apps/web`)
- Hostname pretendido (a confirmar): `admin.croniu.com.br`
- HML sugerido (a confirmar): `admin-hml.croniu.com.br`
- **Não** configurar DNS/Cloudflare sem confirmação

## API

Namespace exclusivo: `/api/v1/platform/*`

Autorização obrigatória no FastAPI via `platform_membership`. Ocultar UI não basta.

## Modelo de permissões (ADR-011)

Tabela `platform_memberships`:

- `user_id`
- `role` (`platform_admin` | `platform_viewer`)
- `created_at`
- `created_by_user_id` (opcional)

Sessões administrativas em `platform_sessions` com cookie **separado** `croniu_admin_session`.

## Bootstrap do primeiro admin

Comando CLI seguro (sem senha padrão, sem seed versionado):

```bash
cd backend
python -m app.cli.create_platform_admin
```

Credenciais via prompt seguro ou variáveis de ambiente **não versionadas**.

## Escopo desta fundação

- Login/logout admin
- Visão geral com métricas **reais** (zero se vazio)
- Listagem paginada de organizações e usuários
- Detalhe básico de organização
- Auditoria de login administrativo
- Sem ações destrutivas, impersonação ou exclusão

## Ações planejadas (ainda bloqueadas na UI/API mutável)

Ativar/suspender/reativar, ajustar trial com justificativa — exigirão permissão, confirmação, motivo e auditoria completa.
