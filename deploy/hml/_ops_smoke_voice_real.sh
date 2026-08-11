#!/usr/bin/env bash
# Real STT smoke: synthesize short PT speech via OpenAI TTS (ops-only), then transcribe.
set -euo pipefail
ENV=/home/palex/ntws/croniu-hml/deploy/hml/.env.hml
API=http://127.0.0.1:18080
COOKIE=/tmp/croniu_voice_real_cookies.txt
# shellcheck disable=SC1090
set -a; source "$ENV"; set +a
KEY="${OPENAI_API_KEY:-${LLM_API_KEY:-}}"
BASE="${LLM_API_BASE:-https://api.openai.com/v1}"
MODEL="${OPENAI_TRANSCRIPTION_MODEL:-gpt-4o-mini-transcribe}"
test -n "$KEY"

PHRASE="Como esta meu dia hoje"
MP3=/tmp/croniu_voice_phrase.mp3
echo "== tts synthesize (ops only) =="
START=$(date +%s%3N)
CODE=$(curl -sS -o "$MP3" -w "%{http_code}" \
  -X POST "$BASE/audio/speech" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini-tts\",\"voice\":\"alloy\",\"input\":\"$PHRASE\",\"response_format\":\"mp3\"}")
END=$(date +%s%3N)
echo "tts_http=$CODE latency_ms=$((END-START)) bytes=$(wc -c < "$MP3")"
# Never print key

EMAIL="voice_real_$(date +%s)@example.com"
PASS='SenhaForte1!'
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"full_name\":\"Voice Real\",\"organization_name\":\"Voice Real $(date +%s)\"}" \
  "$API/api/v1/auth/register" >/dev/null
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$API/api/v1/auth/login" >/dev/null

echo "== transcribe mp3 =="
START=$(date +%s%3N)
HTTP=$(curl -sS -o /tmp/voice_real_tx.json -w "%{http_code}" -b "$COOKIE" \
  -H "X-Request-Id: smoke-real-$(date +%s)" \
  -F "file=@${MP3};type=audio/mpeg" \
  -F "duration_seconds=3" \
  "$API/api/v1/agent/transcribe")
END=$(date +%s%3N)
echo "transcribe_http=$HTTP wall_ms=$((END-START)) model=$MODEL"
python3 - <<'PY'
import json
d=json.load(open("/tmp/voice_real_tx.json"))
if "text" in d:
    t=(d.get("text") or "").strip()
    print("ok text_len", len(t))
    print("preview", t[:60])
    print("model", d.get("model"), "latency_ms", d.get("latency_ms"), "bytes", d.get("bytes_received"))
else:
    detail=d.get("detail") if isinstance(d.get("detail"), dict) else d
    print("fail", detail.get("code") if isinstance(detail, dict) else detail, detail.get("message") if isinstance(detail, dict) else "")
    raise SystemExit(2)
PY

echo "== chat with transcribed intent =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{"title":"voz"}' "$API/api/v1/agent/threads" -o /tmp/vr_thread.json
TID=$(python3 -c 'import json; print(json.load(open("/tmp/vr_thread.json"))["id"])')
TEXT=$(python3 -c 'import json; print(json.load(open("/tmp/voice_real_tx.json"))["text"])')
python3 - <<PY
import json, urllib.request
# write body file
body={"message": json.load(open("/tmp/voice_real_tx.json"))["text"], "input_modality":"voice_transcript"}
open("/tmp/vr_msg.json","w").write(json.dumps(body))
print("sending_len", len(body["message"]))
PY
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  --data-binary @/tmp/vr_msg.json \
  "$API/api/v1/agent/threads/$TID/messages" -o /tmp/vr_chat.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/vr_chat.json"))
print("chat_status", d.get("status"), "tools", d.get("tool_trace"), "pending", bool(d.get("pending_action")))
print("reply_len", len(d.get("reply") or ""))
PY

LEFT=$(docker exec croniu-hml-api sh -c 'find /tmp -maxdepth 1 -name "croniu-voice-*" 2>/dev/null | wc -l')
echo "temp_left=$LEFT"
rm -f "$MP3"
echo SMOKE_REAL_VOICE_DONE
