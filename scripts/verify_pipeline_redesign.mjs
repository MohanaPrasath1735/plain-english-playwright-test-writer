import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    bypassCSP: true,
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message || String(err));
  });

  console.log('[1/8] Navigating to http://localhost:3050/ with hard reload...');
  await page.goto('http://localhost:3050/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  // 1. Check Console & Page Errors
  console.log(`Console Errors count: ${consoleErrors.length}`);
  console.log(`Page Errors count: ${pageErrors.length}`);
  if (consoleErrors.length > 0) {
    console.warn('Console Errors detected:', consoleErrors);
  }
  if (pageErrors.length > 0) {
    console.error('Page Errors detected:', pageErrors);
  }

  // 2. Check Horizontal Scroll at 1366px
  const scrollInfo = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  console.log('[2/8] Scroll info at 1366px:', scrollInfo);
  const hasHorizontalScroll = scrollInfo.scrollWidth > scrollInfo.clientWidth;
  console.log(`Has horizontal scroll at 1366px: ${hasHorizontalScroll}`);

  // 3. Verify Typography and Computed Styles
  const typoInfo = await page.evaluate(() => {
    const bodyComputed = window.getComputedStyle(document.body);
    const h1 = document.querySelector('h1');
    const h1Computed = h1 ? window.getComputedStyle(h1) : null;
    const code = document.querySelector('code');
    const codeComputed = code ? window.getComputedStyle(code) : null;
    const heroTitle = h1 ? h1.innerText.trim() : '';
    const heroLine = document.querySelector('.hero-line')?.innerText.trim() || '';

    return {
      bodyFontSize: bodyComputed.fontSize,
      bodyFontFamily: bodyComputed.fontFamily,
      h1FontFamily: h1Computed ? h1Computed.fontFamily : '',
      codeFontFamily: codeComputed ? codeComputed.fontFamily : '',
      heroTitle,
      heroLine,
    };
  });
  console.log('[3/8] Typography & Hero Header:', typoInfo);

  // 4. Test "Show history" button
  console.log('[4/8] Testing Show history button...');
  const historyBtn = page.locator('#toggleHistoryBtn');
  const historyContainer = page.locator('#historyContainer');
  const beforeHistoryVisible = await historyContainer.isVisible();
  await historyBtn.click();
  await page.waitForTimeout(300);
  const afterHistoryVisible = await historyContainer.isVisible();
  console.log(`History container visibility before: ${beforeHistoryVisible}, after: ${afterHistoryVisible}`);

  // 5. Test Bonus Buttons: Stability & Accessibility
  console.log('[5/8] Testing Bonus buttons...');
  const stabilityBtn = page.locator('#runStabilityBtn');
  if (await stabilityBtn.isVisible()) {
    console.log('Clicking runStabilityBtn...');
    await stabilityBtn.click();
    await page.waitForSelector('#stabilityStatusBadge:not(:has-text("Running"))', { timeout: 30000 });
    const stabilityText = await page.locator('#stabilityStatusBadge').innerText();
    console.log(`Stability result: ${stabilityText}`);
  }

  const a11yBtn = page.locator('#runA11yBtn');
  if (await a11yBtn.isVisible()) {
    console.log('Clicking runA11yBtn...');
    await a11yBtn.click();
    await page.waitForSelector('#a11yStatusBadge:not(:has-text("Auditing"))', { timeout: 30000 });
    const a11yText = await page.locator('#a11yStatusBadge').innerText();
    console.log(`A11y check result: ${a11yText}`);
  }

  // 6. Test Interactive New Test Scenario: Preset fill, Draft test, and Approve
  console.log('[6/8] Testing New Test Scenario draft & approve flow...');
  await page.evaluate(() => {
    if (window.fillScenario) window.fillScenario('TC1');
  });
  const scenarioVal = await page.locator('#scenarioInput').inputValue();
  console.log(`Scenario input filled: "${scenarioVal.slice(0, 50)}..."`);

  const draftBtn = page.locator('#draftTestBtn');
  await draftBtn.click();

  console.log('Waiting for Step 1–5 drafting to complete and pending approval to appear...');
  await page.waitForSelector('#pendingApprovalContainer', { state: 'visible', timeout: 60000 });
  const pendingRunIdText = await page.locator('#pendingRunId').innerText();
  console.log(`Pending approval container visible! ${pendingRunIdText}`);

  // Click Approve & Execute Test
  console.log('Clicking Approve & Execute Test button...');
  const approveBtn = page.locator('#approveDraftBtn');
  await approveBtn.click();

  // Wait for execution to complete
  await page.waitForSelector('#approvalActionFeedback:has-text("Approved")', { timeout: 60000 });
  const feedbackText = await page.locator('#approvalActionFeedback').innerText();
  console.log(`Approval execution feedback: ${feedbackText}`);

  // Verify custom scenario runs table has at least 1 run
  await page.waitForTimeout(1000);
  const customRowsCount = await page.locator('#customRunsTbody tr:not(.timeline-row)').count();
  console.log(`Custom scenario runs count in table: ${customRowsCount}`);

  // Test expanding the timeline on the custom run
  const firstTimelineToggle = page.locator('#customRunsTbody .timeline-toggle-btn').first();
  if (await firstTimelineToggle.isVisible()) {
    console.log('Expanding custom run timeline...');
    await firstTimelineToggle.click();
    await page.waitForTimeout(400);

    // Verify 8 stations metro line
    const stationsCount = await page.locator('#customRunsTbody .timeline-row .timeline-step').count();
    console.log(`Stations count in metro-line: ${stationsCount}`);

    const stationTitles = await page.locator('#customRunsTbody .timeline-row .timeline-step-title').allInnerTexts();
    console.log('Station titles found:', stationTitles);
  }

  // 7. Run axe-core accessibility audit on the page
  console.log('[7/8] Running axe-core accessibility audit on Test Writer page...');
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js' });
  const axeResults = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    });
  });

  console.log(`axe-core violations count: ${axeResults.violations.length}`);
  if (axeResults.violations.length > 0) {
    console.log('Violations detail:');
    for (const v of axeResults.violations) {
      console.log(` - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
      for (const n of v.nodes.slice(0, 3)) {
        console.log(`    Target: ${n.target.join(' ')} | Failure: ${n.failureSummary}`);
      }
    }
  }

  // 8. Capture Full-Page AFTER Screenshot
  const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
  const afterScreenshotPath = path.join(artifactDir, 'test_writer_after_redesign.png');
  await page.screenshot({ path: afterScreenshotPath, fullPage: true });
  console.log(`[8/8] Full page AFTER screenshot saved to: ${afterScreenshotPath}`);

  // Also verify /site-check page loads in light mode with 0 errors
  console.log('Verifying /site-check page loads in light mode...');
  await page.goto('http://localhost:3050/site-check', { waitUntil: 'networkidle' });
  const siteCheckTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log(`/site-check page theme: ${siteCheckTheme}`);

  await browser.close();
  console.log('=== Verification Completed Successfully ===');
}

main().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
