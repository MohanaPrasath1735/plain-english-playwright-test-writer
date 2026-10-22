import { chromium } from 'playwright';
import * as path from 'path';

async function main() {
  console.log('--- Starting Verification of Panel Removal ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });

  const testWriterConsoleErrors: string[] = [];
  const siteCheckConsoleErrors: string[] = [];

  // 1. Verify Test Writer Page (http://localhost:3050/)
  console.log('\n[1/2] Verifying Test Writer page (http://localhost:3050/)...');
  const page1 = await context.newPage();
  page1.on('console', msg => {
    if (msg.type() === 'error') {
      testWriterConsoleErrors.push(msg.text());
      console.error('[Console Error on Test Writer]:', msg.text());
    }
  });
  page1.on('pageerror', err => {
    testWriterConsoleErrors.push(err.message);
    console.error('[Page Error on Test Writer]:', err.message);
  });

  // Load and hard reload (Ctrl+F5 equivalent: bypass cache)
  await page1.goto('http://localhost:3050/', { waitUntil: 'networkidle' });
  await page1.reload({ waitUntil: 'networkidle' });

  // Assert elements that MUST be removed
  const checkSitePanel = await page1.$('#checkSitePanel');
  const siteChecksSection = await page1.$('#siteChecksSection');
  const checkSiteUrlInput = await page1.$('#checkSiteUrlInput');
  const checkSiteBtn = await page1.$('#checkSiteBtn');
  const siteChecksContainer = await page1.$('#siteChecksContainer');

  console.log(`- #checkSitePanel present? ${checkSitePanel !== null} (Expected: false)`);
  console.log(`- #siteChecksSection present? ${siteChecksSection !== null} (Expected: false)`);
  console.log(`- #checkSiteUrlInput present? ${checkSiteUrlInput !== null} (Expected: false)`);
  console.log(`- #checkSiteBtn present? ${checkSiteBtn !== null} (Expected: false)`);
  console.log(`- #siteChecksContainer present? ${siteChecksContainer !== null} (Expected: false)`);

  if (checkSitePanel !== null || siteChecksSection !== null || checkSiteUrlInput !== null || checkSiteBtn !== null) {
    throw new Error('FAILED: "Check another website" panel or site checks section still found on Test Writer page!');
  }

  // Assert elements that MUST be preserved
  const newTestPanel = await page1.$('#newTestPanel');
  const customRunsTable = await page1.$('#customRunsTable');
  const noCustomRunsBox = await page1.$('#noCustomRunsBox');
  const officialRunsTable = await page1.$('.runs-table');
  const bonusSuiteBtn = await page1.$('#runBonusSuiteBtn');
  const cardHealing = await page1.$('#cardHealing');
  const cardStability = await page1.$('#cardStability');
  const cardA11y = await page1.$('#cardA11y');
  const navLinkTestWriter = await page1.$('#navLinkTestWriter');
  const navLinkSiteCheck = await page1.$('#navLinkSiteCheck');

  console.log(`- #newTestPanel preserved? ${newTestPanel !== null}`);
  console.log(`- Custom scenario runs preserved? ${customRunsTable !== null || noCustomRunsBox !== null}`);
  console.log(`- 4 Official runs table preserved? ${officialRunsTable !== null}`);
  console.log(`- Bonus Features preserved? ${bonusSuiteBtn !== null && cardHealing !== null && cardStability !== null && cardA11y !== null}`);
  console.log(`- Top Nav Test Writer link preserved? ${navLinkTestWriter !== null}`);
  console.log(`- Top Nav Site Check link preserved? ${navLinkSiteCheck !== null}`);

  if (!newTestPanel || (!customRunsTable && !noCustomRunsBox) || !officialRunsTable || !bonusSuiteBtn) {
    throw new Error('FAILED: Required elements on Test Writer page are missing!');
  }

  // Check console errors
  console.log(`- Test Writer console errors count: ${testWriterConsoleErrors.length}`);
  if (testWriterConsoleErrors.length > 0) {
    throw new Error(`FAILED: Console errors encountered on Test Writer page: ${JSON.stringify(testWriterConsoleErrors)}`);
  }

  // Save screenshot of the Test Writer page
  const artifactScreenshotPath = path.resolve(
    'C:/Users/Mohan/.gemini/antigravity-ide/brain/8648a7fb-220b-49cf-ad3c-132a8b52d885',
    'test_writer_panel_removed_verified.png'
  );
  await page1.screenshot({ path: artifactScreenshotPath, fullPage: true });
  console.log(`- Full page screenshot saved to: ${artifactScreenshotPath}`);

  // Also capture viewport screenshot of the bottom of Test Writer page (where the panel was)
  const bottomScreenshotPath = path.resolve(
    'C:/Users/Mohan/.gemini/antigravity-ide/brain/8648a7fb-220b-49cf-ad3c-132a8b52d885',
    'test_writer_bottom_verified.png'
  );
  await page1.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page1.waitForTimeout(400);
  await page1.screenshot({ path: bottomScreenshotPath, fullPage: false });
  console.log(`- Bottom layout screenshot saved to: ${bottomScreenshotPath}`);

  // 2. Verify Site Check Page (http://localhost:3050/site-check)
  console.log('\n[2/2] Verifying Site Check page (http://localhost:3050/site-check)...');
  const page2 = await context.newPage();
  page2.on('console', msg => {
    if (msg.type() === 'error') {
      siteCheckConsoleErrors.push(msg.text());
      console.error('[Console Error on Site Check]:', msg.text());
    }
  });
  page2.on('pageerror', err => {
    siteCheckConsoleErrors.push(err.message);
    console.error('[Page Error on Site Check]:', err.message);
  });

  await page2.goto('http://localhost:3050/site-check', { waitUntil: 'networkidle' });
  await page2.reload({ waitUntil: 'networkidle' });

  const siteTargetUrlInput = await page2.$('#siteCheckUrlInput');
  const siteCheckBtn = await page2.$('#siteCheckBtn');
  const historySection = await page2.$('#siteChecksHistorySection');
  const clearAllHistoryBtn = await page2.$('#clearAllHistoryBtn');

  console.log(`- Site Check URL input present? ${siteTargetUrlInput !== null}`);
  console.log(`- Site Check "Check site" button present? ${siteCheckBtn !== null}`);
  console.log(`- History section present? ${historySection !== null}`);
  console.log(`- Clear all history button present? ${clearAllHistoryBtn !== null}`);

  if (!siteTargetUrlInput || !siteCheckBtn || !historySection) {
    throw new Error('FAILED: Site Check page elements missing!');
  }

  console.log(`- Site Check console errors count: ${siteCheckConsoleErrors.length}`);
  if (siteCheckConsoleErrors.length > 0) {
    throw new Error(`FAILED: Console errors encountered on Site Check page: ${JSON.stringify(siteCheckConsoleErrors)}`);
  }

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED PERFECTLY!');
  await browser.close();
}

main().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
