import { spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const conduitDir = path.resolve(rootDir, 'conduit-app');

const PORT = process.env.PORT || '3050';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

process.env.PORT = PORT;
process.env.APP_BASE_URL = APP_BASE_URL;

console.log('==========================================================');
console.log(' Starting Services in GitHub Codespaces');
console.log(` Agent Dashboard: http://localhost:${PORT} (public forwarded)`);
console.log(` Conduit Demo:    http://localhost:3000 (internal only)`);
console.log('==========================================================\n');

if (!fs.existsSync(conduitDir)) {
  console.error(`Error: conduit-app directory not found at: ${conduitDir}`);
  console.error('Please run the postCreateCommand setup or clone Conduit as documented.');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

let conduitProc = null;
let dashProc = null;

function cleanup() {
  console.log('\nStopping child processes...');
  if (conduitProc && !conduitProc.killed) {
    try { conduitProc.kill('SIGTERM'); } catch {}
  }
  if (dashProc && !dashProc.killed) {
    try { dashProc.kill('SIGTERM'); } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 1. Start Conduit Demo App
console.log('[1/2] Starting Conduit demo app in background on localhost:3000...');
conduitProc = spawn(npmCmd, ['run', 'dev', '--', '-p', '3000'], {
  cwd: conduitDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: '3000' },
});

conduitProc.on('error', (err) => {
  console.error('Failed to spawn Conduit process:', err);
});

// 2. Probe readiness of Conduit
function probeConduit(timeoutMs = 60000) {
  const start = Date.now();
  console.log('[2/2] Waiting for Conduit demo app to become ready on 127.0.0.1:3000...');
  return new Promise((resolve) => {
    function check() {
      const req = http.get('http://127.0.0.1:3000', (res) => {
        console.log(`Conduit is responding (HTTP ${res.statusCode}). Ready!`);
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          console.warn('Conduit readiness probe timed out after 60s; launching dashboard now.');
          resolve(false);
        } else {
          setTimeout(check, 1000);
        }
      });
    }
    check();
  });
}

async function start() {
  await probeConduit();

  console.log(`\nLaunching Agent Dashboard on 0.0.0.0:${PORT}...`);
  dashProc = spawn(npmCmd, ['run', 'dashboard'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, PORT, APP_BASE_URL },
  });

  dashProc.on('error', (err) => {
    console.error('Failed to spawn Dashboard process:', err);
  });

  dashProc.on('exit', (code) => {
    console.log(`Dashboard process exited with code ${code}.`);
    cleanup();
  });
}

start().catch((err) => {
  console.error('Error starting Codespace services:', err);
  cleanup();
});
