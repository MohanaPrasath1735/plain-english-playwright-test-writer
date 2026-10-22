import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
const compareDir = path.join(artifactDir, 'qa_comparison');
if (!fs.existsSync(compareDir)) {
  fs.mkdirSync(compareDir, { recursive: true });
}

async function captureBeforeStates() {
  console.log('Capturing exact "BEFORE" states for the 5 worst problems...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  // Test Writer Page in Light Theme
  await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_test_writer', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });

  // Expand first timeline
  const firstTimelineToggle = await page.$('.timeline-toggle-btn');
  if (firstTimelineToggle) {
    await firstTimelineToggle.click();
    await page.waitForTimeout(400);
  }

  // --- PROBLEM 1 BEFORE: Rotated Verdict Stamps & Badges Contrast / Opacity ---
  console.log('Capturing Problem 1 Before...');
  await page.evaluate(() => {
    // Inject pre-fix styles: lighter green/red, 0.92 table opacity
    const style = document.createElement('style');
    style.id = 'prefix-problem1';
    style.innerHTML = `
      #historyRunsTable { opacity: 0.92 !important; }
      .badge-stamp.badge-pass { color: #15803d !important; background: #dcfce7 !important; border-color: #86efac !important; }
      .badge-stamp.badge-fail { color: #b91c1c !important; background: #fee2e2 !important; border-color: #fca5a5 !important; }
      .badge-stamp.badge-warn { color: #b45309 !important; background: #fef3c7 !important; border-color: #fcd34d !important; }
      .badge-stamp.badge-rejected { color: #9f1239 !important; background: #ffe4e6 !important; border-color: #fda4af !important; }
    `;
    document.head.appendChild(style);
  });
  const officialTable = await page.$('.table-container:has(#officialRunsTable)');
  if (officialTable) {
    await officialTable.screenshot({ path: path.join(compareDir, 'problem1_verdict_stamps_before_light.png') });
  }

  // --- PROBLEM 2 BEFORE: Station Badge Contrast in Light Mode Stepper ---
  console.log('Capturing Problem 2 Before...');
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'prefix-problem2';
    style.innerHTML = `
      .station-badge.badge-pass { color: #15803d !important; background: #dcfce7 !important; font-weight: normal !important; }
      .station-badge.badge-fail { color: #b91c1c !important; background: #fee2e2 !important; }
    `;
    document.head.appendChild(style);
  });
  const timelineRow = await page.$('.timeline-row[style*="table-row"]');
  if (timelineRow) {
    await timelineRow.screenshot({ path: path.join(compareDir, 'problem2_timeline_stations_before_light.png') });
  }

  // --- PROBLEM 3 BEFORE: Timeline Station 1 Title Wrapping / Truncation ---
  console.log('Capturing Problem 3 Before...');
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'prefix-problem3';
    style.innerHTML = `
      .timeline-step-title {
        font-size: 13px !important;
        white-space: normal !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
    `;
    document.head.appendChild(style);
  });
  const station1Card = await page.$('.timeline-step:nth-child(1) .timeline-step-card');
  if (station1Card) {
    await station1Card.screenshot({ path: path.join(compareDir, 'problem3_station_title_before_light.png') });
  }

  // --- PROBLEM 4 BEFORE: col-tc button wrapping into 3 lines ---
  console.log('Capturing Problem 4 Before...');
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'prefix-problem4';
    style.innerHTML = `
      .col-tc { width: 72px !important; min-width: 65px !important; }
      .timeline-toggle-btn { white-space: normal !important; font-size: 11px !important; padding: 4px 6px !important; width: 68px !important; }
    `;
    document.head.appendChild(style);
  });
  const colTc = await page.$('#row_TC1_1792328284361 .col-tc, tbody tr:first-child .col-tc');
  if (colTc) {
    await colTc.screenshot({ path: path.join(compareDir, 'problem4_col_tc_button_before_light.png') });
  }

  // --- PROBLEM 5 BEFORE: Dark Theme Subtle Text Contrast in Site Check ---
  console.log('Capturing Problem 5 Before...');
  await page.goto('http://localhost:3050/site-check', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_site_check', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'prefix-problem5';
    style.innerHTML = `
      .safety-hint, .safety-rules-details { color: #64748b !important; }
      .btn-delete-check { min-height: 28px !important; padding: 4px 8px !important; font-size: 12px !important; }
    `;
    document.head.appendChild(style);
  });
  const safetyDetails = await page.$('.safety-rules-details');
  if (safetyDetails) {
    await safetyDetails.screenshot({ path: path.join(compareDir, 'problem5_safety_hint_dark_before.png') });
  }

  console.log('All 5 BEFORE screenshots successfully captured!');
  await browser.close();
}

captureBeforeStates().catch(err => {
  console.error('Failed to capture before states:', err);
  process.exit(1);
});
