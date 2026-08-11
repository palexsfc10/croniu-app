# Backup e restore — PRD/HML

## Criar

```bash
ENVIRONMENT=prd DEPLOY_ROOT=/srv/docker/croniu-prd \
  deploy/release/backup.sh
```

Gera `backups/prd-<UTC>.sql.gz` + `.sha256`. Verifica `gzip -t`.
Retenção: `BACKUP_RETENTION_DAYS` (padrão 14).

## Restaurar (destrutivo)

```bash
deploy/release/restore.sh --environment prd --backup backups/prd-....sql.gz --yes
```

Exige checksum. Não executa sem `--yes`.

## Política

- Backup **obrigatório** antes de `alembic upgrade` no `deploy.sh`.
- Rollback de imagens **não** desfaz migration irreversível — use restore.
- Nunca misturar dumps HML ↔ PRD.
