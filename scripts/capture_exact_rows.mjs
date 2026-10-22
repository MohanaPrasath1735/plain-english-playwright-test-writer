import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
const outputDir = path.join(artifactDir, 'evidence_chips_verification');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });

  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();

    await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(th => {
      localStorage.setItem('agent_theme_test_writer', th);
      document.documentElement.setAttribute('data-theme', th);
    }, theme);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // 1. Locate TC3 row in official runs table
    const tc3Row = await page.$('#officialRunsTable tr:has(.badge-tc:has-text("TC3"))');
    if (tc3Row) {
      const tc3Path = path.join(outputDir, `tc3_row_${theme}_verified.png`);
      await tc3Row.screenshot({ path: tc3Path });
      console.log(`Saved TC3 row (${theme}): ${tc3Path}`);
    } else {
      console.error('Could not find TC3 row');
    }

    // 2. Locate Custom Scenario row
    const customRow = await page.$('#customRunsTable tbody tr:first-child');
    if (customRow) {
      const customPath = path.join(outputDir, `custom_scenario_row_${theme}_verified.png`);
      await customRow.screenshot({ path: customPath });
      console.log(`Saved Custom Scenario row (${theme}): ${customPath}`);
    } else {
      console.error('Could not find Custom Scenario row');
    }

    await context.close();
  }

  await browser.close();
  console.log('Capture finished successfully!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
