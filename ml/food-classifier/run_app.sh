#!/usr/bin/env bash
# Launch the API and the camera UI on free ports and wire them together.
#
# Port 8000 is commonly taken on a dev machine; hardcoding it made the UI
# fall back to slow in-process inference without saying why.
set -euo pipefail
cd "$(dirname "$0")"

PY=${PY:-.venv/bin/python}
free_port() {
  "$PY" - "$1" <<'PYEOF'
import socket, sys
start = int(sys.argv[1])
for p in range(start, start + 50):
    with socket.socket() as s:
        if s.connect_ex(('127.0.0.1', p)) != 0:
            print(p); break
else:
    raise SystemExit('no free port')
PYEOF
}

API_PORT=$(free_port 8000)
UI_PORT=$(free_port 8501)

echo "API  → http://localhost:${API_PORT}"
echo "UI   → http://localhost:${UI_PORT}"

"$PY" -m uvicorn api.main:app --port "$API_PORT" --log-level warning &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

printf 'waiting for models to warm'
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    echo " ready"; break
  fi
  printf '.'; sleep 2
done

DISHDETECT_API="http://localhost:${API_PORT}" \
  "$PY" -m streamlit run app/camera_ui.py \
    --server.port "$UI_PORT" --browser.gatherUsageStats false
