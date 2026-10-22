import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3050/', { waitUntil: 'networkidle' });

  // Expand the timeline of the first custom run
  const firstTimeline = page.locator('#customRunsTbody .timeline-toggle-btn').first();
  await firstTimeline.click();
  await page.waitForTimeout(500);

  const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
  
  const timelineRow = page.locator('#customRunsTbody .timeline-row').first();
  await timelineRow.screenshot({
    path: path.join(artifactDir, 'pipeline_metroline_stations.png')
  });

  console.log('Saved element screenshot of timeline row to pipeline_metroline_stations.png');
  await browser.close();
}

main().catch(console.error);
