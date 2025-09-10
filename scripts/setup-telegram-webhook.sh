#!/bin/sh

# Automate creating a public tunnel and setting Telegram webhook to your local dev server.
# Usage: sh scripts/setup-telegram-webhook.sh

set -e

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️ .env file not found. Create .env with TELEGRAM_BOT_TOKEN=your_token"
  exit 1
fi

# Read and strip quotes from TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "⚠️ TELEGRAM_BOT_TOKEN not set in $ENV_FILE"
  exit 1
fi

# Start localtunnel via npx (no global install required)
LOG_FILE="/tmp/localtunnel.$$.log"
rm -f "$LOG_FILE"

echo "🔌 Starting local tunnel (npx localtunnel --port 3000) — logs: $LOG_FILE"
# Start in background and capture PID
npx localtunnel --port 3000 > "$LOG_FILE" 2>&1 &
LT_PID=$!

# Ensure we clean up tunnel on exit
cleanup() {
  echo "\n🛑 Stopping local tunnel (PID $LT_PID)"
  kill "$LT_PID" 2>/dev/null || true
  exit
}
trap cleanup INT TERM EXIT

# Wait for the tunnel URL to appear in logs
echo "⏳ Waiting for tunnel URL..."
URL=""
# Give the tunnel up to 30 seconds to start and write its URL to the log
COUNT=0
while [ "$COUNT" -lt 30 ]; do
  COUNT=$((COUNT + 1))
  sleep 1
  # Extract the last full https://... token from the log file
  URL_CANDIDATE=$(grep -Eo "https?://[^[:space:]]+" "$LOG_FILE" 2>/dev/null | tail -n1 || true)
  if [ -n "$URL_CANDIDATE" ]; then
    # Basic validation: ensure there's at least one dot in the hostname
    if printf '%s' "$URL_CANDIDATE" | grep -q '\.'; then
      URL="$URL_CANDIDATE"
      break
    fi
  fi
done

if [ -z "$URL" ]; then
  echo "❌ Failed to obtain tunnel URL. Last log lines (for debugging):"
  tail -n 50 "$LOG_FILE"
  cleanup
fi

WEBHOOK_URL="${URL}/api/telegram/webhook"

echo "🔗 Tunnel URL: $URL"
echo "📬 Setting Telegram webhook to: $WEBHOOK_URL"

# Set webhook via Telegram API
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" -d "url=${WEBHOOK_URL}")

echo "Telegram API response: $RESPONSE"

echo "✅ Webhook set. Tunnel will remain running. Press Ctrl+C to stop and remove the tunnel."

# Keep showing logs so the script doesn't exit and the tunnel stays up
# User can Ctrl+C to stop (trap will clean up)

exec tail -f "$LOG_FILE"
