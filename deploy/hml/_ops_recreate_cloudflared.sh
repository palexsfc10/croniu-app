#!/usr/bin/env bash
set -euo pipefail
docker inspect croniu-hml-cloudflared --format '{{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}}'
docker stop croniu-hml-cloudflared
docker rm croniu-hml-cloudflared
docker run -d \
  --name croniu-hml-cloudflared \
  --restart unless-stopped \
  --network host \
  -v /home/palex/cloudflared:/home/nonroot/.cloudflared:ro \
  -v /home/palex/ntws/croniu-hml/deploy/hml/cloudflared/config.yml:/etc/cloudflared/config.yml:ro \
  cloudflare/cloudflared:2025.7.0 \
  --no-autoupdate tunnel --config /etc/cloudflared/config.yml \
  --origincert /home/nonroot/.cloudflared/cert.pem run croniu-hml-ntws
sleep 6
docker ps --filter name=croniu-hml-cloudflared --format '{{.Names}} {{.Status}}'
WEB_IP=$(dig +short @1.1.1.1 croniu-hml.ntws.cloud A | head -1)
API_IP=$(dig +short @1.1.1.1 api-croniu-hml.ntws.cloud A | head -1)
ADM_IP=$(dig +short @1.1.1.1 admin-croniu-hml.ntws.cloud A | head -1)
echo "WEB_IP=$WEB_IP API_IP=$API_IP ADM_IP=$ADM_IP"
curl -sS --resolve "croniu-hml.ntws.cloud:443:${WEB_IP}" -o /dev/null -w 'web=%{http_code}\n' https://croniu-hml.ntws.cloud/
curl -sS --resolve "api-croniu-hml.ntws.cloud:443:${API_IP}" -o /dev/null -w 'api=%{http_code}\n' https://api-croniu-hml.ntws.cloud/health
curl -sS --resolve "admin-croniu-hml.ntws.cloud:443:${ADM_IP}" -o /dev/null -w 'admin=%{http_code}\n' https://admin-croniu-hml.ntws.cloud/
docker logs croniu-hml-cloudflared 2>&1 | tail -20
docker ps --filter name=kyvora --format '{{.Names}} {{.Status}}' | head -3 || true
echo RECREATE_OK
