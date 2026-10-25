import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = 'C:\\Users\\Mohan\\.gemini\\antigravity-ide\\brain\\8648a7fb-220b-49cf-ad3c-132a8b52d885';
const auditImgDir = path.join(artifactDir, 'audit');
if (!fs.existsSync(auditImgDir)) {
  fs.mkdirSync(auditImgDir, { recursive: true });
}

const axePath = path.resolve('node_modules/axe-core/axe.min.js');

const WIDTHS = [1366, 1280, 1024, 390];
const THEMES = ['dark', 'light'];
const PAGES = [
  { name: 'test_writer', url: 'http://localhost:3050/', themeKey: 'agent_theme_test_writer' },
  { name: 'site_check', url: 'http://localhost:3050/site-check', themeKey: 'agent_theme_site_check' }
];

async function runAudit() {
  const browser = await chromium.launch({ headless: true });
  const allFindings = [];

  for (const pageDef of PAGES) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        console.log(`Auditing: ${pageDef.name} | ${theme} | ${width}px`);
        const context = await browser.newContext({
          viewport: { width, height: 900 }
        });
        const page = await context.newPage();

        const consoleErrors = [];
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto(pageDef.url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(({ key, th }) => {
          localStorage.setItem(key, th);
          document.documentElement.setAttribute('data-theme', th);
        }, { key: pageDef.themeKey, th: theme });

        await page.reload({ waitUntil: 'networkidle' });

        // Open expandables
        if (pageDef.name === 'test_writer') {
          // Open history
          await page.evaluate(() => {
            const histBtn = document.getElementById('toggleHistoryBtn');
            const histContainer = document.getElementById('historyContainer');
            if (histBtn && histContainer && histContainer.style.display === 'none') {
              histBtn.click();
            }
          });
          // Open all timelines
          await page.evaluate(() => {
            const btns = document.querySelectorAll('.timeline-toggle-btn');
            btns.forEach(b => {
              const tid = b.getAttribute('data-timeline-id');
              const row = tid ? document.getElementById(tid) : null;
              if (row && (row.style.display === 'none' || !row.style.display)) {
                b.click();
              }
            });
          });
        }
        await page.waitForTimeout(500);

        // Inject axe-core
        await page.addScriptTag({ path: axePath });

        // Run in-browser audit evaluation
        const evalResults = await page.evaluate(async ({ width, theme, pageName }) => {
          const findings = [];

          // 1. Horizontal scroll
          const docScrollW = document.documentElement.scrollWidth;
          const winInnerW = window.innerWidth;
          if (docScrollW > winInnerW + 2) {
            findings.push({
              type: 'horizontal-scroll',
              detail: `Document scrollWidth (${docScrollW}px) exceeds viewport width (${winInnerW}px) by ${docScrollW - winInnerW}px. Causes horizontal window scrolling.`
            });
          }

          // 2. Axe-core contrast
          try {
            const axeRes = await window.axe.run(document, {
              runOnly: { type: 'rule', values: ['color-contrast'] }
            });
            if (axeRes.violations && axeRes.violations.length > 0) {
              axeRes.violations.forEach(v => {
                v.nodes.forEach(n => {
                  findings.push({
                    type: 'color-contrast',
                    target: n.target.join(' '),
                    detail: `${v.help}: ${n.failureSummary}`,
                    html: n.html.slice(0, 150)
                  });
                });
              });
            }
          } catch(e) {
            findings.push({ type: 'axe-error', detail: String(e) });
          }

          // 3. Text clipped or truncated
          const allTextEls = document.querySelectorAll('button, span, p, h1, h2, h3, h4, th, td, a, .badge, .chip-evidence');
          allTextEls.forEach(el => {
            if (el.offsetParent === null) return; // not visible
            const style = window.getComputedStyle(el);
            // Ignore pre, code, and intentional scroll containers
            if (el.tagName === 'PRE' || el.tagName === 'CODE' || style.overflowX === 'auto' || style.overflowX === 'scroll') return;
            if (el.closest('.timeline-stepper') || el.closest('table')) {
              // Check if important label is truncated via text-overflow: ellipsis
              if (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2) {
                findings.push({
                  type: 'text-truncated-ellipsis',
                  tag: el.tagName,
                  text: el.innerText.slice(0, 40),
                  target: el.className || el.id || el.tagName,
                  detail: `Text "${el.innerText.slice(0, 30)}..." truncated by ellipsis (scrollWidth: ${el.scrollWidth}px > clientWidth: ${el.clientWidth}px)`
                });
              }
            }
            if ((style.overflow === 'hidden' || style.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 4) {
              if (style.textOverflow !== 'ellipsis' && !el.classList.contains('metro-track-line')) {
                findings.push({
                  type: 'text-clipped-hidden',
                  tag: el.tagName,
                  text: el.innerText.slice(0, 40),
                  target: el.className || el.id || el.tagName,
                  detail: `Text clipped by overflow hidden without wrapping (scrollWidth: ${el.scrollWidth}px > clientWidth: ${el.clientWidth}px)`
                });
              }
            }
          });

          // 4. Overlapping siblings (especially stamps, badges, buttons)
          const stampContainers = document.querySelectorAll('.run-verdict-stack, .runs-table td, .top-nav-actions, .hero-actions');
          stampContainers.forEach(container => {
            const children = Array.from(container.children).filter(c => c.offsetParent !== null && !['SCRIPT', 'STYLE'].includes(c.tagName));
            for (let i = 0; i < children.length; i++) {
              for (let j = i + 1; j < children.length; j++) {
                const r1 = children[i].getBoundingClientRect();
                const r2 = children[j].getBoundingClientRect();
                // Check if bounding boxes overlap with more than 3px margin
                const overlaps = !(r1.right <= r2.left + 2 || 
                                   r1.left >= r2.right - 2 || 
                                   r1.bottom <= r2.top + 2 || 
                                   r1.top >= r2.bottom - 2);
                if (overlaps) {
                  findings.push({
                    type: 'overlapping-elements',
                    target: `${children[i].className || children[i].tagName} and ${children[j].className || children[j].tagName}`,
                    detail: `Elements overlap in container: "${children[i].innerText.slice(0, 25)}" and "${children[j].innerText.slice(0, 25)}"`
                  });
                }
              }
            }
          });

          // 5. Mobile tap targets (width 390 only)
          if (width <= 400) {
            const interactives = document.querySelectorAll('button, a.btn, input[type="text"], input[type="checkbox"]');
            interactives.forEach(btn => {
              if (btn.offsetParent === null) return;
              const rect = btn.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32)) {
                findings.push({
                  type: 'small-tap-target',
                  target: btn.className || btn.id || btn.tagName,
                  detail: `Interactive element tap target is ${Math.round(rect.width)}x${Math.round(rect.height)}px (under 32px standard touch minimum). Text: "${btn.innerText.slice(0, 25)}"`
                });
              }
            });
          }

          // 6. Font sizes under 11px
          const contentEls = document.querySelectorAll('p, td, .card, input, textarea');
          contentEls.forEach(el => {
            if (el.offsetParent === null) return;
            const fs = parseFloat(window.getComputedStyle(el).fontSize);
            if (fs < 11) {
              findings.push({
                type: 'tiny-font',
                target: el.className || el.tagName,
                detail: `Font size is ${fs}px (under 11px minimum readable threshold). Text: "${el.innerText.slice(0, 30)}"`
              });
            }
          });

          return findings;
        }, { width, theme, pageName: pageDef.name });

        // Screenshot
        const screenshotFileName = `audit_${pageDef.name}_${theme}_${width}.png`;
        const screenshotPath = path.join(auditImgDir, screenshotFileName);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        allFindings.push({
          page: pageDef.name,
          theme,
          width,
          screenshot: screenshotFileName,
          consoleErrors,
          findings: evalResults
        });

        await context.close();
      }
    }
  }

  await browser.close();

  const reportPath = path.join(auditImgDir, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(allFindings, null, 2));
  console.log(`Audit complete. Results written to ${reportPath}`);
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
