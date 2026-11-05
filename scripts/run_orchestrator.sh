#!/usr/bin/env bash
# Start the Argus orchestrator behind the fixed ngrok domain.
#   scripts/run_orchestrator.sh            # orchestrator + tunnel
#   ARGUS_NO_TUNNEL=1 scripts/run_orchestrator.sh   # local only
# Ctrl+C stops both. Webhook URL: https://$NGROK_DOMAIN/webhook
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${ARGUS_PORT:-8787}"
get() { sed -n "s/^$1=//p" "$ROOT/.env" | head -1; }

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

if [[ -z "${ARGUS_NO_TUNNEL:-}" ]]; then
  DOMAIN="$(get NGROK_DOMAIN)"
  [[ -n "$DOMAIN" ]] || { echo "NGROK_DOMAIN missing in .env" >&2; exit 1; }
  CONF="$(mktemp)"; printf 'version: "3"\n' > "$CONF"
  NGROK_AUTHTOKEN="$(get NGROK_AUTHTOKEN)" ngrok http "127.0.0.1:$PORT" --url "https://$DOMAIN" \
    --config "$CONF" --log stdout --log-level warn > "$ROOT/orchestrator/logs/ngrok.log" 2>&1 &
  pids+=($!)
  echo "tunnel: https://$DOMAIN -> 127.0.0.1:$PORT (inspector http://127.0.0.1:4040)"
fi

cd "$ROOT/orchestrator"
python3 -m argus --port "$PORT" &
pids+=($!)
wait -n "${pids[@]}"
