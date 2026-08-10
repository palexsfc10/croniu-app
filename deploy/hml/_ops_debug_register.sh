#!/usr/bin/env bash
set -euo pipefail
python3 <<'PY'
import json
from pathlib import Path
p = Path("/tmp/croniu-hml-a.json")
print("exists", p.exists(), "size", p.stat().st_size if p.exists() else None)
raw = p.read_text(encoding="utf-8", errors="replace")
print("raw_prefix", raw[:400])
d = json.loads(raw)
print("keys", sorted(d.keys()) if isinstance(d, dict) else type(d))
PY
API=http://127.0.0.1:18080
SUFFIX=$(date +%s)
EMAIL="smoke_${SUFFIX}@example.com"
PASS="SenhaForte1!"
curl -sS -H 'Content-Type: application/json' \
  -d "{\"email\":\"a_${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"A\",\"organization_name\":\"OrgA ${SUFFIX}\"}" \
  -o /tmp/croniu-hml-a2.json -w 'code=%{http_code}\n' "${API}/api/v1/auth/register"
python3 <<'PY'
import json
d=json.load(open("/tmp/croniu-hml-a2.json"))
print("keys", sorted(d.keys()))
print("ok", "organization" in d)
PY
