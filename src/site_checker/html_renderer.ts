import { SiteCheckRecord, SiteCheckProposal, DiscoveredElementsSummary } from './store.js';

export function escapeHtml(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderSiteCheckCard(record: SiteCheckRecord): string {
  let consoleErrors: string[] = [];
  let elements: DiscoveredElementsSummary = { forms: [], buttons: [], inputs: [], links: [] };
  let brokenLinks: any[] = [];
  let a11yViolations: any[] = [];
  let crawledPages: any[] = [];
  let proposals: SiteCheckProposal[] = [];

  try { consoleErrors = JSON.parse(record.consoleErrorsJson || '[]'); } catch {}
  try { elements = JSON.parse(record.elementsJson || '{}'); } catch {}
  try { brokenLinks = JSON.parse(record.brokenLinksJson || '[]'); } catch {}
  try { a11yViolations = JSON.parse(record.a11yViolationsJson || '[]'); } catch {}
  try { crawledPages = JSON.parse(record.crawledPagesJson || '[]'); } catch {}
  try { proposals = JSON.parse(record.proposalsJson || '[]'); } catch {}

  const hasDesktop = record.desktopScreenshotPath && record.desktopScreenshotPath !== 'uncertain';
  const hasMobile = record.mobileScreenshotPath && record.mobileScreenshotPath !== 'uncertain';

  const uncertainItems: string[] = [];
  if (!hasDesktop) uncertainItems.push('Desktop Screenshot (file missing or could not be generated)');
  if (!hasMobile) uncertainItems.push('Mobile Screenshot (file missing or could not be generated)');
  if (!record.evidenceComplete) uncertainItems.push('Evidence incomplete: one or more visual artifacts missing');
  if (record.status === 'BLOCKED') uncertainItems.push('Full DOM inspection and crawler halted (blocked by bot barrier or manual step required)');
  if (record.status === 'ERROR') uncertainItems.push('Crawl incomplete due to connection error or safety trip');

  const checkDate = new Date(record.retrievalTime);
  const timeFormatted = isNaN(checkDate.getTime())
    ? record.retrievalTime
    : checkDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' (' + checkDate.toLocaleDateString() + ')';

  const isRedirected = record.requestedUrl !== record.finalUrl;
  const statusBadgeClass = record.status === 'COMPLETED' ? 'badge-pass' : (record.status === 'BLOCKED' ? 'badge-warn' : 'badge-fail');

  return `
  <div id="check_card_${record.id}" class="site-check-result-group site-check-card" data-check-id="${record.id}">
    
    <!-- 1. SUMMARY CARD -->
    <div class="result-card card-summary">
      <div class="result-card-header">
        <div class="card-title-group">
          <h3 class="result-card-title">
            <span class="card-icon" aria-hidden="true">📋</span> Summary
          </h3>
          <span class="badge ${statusBadgeClass}">
            ${record.status === 'COMPLETED' ? `✓ HTTP ${record.statusCode} OK` : (record.status === 'BLOCKED' ? '⚠ BLOCKED' : `✖ ERROR ${record.statusCode || ''}`)}
          </span>
          ${uncertainItems.length > 0
            ? `<span class="badge badge-uncertain">⚠ ${uncertainItems.length} uncertain item${uncertainItems.length === 1 ? '' : 's'}</span>`
            : `<span class="badge badge-pass">✓ Evidence Complete</span>`}
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-delete-check" onclick="window.deleteSiteCheck('${record.id}')" aria-label="Delete this site check" title="Delete this check from SQLite and remove evidence files">
            🗑 Delete
          </button>
        </div>
      </div>

      ${record.status !== 'COMPLETED' ? `
        <div class="banner banner-error" role="alert">
          <strong>Notice:</strong> ${escapeHtml(record.statusMessage)}
        </div>
      ` : ''}

      <div class="summary-details-grid">
        <div class="summary-item">
          <span class="summary-label">Target URL</span>
          <a href="${escapeHtml(record.requestedUrl)}" target="_blank" rel="noopener noreferrer" class="summary-value link-url" title="${escapeHtml(record.requestedUrl)}">
            ${escapeHtml(record.requestedUrl)}
          </a>
        </div>
        <div class="summary-item">
          <span class="summary-label">Final URL</span>
          <div class="summary-value ${isRedirected ? 'redirected-val' : ''}">
            ${isRedirected ? `
              <span class="redirect-arrow">↳</span>
              <a href="${escapeHtml(record.finalUrl)}" target="_blank" rel="noopener noreferrer" class="link-url">
                ${escapeHtml(record.finalUrl)}
              </a>
              <span class="badge badge-info badge-sm">Redirected</span>
            ` : `
              <a href="${escapeHtml(record.finalUrl)}" target="_blank" rel="noopener noreferrer" class="link-url">
                ${escapeHtml(record.finalUrl)}
              </a>
            `}
          </div>
        </div>
        <div class="summary-item">
          <span class="summary-label">Page Title</span>
          <div class="summary-value page-title-val">${escapeHtml(record.title || 'N/A')}</div>
        </div>
        <div class="summary-item">
          <span class="summary-label">Time Checked</span>
          <div class="summary-value">${escapeHtml(timeFormatted)}</div>
        </div>
      </div>

      ${uncertainItems.length > 0 ? `
        <div class="alert alert-uncertain" role="region" aria-label="Uncertain items">
          <div class="alert-title">
            <span class="badge badge-uncertain">Uncertain Items (${uncertainItems.length})</span>
            <span>The following items could not be confirmed during audit:</span>
          </div>
          <ul class="alert-list">
            ${uncertainItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>

    <!-- 2. FORMS AND BUTTONS CARD -->
    <div class="result-card card-forms-buttons">
      <div class="result-card-header">
        <h3 class="result-card-title">
          <span class="card-icon" aria-hidden="true">📝</span> Forms and Buttons
        </h3>
        <span class="badge badge-info">
          ${(elements.forms || []).length} forms • ${(elements.buttons || []).length} buttons • ${(elements.inputs || []).length} inputs
        </span>
      </div>

      <div class="elements-grid">
        <!-- Forms Column -->
        <div class="elements-column">
          <h4 class="elements-column-title">Forms (${(elements.forms || []).length})</h4>
          ${(elements.forms || []).length === 0 ? `
            <p class="elements-empty">No HTML forms detected.</p>
          ` : `
            <div class="elements-list" tabindex="0" role="region" aria-label="Discovered forms list">
              ${elements.forms.map(f => `
                <div class="element-item">
                  <span class="badge badge-info badge-sm">Form</span>
                  <code class="element-selector">${escapeHtml(f.selector)}</code>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Buttons Column -->
        <div class="elements-column">
          <h4 class="elements-column-title">Buttons (${(elements.buttons || []).length})</h4>
          ${(elements.buttons || []).length === 0 ? `
            <p class="elements-empty">No buttons detected.</p>
          ` : `
            <div class="elements-list" tabindex="0" role="region" aria-label="Discovered buttons list">
              ${elements.buttons.map(b => `
                <div class="element-item">
                  <span class="element-text">"${escapeHtml(b.text || 'Button')}"</span>
                  <code class="element-selector">${escapeHtml(b.selector)}</code>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Inputs Column -->
        <div class="elements-column">
          <h4 class="elements-column-title">Inputs (${(elements.inputs || []).length})</h4>
          ${(elements.inputs || []).length === 0 ? `
            <p class="elements-empty">No inputs detected.</p>
          ` : `
            <div class="elements-list" tabindex="0" role="region" aria-label="Discovered inputs list">
              ${elements.inputs.map(i => `
                <div class="element-item">
                  <span class="badge badge-pass badge-sm">${escapeHtml(i.type || 'text')}</span>
                  ${i.placeholder ? `<span class="element-desc">"${escapeHtml(i.placeholder)}"</span>` : ''}
                  <code class="element-selector">${escapeHtml(i.selector)}</code>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- 3. LINKS CARD (WITH BROKEN LINKS HIGHLIGHTED) -->
    <div class="result-card card-links">
      <div class="result-card-header">
        <h3 class="result-card-title">
          <span class="card-icon" aria-hidden="true">🔗</span> Links
        </h3>
        <span class="badge ${brokenLinks.length > 0 ? 'badge-fail' : 'badge-pass'}">
          ${brokenLinks.length > 0 ? `✖ ${brokenLinks.length} Broken Link${brokenLinks.length === 1 ? '' : 's'}` : '✓ 0 Broken Links'}
        </span>
      </div>

      <!-- Broken Links Highlight Section -->
      ${brokenLinks.length > 0 ? `
        <div class="broken-links-highlight" role="alert">
          <div class="broken-links-header">
            <span class="badge badge-fail">🚨 Broken Links Alert</span>
            <strong class="broken-links-title">${brokenLinks.length} link${brokenLinks.length === 1 ? '' : 's'} returned HTTP failure or connection errors:</strong>
          </div>
          <div class="broken-links-table">
            ${brokenLinks.map(bl => `
              <div class="broken-link-row">
                <span class="badge badge-fail badge-sm">HTTP ${bl.statusCode || 'Error'}</span>
                <a href="${escapeHtml(bl.url)}" target="_blank" rel="noopener noreferrer" class="broken-link-url">${escapeHtml(bl.url)}</a>
                ${bl.error ? `<span class="broken-link-err">${escapeHtml(bl.error)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="all-links-ok-banner">
          <span class="badge badge-pass">✓ All Links Healthy</span>
          <span class="all-links-text">Zero broken links found among sampled targets.</span>
        </div>
      `}

      <!-- Crawled Pages & Sampling Details -->
      <details class="crawl-breakdown-details">
        <summary class="crawl-breakdown-summary">
          <span>View Crawled Pages (${crawledPages.length}) &amp; Sampled Discovered Links (${(elements.links || []).length})</span>
        </summary>
        <div class="crawl-breakdown-content">
          <h4 class="subheading">Crawled Pages (Same-Domain, robots.txt Respected):</h4>
          <div class="crawled-pages-list">
            ${crawledPages.map(p => `
              <div class="crawled-page-item">
                <span class="crawled-url">${escapeHtml(p.url)}</span>
                <span class="badge ${p.skippedReason ? 'badge-warn' : 'badge-pass'} badge-sm">
                  ${p.skippedReason ? escapeHtml(p.skippedReason) : `HTTP ${p.statusCode || 200}`}
                </span>
              </div>
            `).join('')}
          </div>

          ${(elements.links || []).length > 0 ? `
            <h4 class="subheading" style="margin-top: 14px;">Discovered Page Links:</h4>
            <div class="discovered-links-list" tabindex="0" role="region" aria-label="Discovered links list">
              ${elements.links.slice(0, 15).map(l => `
                <div class="discovered-link-item">
                  <span class="link-label">"${escapeHtml(l.text || 'Link')}"</span>
                  <code class="element-selector">${escapeHtml(l.selector)}</code>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </details>
    </div>

    <!-- 4. ACCESSIBILITY CARD (ALL VIOLATIONS WITH SEVERITY BADGES) -->
    <div class="result-card card-accessibility">
      <div class="result-card-header">
        <h3 class="result-card-title">
          <span class="card-icon" aria-hidden="true">♿</span> Accessibility (axe-core)
        </h3>
        <span class="badge ${a11yViolations.length === 0 ? 'badge-pass' : 'badge-warn'}">
          ${a11yViolations.length === 0 ? '✓ 0 Violations (WCAG AA)' : `⚠ ${a11yViolations.length} Violation${a11yViolations.length === 1 ? '' : 's'}`}
        </span>
      </div>

      ${a11yViolations.length === 0 ? `
        <div class="a11y-passed-banner">
          <span class="badge badge-pass">✓ WCAG AA Compliant</span>
          <span class="a11y-passed-text">No accessibility violations detected on this page by axe-core!</span>
        </div>
      ` : `
        <div class="a11y-violations-list">
          ${a11yViolations.map(v => {
            const impact = (v.impact || 'moderate').toLowerCase();
            const impactBadgeClass = impact === 'critical' ? 'badge-severity-critical'
              : (impact === 'serious' ? 'badge-severity-serious'
              : (impact === 'moderate' ? 'badge-severity-moderate' : 'badge-severity-minor'));
            const impactLabel = impact.toUpperCase();
            return `
              <div class="violation-card">
                <div class="violation-card-header">
                  <div class="violation-id-group">
                    <strong class="violation-id">${escapeHtml(v.id)}</strong>
                    <span class="badge ${impactBadgeClass}">
                      ${impactLabel}
                    </span>
                  </div>
                  ${v.nodeCount ? `<span class="violation-nodes-count">${v.nodeCount} node${v.nodeCount === 1 ? '' : 's'} affected</span>` : ''}
                </div>
                <p class="violation-desc"><strong>Description:</strong> ${escapeHtml(v.description)}</p>
                ${v.help ? `<p class="violation-help"><strong>Fix guidance:</strong> ${escapeHtml(v.help)}</p>` : ''}
                ${v.helpUrl ? `
                  <div class="violation-link-row">
                    <a href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener noreferrer" class="link-wcag-rule">
                      View WCAG rule specification ↗
                    </a>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- 5. SCREENSHOTS CARD (DESKTOP AND MOBILE SIDE BY SIDE) -->
    <div class="result-card card-screenshots">
      <div class="result-card-header">
        <h3 class="result-card-title">
          <span class="card-icon" aria-hidden="true">🖼️</span> Screenshots (Desktop &amp; Mobile)
        </h3>
        <span class="badge badge-info">Side by Side</span>
      </div>

      <div class="screenshots-grid-side-by-side">
        <!-- Desktop Screenshot Column -->
        <div class="screenshot-column">
          <div class="screenshot-meta">
            <strong class="screenshot-title">🖥 Desktop Viewport</strong>
            <span class="screenshot-dim">1280 × 800</span>
          </div>
          <div class="screenshot-preview-box">
            ${hasDesktop ? `
              <a href="/evidence/site_checks/${record.id}/desktop_screenshot.png" target="_blank" rel="noopener noreferrer" class="screenshot-anchor" title="Click to view full size desktop screenshot">
                <img src="/evidence/site_checks/${record.id}/desktop_screenshot.png" alt="Desktop screenshot for ${escapeHtml(record.title || record.requestedUrl)}" loading="lazy" class="screenshot-image desktop-img" />
              </a>
              <div class="screenshot-footer">
                <a href="/evidence/site_checks/${record.id}/desktop_screenshot.png" target="_blank" rel="noopener noreferrer" class="link-artifact">
                  Open full resolution (1280×800) ↗
                </a>
              </div>
            ` : `
              <div class="screenshot-unavailable">
                <span class="badge badge-uncertain">⚠ Desktop Screenshot: uncertain</span>
              </div>
            `}
          </div>
        </div>

        <!-- Mobile Screenshot Column -->
        <div class="screenshot-column">
          <div class="screenshot-meta">
            <strong class="screenshot-title">📱 Mobile Viewport</strong>
            <span class="screenshot-dim">390 × 844</span>
          </div>
          <div class="screenshot-preview-box mobile-box">
            ${hasMobile ? `
              <a href="/evidence/site_checks/${record.id}/mobile_screenshot.png" target="_blank" rel="noopener noreferrer" class="screenshot-anchor" title="Click to view full size mobile screenshot">
                <img src="/evidence/site_checks/${record.id}/mobile_screenshot.png" alt="Mobile screenshot for ${escapeHtml(record.title || record.requestedUrl)}" loading="lazy" class="screenshot-image mobile-img" />
              </a>
              <div class="screenshot-footer">
                <a href="/evidence/site_checks/${record.id}/mobile_screenshot.png" target="_blank" rel="noopener noreferrer" class="link-artifact">
                  Open full resolution (390×844) ↗
                </a>
              </div>
            ` : `
              <div class="screenshot-unavailable">
                <span class="badge badge-uncertain">⚠ Mobile Screenshot: uncertain</span>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>

    <!-- 6. PROPOSED TESTS CARD -->
    <div class="result-card card-proposed-tests">
      <div class="result-card-header">
        <h3 class="result-card-title">
          <span class="card-icon" aria-hidden="true">🧪</span> Proposed Tests
        </h3>
        <span class="badge badge-warn">Human Approval Required</span>
      </div>
      <p class="section-desc">
        Automated visitor flows generated with LLM using synthetic data only. Form submissions require the permission checkbox.
      </p>

      <div class="proposals-list">
        ${proposals.length === 0 ? `
          <p class="elements-empty">No proposed tests generated for this check.</p>
        ` : proposals.map(prop => renderProposalCard(record.id, prop)).join('')}
      </div>
    </div>
  </div>
  `;
}

function renderProposalCard(checkId: string, prop: SiteCheckProposal): string {
  const isForm = prop.isFormSubmission;
  const isPassed = prop.status === 'PASSED';
  const isFailed = prop.status === 'FAILED';
  const isRunning = prop.status === 'RUNNING';

  const statusBadge = isPassed
    ? '<span class="badge badge-pass">✓ PASSED</span>'
    : (isFailed
      ? '<span class="badge badge-fail">✖ FAILED</span>'
      : (isRunning
        ? '<span class="badge badge-warn">⏳ Running...</span>'
        : '<span class="badge badge-uncertain">Proposed</span>'));

  return `
  <div id="prop_box_${prop.id}" class="proposal-card ${isPassed ? 'proposal-passed' : (isFailed ? 'proposal-failed' : '')}">
    <div class="proposal-header">
      <div class="proposal-title-block">
        <div class="proposal-title-row">
          <strong class="proposal-title">${escapeHtml(prop.title)}</strong>
          ${statusBadge}
          <span class="badge ${isForm ? 'badge-warn' : 'badge-info'}">
            ${isForm ? '📝 Form Submission' : '👁 Read-Only'}
          </span>
        </div>
        <p class="proposal-desc">${escapeHtml(prop.description)}</p>
      </div>
      <div class="proposal-actions">
        ${!isPassed && !isFailed ? `
          <button type="button" class="btn btn-primary btn-sm btn-approve-prop" onclick="window.approveSiteProposal('${checkId}', '${prop.id}', ${isForm})">
            ✓ Approve &amp; Run Test
          </button>
        ` : `
          <button type="button" class="btn btn-secondary btn-sm btn-approve-prop" onclick="window.approveSiteProposal('${checkId}', '${prop.id}', ${isForm})">
            ⚡ Re-run Test
          </button>
        `}
      </div>
    </div>

    <!-- Execution result details if run -->
    ${prop.executionResult ? `
      <div class="proposal-result-bar">
        <div class="result-status-text">
          <strong>Status:</strong> ${prop.executionResult.status} (${prop.executionResult.durationMs}ms)
          ${prop.executionResult.error ? `<span class="result-err">✖ ${escapeHtml(prop.executionResult.error)}</span>` : '<span class="result-ok">✓ All assertions passed</span>'}
        </div>
        <div class="result-evidence-links">
          <a class="btn btn-secondary btn-xs" href="/evidence/site_checks/${checkId}/proposals/${prop.id}_screenshot.png" target="_blank" rel="noopener noreferrer">📷 Screenshot</a>
          <a class="btn btn-secondary btn-xs" href="/evidence/site_checks/${checkId}/proposals/${prop.id}_trace.zip" target="_blank" rel="noopener noreferrer">🔍 Trace</a>
        </div>
      </div>
    ` : ''}

    <!-- Collapsible Spec Code Preview -->
    <details class="proposal-code-details">
      <summary class="proposal-code-summary">View Playwright Spec Draft (.spec.ts)</summary>
      <pre class="code-preview" tabindex="0" role="region" aria-label="Spec code preview"><code>${escapeHtml(prop.specCode)}</code></pre>
    </details>
  </div>
  `;
}
