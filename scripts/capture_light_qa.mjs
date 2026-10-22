import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
const compareDir = path.join(artifactDir, 'qa_comparison');

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('agent_theme_test_writer', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });

  const officialCard = await page.$('.table-container:has(#officialRunsTable)');
  if (officialCard) {
    await officialCard.screenshot({ path: path.join(compareDir, 'problem1_verdict_stamps_after_light.png') });
  }

  const timelineToggle = await page.$('.timeline-toggle-btn');
  if (timelineToggle) {
    await timelineToggle.click();
    await page.waitForTimeout(400);
  }

  const timelineEl = await page.$('.timeline-row[style*="table-row"]');
  if (timelineEl) {
    await timelineEl.screenshot({ path: path.join(compareDir, 'problem2_timeline_stations_after_light.png') });
  }

  const station1 = await page.$('.timeline-step:nth-child(1) .timeline-step-card');
  if (station1) {
    await station1.screenshot({ path: path.join(compareDir, 'problem3_station_title_after_light.png') });
  }

  const colTc = await page.$('#officialRunsTable tbody tr:first-child .col-tc');
  if (colTc) {
    await colTc.screenshot({ path: path.join(compareDir, 'problem4_col_tc_button_after_light.png') });
  }

  await browser.close();
  console.log('Done capturing light QA comparison images.');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
