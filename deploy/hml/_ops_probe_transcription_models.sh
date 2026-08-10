#!/usr/bin/env bash
# Probe OpenAI transcription models without printing the API key.
set -euo pipefail
ENV_FILE="${1:-/home/palex/ntws/croniu-hml/deploy/hml/.env.hml}"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
KEY="${OPENAI_API_KEY:-${LLM_API_KEY:-}}"
BASE="${LLM_API_BASE:-https://api.openai.com/v1}"
if [[ -z "$KEY" ]]; then echo "no_api_key"; exit 2; fi

MODELS=("whisper-1" "gpt-4o-mini-transcribe" "gpt-4o-transcribe")
TMP="$(mktemp /tmp/croniu-voice-probe-XXXX.wav)"
# Minimal silent-ish wav header + tiny payload (may 400; we still learn availability)
python3 - <<'PY' "$TMP"
import struct, sys
path = sys.argv[1]
# 0.2s mono 16kHz silence wav
rate=16000; n=int(rate*0.2)
data=b"\x00\x00"*n
with open(path,"wb") as f:
    f.write(b"RIFF"); f.write(struct.pack("<I", 36+len(data)))
    f.write(b"WAVEfmt "); f.write(struct.pack("<IHHIIHH", 16,1,1,rate,rate*2,2,16))
    f.write(b"data"); f.write(struct.pack("<I", len(data))); f.write(data)
PY

for model in "${MODELS[@]}"; do
  start=$(date +%s%3N)
  code=$(curl -sS -o /tmp/voice_probe_body.json -w "%{http_code}" \
    -X POST "$BASE/audio/transcriptions" \
    -H "Authorization: Bearer $KEY" \
    -F "file=@${TMP};type=audio/wav" \
    -F "model=${model}" \
    -F "response_format=json" || echo "000")
  end=$(date +%s%3N)
  lat=$((end-start))
  rid=$(python3 - <<'PY'
import json
try:
  d=json.load(open("/tmp/voice_probe_body.json"))
  print(d.get("id") or d.get("request_id") or "")
except Exception:
  print("")
PY
)
  # Never print body text content — only status/meta
  echo "model=${model} status=${code} latency_ms=${lat} request_id_sanitized=${rid:0:24}"
done
rm -f "$TMP"
