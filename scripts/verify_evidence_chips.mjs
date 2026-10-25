import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
const outputDir = path.join(artifactDir, 'evidence_chips_verification');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const WIDTHS = [1366, 1280, 1024];
const THEMES = ['dark', 'light'];

async function verifyChips() {
  console.log('=== Verifying Evidence Chips & Table Layout Across Viewports ===');
  const browser = await chromium.launch({ headless: true });

  const results = {
    consoleErrors: [],
    horizontalScrolls: [],
    clippedChips: [],
    overlaps: []
  };

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      console.log(`\n--- Testing ${theme.toUpperCase()} theme at ${width}px ---`);
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        bypassCSP: true
      });
      const page = await context.newPage();

      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error(`[Console Error][${theme}][${width}px]:`, msg.text());
          results.consoleErrors.push({ theme, width, error: msg.text() });
        }
      });

      // Navigate and force theme in localStorage
      await page.goto('http://localhost:3050/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(th => {
        localStorage.setItem('agent_theme_test_writer', th);
        document.documentElement.setAttribute('data-theme', th);
      }, theme);

      // Reload with network cache bypass (Ctrl+F5 equivalent)
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Check 1: Horizontal page scroll
      const scrollCheck = await page.evaluate(() => {
        const docScrollW = document.documentElement.scrollWidth;
        const winInnerW = window.innerWidth;
        return {
          scrollWidth: docScrollW,
          innerWidth: winInnerW,
          hasScroll: docScrollW > winInnerW + 1
        };
      });
      if (scrollCheck.hasScroll) {
        console.warn(`Horizontal scroll detected at ${width}px: scrollWidth ${scrollCheck.scrollWidth} > innerWidth ${scrollCheck.innerWidth}`);
        results.horizontalScrolls.push({ theme, width, ...scrollCheck });
      } else {
        console.log(`✓ No horizontal page scroll (scrollWidth: ${scrollCheck.scrollWidth}px, innerWidth: ${scrollCheck.innerWidth}px)`);
      }

      // Check 2: Evidence chips layout & clipping
      const chipDetails = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('.col-evidence .chip-evidence'));
        return chips.map(c => {
          const text = c.innerText.trim();
          const rect = c.getBoundingClientRect();
          const isClipped = c.scrollWidth > c.clientWidth + 1;
          const style = window.getComputedStyle(c);
          return {
            text,
            width: rect.width,
            height: rect.height,
            padding: style.padding,
            whiteSpace: style.whiteSpace,
            overflowWrap: style.overflowWrap,
            display: style.display,
            isClipped
          };
        });
      });

      const clipped = chipDetails.filter(c => c.isClipped);
      if (clipped.length > 0) {
        console.warn(`Found ${clipped.length} clipped chips:`, clipped);
        results.clippedChips.push({ theme, width, clipped });
      } else {
        console.log(`✓ All ${chipDetails.length} evidence chips sized to content with 0 clipping.`);
      }

      // Check 3: TC3 chips specifically
      const tc3Chips = await page.evaluate(() => {
        const tc3Row = document.querySelector('tr[id*="TC3"], tr:has(.badge-tc:is(:text("TC3")))');
        if (!tc3Row) return [];
        return Array.from(tc3Row.querySelectorAll('.col-evidence .chip-evidence')).map(c => c.innerText.trim());
      });
      console.log(`TC3 Chips (${theme}, ${width}px):`, tc3Chips);

      // Check 4: Screenshots at 1366px (primary) and 1024px
      if (width === 1366) {
        // Screenshot TC3 row in official runs
        const tc3Row = await page.$('tr[id*="TC3"], tbody tr:nth-child(3)');
        if (tc3Row) {
          const tc3Path = path.join(outputDir, `tc3_row_${theme}_1366px.png`);
          await tc3Row.screenshot({ path: tc3Path });
          console.log(`Captured TC3 screenshot: ${tc3Path}`);
        }

      }

      await context.close();
    }
  }

  await browser.close();

  console.log('\n=== Summary of Results ===');
  console.log(`Console Errors: ${results.consoleErrors.length}`);
  console.log(`Horizontal Scroll Failures: ${results.horizontalScrolls.length}`);
  console.log(`Clipped Chips: ${results.clippedChips.length}`);

  if (results.consoleErrors.length > 0 || results.horizontalScrolls.length > 0 || results.clippedChips.length > 0) {
    throw new Error('Verification failed with issues');
  }
}

verifyChips().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
