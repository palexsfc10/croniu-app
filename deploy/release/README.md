# Immutable release pipeline

`deploy.sh` deploys an image manifest to `hml` or `prd`:

```bash
./deploy.sh --environment hml --sha <git-sha> --manifest /secure/path/release-manifest.json
```

It obtains an exclusive lock, validates prerequisites, makes and verifies a
PostgreSQL gzip backup, pulls immutable images, migrates in a one-off API job,
recreates application containers, and performs local/public smoke checks. It
writes `RELEASE_MANIFEST.json` only after success. A failed deployment attempts
to restore the images from the preceding release state; database migrations are
not automatically reversed.

Run `backup.sh` manually with the same exported deployment variables to create a
verified database backup. Keep manifests and backups in server-controlled,
access-restricted locations.
