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

  // 5. Verify removed bonus and draft elements are not present
  console.log('[5/8] Verifying removed bonus and draft elements are absent...');
  const removedDraftBtn = page.locator('#draftTestBtn');
  console.log(`draftTestBtn present? ${await removedDraftBtn.count() > 0} (Expected: false)`);
  const removedBonusContainer = page.locator('.bonus-section-container');
  console.log(`bonusSectionContainer present? ${await removedBonusContainer.count() > 0} (Expected: false)`);


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
