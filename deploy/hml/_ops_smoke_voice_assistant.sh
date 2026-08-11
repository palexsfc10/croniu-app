#!/usr/bin/env bash
# Controlled HML smoke: voice transcribe + read-only assistant turn.
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
COOKIE=/tmp/croniu_voice_smoke_cookies.txt
rm -f "$COOKIE"
EMAIL="voice_smoke_$(date +%s)@example.com"
PASS='SenhaForte1!'
ORG="Voice Smoke $(date +%s)"

echo "== register/login =="
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"full_name\":\"Voice Smoke\",\"organization_name\":\"$ORG\"}" \
  "$API/api/v1/auth/register" >/tmp/voice_reg.json
python3 -c 'import json; d=json.load(open("/tmp/voice_reg.json")); print("reg_ok", bool(d.get("organization")))'
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$API/api/v1/auth/login" >/dev/null

echo "== status =="
curl -sS -b "$COOKIE" "$API/api/v1/agent/status" -o /tmp/voice_status.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/voice_status.json"))
print("enabled", d.get("enabled"), "voice_enabled", d.get("voice_enabled"), "entitlement", d.get("entitlement_ok"))
PY

echo "== make short wav =="
WAV=/tmp/croniu_smoke_voice.wav
python3 - <<'PY'
import math, struct
path="/tmp/croniu_smoke_voice.wav"
rate=16000; n=int(rate*1.5)
frames=bytearray()
for i in range(n):
    v=int(10000*math.sin(2*math.pi*440*i/rate))
    frames += struct.pack("<h", v)
data=bytes(frames)
with open(path,"wb") as f:
    f.write(b"RIFF"); f.write(struct.pack("<I", 36+len(data)))
    f.write(b"WAVEfmt "); f.write(struct.pack("<IHHIIHH", 16,1,1,rate,rate*2,2,16))
    f.write(b"data"); f.write(struct.pack("<I", len(data))); f.write(data)
print("wav_bytes", len(data)+44)
PY

echo "== transcribe =="
START=$(date +%s%3N)
HTTP=$(curl -sS -o /tmp/voice_smoke_tx.json -w "%{http_code}" -b "$COOKIE" \
  -H "X-Request-Id: smoke-voice-$(date +%s)" \
  -F "file=@${WAV};type=audio/wav" \
  -F "duration_seconds=1.5" \
  "$API/api/v1/agent/transcribe" || echo 000)
END=$(date +%s%3N)
echo "transcribe_http=$HTTP wall_latency_ms=$((END-START))"
python3 - <<'PY'
import json
d=json.load(open("/tmp/voice_smoke_tx.json"))
detail=d.get("detail")
if isinstance(detail, dict):
    print("error_code", detail.get("code"))
    print("error_message", detail.get("message"))
elif "text" in d:
    t=d.get("text") or ""
    print("text_len", len(t))
    print("text_preview", t[:48].replace("\n"," "))
    print("model", d.get("model"))
    print("latency_ms", d.get("latency_ms"))
    print("bytes_received", d.get("bytes_received"))
    print("mime", d.get("mime_type"))
else:
    print("unexpected", list(d.keys())[:8])
PY

echo "== read-only chat =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"title":"smoke voice"}' "$API/api/v1/agent/threads" -o /tmp/voice_thread.json
TID=$(python3 -c 'import json; print(json.load(open("/tmp/voice_thread.json"))["id"])')
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"message":"Como está meu dia hoje?","input_modality":"text"}' \
  "$API/api/v1/agent/threads/$TID/messages" -o /tmp/voice_smoke_chat.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/voice_smoke_chat.json"))
print("chat_status", d.get("status"))
print("reply_len", len(d.get("reply") or ""))
print("tools", d.get("tool_trace"))
print("pending", bool(d.get("pending_action")))
PY

echo "== temp leftovers =="
LEFT=$(docker exec croniu-hml-api sh -c 'ls /tmp/croniu-voice-* 2>/dev/null | wc -l' || echo 0)
echo "croniu_voice_temp_files=$LEFT"

echo "== usage counters =="
docker exec croniu-hml-db psql -U croniu_hml -d croniu_hml -tAc \
  "SELECT coalesce(sum(voice_transcriptions),0), coalesce(sum(voice_errors),0), coalesce(sum(voice_audio_seconds),0) FROM agent_usage_daily;"

rm -f "$WAV"
echo SMOKE_VOICE_DONE
