# PostgreSQL backups

Every release creates `backups/<environment>-<timestamp>.sql.gz`, verifies it
with `gzip -t`, and writes a SHA-256 checksum beside it. To run one manually,
export the same deployment variables used by `deploy.sh` and execute
`deploy/release/backup.sh`.

Before restoring, verify the checksum and gzip stream, identify the target
environment explicitly, and obtain approval for the data-impacting operation.
Do not place database dumps in Git or CI artifacts.
