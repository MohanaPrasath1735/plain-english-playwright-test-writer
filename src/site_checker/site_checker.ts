import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'node:url';
import { validateUrlSafety, siteCheckRateLimiter } from './ssrf_guard.js';
import { fetchRobotsTxt, isPathDisallowedByRobots, checkLinkStatus, sleep, CrawledPageInfo, BrokenLinkInfo } from './crawler.js';
import { detectBotChallengeOrCaptcha } from './detector.js';
import { generateSiteTestProposals } from './proposals.js';
import { saveSiteCheckRecord, SiteCheckRecord, DiscoveredElementsSummary } from './store.js';

export interface SiteCheckProgress {
  step: string;
  message: string;
  data?: any;
}

export interface SiteCheckResult {
  success: boolean;
  record: SiteCheckRecord;
  error?: string;
}

export async function runSiteCheck(
  targetUrl: string,
  onProgress?: (progress: SiteCheckProgress) => void
): Promise<SiteCheckResult> {
  const checkId = `site_${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Rate limit check
  const rateLimit = siteCheckRateLimiter.checkLimit();
  if (!rateLimit.allowed) {
    const errorMsg = `Rate limit exceeded. Please wait ${rateLimit.retryAfterSec || 10}s before checking another site.`;
    throw new Error(errorMsg);
  }

  // 2. Pre-flight SSRF Validation
  onProgress?.({ step: 'ssrf', message: 'Validating URL safety and resolving hostname...' });
  const safety = await validateUrlSafety(targetUrl);
  if (!safety.safe || !safety.parsedUrl) {
    const errorMsg = safety.error || 'URL safety check failed.';
    throw new Error(errorMsg);
  }

  const parsedUrl = safety.parsedUrl;
  const origin = parsedUrl.origin;

  // Evidence directory setup
  const evidenceDir = path.resolve(process.cwd(), 'evidence', 'site_checks', checkId);
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const desktopScreenshotPath = path.join(evidenceDir, 'desktop_screenshot.png');
  const mobileScreenshotPath = path.join(evidenceDir, 'mobile_screenshot.png');

  // 3. Robots.txt fetch
  onProgress?.({ step: 'robots', message: 'Inspecting robots.txt policy...' });
  const robotsRules = await fetchRobotsTxt(origin);
  console.log(`[SiteChecker] ${origin} robots.txt rules loaded: ${robotsRules.length} rules.`);

  // Check if root requested path is disallowed
  if (isPathDisallowedByRobots(parsedUrl.pathname, robotsRules)) {
    console.warn(`[SiteChecker] Path ${parsedUrl.pathname} is disallowed by robots.txt.`);
  }

  const browser = await chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const crawledPages: CrawledPageInfo[] = [];
  const discoveredLinks: Set<string> = new Set();
  const elements: DiscoveredElementsSummary = { forms: [], buttons: [], inputs: [], links: [] };
  const brokenLinks: BrokenLinkInfo[] = [];
  let a11yViolations: any[] = [];
  let statusCode = 200;
  let pageTitle = '';
  let finalUrl = targetUrl;
  let status: 'COMPLETED' | 'BLOCKED' | 'ERROR' = 'COMPLETED';
  let statusMessage = 'Site check completed successfully.';

  const crawlTimeoutAt = Date.now() + 90000; // 90 second hard ceiling

  try {
    // 4. Desktop Inspection & Screenshot
    onProgress?.({ step: 'desktop', message: 'Loading page on desktop viewport (read-only)...' });
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const desktopPage = await desktopContext.newPage();

    // Listen for console errors
    desktopPage.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon.ico')) {
          consoleErrors.push(text);
        }
      }
    });
    desktopPage.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    // Guard against SSRF redirects
    desktopPage.on('response', async res => {
      const resUrl = res.url();
      if (res.status() >= 300 && res.status() < 400) {
        const location = res.headers()['location'];
        if (location) {
          try {
            const redirectUrl = new URL(location, resUrl);
            const redirectSafety = await validateUrlSafety(redirectUrl.href);
            if (!redirectSafety.safe) {
              throw new Error(`SSRF Block: Redirect to unsafe destination '${redirectUrl.href}' blocked.`);
            }
          } catch (e: any) {
            console.warn('[SiteChecker SSRF]', e.message);
          }
        }
      }
    });

    const response = await desktopPage.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    statusCode = response?.status() || 200;
    finalUrl = desktopPage.url();
    pageTitle = await desktopPage.title();

    // Re-verify final URL after redirects against SSRF
    const finalSafety = await validateUrlSafety(finalUrl);
    if (!finalSafety.safe) {
      throw new Error(`SSRF Blocked: Final redirect landed on unsafe destination '${finalUrl}'.`);
    }

    // Check for CAPTCHA or Bot Challenge
    onProgress?.({ step: 'barrier', message: 'Checking for automated bot challenges or CAPTCHA...' });
    const challenge = await detectBotChallengeOrCaptcha(desktopPage, statusCode);
    if (challenge.isChallenge) {
      status = 'BLOCKED';
      statusMessage = challenge.reason || 'Blocked or manual step required: Bot challenge / CAPTCHA detected.';
      await desktopPage.screenshot({ path: desktopScreenshotPath, fullPage: false }).catch(() => {});
      await desktopContext.close();
      await browser.close();

      const record: SiteCheckRecord = {
        id: checkId,
        requestedUrl: targetUrl,
        finalUrl,
        retrievalTime: now,
        statusCode,
        title: pageTitle,
        consoleErrorsJson: JSON.stringify(consoleErrors),
        elementsJson: JSON.stringify(elements),
        brokenLinksJson: JSON.stringify([]),
        a11yViolationsJson: JSON.stringify([]),
        desktopScreenshotPath,
        mobileScreenshotPath: 'uncertain',
        crawledPagesJson: JSON.stringify([]),
        proposalsJson: JSON.stringify([]),
        status,
        statusMessage,
        evidenceComplete: false,
        createdAt: now,
        updatedAt: now,
      };

      saveSiteCheckRecord(record);
      return { success: true, record };
    }

    // Take desktop screenshot
    await desktopPage.screenshot({ path: desktopScreenshotPath, fullPage: false });
    crawledPages.push({
      url: finalUrl,
      statusCode,
      title: pageTitle,
      statusText: 'Inspected desktop view',
    });

    // 5. Harvest Interactive Elements (forms, buttons, inputs, links preferring role/label/test-id)
    onProgress?.({ step: 'elements', message: 'Harvesting interactive elements with resilient locators...' });
    const rawElements = await desktopPage.evaluate(() => {
      const forms: any[] = [];
      const buttons: any[] = [];
      const inputs: any[] = [];
      const links: any[] = [];

      // Forms
      document.querySelectorAll('form').forEach(f => {
        const id = f.id;
        const name = f.getAttribute('name') || undefined;
        const action = f.getAttribute('action') || undefined;
        const selector = id ? `form#${id}` : (name ? `form[name="${name}"]` : 'form');
        forms.push({ id, name, action, selector });
      });

      // Buttons (prefer role, label, text, data-testid)
      document.querySelectorAll('button, input[type="submit"], [role="button"]').forEach(b => {
        const text = (b.textContent || (b as HTMLInputElement).value || '').trim().slice(0, 50);
        const testId = b.getAttribute('data-testid');
        const ariaLabel = b.getAttribute('aria-label');
        let selector = '';
        if (testId) {
          selector = `[data-testid="${testId}"]`;
        } else if (ariaLabel) {
          selector = `page.getByRole('button', { name: '${ariaLabel}' })`;
        } else if (text) {
          selector = `page.getByRole('button', { name: '${text}' })`;
        } else {
          selector = 'button';
        }
        buttons.push({
          text: text || 'Button',
          role: 'button',
          selector,
          type: (b as HTMLButtonElement).type || 'button',
        });
      });

      // Inputs
      document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(i => {
        const input = i as HTMLInputElement;
        const type = input.type || 'text';
        const name = input.name;
        const placeholder = input.placeholder;
        const testId = input.getAttribute('data-testid');
        const ariaLabel = input.getAttribute('aria-label');

        let selector = '';
        if (testId) {
          selector = `[data-testid="${testId}"]`;
        } else if (ariaLabel) {
          selector = `page.getByLabel('${ariaLabel}')`;
        } else if (placeholder) {
          selector = `page.getByPlaceholder('${placeholder}')`;
        } else if (name) {
          selector = `input[name="${name}"]`;
        } else {
          selector = `input[type="${type}"]`;
        }

        inputs.push({
          name: name || undefined,
          type,
          placeholder: placeholder || undefined,
          label: ariaLabel || undefined,
          selector,
        });
      });

      // Links (max 20)
      document.querySelectorAll('a[href]').forEach(a => {
        const text = (a.textContent || '').trim().slice(0, 60);
        const href = a.getAttribute('href') || '';
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          links.push({
            text: text || href,
            href,
            selector: text ? `page.getByRole('link', { name: '${text}' })` : `a[href="${href}"]`,
          });
        }
      });

      return { forms, buttons, inputs, links };
    });

    elements.forms = rawElements.forms.slice(0, 10);
    elements.buttons = rawElements.buttons.slice(0, 15);
    elements.inputs = rawElements.inputs.slice(0, 15);
    elements.links = rawElements.links.slice(0, 20);

    // Harvest unique URLs for broken link checks & crawling
    for (const l of rawElements.links) {
      try {
        const abs = new URL(l.href, finalUrl).href;
        discoveredLinks.add(abs);
      } catch {}
    }

    // 6. Run axe-core accessibility audit
    onProgress?.({ step: 'a11y', message: 'Running axe-core accessibility audit...' });
    try {
      await desktopPage.addScriptTag({
        url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
      }).catch(() => {});

      const axeResults: any = await desktopPage.evaluate(async () => {
        // @ts-ignore
        if (typeof window.axe === 'undefined') return null;
        // @ts-ignore
        return await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
        });
      }).catch(() => null);

      if (axeResults && Array.isArray(axeResults.violations)) {
        a11yViolations = axeResults.violations.map((v: any) => ({
          id: v.id,
          impact: v.impact || 'minor',
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodeCount: Array.isArray(v.nodes) ? v.nodes.length : 0,
        }));
      }
    } catch (e: any) {
      console.warn('[SiteChecker a11y]', e.message);
    }

    await desktopContext.close();

    // 7. Mobile Viewport & Screenshot
    onProgress?.({ step: 'mobile', message: 'Capturing mobile viewport (390x844)...' });
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: false });
    await mobileContext.close();

    // 8. Broken links check (up to 20 links, max 90s total limit)
    onProgress?.({ step: 'links', message: `Checking ${Math.min(discoveredLinks.size, 20)} discovered links for broken targets...` });
    const linkArray = Array.from(discoveredLinks).slice(0, 20);
    for (const linkUrl of linkArray) {
      if (Date.now() > crawlTimeoutAt) break;
      const res = await checkLinkStatus(linkUrl);
      if (!res.ok) {
        brokenLinks.push({
          url: linkUrl,
          statusCode: res.statusCode,
          error: res.error,
        });
      }
    }

    // 9. Same-Domain Crawl (up to 5 pages, 1s delay, respecting robots.txt)
    onProgress?.({ step: 'crawl', message: 'Crawling same-domain pages (max 5 pages, respecting robots.txt)...' });
    const targetDomain = new URL(finalUrl).hostname.toLowerCase();
    const candidatePages: string[] = [];

    for (const l of discoveredLinks) {
      try {
        const u = new URL(l);
        if (u.hostname.toLowerCase() === targetDomain && u.href !== finalUrl) {
          candidatePages.push(u.href);
        }
      } catch {}
    }

    const pagesToCrawl = candidatePages.slice(0, 4); // + initial page = 5 total
    for (const pageUrl of pagesToCrawl) {
      if (Date.now() > crawlTimeoutAt) break;

      // 1-second delay between requests
      await sleep(1000);

      const u = new URL(pageUrl);
      if (isPathDisallowedByRobots(u.pathname, robotsRules)) {
        crawledPages.push({
          url: pageUrl,
          skippedReason: 'skipped: disallowed by robots.txt',
        });
        console.log(`[SiteChecker] ${pageUrl} skipped: disallowed by robots.txt`);
        continue;
      }

      // Pre-flight SSRF check
      const pSafety = await validateUrlSafety(pageUrl);
      if (!pSafety.safe) {
        crawledPages.push({
          url: pageUrl,
          skippedReason: 'skipped: blocked by SSRF safety rules',
        });
        continue;
      }

      try {
        const tStart = Date.now();
        const crawlContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const cPage = await crawlContext.newPage();
        const cRes = await cPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const cStatus = cRes?.status() || 200;
        const cTitle = await cPage.title();
        const dur = Date.now() - tStart;
        await crawlContext.close();

        crawledPages.push({
          url: pageUrl,
          statusCode: cStatus,
          title: cTitle,
          durationMs: dur,
        });
      } catch (err: any) {
        crawledPages.push({
          url: pageUrl,
          statusCode: 500,
          statusText: err?.message || 'Failed to crawl page',
        });
      }
    }

  } catch (err: any) {
    status = 'ERROR';
    statusMessage = `Site check failed: ${err?.message || String(err)}`;
  } finally {
    await browser.close().catch(() => {});
  }

  // Check evidence completeness (mark missing evidence as "uncertain")
  const hasDesktopScreenshot = fs.existsSync(desktopScreenshotPath);
  const hasMobileScreenshot = fs.existsSync(mobileScreenshotPath);
  const evidenceComplete = hasDesktopScreenshot && hasMobileScreenshot && status !== 'ERROR';

  // 10. Generate Test Proposals with LLM
  onProgress?.({ step: 'proposals', message: 'Generating up to 3 Playwright test proposals with synthetic data...' });
  const proposals = await generateSiteTestProposals(finalUrl, pageTitle, elements, checkId);

  const record: SiteCheckRecord = {
    id: checkId,
    requestedUrl: targetUrl,
    finalUrl,
    retrievalTime: now,
    statusCode,
    title: pageTitle || (status === 'ERROR' ? 'Error loading page' : 'N/A'),
    consoleErrorsJson: JSON.stringify(consoleErrors),
    elementsJson: JSON.stringify(elements),
    brokenLinksJson: JSON.stringify(brokenLinks),
    a11yViolationsJson: JSON.stringify(a11yViolations),
    desktopScreenshotPath: hasDesktopScreenshot ? desktopScreenshotPath : 'uncertain',
    mobileScreenshotPath: hasMobileScreenshot ? mobileScreenshotPath : 'uncertain',
    crawledPagesJson: JSON.stringify(crawledPages),
    proposalsJson: JSON.stringify(proposals),
    status,
    statusMessage,
    evidenceComplete,
    createdAt: now,
    updatedAt: now,
  };

  saveSiteCheckRecord(record);
  console.log(`✓ Stored site check record '${checkId}' in SQLite.`);

  return {
    success: status !== 'ERROR',
    record,
    error: status === 'ERROR' ? statusMessage : undefined,
  };
}
