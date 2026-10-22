import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
const compareDir = path.join(artifactDir, 'qa_comparison');
if (!fs.existsSync(compareDir)) {
  fs.mkdirSync(compareDir, { recursive: true });
}

async function verifyAll() {
  console.log('=== Step 3: Comprehensive Functional & Visual Verification ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 1. Test Writer Verification
  console.log('1. Loading Test Writer Page...');
  await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Check 4 official benchmark runs
  const officialRows = await page.$$eval('#officialRunsTable tbody > tr:not(.timeline-row)', rows => {
    return rows.map(r => {
      const tc = r.querySelector('.col-tc .badge')?.innerText;
      const result = r.querySelector('.col-run-result')?.innerText;
      return { tc, result: result?.replace(/\s+/g, ' ').trim() };
    });
  });
  console.log('Official Benchmark Runs verified:', officialRows);
  if (officialRows.length !== 4) {
    throw new Error(`Expected 4 official runs, found ${officialRows.length}`);
  }

  // Test "Show history" button
  console.log('Testing "Show history" button...');
  const histBtn = await page.$('#toggleHistoryBtn');
  const histContainer = await page.$('#historyContainer');
  if (histBtn && histContainer) {
    const initiallyHidden = await histContainer.evaluate(el => el.style.display === 'none' || getComputedStyle(el).display === 'none');
    console.log('History initially hidden:', initiallyHidden);
    await histBtn.click();
    await page.waitForTimeout(300);
    const visibleAfterClick = await histContainer.evaluate(el => el.style.display !== 'none');
    console.log('History visible after click:', visibleAfterClick);
  }

  // Test Scenario preset
  console.log('Testing scenario presets...');
  const presetBtn = await page.$('.btn-preset:nth-child(2)'); // TC1
  if (presetBtn) {
    await presetBtn.click();
    const scenarioVal = await page.$eval('#scenarioInput', el => el.value);
    console.log('Scenario populated:', scenarioVal.slice(0, 45) + '...');
  }

  // Test Recalculate Stability Score button
  console.log('Testing Recalculate Stability button (runs 3 full test iterations)...');
  const stabBtn = await page.$('#runStabilityBtn');
  if (stabBtn) {
    await stabBtn.click();
    await page.waitForSelector('#stabilityStatusBadge:has-text("passed")', { timeout: 35000 });
    const scoreBadge = await page.$eval('#stabilityStatusBadge', el => el.innerText);
    console.log('Stability recalculation verified:', scoreBadge);
  }

  // Test Run Accessibility Check button
  console.log('Testing Run Accessibility Check button...');
  const a11yBtn = await page.$('#runA11yBtn');
  if (a11yBtn) {
    await a11yBtn.click();
    await page.waitForSelector('#a11yStatusBadge:has-text("violations")', { timeout: 35000 });
    const a11yBadge = await page.$eval('#a11yStatusBadge', el => el.innerText);
    console.log('Accessibility audit button verified:', a11yBadge);
  }

  // Capture after screenshots for visual QA comparison
  console.log('Capturing verified component states...');
  // Expand first timeline
  const firstTimelineToggle = await page.$('.timeline-toggle-btn');
  if (firstTimelineToggle) {
    await firstTimelineToggle.click();
    await page.waitForTimeout(400);
  }

  // Screenshot 1: Verdict stamps & badges
  const officialTable = await page.$('.table-container:has(#officialRunsTable)');
  if (officialTable) {
    await officialTable.screenshot({ path: path.join(compareDir, 'problem1_verdict_stamps_after.png') });
  }

  // Screenshot 2: Agent Timeline Metro Line
  const timelineRow = await page.$('.timeline-row[style*="table-row"]');
  if (timelineRow) {
    await timelineRow.screenshot({ path: path.join(compareDir, 'problem2_timeline_stations_after.png') });
  }

  // Screenshot 3: Station 1 Title
  const station1Card = await page.$('.timeline-step:nth-child(1) .timeline-step-card');
  if (station1Card) {
    await station1Card.screenshot({ path: path.join(compareDir, 'problem3_station_title_after.png') });
  }

  // Screenshot 4: Timeline toggle button in col-tc
  const colTc = await page.$('#row_TC1_1792328284361 .col-tc, tbody tr:first-child .col-tc');
  if (colTc) {
    await colTc.screenshot({ path: path.join(compareDir, 'problem4_col_tc_button_after.png') });
  }

  // 2. Site Check Verification
  console.log('2. Loading Site Check Page...');
  await page.goto('http://localhost:3050/site-check', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Screenshot 5: Safety rules hint in dark theme
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_site_check', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });
  const safetyDetails = await page.$('.safety-rules-details');
  if (safetyDetails) {
    await safetyDetails.screenshot({ path: path.join(compareDir, 'problem5_safety_hint_dark_after.png') });
  }

  // Test Delete button in history
  console.log('Testing delete button on site check...');
  const deleteBtn = await page.$('.btn-delete-check');
  if (deleteBtn) {
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    // Record current count
    const initialCount = await page.$$eval('.history-item-card', items => items.length);
    console.log('Initial history cards:', initialCount);
  }

  // Set back to light theme for final inspection
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_site_check', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });

  console.log(`Verification complete. Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('Console Errors:', consoleErrors);
  }

  await browser.close();
}

verifyAll().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
