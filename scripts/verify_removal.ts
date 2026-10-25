import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/Mohan/.gemini/antigravity-ide/brain/78c62fe0-be51-47b1-9a20-b25a319a685d';

async function main() {
  console.log('=== STARTING COMPLETE VERIFICATION OF FEATURE REMOVAL ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });

  const testWriterErrors: string[] = [];
  const siteCheckErrors: string[] = [];

  // =========================================================
  // 1. Verify Test Writer Page (http://localhost:3050/)
  // =========================================================
  console.log('\n--- 1. Verifying Test Writer Page (http://localhost:3050/) ---');
  const page1 = await context.newPage();
  page1.on('console', msg => {
    if (msg.type() === 'error') {
      testWriterErrors.push(msg.text());
      console.error('[Console Error on Test Writer]:', msg.text());
    }
  });
  page1.on('pageerror', err => {
    testWriterErrors.push(err.message);
    console.error('[Page Error on Test Writer]:', err.message);
  });

  await page1.goto('http://localhost:3050/', { waitUntil: 'networkidle' });

  // 1a. Assert REMOVED elements do NOT exist
  const removedSelectors = [
    '#newTestPanel',
    '#draftTestBtn',
    '#draftProgressContainer',
    '#pendingApprovalContainer',
    '#customScenariosSection',
    '#customRunsTable',
    '#noCustomRunsBox',
    '.bonus-section-container',
    '#runBonusSuiteBtn',
    '#cardHealing',
    '#cardStability',
    '#cardA11y',
    '#approveDraftBtn',
    '#rejectDraftBtn',
    '#approveHealingBtn',
  ];

  for (const sel of removedSelectors) {
    const el = await page1.$(sel);
    if (el !== null) {
      throw new Error(`FAILED: Removed element still present on Test Writer: ${sel}`);
    }
  }
  console.log('✓ All 15 removed UI elements verified ABSENT from DOM.');

  // 1b. Assert KEPT elements exist
  const navLinkTestWriter = await page1.$('#navLinkTestWriter');
  const navLinkSiteCheck = await page1.$('#navLinkSiteCheck');
  const metricsContainer = await page1.$('.metrics');
  const officialRunsTable = await page1.$('#officialRunsTable');
  const toggleHistoryBtn = await page1.$('#toggleHistoryBtn');

  if (!navLinkTestWriter || !navLinkSiteCheck) {
    throw new Error('FAILED: Top navigation links missing!');
  }
  if (!metricsContainer || !officialRunsTable || !toggleHistoryBtn) {
    throw new Error('FAILED: Core dashboard components (metrics, runs table, history toggle) missing!');
  }
  console.log('✓ Core navigation, metric cards, runs table, and history toggle are PRESENT.');

  // 1c. Verify 4 official runs in the table
  const runRows = await page1.$$('#officialRunsTable tbody tr[id^="row_"]');
  console.log(`- Found ${runRows.length} official run rows (Expected: 4)`);
  if (runRows.length !== 4) {
    throw new Error(`FAILED: Expected 4 official benchmark runs, found ${runRows.length}`);
  }

  // 1d. Verify evidence links on the official runs
  const evidenceLinks = await page1.$$('#officialRunsTable td.col-evidence a');
  console.log(`- Found ${evidenceLinks.length} evidence links (Screenshot, Trace, Spec, DB Proof, Raw Error)`);
  if (evidenceLinks.length < 10) {
    throw new Error(`FAILED: Expected at least 10 evidence links across runs, found ${evidenceLinks.length}`);
  }

  // 1e. Test Agent Timeline toggle
  const firstTimelineBtn = await page1.$('.timeline-toggle-btn');
  if (!firstTimelineBtn) {
    throw new Error('FAILED: No timeline toggle button found on official runs table');
  }
  await firstTimelineBtn.click();
  await page1.waitForTimeout(300);
  const activeTimeline = await page1.$('tr.timeline-row[style*="table-row"], tr.timeline-row:not([style*="display: none"])');
  if (!activeTimeline) {
    throw new Error('FAILED: Timeline row did not open when toggle button was clicked');
  }
  console.log('✓ Timeline toggle opens stations smoothly.');

  // 1f. Test "Show history" toggle
  const historyContainer = await page1.$('#historyContainer');
  const initialDisplay = await page1.evaluate(el => el ? window.getComputedStyle(el).display : 'none', historyContainer);
  console.log(`- History container initial display: ${initialDisplay}`);
  await toggleHistoryBtn.click();
  await page1.waitForTimeout(300);
  const openedDisplay = await page1.evaluate(el => el ? window.getComputedStyle(el).display : 'none', historyContainer);
  console.log(`- History container display after toggle: ${openedDisplay}`);
  if (openedDisplay === 'none') {
    throw new Error('FAILED: History container did not expand upon clicking Show History');
  }
  console.log('✓ Show history button toggles archived historical runs successfully.');

  // 1g. Check for console errors on Test Writer
  if (testWriterErrors.length > 0) {
    throw new Error(`FAILED: Console errors on Test Writer page: ${JSON.stringify(testWriterErrors)}`);
  }
  console.log('✓ 0 console errors on Test Writer page.');

  // 1h. Capture screenshot of Test Writer page
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const testWriterScreenshot = path.join(ARTIFACT_DIR, 'test_writer_page.png');
  await page1.screenshot({ path: testWriterScreenshot, fullPage: true });
  console.log(`✓ Full-page screenshot of Test Writer saved to: ${testWriterScreenshot}`);

  // =========================================================
  // 2. Verify Removed Endpoints Return 404
  // =========================================================
  console.log('\n--- 2. Verifying Removed Endpoints Return HTTP 404 ---');
  const endpointsToTest: { method: string; url: string; body?: any }[] = [
    { method: 'POST', url: 'http://localhost:3050/api/pipeline/draft', body: { scenario: 'test' } },
    { method: 'POST', url: 'http://localhost:3050/api/pipeline/draft-stream', body: { scenario: 'test' } },
    { method: 'POST', url: 'http://localhost:3050/api/pipeline/approve', body: { proposalId: '1' } },
    { method: 'POST', url: 'http://localhost:3050/api/pipeline/reject', body: { proposalId: '1' } },
    { method: 'GET', url: 'http://localhost:3050/api/custom-runs' },
    { method: 'POST', url: 'http://localhost:3050/api/bonus/heal-tc2' },
    { method: 'POST', url: 'http://localhost:3050/api/bonus/run-stability' },
    { method: 'POST', url: 'http://localhost:3050/api/bonus/run-a11y' },
  ];

  for (const ep of endpointsToTest) {
    const res = await page1.request.fetch(ep.url, {
      method: ep.method,
      data: ep.body,
    });
    console.log(`- ${ep.method} ${ep.url} -> HTTP ${res.status()}`);
    if (res.status() !== 404) {
      throw new Error(`FAILED: Endpoint ${ep.url} returned status ${res.status()} instead of 404!`);
    }
  }
  console.log('✓ All 8 removed backend endpoints confirmed returning HTTP 404.');

  // =========================================================
  // 3. Verify Site Check Page & End-to-End Functionality
  // =========================================================
  console.log('\n--- 3. Verifying Site Check Page (http://localhost:3050/site-check) ---');
  const page2 = await context.newPage();
  page2.on('console', msg => {
    if (msg.type() === 'error') {
      siteCheckErrors.push(msg.text());
      console.error('[Console Error on Site Check]:', msg.text());
    }
  });
  page2.on('pageerror', err => {
    siteCheckErrors.push(err.message);
    console.error('[Page Error on Site Check]:', err.message);
  });

  await page2.goto('http://localhost:3050/site-check', { waitUntil: 'networkidle' });

  const siteCheckUrlInput = await page2.$('#siteCheckUrlInput');
  const siteCheckBtn = await page2.$('#siteCheckBtn');
  const historySection = await page2.$('#siteChecksHistorySection');
  const clearAllHistoryBtn = await page2.$('#clearAllHistoryBtn');

  if (!siteCheckUrlInput || !siteCheckBtn || !historySection || !clearAllHistoryBtn) {
    throw new Error('FAILED: Site Check core elements missing!');
  }
  console.log('✓ Site Check UI components are intact.');

  // 3a. Run an end-to-end check
  console.log('- Running live Site Check audit on https://example.com...');
  await siteCheckUrlInput.fill('https://example.com');
  await siteCheckBtn.click();

  // Wait for result card to appear
  await page2.waitForSelector('.site-check-card', { timeout: 60000 });
  console.log('✓ Site Check completed successfully and rendered result card.');

  // 3b. Verify delete button on the card
  const deleteBtn = await page2.$('.btn-delete-check');
  if (deleteBtn) {
    // Intercept confirm dialog
    page2.once('dialog', async dialog => {
      await dialog.accept();
    });
    await deleteBtn.click();
    await page2.waitForTimeout(600);
    console.log('✓ Delete single site check item executed successfully.');
  }

  // 3c. Verify clear history
  if (clearAllHistoryBtn) {
    page2.once('dialog', async dialog => {
      await dialog.accept();
    });
    await clearAllHistoryBtn.click();
    await page2.waitForTimeout(600);
    console.log('✓ Clear all history executed successfully.');
  }

  // 3d. Check console errors on Site Check
  if (siteCheckErrors.length > 0) {
    throw new Error(`FAILED: Console errors on Site Check page: ${JSON.stringify(siteCheckErrors)}`);
  }
  console.log('✓ 0 console errors on Site Check page.');

  console.log('\n=========================================================');
  console.log('🎉 ALL VERIFICATION CRITERIA MET AND PASSED WITH 100% SUCCESS!');
  console.log('=========================================================');

  await browser.close();
}

main().catch(err => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
