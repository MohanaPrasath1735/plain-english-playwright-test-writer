import { chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { SingleExecutionResult, TestExecutionSuiteResult } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';

export interface TestExecutionOptions {
  testId: string;
  targetUrl: string;
  credentials: {
    username: string;
    email: string;
    password: string;
  };
  evidenceDir: string;
  buttonSelectorOverride?: string;
  forceOnlyUrlCheck?: boolean;
}

/**
 * Step 7: Runner
 * Executes the test, then reruns it separately to check stability.
 * Saves Playwright trace, screenshot, and execution logs.
 */
export async function executeTestWithStabilityRerun(
  options: TestExecutionOptions
): Promise<TestExecutionSuiteResult> {
  // Ensure evidence dir
  if (!fs.existsSync(options.evidenceDir)) {
    fs.mkdirSync(options.evidenceDir, { recursive: true });
  }

  // Run 1
  const run1 = await executeSingleRun(options, 1);

  // Rerun separately to check stability with fresh synthetic credentials
  const freshRerunCredentials = {
    username: `user_${uuidv4().replace(/-/g, '').slice(0, 8)}`,
    email: `agent_test_${uuidv4().replace(/-/g, '').slice(0, 8)}@example.com`,
    password: options.credentials.password,
  };
  const run2 = await executeSingleRun({ ...options, credentials: freshRerunCredentials }, 2);

  const isStable = run1.status === run2.status;

  return {
    run1,
    run2Rerun: run2,
    isStable,
  };
}

async function executeSingleRun(
  options: TestExecutionOptions,
  runNumber: number
): Promise<SingleExecutionResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const log = (msg: string) => {
    const entry = `[Run ${runNumber}][${new Date().toISOString()}] ${msg}`;
    logs.push(entry);
    console.log(entry);
  };

  const tracePath = path.join(options.evidenceDir, `run_${runNumber}_trace.zip`);
  const screenshotPath = path.join(options.evidenceDir, `run_${runNumber}_screenshot.png`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Start Playwright Tracing
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();

  page.on('console', msg => log(`Browser Console: ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => log(`Browser Error: ${err.message}`));

  let runStatus: 'PASSED' | 'FAILED' = 'PASSED';
  let failureError: string | undefined;

  try {
    log(`Navigating to target URL: ${options.targetUrl}`);
    await page.goto(options.targetUrl, { waitUntil: 'networkidle', timeout: 15000 });

    log(`Filling credentials (username: ${options.credentials.username}, email: ${options.credentials.email})`);
    await page.getByPlaceholder('Username').fill(options.credentials.username);
    await page.getByPlaceholder('Email').fill(options.credentials.email);
    await page.getByPlaceholder('Password').fill(options.credentials.password);

    // Click button or trigger intentional selector mutation
    if (options.buttonSelectorOverride) {
      log(`Clicking button using altered selector: ${options.buttonSelectorOverride}`);
      // Wait with short timeout to catch failure cleanly
      await page.locator(options.buttonSelectorOverride).click({ timeout: 4000 });
    } else {
      log(`Clicking accessible button "Sign up"`);
      await page.getByRole('button', { name: 'Sign up' }).click();
    }

    // Verify assertions
    if (options.forceOnlyUrlCheck) {
      log(`Checking URL assertion only (DRAFT CHECK)`);
      const currentUrl = page.url();
      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const cleanHost = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!currentUrl.includes(cleanHost)) {
        throw new Error(`Expected URL to match APP_BASE_URL (${baseUrl}), got ${currentUrl}`);
      }
    } else {
      log(`Verifying in-page state: user profile link for "${options.credentials.username}"`);
      const userNavLink = page.getByRole('link', { name: options.credentials.username });
      await userNavLink.waitFor({ state: 'visible', timeout: 15000 });
      log(`State assertion verified: user "${options.credentials.username}" is visible in navbar`);

      // Backend database verification: assert email and username match submitted credentials
      const conduitDbPath = path.resolve(process.cwd(), 'conduit-app', 'prisma', 'db.sqlite');
      if (fs.existsSync(conduitDbPath)) {
        const { DatabaseSync } = await import('node:sqlite');
        const conduitDb = new DatabaseSync(conduitDbPath);
        const userRecord = conduitDb.prepare('SELECT id, username, email FROM User WHERE username = ?').get(options.credentials.username) as any;
        if (!userRecord) {
          throw new Error(`Backend verification failed: user "${options.credentials.username}" not found in database.`);
        }
        if (userRecord.username !== options.credentials.username || userRecord.email !== options.credentials.email) {
          throw new Error(`Backend verification mismatch: expected (${options.credentials.username}, ${options.credentials.email}), found (${userRecord.username}, ${userRecord.email})`);
        }
        log(`✓ Backend verification verified: DB User ID ${userRecord.id}, Username "${userRecord.username}", Email "${userRecord.email}"`);

        // Save evidence as backend_verification_run_<number>.json
        const backendEvidencePath = path.join(options.evidenceDir, `backend_verification_run_${runNumber}.json`);
        fs.writeFileSync(backendEvidencePath, JSON.stringify({
          verifiedAt: new Date().toISOString(),
          runNumber,
          submitted: {
            username: options.credentials.username,
            email: options.credentials.email,
          },
          backendRecord: userRecord,
          matched: true,
        }, null, 2), 'utf-8');
        log(`✓ Backend verification evidence saved to: ${backendEvidencePath}`);
      }
    }

    log(`Execution succeeded.`);
  } catch (err: any) {
    runStatus = 'FAILED';
    failureError = err?.message || String(err);
    log(`Execution failed with error: ${failureError}`);
  } finally {
    // Save screenshot
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`Screenshot captured at: ${screenshotPath}`);
    } catch (e) {
      log(`Failed to capture screenshot: ${e}`);
    }

    // Stop and save trace
    try {
      await context.tracing.stop({ path: tracePath });
      log(`Playwright Trace saved at: ${tracePath}`);
    } catch (e) {
      log(`Failed to save trace: ${e}`);
    }

    await browser.close();
  }

  const durationMs = Date.now() - startTime;

  return {
    runNumber,
    status: runStatus,
    durationMs,
    tracePath,
    screenshotPath,
    logs,
    error: failureError,
    createdUserData: runStatus === 'PASSED' ? {
      username: options.credentials.username,
      email: options.credentials.email,
    } : undefined,
  };
}
