import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function check(condition, message) {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

async function verifyCodespaces() {
  console.log('========================================================');
  console.log(' VERIFYING GITHUB CODESPACES CONFIGURATION & READINESS');
  console.log('========================================================\n');

  // 1. devcontainer.json validation
  console.log('[Check 1] Validating .devcontainer/devcontainer.json...');
  const devcontainerPath = path.resolve(rootDir, '.devcontainer', 'devcontainer.json');
  check(fs.existsSync(devcontainerPath), '.devcontainer/devcontainer.json exists');
  
  const devcontainerRaw = fs.readFileSync(devcontainerPath, 'utf-8');
  let devcontainer;
  try {
    devcontainer = JSON.parse(devcontainerRaw);
  } catch (err) {
    throw new Error(`devcontainer.json is not valid JSON: ${err.message}`);
  }

  check(devcontainer.image.includes('javascript-node:1-22') || devcontainer.image.includes('node:22') || devcontainer.image.includes('javascript-node:22'), 'Base image uses Node 22 devcontainer');
  check(Array.isArray(devcontainer.forwardPorts) && devcontainer.forwardPorts.includes(3050) && !devcontainer.forwardPorts.includes(3000), 'forwardPorts contains [3050] and DOES NOT publicly forward 3000');
  check(devcontainer.portsAttributes && devcontainer.portsAttributes['3050'], 'portsAttributes defined for 3050');
  check(devcontainer.portsAttributes['3050'].label === 'Agent Dashboard', 'Port 3050 has descriptive label');
  check(devcontainer.portsAttributes['3050'].onAutoForward === 'notify', 'Port 3050 onAutoForward is "notify"');
  check(devcontainer.portsAttributes['3000'] && devcontainer.portsAttributes['3000'].onAutoForward === 'ignore', 'Port 3000 onAutoForward is "ignore"');
  check(Boolean(devcontainer.postCreateCommand), 'postCreateCommand is defined');

  // 2. setup.sh validation
  console.log('\n[Check 2] Validating .devcontainer/setup.sh...');
  const setupShPath = path.resolve(rootDir, '.devcontainer', 'setup.sh');
  check(fs.existsSync(setupShPath), '.devcontainer/setup.sh exists');
  const setupShContent = fs.readFileSync(setupShPath, 'utf-8');
  check(setupShContent.includes('npm install'), 'setup.sh runs npm install');
  check(setupShContent.includes('npx playwright install --with-deps chromium'), 'setup.sh installs Playwright with deps');
  check(setupShContent.includes('https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git'), 'setup.sh clones Conduit repo');
  check(setupShContent.includes('1413fb9cc94409bdb47d904f9895084b050e900c'), 'setup.sh checks out pinned Conduit commit');
  check(setupShContent.includes('prisma generate'), 'setup.sh generates Prisma client');
  check(setupShContent.includes('prisma db push'), 'setup.sh pushes SQLite database schema');

  // 3. package.json codespace:start script
  console.log('\n[Check 3] Validating package.json scripts...');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8'));
  check(Boolean(pkg.scripts['codespace:start']), 'package.json contains "codespace:start" script');
  console.log(`  Script command: ${pkg.scripts['codespace:start']}`);

  // 4. start_codespace.mjs & start_codespace.sh validation
  console.log('\n[Check 4] Validating Codespace start scripts...');
  const startMjsPath = path.resolve(rootDir, 'scripts', 'start_codespace.mjs');
  const startShPath = path.resolve(rootDir, 'scripts', 'start_codespace.sh');
  check(fs.existsSync(startMjsPath), 'scripts/start_codespace.mjs exists');
  check(fs.existsSync(startShPath), 'scripts/start_codespace.sh exists');

  const startMjsContent = fs.readFileSync(startMjsPath, 'utf-8');
  check(startMjsContent.includes('3050') && startMjsContent.includes('3000'), 'start_codespace.mjs manages port 3000 (Conduit) and 3050 (Dashboard)');

  // 5. Secret audit
  console.log('\n[Check 5] Auditing for secret leaks...');
  check(!devcontainerRaw.includes('AIza') && !devcontainerRaw.includes('GEMINI_API_KEY='), 'devcontainer.json contains no hardcoded secrets');
  check(!setupShContent.includes('AIza') && !setupShContent.includes('GEMINI_API_KEY='), 'setup.sh contains no hardcoded secrets');
  check(!startMjsContent.includes('AIza') && !startMjsContent.includes('AIzaSy'), 'start_codespace.mjs contains no hardcoded secrets');

  // 6. README section
  console.log('\n[Check 6] Validating README.md documentation...');
  const readmeContent = fs.readFileSync(path.resolve(rootDir, 'README.md'), 'utf-8');
  check(readmeContent.includes('## Run in GitHub Codespaces'), 'README.md contains "## Run in GitHub Codespaces"');
  check(readmeContent.includes('npm run codespace:start'), 'README.md documents npm run codespace:start');
  check(readmeContent.includes('GEMINI_API_KEY'), 'README.md documents Codespaces secret configuration');

  // 7. Live Health Endpoint on port 3050
  console.log('\n[Check 7] Querying live /health endpoint on port 3050...');
  await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:3050/health', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          check(res.statusCode === 200, `/health returned HTTP 200`);
          check(json.status === 'ok', `status is "ok"`);
          check(json.port === 3050, `port is 3050`);
          check(json.database === 'connected', `database is "connected"`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

  console.log('\n========================================================');
  console.log(' ALL GITHUB CODESPACES READINESS CHECKS PASSED!');
  console.log('========================================================');
}

verifyCodespaces().catch(err => {
  console.error('\nCODESPACES VERIFICATION FAILED:', err);
  process.exit(1);
});
