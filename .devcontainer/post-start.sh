#!/usr/bin/env bash
set -e

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/codespace-services.log"

export PORT="${PORT:-3050}"
export APP_BASE_URL="${APP_BASE_URL:-http://localhost:3000}"

echo "=========================================================="
echo " Starting Services in GitHub Codespaces (postStartCommand)"
echo " Time:         $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo " Dashboard:    http://localhost:${PORT}"
echo " Conduit App:  ${APP_BASE_URL}"
echo " Log file:     ${LOG_FILE}"
echo "=========================================================="

# Initialize log file header
echo "" >> "$LOG_FILE"
echo "==========================================================" >> "$LOG_FILE"
echo " Codespace Services Startup: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE"
echo " Codespace Name: ${CODESPACE_NAME:-local}" >> "$LOG_FILE"
echo "==========================================================" >> "$LOG_FILE"

# Probe helper using Node.js to test URL reachability without hanging
probe_url() {
  local target="$1"
  node -e '
    const http = require("http");
    const target = process.argv[1];
    function check(urlStr) {
      return new Promise((resolve) => {
        try {
          const u = new URL(urlStr);
          const req = http.get(u, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 500);
          });
          req.on("error", () => resolve(false));
          req.setTimeout(1500, () => { req.destroy(); resolve(false); });
        } catch {
          resolve(false);
        }
      });
    }
    async function run() {
      const ok = await check(target);
      process.exit(ok ? 0 : 1);
    }
    run();
  ' "$target" 2>/dev/null
}

# 1. Start Conduit Demo App if not already responsive
if probe_url "http://127.0.0.1:3000" || probe_url "http://localhost:3000"; then
  echo "[1/4] Conduit demo app is already running on port 3000."
else
  echo "[1/4] Starting Conduit demo app in background on port 3000..."
  if [ -d "$PROJECT_ROOT/conduit-app" ]; then
    cd "$PROJECT_ROOT/conduit-app"
    nohup npm run dev -- -p 3000 >> "$LOG_FILE" 2>&1 &
    disown
    cd "$PROJECT_ROOT"
  else
    echo "Warning: conduit-app directory not found at $PROJECT_ROOT/conduit-app. Running setup..."
    bash "$SCRIPT_DIR/setup.sh"
    cd "$PROJECT_ROOT/conduit-app"
    nohup npm run dev -- -p 3000 >> "$LOG_FILE" 2>&1 &
    disown
    cd "$PROJECT_ROOT"
  fi
fi

# 2. Start Agent Dashboard if not already responsive
if probe_url "http://127.0.0.1:${PORT}/health" || probe_url "http://localhost:${PORT}/health"; then
  echo "[2/4] Agent Dashboard is already running on port ${PORT}."
else
  echo "[2/4] Starting Agent Dashboard in background on port ${PORT}..."
  cd "$PROJECT_ROOT"
  nohup npm run dashboard >> "$LOG_FILE" 2>&1 &
  disown
fi

# 3. Wait until http://localhost:3000 and http://localhost:3050/health respond
echo "[3/4] Waiting for services to become responsive..."

echo " - Waiting for Conduit demo app on http://localhost:3000..."
CONDUIT_TIMEOUT=60
START_TIME=$(date +%s)
while ! probe_url "http://127.0.0.1:3000" && ! probe_url "http://localhost:3000"; do
  NOW=$(date +%s)
  if [ $((NOW - START_TIME)) -ge $CONDUIT_TIMEOUT ]; then
    echo "   Warning: Conduit probe timed out after ${CONDUIT_TIMEOUT}s. Check ${LOG_FILE} for details."
    break
  fi
  sleep 1
done
if probe_url "http://127.0.0.1:3000" || probe_url "http://localhost:3000"; then
  echo "   ✓ Conduit demo app is ready on http://localhost:3000"
fi

echo " - Waiting for Agent Dashboard on http://localhost:${PORT}/health..."
DASH_TIMEOUT=60
START_TIME=$(date +%s)
while ! probe_url "http://127.0.0.1:${PORT}/health" && ! probe_url "http://localhost:${PORT}/health"; do
  NOW=$(date +%s)
  if [ $((NOW - START_TIME)) -ge $DASH_TIMEOUT ]; then
    echo "   Warning: Dashboard probe timed out after ${DASH_TIMEOUT}s. Check ${LOG_FILE} for details."
    break
  fi
  sleep 1
done
if probe_url "http://127.0.0.1:${PORT}/health" || probe_url "http://localhost:${PORT}/health"; then
  echo "   ✓ Agent Dashboard is ready on http://localhost:${PORT}/health"
fi

# 4. Attempt to set port 3050 visibility to public
echo "[4/4] Configuring port visibility..."
if command -v gh >/dev/null 2>&1 && [ -n "${CODESPACE_NAME:-}" ]; then
  echo "Attempting: gh codespace ports visibility ${PORT}:public -c \"$CODESPACE_NAME\""
  if gh codespace ports visibility "${PORT}:public" -c "$CODESPACE_NAME" >> "$LOG_FILE" 2>&1; then
    echo "✓ Port ${PORT} visibility set to public."
  else
    echo "! Note: Could not set port ${PORT} visibility automatically via gh CLI."
    echo "  (Default Codespace GITHUB_TOKEN has repository scope rather than user codespace management scope)."
    echo "  Manual step: In VS Code / Web Codespace, open the 'Ports' tab, right-click port ${PORT}, and select 'Port Visibility' -> 'Public'."
  fi
else
  echo "! Note: CODESPACE_NAME not set or gh CLI not available. Skipping CLI port visibility change."
  echo "  Manual step: In VS Code / Web Codespace, open the 'Ports' tab, right-click port ${PORT}, and select 'Port Visibility' -> 'Public'."
fi

echo "=========================================================="
echo " Codespace startup complete! Logs: ${LOG_FILE}"
echo "=========================================================="
exit 0
