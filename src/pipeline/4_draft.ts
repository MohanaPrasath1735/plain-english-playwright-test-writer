import { v4 as uuidv4 } from 'uuid';
import { UnderstoodFlow, ReasoningResult } from '../types.js';
import { draftSpecWithLLM } from '../llm.js';
import * as path from 'path';
import * as fs from 'fs';

export interface DraftResult {
  code: string;
  filePath: string;
  syntheticCredentials: {
    username: string;
    email: string;
    password: string;
  };
}

/**
 * Step 4: Draft
 * Draft a .spec.ts using the LLM with fresh synthetic data per run (unique username and email via uuid).
 * Never bypass OTP/CAPTCHA; show a manual step or a mock instead.
 */
export async function draftPlaywrightSpec(
  flow: UnderstoodFlow,
  reasoning: ReasoningResult,
  outputDir: string,
  options?: {
    forceOnlyUrlCheck?: boolean; // For TC3 demonstration
    buttonSelectorOverride?: string; // For TC2 demonstration
  }
): Promise<DraftResult> {
  const shortId = uuidv4().replace(/-/g, '').slice(0, 8);
  const syntheticCredentials = {
    username: `user_${shortId}`,
    email: `agent_test_${shortId}@example.com`,
    password: `P@ssword_${shortId}!`,
  };

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const specFileName = `${flow.testId.toLowerCase()}_flow.spec.ts`;
  const specFilePath = path.join(outputDir, specFileName);

  // Use LLM to generate the spec code
  let code: string;
  try {
    code = await draftSpecWithLLM({
      testId: flow.testId,
      flowDescription: flow.rawFlow,
      expectedEndState: flow.expectedEndState,
      targetUrl: flow.targetInitialUrl,
      reasonedDecisions: reasoning.decisions,
      syntheticData: syntheticCredentials,
      onlyCheckUrlMock: options?.forceOnlyUrlCheck,
    });
  } catch (err) {
    console.warn('LLM call encountered error, using template-guided synthetic generation:', err);
    // Deterministic fallback adhering strictly to the same rules
    code = generateDeterministicSpec(flow, reasoning, syntheticCredentials, options);
  }

  // If options specify only URL check or button selector override for TC2/TC3
  if (options?.forceOnlyUrlCheck) {
    code = generateOnlyUrlCheckSpec(flow, syntheticCredentials);
  } else if (options?.buttonSelectorOverride) {
    code = generateOverriddenButtonSpec(flow, syntheticCredentials, options.buttonSelectorOverride);
  }

  fs.writeFileSync(specFilePath, code, 'utf-8');

  return {
    code,
    filePath: specFilePath,
    syntheticCredentials,
  };
}

function generateOnlyUrlCheckSpec(
  flow: UnderstoodFlow,
  creds: { username: string; email: string; password: string }
): string {
  return `import { test, expect } from '@playwright/test';

test.describe('${flow.testId} - Sign up flow', () => {
  test('Sign up and check URL only', async ({ page }) => {
    // Fresh synthetic credentials (no PII)
    const credentials = {
      username: '${creds.username}',
      email: '${creds.email}',
      password: '${creds.password}',
    };

    // Navigate to registration page
    await page.goto('${flow.targetInitialUrl}', { waitUntil: 'networkidle' });

    // Fill form
    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // Submit
    await page.getByRole('button', { name: 'Sign up' }).click();

    // DRAFT FLAW: only checks URL without state assertion
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const hostPattern = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    await expect(page).toHaveURL(new RegExp(hostPattern + '\\/?$'));
  });
});
`;
}

function generateOverriddenButtonSpec(
  flow: UnderstoodFlow,
  creds: { username: string; email: string; password: string },
  invalidSelector: string
): string {
  return `import { test, expect } from '@playwright/test';

test.describe('${flow.testId} - Sign up with modified button selector', () => {
  test('Sign up with altered button selector', async ({ page }) => {
    const credentials = {
      username: '${creds.username}',
      email: '${creds.email}',
      password: '${creds.password}',
    };

    await page.goto('${flow.targetInitialUrl}', { waitUntil: 'networkidle' });

    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // SIMULATED SELECTOR CHANGE / MUTATION:
    // Targeting an altered selector that does not exist in the DOM
    await page.locator('${invalidSelector}').click({ timeout: 5000 });

    // State assertion
    await expect(page.getByRole('link', { name: credentials.username })).toBeVisible({ timeout: 5000 });
  });
});
`;
}

function generateDeterministicSpec(
  flow: UnderstoodFlow,
  reasoning: ReasoningResult,
  creds: { username: string; email: string; password: string },
  options?: { buttonSelectorOverride?: string }
): string {
  return `import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

test.describe('${flow.testId} - Plain-English Playwright Test', () => {
  test('Sign up flow with UI state and backend database verification', async ({ page }) => {
    // Fresh synthetic test data generated uniquely for this test run
    const credentials = {
      username: '${creds.username}',
      email: '${creds.email}',
      password: '${creds.password}',
    };

    // 1. Navigate to target URL
    await page.goto('${flow.targetInitialUrl}', { waitUntil: 'networkidle' });

    // 2. Fill credentials using accessible locators
    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // 3. Submit registration
    ${
      options?.buttonSelectorOverride
        ? `await page.locator('${options.buttonSelectorOverride}').click({ timeout: 5000 });`
        : `await page.getByRole('button', { name: 'Sign up' }).click();`
    }

    // 4. State assertion: verify the new username is visible in the dashboard navbar
    const userNavLink = page.getByRole('link', { name: credentials.username });
    await expect(userNavLink).toBeVisible({ timeout: 15000 });

    // 5. Backend verification: query the app's database and assert email and username match submitted
    const conduitDbPath = path.resolve(process.cwd(), 'conduit-app', 'prisma', 'db.sqlite');
    const conduitDb = new DatabaseSync(conduitDbPath);
    const userRecord = conduitDb.prepare('SELECT id, username, email FROM User WHERE username = ?').get(credentials.username) as any;
    expect(userRecord).toBeDefined();
    expect(userRecord.username).toBe(credentials.username);
    expect(userRecord.email).toBe(credentials.email);
  });
});
`;
}
