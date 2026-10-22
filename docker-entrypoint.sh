#!/usr/bin/env bash
set -e

# Port configuration
export PORT="${PORT:-3050}"
export APP_BASE_URL="${APP_BASE_URL:-http://localhost:3000}"

echo "=========================================================="
echo " Starting Agentic Playwright Test Writer Container"
echo " Time:                     $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo " Agent Dashboard Port:     $PORT (public)"
echo " Conduit Demo App URL:     $APP_BASE_URL (internal)"
echo " Database Seed Source:     /app/data/seed.sqlite"
echo "=========================================================="

# Graceful process termination
CONDUIT_PID=""
cleanup() {
  echo ""
  echo "Termination signal received. Shutting down child processes..."
  if [ -n "$CONDUIT_PID" ]; then
    kill -TERM "$CONDUIT_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Start internal Conduit demo app on localhost:3000
echo "[1/3] Starting Conduit demo app in background on localhost:3000..."
cd /app/conduit-app
npm run dev -- -p 3000 &
CONDUIT_PID=$!
cd /app

# 2. Poll until Conduit is ready
echo "[2/3] Waiting for Conduit demo app to be ready on 127.0.0.1:3000..."
node -e '
const http = require("http");
const start = Date.now();
const TIMEOUT_MS = 60000;

function check() {
  const req = http.get("http://127.0.0.1:3000", (res) => {
    console.log(`Conduit demo app is responsive (HTTP ${res.statusCode}). Ready to accept traffic.`);
    process.exit(0);
  });
  req.on("error", (err) => {
    if (Date.now() - start > TIMEOUT_MS) {
      console.warn("Conduit readiness probe timed out after 60s; continuing to dashboard start.");
      process.exit(0);
    }
    setTimeout(check, 1000);
  });
}
check();
'

# 3. Start Agent Dashboard on public $PORT
echo "[3/3] Launching Agent Dashboard on 0.0.0.0:$PORT..."
exec npm run dashboard
