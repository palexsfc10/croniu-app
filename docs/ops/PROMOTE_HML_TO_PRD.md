# Promote HML to production

1. Confirm HML health, smoke results, migration revision, and the exact CI
   `release-manifest.json` artifact.
2. Stage that unchanged manifest at
   `/srv/docker/croniu-prd/manifests/<release-tag-or-sha>.json`.
3. Trigger **Promote production** manually and complete the protected
   `production` environment approval.
4. The workflow SSHes to the production host and invokes `deploy.sh` with the
   selected manifest. It does not build or retag images.
5. Verify `/health`, `/health/ready`, and `/version` through the approved
   production route. Record the resulting `RELEASE_MANIFEST.json`.

Do not promote mutable tags such as `latest`; the manifest must use digests.
