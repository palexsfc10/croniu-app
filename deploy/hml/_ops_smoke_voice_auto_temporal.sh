#!/usr/bin/env bash
# HML smoke: temporal context + voice auto-send pipeline (read + propose path).
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
COOKIE=/tmp/croniu_voice_auto_cookies.txt
rm -f "$COOKIE"
EMAIL="voice_auto_$(date +%s)@example.com"
PASS='SenhaForte1!'

curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"full_name\":\"Voice Auto\",\"organization_name\":\"Voice Auto $(date +%s)\"}" \
  "$API/api/v1/auth/register" >/dev/null
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$API/api/v1/auth/login" >/dev/null

echo "== org timezone =="
curl -sS -b "$COOKIE" -X PATCH -H 'Content-Type: application/json' \
  -d '{"timezone":"America/Sao_Paulo"}' \
  "$API/api/v1/organization/preferences" -o /tmp/va_pref.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/va_pref.json"))
print("timezone", d.get("timezone"))
PY

echo "== backend clock via chat today =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{"title":"clock"}' "$API/api/v1/agent/threads" -o /tmp/va_thread.json
TID=$(python3 -c 'import json; print(json.load(open("/tmp/va_thread.json"))["id"])')
CID=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -H "X-Request-Id: $CID" \
  -d "{\"message\":\"Qual é a data de hoje e de amanhã no meu fuso?\",\"input_modality\":\"text\",\"client_message_id\":\"$CID\"}" \
  "$API/api/v1/agent/threads/$TID/messages" -o /tmp/va_clock.json
python3 - <<'PY'
import json,re
d=json.load(open("/tmp/va_clock.json"))
print("clock_status", d.get("status"))
print("reply_preview", (d.get("reply") or "")[:220].replace("\n"," "))
PY

# idempotent replay
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -H "X-Request-Id: $CID" \
  -d "{\"message\":\"Qual é a data de hoje e de amanhã no meu fuso?\",\"input_modality\":\"text\",\"client_message_id\":\"$CID\"}" \
  "$API/api/v1/agent/threads/$TID/messages" -o /tmp/va_clock_replay.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/va_clock_replay.json"))
print("idempotent_replay", d.get("idempotent_replay"))
PY

echo "== voice transcript auto path (same pipeline) =="
ENV=/home/palex/ntws/croniu-hml/deploy/hml/.env.hml
set -a; source "$ENV"; set +a
KEY="${OPENAI_API_KEY:-${LLM_API_KEY:-}}"
BASE="${LLM_API_BASE:-https://api.openai.com/v1}"
PHRASE="Como esta meu dia amanha"
MP3=/tmp/croniu_voice_auto.mp3
curl -sS -o "$MP3" -w "tts_http=%{http_code}\n" \
  -X POST "$BASE/audio/speech" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini-tts\",\"voice\":\"alloy\",\"input\":\"$PHRASE\",\"response_format\":\"mp3\"}" >/dev/null
curl -sS -b "$COOKIE" -F "file=@${MP3};type=audio/mpeg" -F "duration_seconds=3" \
  "$API/api/v1/agent/transcribe" -o /tmp/va_tx.json
TEXT=$(python3 -c 'import json; print(json.load(open("/tmp/va_tx.json")).get("text","").strip())')
echo "transcribed_len=${#TEXT}"
CID2=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -H "X-Request-Id: $CID2" \
  -d "$(python3 - <<PY
import json
print(json.dumps({"message":"""$TEXT""","input_modality":"voice_transcript","client_message_id":"$CID2"}))
PY
)" \
  "$API/api/v1/agent/threads/$TID/messages" -o /tmp/va_voice_chat.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/va_voice_chat.json"))
print("voice_chat_status", d.get("status"), "tools", d.get("tool_trace"), "pending", bool(d.get("pending_action")))
print("voice_reply_len", len(d.get("reply") or ""))
PY
rm -f "$MP3"
echo SMOKE_VOICE_AUTO_TEMPORAL_DONE
