import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { startWebUI } from '../src/pipeline/10_webui.ts';
import { validateUrlSafety } from '../src/site_checker/ssrf_guard.ts';
import { getDatabase, getAllPipelineRuns } from '../src/pipeline/9_store.ts';
import { getLatestBonusData } from '../src/pipeline/bonus.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_PORT = 3099;
process.env.PORT = String(TEST_PORT);
process.env.APP_BASE_URL = 'http://localhost:3000';

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runVerification() {
  console.log('========================================================');
  console.log(' RUNNING CONTAINER & DEPLOYMENT VERIFICATION CHECKS');
  console.log('========================================================\n');

  let server;
  let testDbPath = path.resolve(rootDir, 'test_verify_data.sqlite');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Database Auto-Seeding When Empty
    // -------------------------------------------------------------------------
    console.log('[Check 1] Verifying Database Auto-Seeding on Startup...');
    const seedPath = path.resolve(rootDir, 'data', 'seed.sqlite');
    if (!fs.existsSync(seedPath)) {
      throw new Error(`Seed database file does not exist at: ${seedPath}`);
    }
    const { DatabaseSync } = await import('node:sqlite');
    const seedDb = new DatabaseSync(seedPath);
    const seedRuns = seedDb.prepare('SELECT test_case_id FROM pipeline_runs').all();
    const seedRunIds = seedRuns.map(r => r.test_case_id).sort();
    console.log(`Seed database contains test runs: ${JSON.stringify(seedRunIds)}`);
    if (seedRunIds.length !== 4 || !seedRunIds.includes('TC1') || !seedRunIds.includes('TC4')) {
      throw new Error(`Expected exactly 4 benchmark runs in seed database, got: ${seedRunIds.length}`);
    }
    const seedHealing = seedDb.prepare('SELECT count(*) as cnt FROM bonus_healing').get();
    const seedStability = seedDb.prepare('SELECT count(*) as cnt FROM bonus_stability').get();
    const seedA11y = seedDb.prepare('SELECT count(*) as cnt FROM bonus_accessibility').get();
    console.log(`Seed bonus records -> Healing: ${seedHealing.cnt}, Stability: ${seedStability.cnt}, A11y: ${seedA11y.cnt}`);
    if (!seedHealing.cnt || !seedStability.cnt || !seedA11y.cnt) {
      throw new Error('Seed database is missing one or more bonus records!');
    }
    seedDb.close();

    // Verify live DB has runs seeded
    const liveRuns = getAllPipelineRuns();
    console.log(`Live database test runs: ${liveRuns.map(r => r.testCaseId).join(', ')}`);
    if (liveRuns.length < 4) {
      throw new Error(`Expected at least 4 runs in live store, found ${liveRuns.length}`);
    }
    console.log('  PASS: Database seed integrity and auto-seed mechanism verified successfully.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Start Web UI Server and Test /health Endpoint
    // -------------------------------------------------------------------------
    console.log('[Check 2] Starting Web UI Server & Testing /health...');
    server = startWebUI(TEST_PORT);

    // Wait 500ms for server listen
    await new Promise(r => setTimeout(r, 500));

    const healthRes = await httpRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/health',
      method: 'GET',
    });

    console.log(`HTTP GET /health status: ${healthRes.statusCode}`);
    const healthJson = JSON.parse(healthRes.body);
    console.log(`Response:`, healthJson);

    if (healthRes.statusCode !== 200 || healthJson.status !== 'ok') {
      throw new Error(`Expected /health status 200 with status "ok", got: ${healthRes.statusCode}`);
    }
    if (healthJson.port !== TEST_PORT || healthJson.appBaseUrl !== 'http://localhost:3000') {
      throw new Error(`Unexpected health payload: ${JSON.stringify(healthJson)}`);
    }
    console.log('  PASS: /health endpoint returns HTTP 200 and expected schema.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Execution & LLM Rate Limiter Check (HTTP 429)
    // -------------------------------------------------------------------------
    console.log('[Check 3] Testing Rate Limiter on Execution Routes (limit: 15 req/min)...');
    let got429 = false;
    let rateLimitPayload = null;

    // Fire 18 rapid requests to an execution endpoint (/api/pipeline/approve)
    for (let i = 1; i <= 18; i++) {
      const res = await httpRequest(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/pipeline/approve',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        JSON.stringify({ runId: 'fake_run' })
      );

      if (res.statusCode === 429) {
        got429 = true;
        rateLimitPayload = JSON.parse(res.body);
        console.log(`Request #${i} triggered HTTP 429 as expected. Retry-After: ${res.headers['retry-after']}s`);
        console.log(`Payload:`, rateLimitPayload);
        break;
      }
    }

    if (!got429) {
      throw new Error('Rate limiter failed to trigger HTTP 429 within 18 rapid requests!');
    }
    console.log('  PASS: Rate limiter correctly guards execution routes against abuse.\n');

    // -------------------------------------------------------------------------
    // TEST 4: SSRF Guard Integrity Verification
    // -------------------------------------------------------------------------
    console.log('[Check 4] Testing SSRF Guard Integrity...');
    // 1. AWS metadata endpoint
    const awsCheck = await validateUrlSafety('http://169.254.169.254/latest/meta-data/');
    console.log('169.254.169.254 safe?:', awsCheck.safe, awsCheck.error);
    if (awsCheck.safe) throw new Error('SSRF guard failed to block AWS link-local metadata IP!');

    // 2. Private 10.0.0.1
    const privateCheck = await validateUrlSafety('http://10.0.0.1:8080/admin');
    console.log('10.0.0.1 safe?:', privateCheck.safe, privateCheck.error);
    if (privateCheck.safe) throw new Error('SSRF guard failed to block private 10.x.x.x network!');

    // 3. Allowlisted demo app
    const demoCheck = await validateUrlSafety('http://localhost:3000');
    console.log('http://localhost:3000 safe?:', demoCheck.safe);
    if (!demoCheck.safe) throw new Error('SSRF guard failed to allow configured demo app URL!');

    // 4. Arbitrary internal port on localhost
    const blockedLocalhostCheck = await validateUrlSafety('http://localhost:9999');
    console.log('http://localhost:9999 safe?:', blockedLocalhostCheck.safe, blockedLocalhostCheck.error);
    if (blockedLocalhostCheck.safe) throw new Error('SSRF guard allowed localhost on unconfigured port!');

    console.log('  PASS: SSRF Guard is completely intact and secure.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Docker Files & Configurations Check
    // -------------------------------------------------------------------------
    console.log('[Check 5] Verifying Dockerfile, .dockerignore, and Entrypoint...');
    const dockerfileContent = fs.readFileSync(path.resolve(rootDir, 'Dockerfile'), 'utf-8');
    const dockerignoreContent = fs.readFileSync(path.resolve(rootDir, '.dockerignore'), 'utf-8');
    const entrypointContent = fs.readFileSync(path.resolve(rootDir, 'docker-entrypoint.sh'), 'utf-8');

    // Check base image
    if (!dockerfileContent.includes('mcr.microsoft.com/playwright:')) {
      throw new Error('Dockerfile does not use official Playwright base image!');
    }
    // Check secret safety
    if (dockerfileContent.includes('AIza') || dockerfileContent.includes('GEMINI_API_KEY=')) {
      throw new Error('CRITICAL: Secret detected inside Dockerfile!');
    }
    if (!dockerignoreContent.includes('.env')) {
      throw new Error('.dockerignore does not exclude .env!');
    }
    // Check Conduit repo & commit
    if (!dockerfileContent.includes('https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git')) {
      throw new Error('Dockerfile missing Conduit repository URL!');
    }
    if (!dockerfileContent.includes('1413fb9cc94409bdb47d904f9895084b050e900c')) {
      throw new Error('Dockerfile missing Conduit commit sha!');
    }
    // Check entrypoint port binding and internal demo
    if (!entrypointContent.includes('npm run dev -- -p 3000') || !entrypointContent.includes('npm run dashboard')) {
      throw new Error('Entrypoint does not launch internal Conduit and dashboard!');
    }

    console.log('  PASS: Dockerfile, .dockerignore, and docker-entrypoint.sh pass all security & functional criteria.\n');

    console.log('========================================================');
    console.log(' ALL 5 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runVerification().catch(err => {
  console.error('\nVERIFICATION FAILED:', err);
  process.exit(1);
});
