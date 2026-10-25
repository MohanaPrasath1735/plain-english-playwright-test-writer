import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';

  console.log('--- 1. Testing Test Writer Page (Light Theme) ---');
  await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_test_writer', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });

  // Inject axe-core
  const axePath = path.resolve('node_modules/axe-core/axe.min.js');
  await page.addScriptTag({ path: axePath });

  const a11yTestWriter = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] }
    });
    return results.violations;
  });

  console.log(`Test Writer Light Theme Contrast Violations: ${a11yTestWriter.length}`);
  if (a11yTestWriter.length > 0) {
    console.log(JSON.stringify(a11yTestWriter, null, 2));
  }

  // Expand timeline for screenshot
  const timelineToggle = await page.$('.timeline-toggle-btn');
  if (timelineToggle) {
    await timelineToggle.click();
    await page.waitForTimeout(400);
  }

  // Official runs screenshot
  const officialContainer = await page.$('.table-container:has(#officialRunsTable)');
  if (officialContainer) {
    await officialContainer.screenshot({ path: path.join(artifactDir, 'test_writer_light_official_runs.png') });
  }



  // Timeline screenshot
  const timelineEl = await page.$('.timeline-row[style*="table-row"]');
  if (timelineEl) {
    await timelineEl.screenshot({ path: path.join(artifactDir, 'test_writer_light_timeline.png') });
  } else {
    const fallbackTimeline = await page.$('.timeline-row');
    if (fallbackTimeline) {
      await fallbackTimeline.screenshot({ path: path.join(artifactDir, 'test_writer_light_timeline.png') });
    }
  }



  console.log('--- 2. Testing Site Check Page (Light Theme) ---');
  await page.goto('http://localhost:3050/site-check', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_site_check', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });

  await page.addScriptTag({ path: axePath });

  const a11ySiteCheck = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] }
    });
    return results.violations;
  });

  console.log(`Site Check Light Theme Contrast Violations: ${a11ySiteCheck.length}`);
  if (a11ySiteCheck.length > 0) {
    console.log(JSON.stringify(a11ySiteCheck, null, 2));
  }

  await page.screenshot({ path: path.join(artifactDir, 'site_check_light_verified.png'), fullPage: true });

  console.log('--- 3. Testing Test Writer Page (Dark Theme Proof) ---');
  await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_test_writer', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });

  await page.screenshot({ path: path.join(artifactDir, 'test_writer_dark_proof.png'), clip: { x: 0, y: 0, width: 1366, height: 950 } });

  console.log('--- 4. Console Errors Check ---');
  console.log(`Total console errors recorded: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('Errors:', consoleErrors);
  }

  await browser.close();
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
