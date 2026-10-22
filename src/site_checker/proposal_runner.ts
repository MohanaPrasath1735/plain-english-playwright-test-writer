import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { getSiteCheckRecord, saveSiteCheckRecord, SiteCheckProposal } from './store.js';
import { detectBotChallengeOrCaptcha } from './detector.js';

export interface ProposalRunResult {
  success: boolean;
  proposal: SiteCheckProposal;
  error?: string;
}

/**
 * Executes an approved site test proposal.
 * Enforces permission checkbox for form submissions, records trace and screenshot,
 * detects bot challenges / CAPTCHA, and updates the SQLite record.
 */
export async function executeSiteCheckProposal(
  checkId: string,
  proposalId: string,
  permissionChecked: boolean
): Promise<ProposalRunResult> {
  const record = getSiteCheckRecord(checkId);
  if (!record) {
    throw new Error(`Site check record not found for ID: ${checkId}`);
  }

  let proposals: SiteCheckProposal[] = [];
  try {
    proposals = JSON.parse(record.proposalsJson || '[]');
  } catch {
    throw new Error('Failed to parse proposals JSON from record.');
  }

  const proposalIndex = proposals.findIndex(p => p.id === proposalId);
  if (proposalIndex === -1) {
    throw new Error(`Proposal ID '${proposalId}' not found in check record '${checkId}'.`);
  }

  const proposal = proposals[proposalIndex];

  // Enforce safety permission rule
  if (proposal.isFormSubmission && !permissionChecked) {
    throw new Error(
      "Permission required: The checkbox 'I own this site or have permission to test it' must be checked to execute tests that submit forms."
    );
  }

  const evidenceDir = path.resolve(process.cwd(), 'evidence', 'site_checks', checkId, 'proposals');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const screenshotPath = path.join(evidenceDir, `${proposalId}_screenshot.png`);
  const tracePath = path.join(evidenceDir, `${proposalId}_trace.zip`);
  const specPath = path.join(evidenceDir, `${proposalId}.spec.ts`);

  // Write spec file for evidence
  fs.writeFileSync(specPath, proposal.specCode, 'utf-8');

  // Update status to RUNNING
  proposal.status = 'RUNNING';
  proposals[proposalIndex] = proposal;
  record.proposalsJson = JSON.stringify(proposals);
  saveSiteCheckRecord(record);

  const startTime = Date.now();
  let status: 'PASSED' | 'FAILED' = 'PASSED';
  let errorMsg: string | undefined = undefined;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  try {
    const targetUrl = record.finalUrl || record.requestedUrl;
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const statusCode = response?.status();

    // Check for bot challenge or CAPTCHA
    const challenge = await detectBotChallengeOrCaptcha(page, statusCode);
    if (challenge.isChallenge) {
      status = 'FAILED';
      errorMsg = challenge.reason || 'Blocked or manual step required: Bot challenge / CAPTCHA detected.';
    } else {
      // Execute the test actions safely
      if (proposal.isFormSubmission) {
        // Find form input and fill synthetic data
        const input = page.locator('input[type="text"], input[type="email"], input[name*="user"], input').first();
        if (await input.isVisible()) {
          await input.fill('synthetic_test_user');
        }
        const submitBtn = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Search"), button').first();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
        }
      } else {
        // Read-only verification: check title and visible content
        const title = await page.title();
        if (!title && statusCode && statusCode >= 400) {
          status = 'FAILED';
          errorMsg = `HTTP Error ${statusCode}: Page failed to load successfully.`;
        }
        await page.waitForTimeout(500);
      }
    }

    // Capture screenshot
    await page.screenshot({ path: screenshotPath, fullPage: false });
  } catch (err: any) {
    status = 'FAILED';
    errorMsg = err?.message || String(err);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {}
  } finally {
    try {
      await context.tracing.stop({ path: tracePath });
    } catch {}
    await browser.close().catch(() => {});
  }

  const durationMs = Date.now() - startTime;

  proposal.status = status;
  proposal.executionResult = {
    status,
    durationMs,
    error: errorMsg,
    screenshotPath,
    tracePath,
    executedAt: new Date().toISOString(),
  };

  proposals[proposalIndex] = proposal;
  record.proposalsJson = JSON.stringify(proposals);
  record.updatedAt = new Date().toISOString();
  saveSiteCheckRecord(record);

  return {
    success: status === 'PASSED',
    proposal,
    error: errorMsg,
  };
}
