# Emergency disablement: AI and billing

Set the following server-only environment values, then recreate the API:

```dotenv
AI_ENABLED=false
BILLING_ENABLED=false
BILLING_CHECKOUT_ENABLED=false
```

From the relevant server deployment root:

```bash
docker compose --env-file deploy/<environment>/.env.<environment> \
  -f deploy/<environment>/compose.<environment>.yaml up -d --no-deps --force-recreate api
```

Verify `/health/ready`, then confirm billing checkout and AI requests are
disabled. Keep the change in the protected server environment file and record
the incident; never add its values to Git.
