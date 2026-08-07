#!/usr/bin/env bash
set -euo pipefail
cd /home/palex/ntws/croniu-hml/deploy/hml
echo "== list api containers =="
docker ps -a | grep croniu-hml-api || true
for id in $(docker ps -aq --filter name=croniu-hml-api); do
  echo "removing $id"
  docker rm -f "$id" || true
done
set -a; source .env.hml; set +a
# Keep voice enabled
python3 - <<'PY'
from pathlib import Path
p=Path(".env.hml")
lines=[]
seen_v=seen_m=False
for line in p.read_text().splitlines():
    if line.startswith("VOICE_ENABLED="):
        lines.append("VOICE_ENABLED=true"); seen_v=True
    elif line.startswith("OPENAI_TRANSCRIPTION_MODEL="):
        lines.append("OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe"); seen_m=True
    else:
        lines.append(line)
if not seen_v: lines.append("VOICE_ENABLED=true")
if not seen_m: lines.append("OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe")
p.write_text("\n".join(lines)+"\n")
print("voice_env_ok")
PY
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
curl -sS http://127.0.0.1:18080/api/v1/agent/health; echo
docker exec croniu-hml-api python - <<'PY'
from app.config import get_settings
get_settings.cache_clear()
s=get_settings()
print(f"voice_enabled={s.voice_enabled}")
print(f"model={s.openai_transcription_model}")
PY
bash /tmp/_ops_smoke_voice_real.sh
echo RECOVER_AND_SMOKE_DONE
