# Rollback

## Imagens (rápido)

`deploy/release/rollback.sh` restaura `api`/`web`/`admin` a partir de `RELEASE_MANIFEST.previous.json`.

Não altera PostgreSQL.

## Schema / dados

Se a release aplicou migration incompatível com o código anterior:

1. Manter app parado ou em rollback de imagem compatível com o schema atual **ou**
2. Restaurar o backup pré-deploy (`docs/ops/BACKUP.md`).

Não alegue “rollback automático de migration destrutiva” sem restore comprovado.
