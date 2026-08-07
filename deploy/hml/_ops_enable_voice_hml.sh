#!/usr/bin/env bash
# Enable voice on HML after probe; recreate API only.
set -euo pipefail
MODEL="${1:-gpt-4o-mini-transcribe}"
ENV=/home/palex/ntws/croniu-hml/deploy/hml/.env.hml
cd /home/palex/ntws/croniu-hml/deploy/hml
sed -i 's/\r$//' "$ENV"
python3 - "$ENV" "$MODEL" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
model = sys.argv[2]
lines = []
seen_v = seen_m = False
for line in p.read_text().splitlines():
    if line.startswith("VOICE_ENABLED="):
        lines.append("VOICE_ENABLED=true"); seen_v = True
    elif line.startswith("OPENAI_TRANSCRIPTION_MODEL="):
        lines.append(f"OPENAI_TRANSCRIPTION_MODEL={model}"); seen_m = True
    else:
        lines.append(line)
if not seen_v:
    lines.append("VOICE_ENABLED=true")
if not seen_m:
    lines.append(f"OPENAI_TRANSCRIPTION_MODEL={model}")
p.write_text("\n".join(lines) + "\n")
print(f"voice_env_updated model={model}")
PY
set -a; source .env.hml; set +a
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
docker exec croniu-hml-api python - <<'PY'
from app.config import get_settings
get_settings.cache_clear()
s = get_settings()
print(f"voice_enabled={s.voice_enabled}")
print(f"transcription_model={s.openai_transcription_model}")
print(f"ai_enabled={s.ai_enabled}")
PY
curl -sS http://127.0.0.1:18080/api/v1/agent/health; echo
echo VOICE_ENABLE_DONE
