#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/palex/ntws/croniu-hml/deploy/hml
cd "$ROOT"
python3 <<'PY'
from pathlib import Path
for name in ["deploy.sh", "healthcheck.sh", "rollback.sh"]:
    p = Path(name)
    if not p.exists():
        continue
    data = p.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    p.write_bytes(data)
    p.chmod(0o755)
    print(name, "lf_ok")
PY
bash ./deploy.sh up
echo "=== alembic after ==="
docker exec croniu-hml-api alembic current 2>&1 | tail -5
echo "=== containers ==="
docker ps --format '{{.Names}} {{.Status}}' | grep croniu-hml || true
docker ps --format '{{.Names}}' | grep -Ei 'kyvora|samba|unifi' || true
./healthcheck.sh || true
API_PORT=$(grep '^API_HOST_PORT=' .env.hml | cut -d= -f2)
echo "=== openapi agent paths ==="
curl -sS "http://127.0.0.1:${API_PORT}/openapi.json" | python3 -c 'import sys,json; d=json.load(sys.stdin); paths=sorted(p for p in d.get("paths",{}) if "agent" in p or "ai-ops" in p); print(len(paths)); print("\n".join(paths))'
echo "=== agent health ==="
curl -sS -o /tmp/agent_health.json -w 'http=%{http_code}\n' "http://127.0.0.1:${API_PORT}/api/v1/agent/health" || true
python3 -c 'import json; print(json.load(open("/tmp/agent_health.json")))' 2>/dev/null || true
echo "=== AI flags presence ==="
for k in AI_ENABLED OPENAI_API_KEY LLM_PROVIDER OPENAI_MODEL; do
  if grep -q "^${k}=" .env.hml; then
    v=$(grep "^${k}=" .env.hml | head -1 | cut -d= -f2-)
    if [ -z "$v" ]; then echo "$k=EMPTY"; else echo "$k=SET"; fi
  else
    echo "$k=ABSENT"
  fi
done
cat /home/palex/ntws/croniu-hml/DEPLOY_MARKER.txt
echo DONE_REBUILD
