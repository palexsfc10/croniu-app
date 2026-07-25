# Croniu HML — Jarvis

Homologação exclusiva do Croniu no servidor compartilhado **jarvis**.

Serviços: `croniu-hml-web`, `croniu-hml-admin`, `croniu-hml-api`, `croniu-hml-db`.

Hostname admin sugerido (a confirmar, sem DNS silencioso): `admin-hml.croniu.com.br`.

## Proteções

- Prefixo obrigatório: `croniu-hml-*`
- Não executar `docker system prune`
- Não parar/alterar Samba, UniFi ou outros projetos
- Não publicar PostgreSQL no host
- `.env.hml` apenas no servidor (nunca no Git)

## Artefatos

| Arquivo | Função |
|---------|--------|
| `compose.hml.yaml` | Stack HML |
| `.env.hml.example` | Modelo de variáveis |
| `deploy.sh` | Build + up |
| `healthcheck.sh` | Smokes técnicos |
| `rollback.sh` | Stop preservando volume / imagens anteriores |

## Preparação no Jarvis

1. Preflight de leitura (hostname, memória, portas, containers).
2. Criar `/srv/docker/croniu` se disponível.
3. Copiar repositório / artefatos.
4. `cp .env.hml.example .env.hml` e preencher segredos + portas livres.
5. `chmod +x deploy.sh healthcheck.sh rollback.sh`
6. `./deploy.sh up`
7. `./healthcheck.sh`

## Domínios

Sugestões (confirmar antes de DNS/túnel):

- App: `hml.croniu.com`
- API: `api-hml.croniu.com`

Sem confirmação, usar acesso por IP/porta local documentada no `.env.hml`.

## Rollback

- Primeira versão: `./rollback.sh stop` (remove containers/rede Croniu; **preserva** volume do banco).
- Versões seguintes: `PREV_API_IMAGE=... PREV_WEB_IMAGE=... ./rollback.sh previous-image`

## Backup / restore (banco)

```bash
docker exec croniu-hml-db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
# restore
cat backup.sql | docker exec -i croniu-hml-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
