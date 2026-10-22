#!/usr/bin/env bash
set -e

export PORT="${PORT:-3050}"
export APP_BASE_URL="${APP_BASE_URL:-http://localhost:3000}"

echo "=========================================================="
echo " Starting GitHub Codespaces Services"
echo " Dashboard Port:     $PORT (public forwarded)"
echo " Conduit Port:       3000 (internal only)"
echo " APP_BASE_URL:       $APP_BASE_URL"
echo "=========================================================="

CONDUIT_PID=""
cleanup() {
  echo ""
  echo "Shutting down Codespace child processes..."
  if [ -n "$CONDUIT_PID" ]; then
    kill -TERM "$CONDUIT_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Start Conduit
echo "[1/2] Starting Conduit demo app in background on localhost:3000..."
cd conduit-app
npm run dev -- -p 3000 &
CONDUIT_PID=$!
cd ..

# 2. Wait for Conduit readiness
echo "[2/2] Waiting for Conduit demo app to respond on 127.0.0.1:3000..."
node -e '
const http = require("http");
const start = Date.now();
function check() {
  const req = http.get("http://127.0.0.1:3000", (res) => {
    console.log("Conduit demo app is responsive (HTTP " + res.statusCode + ").");
    process.exit(0);
  });
  req.on("error", () => {
    if (Date.now() - start > 60000) {
      console.warn("Conduit probe timed out; continuing to dashboard.");
      process.exit(0);
    }
    setTimeout(check, 1000);
  });
}
check();
'

# 3. Start Agent Dashboard
echo "Conduit is responsive. Launching Agent Dashboard on port $PORT..."
npm run dashboard
