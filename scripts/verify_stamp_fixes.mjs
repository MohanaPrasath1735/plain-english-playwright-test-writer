import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';

  const consoleErrors = [];
  const widthsToTest = [1366, 1280, 1024];

  for (const width of widthsToTest) {
    console.log(`\n=== Testing Viewport Width: ${width}px ===`);
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(`[${width}px] ${msg.text()}`);
    });

    await page.goto('http://localhost:3050/', { waitUntil: 'networkidle' });
    // Hard reload (Ctrl+F5 equivalent)
    await page.reload({ waitUntil: 'networkidle' });

    // 1. Check Horizontal Scroll
    const scrollInfo = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const hasHorizontalScroll = scrollInfo.scrollWidth > scrollInfo.clientWidth;
    console.log(`Width ${width}px - scrollWidth: ${scrollInfo.scrollWidth}, clientWidth: ${scrollInfo.clientWidth}, hasHorizontalScroll: ${hasHorizontalScroll}`);

    // 2. Measure Overlap between .badge-stamp in col-run-result and neighboring col-observed
    const rowsOverlap = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('tr:not(.timeline-row)');
      rows.forEach(row => {
        const runResCell = row.querySelector('.col-run-result');
        const obsCell = row.querySelector('.col-observed');
        if (!runResCell || !obsCell) return;

        const obsRect = obsCell.getBoundingClientRect();
        const stamps = runResCell.querySelectorAll('.badge-stamp');
        stamps.forEach(stamp => {
          const stampRect = stamp.getBoundingClientRect();
          // Overlap occurs if stamp right edge exceeds the left edge of obsCell
          const diff = stampRect.right - obsRect.left;
          results.push({
            stampText: stamp.innerText.trim(),
            stampRight: stampRect.right,
            obsLeft: obsRect.left,
            clearancePx: obsRect.left - stampRect.right,
            isOverlapping: stampRect.right > obsRect.left
          });
        });
      });
      return results;
    });

    console.log(`Width ${width}px - Total stamps measured: ${rowsOverlap.length}`);
    let anyOverlap = false;
    rowsOverlap.forEach((r, idx) => {
      if (r.isOverlapping) {
        console.error(`  OVERLAP DETECTED on stamp "${r.stampText}": right=${r.stampRight}, obsLeft=${r.obsLeft}`);
        anyOverlap = true;
      }
    });

    if (!anyOverlap) {
      const minClearance = Math.min(...rowsOverlap.map(r => r.clearancePx));
      console.log(`  ✓ ZERO overlap detected! Minimum clearance to next column: ${minClearance.toFixed(1)}px`);
    }

    await context.close();
  }

  // Next, capture focused screenshots in Dark and Light themes at 1366px
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3050/', { waitUntil: 'networkidle' });

  // Official runs table screenshot (showing TC1, TC2, TC3, TC4)
  console.log('\nCapturing official runs table screenshot (Dark Theme)...');
  const officialTable = page.locator('#officialRunsTable');
  await officialTable.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await officialTable.screenshot({
    path: path.join(artifactDir, 'official_runs_table_verified.png')
  });

  // Custom scenario row screenshot (first custom scenario row)
  console.log('Capturing custom scenario row screenshot (Dark Theme)...');
  const firstCustomRow = page.locator('#customRunsTbody tr:not(.timeline-row)').first();
  await firstCustomRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await firstCustomRow.screenshot({
    path: path.join(artifactDir, 'custom_scenario_row_fixed.png')
  });

  // Test Light Theme
  console.log('Testing and capturing Light Theme...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('agent_theme_test_writer', 'light');
  });
  await page.waitForTimeout(300);

  await officialTable.scrollIntoViewIfNeeded();
  await officialTable.screenshot({
    path: path.join(artifactDir, 'official_runs_table_light_verified.png')
  });

  // Reset theme back to dark
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('agent_theme_test_writer', 'dark');
  });

  console.log(`Console errors total: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Console errors:', consoleErrors);
  }

  await browser.close();
  console.log('=== All tests and screenshot captures completed successfully ===');
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
