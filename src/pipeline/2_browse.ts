import { chromium } from 'playwright';
import { BrowsedSelector, BrowseResult } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';

interface CachedBrowseEntry {
  sourceUrl: string;
  retrievalTime: string;
  selectors: BrowsedSelector[];
  screenshotBuffer?: Buffer;
  timestamp: number;
}

// In-memory cache for inspected page elements and selectors
const browseCache = new Map<string, CachedBrowseEntry>();
const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

export function clearBrowseCache(): void {
  browseCache.clear();
}

/**
 * Step 2: Browse
 * Inspect the app with Playwright and harvest real candidate selectors.
 * Prefers role/label/placeholder/test-id over CSS.
 *
 * Caches inspected page elements and selectors for 5 minutes
 * so Browse does not repeat browser launch/navigation for every scenario.
 */
export async function browseApp(targetUrl: string, evidenceDir: string): Promise<BrowseResult> {
  const normalizedUrl = targetUrl.replace(/\/$/, '');
  const now = Date.now();
  const cached = browseCache.get(normalizedUrl);

  // Ensure evidence dir exists
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
  const screenshotPath = path.join(evidenceDir, 'browse_inspection.png');

  // Check cache hit
  if (cached && (now - cached.timestamp < BROWSE_CACHE_TTL_MS)) {
    const ageSeconds = Math.round((now - cached.timestamp) / 1000);
    console.log(`[Step 2: Browse] Cache HIT for ${targetUrl} (cached ${ageSeconds}s ago). Reusing ${cached.selectors.length} selectors.`);

    // Write cached screenshot to the scenario's evidence directory if available
    if (cached.screenshotBuffer && !fs.existsSync(screenshotPath)) {
      try {
        fs.writeFileSync(screenshotPath, cached.screenshotBuffer);
      } catch (e) {
        // Non-critical if writing cached screenshot fails
      }
    }

    return {
      sourceUrl: cached.sourceUrl,
      retrievalTime: cached.retrievalTime,
      selectors: cached.selectors,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : undefined,
    };
  }

  console.log(`[Step 2: Browse] Cache MISS for ${targetUrl}. Launching Playwright browser inspection...`);
  const retrievalTime = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const selectors: BrowsedSelector[] = [];

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });
    const currentUrl = page.url();

    await page.screenshot({ path: screenshotPath, fullPage: true });
    let screenshotBuffer: Buffer | undefined;
    if (fs.existsSync(screenshotPath)) {
      try {
        screenshotBuffer = fs.readFileSync(screenshotPath);
      } catch {}
    }

    // Extract inputs
    const inputs = await page.locator('input, textarea, select').all();
    for (const input of inputs) {
      const tag = await input.evaluate(el => el.tagName.toLowerCase());
      const placeholder = await input.getAttribute('placeholder');
      const name = await input.getAttribute('name');
      const type = await input.getAttribute('type') || 'text';
      const ariaLabel = await input.getAttribute('aria-label');
      const testId = await input.getAttribute('data-testid');

      if (ariaLabel) {
        selectors.push({
          selector: `page.getByLabel('${ariaLabel}')`,
          strategy: 'label',
          elementDescription: `Input labeled "${ariaLabel}"`,
          elementTag: tag,
          sourceUrl: currentUrl,
          retrievalTime,
          attributes: { name: name || '', type },
        });
      }

      if (placeholder) {
        selectors.push({
          selector: `page.getByPlaceholder('${placeholder}')`,
          strategy: 'placeholder',
          elementDescription: `Input with placeholder "${placeholder}"`,
          elementTag: tag,
          sourceUrl: currentUrl,
          retrievalTime,
          attributes: { name: name || '', type },
        });
      }

      if (testId) {
        selectors.push({
          selector: `page.getByTestId('${testId}')`,
          strategy: 'testid',
          elementDescription: `Element with testId "${testId}"`,
          elementTag: tag,
          sourceUrl: currentUrl,
          retrievalTime,
        });
      }

      if (name) {
        selectors.push({
          selector: `page.locator('input[name="${name}"]')`,
          strategy: 'css',
          elementDescription: `Input with name="${name}"`,
          elementTag: tag,
          sourceUrl: currentUrl,
          retrievalTime,
        });
      }
    }

    // Extract buttons
    const buttons = await page.locator('button, input[type="submit"], [role="button"]').all();
    for (const btn of buttons) {
      const text = (await btn.innerText()).trim();
      const testId = await btn.getAttribute('data-testid');
      const ariaLabel = await btn.getAttribute('aria-label');
      const btnClass = await btn.getAttribute('class') || '';

      if (text) {
        selectors.push({
          selector: `page.getByRole('button', { name: '${text}' })`,
          strategy: 'role',
          elementDescription: `Button with accessible name "${text}"`,
          elementTag: 'button',
          elementText: text,
          sourceUrl: currentUrl,
          retrievalTime,
        });
      } else if (ariaLabel) {
        selectors.push({
          selector: `page.getByRole('button', { name: '${ariaLabel}' })`,
          strategy: 'role',
          elementDescription: `Button with aria-label "${ariaLabel}"`,
          elementTag: 'button',
          sourceUrl: currentUrl,
          retrievalTime,
        });
      }

      if (testId) {
        selectors.push({
          selector: `page.getByTestId('${testId}')`,
          strategy: 'testid',
          elementDescription: `Button with testid "${testId}"`,
          elementTag: 'button',
          sourceUrl: currentUrl,
          retrievalTime,
        });
      }

      if (btnClass) {
        selectors.push({
          selector: `page.locator('button.${btnClass.split(' ').filter(Boolean).join('.')}')`,
          strategy: 'css',
          elementDescription: `Button with CSS class "${btnClass}"`,
          elementTag: 'button',
          sourceUrl: currentUrl,
          retrievalTime,
        });
      }
    }

    // Extract links
    const links = await page.locator('nav a, header a').all();
    for (const link of links) {
      const text = (await link.innerText()).trim();
      const href = await link.getAttribute('href');
      if (text) {
        selectors.push({
          selector: `page.getByRole('link', { name: '${text}' })`,
          strategy: 'role',
          elementDescription: `Navigation link "${text}" (href: ${href || ''})`,
          elementTag: 'a',
          elementText: text,
          sourceUrl: currentUrl,
          retrievalTime,
        });
      }
    }

    // Cache the extracted elements
    browseCache.set(normalizedUrl, {
      sourceUrl: currentUrl,
      retrievalTime,
      selectors,
      screenshotBuffer,
      timestamp: Date.now(),
    });

    return {
      sourceUrl: currentUrl,
      retrievalTime,
      selectors,
      screenshotPath,
    };
  } finally {
    await browser.close();
  }
}
