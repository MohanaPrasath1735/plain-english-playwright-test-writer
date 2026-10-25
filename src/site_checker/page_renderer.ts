import { SiteCheckRecord } from './store.js';
import { renderSiteCheckCard, escapeHtml } from './html_renderer.js';

export function renderTopNavBar(activePage: 'test-writer' | 'site-check'): string {
  return `
  <nav class="top-nav-bar" id="globalTopNav" aria-label="Platform Navigation">
    <div class="top-nav-container">
      <div class="nav-brand">
        <span class="nav-brand-dot" aria-hidden="true"></span>
        <span class="nav-brand-text">Agentic Playwright Platform</span>
      </div>
      <div class="nav-right-cluster">
        <div class="nav-links">
          <a href="/" id="navLinkTestWriter" class="nav-link ${activePage === 'test-writer' ? 'active' : ''}">
            <span class="nav-icon" aria-hidden="true">✍</span>
            <span>Test Writer</span>
          </a>
          <a href="/site-check" id="navLinkSiteCheck" class="nav-link ${activePage === 'site-check' ? 'active' : ''}">
            <span class="nav-icon" aria-hidden="true">🌐</span>
            <span>Site Check</span>
          </a>
        </div>
        <button id="themeToggleBtn" type="button" class="theme-toggle-btn" aria-label="Switch between light and dark theme" title="Toggle theme">
          <span id="themeToggleIcon" class="theme-toggle-icon" aria-hidden="true">${activePage === 'site-check' ? '☀️' : '🌙'}</span>
          <span id="themeToggleLabel" class="theme-toggle-label">${activePage === 'site-check' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </div>
  </nav>

  <script>
    (function() {
      var isSiteCheck = window.location.pathname.startsWith('/site-check');
      var storageKey = isSiteCheck ? 'agent_theme_site_check' : 'agent_theme_test_writer';
      var defaultTheme = isSiteCheck ? 'light' : 'dark';
      var currentTheme = localStorage.getItem(storageKey) || defaultTheme;

      function syncToggleUI(theme) {
        var icon = document.getElementById('themeToggleIcon');
        var label = document.getElementById('themeToggleLabel');
        var btn = document.getElementById('themeToggleBtn');
        if (!btn) return;
        if (theme === 'dark') {
          if (icon) icon.innerText = '🌙';
          if (label) label.innerText = 'Dark mode';
          btn.setAttribute('aria-label', 'Switch to light mode');
        } else {
          if (icon) icon.innerText = '☀️';
          if (label) label.innerText = 'Light mode';
          btn.setAttribute('aria-label', 'Switch to dark mode');
        }
      }

      function initTheme() {
        document.documentElement.setAttribute('data-theme', currentTheme);
        syncToggleUI(currentTheme);

        var btn = document.getElementById('themeToggleBtn');
        if (btn && !btn._themeAttached) {
          btn._themeAttached = true;
          btn.addEventListener('click', function() {
            var active = document.documentElement.getAttribute('data-theme') || defaultTheme;
            var next = active === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(storageKey, next);
            syncToggleUI(next);
          });
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
      } else {
        initTheme();
      }
    })();
  </script>
  `;
}

export function renderSiteCheckPageHtml(records: SiteCheckRecord[]): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site Check - Agent Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  
  <script>
    // Set theme immediately to avoid flash of wrong theme
    (function() {
      var saved = localStorage.getItem('agent_theme_site_check') || 'light';
      document.documentElement.setAttribute('data-theme', saved);
    })();
  </script>

  <style>
    /* CSS Variables: LIGHT THEME (Default) */
    :root, [data-theme="light"] {
      --bg: #f8fafc;
      --bg-elevated: #f1f5f9;
      --card-bg: #ffffff;
      --card-border: #e2e8f0;
      --border: #e2e8f0;
      --border-subtle: #edf2f7;
      --text: #0f172a;
      --text-muted: #475569;
      --text-subtle: #475569;
      --accent: #0f766e; /* Calm Teal 700: 5.5:1 contrast on white */
      --accent-hover: #115e59; /* Teal 800 */
      --accent-contrast: #ffffff;
      --accent-dim: #ccfbf1; /* Teal 100 */
      --accent-glow: transparent;
      --shadow: 0 1px 3px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.03);
      --shadow-hover: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -1px rgba(15, 23, 42, 0.04);
      --input-bg: #ffffff;
      --input-border: #cbd5e1;
      --input-border-focus: #0f766e;
      --code-bg: #f8fafc;
      --code-border: #e2e8f0;
      --code-text: #0f172a;
      --badge-pass-bg: #dcfce7;
      --badge-pass-text: #15803d;
      --badge-pass-border: #86efac;
      --badge-fail-bg: #fee2e2;
      --badge-fail-text: #b91c1c;
      --badge-fail-border: #fca5a5;
      --badge-warn-bg: #fef3c7;
      --badge-warn-text: #b45309;
      --badge-warn-border: #fde68a;
      --badge-info-bg: #e0f2fe;
      --badge-info-text: #0369a1;
      --badge-info-border: #bae6fd;
      --badge-uncertain-bg: #fef3c7;
      --badge-uncertain-text: #b45309;
      --badge-uncertain-border: #fde68a;
      --badge-rejected-bg: #ffe4e6;
      --badge-rejected-text: #9f1239;
      --badge-rejected-border: #fecdd3;
      --badge-human-bg: #e0e7ff;
      --badge-human-text: #3730a3;
      --badge-human-border: #c7d2fe;
      --display: 'Space Grotesk', sans-serif;
      --body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, monospace;
    }

    /* CSS Variables: DARK THEME */
    [data-theme="dark"] {
      --bg: #0a0d14;
      --bg-elevated: #111722;
      --card-bg: #151d2a;
      --card-border: #233144;
      --border: #233144;
      --border-subtle: #1c2738;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-subtle: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --accent-contrast: #0b1120;
      --accent-dim: rgba(56, 189, 248, 0.14);
      --accent-glow: rgba(56, 189, 248, 0.28);
      --shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      --shadow-hover: 0 12px 30px rgba(0, 0, 0, 0.45);
      --input-bg: #0d131d;
      --input-border: #334155;
      --input-border-focus: #38bdf8;
      --code-bg: #080c14;
      --code-border: #1e293b;
      --code-text: #e2e8f0;
      --badge-pass-bg: rgba(34, 197, 94, 0.16);
      --badge-pass-text: #4ade80;
      --badge-pass-border: rgba(34, 197, 94, 0.35);
      --badge-fail-bg: rgba(239, 68, 68, 0.16);
      --badge-fail-text: #f87171;
      --badge-fail-border: rgba(239, 68, 68, 0.35);
      --badge-warn-bg: rgba(245, 158, 11, 0.16);
      --badge-warn-text: #fbbf24;
      --badge-warn-border: rgba(245, 158, 11, 0.35);
      --badge-info-bg: rgba(56, 189, 248, 0.16);
      --badge-info-text: #38bdf8;
      --badge-info-border: rgba(56, 189, 248, 0.35);
      --badge-uncertain-bg: rgba(168, 85, 247, 0.16);
      --badge-uncertain-text: #c084fc;
      --badge-uncertain-border: rgba(168, 85, 247, 0.35);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html {
      overflow-x: hidden;
      font-size: 16px;
      scroll-behavior: smooth;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--body);
      font-size: 16px;
      line-height: 1.6;
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px 22px 64px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    h1, h2, h3, h4 {
      font-family: var(--display);
      letter-spacing: -0.02em;
      color: var(--text);
    }

    /* Accessibility Focus Outlines */
    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    /* Top Navigation Bar */
    .top-nav-bar {
      margin-bottom: 24px;
      padding: 12px 20px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--shadow);
      transition: all 0.25s ease;
    }
    .top-nav-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
    }
    .nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--display);
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.01em;
    }
    .nav-brand-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent-glow);
    }
    .nav-right-cluster {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nav-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      color: var(--text-muted);
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }
    .nav-link:hover {
      color: var(--accent);
      background: var(--accent-dim);
    }
    .nav-link.active {
      color: var(--accent);
      background: var(--accent-dim);
      border-color: var(--accent);
      font-weight: 700;
    }

    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      border-radius: 10px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .theme-toggle-btn:hover {
      background: var(--card-bg);
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Hero Header */
    .hero-header {
      margin-bottom: 24px;
      padding: 28px 30px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      transition: all 0.25s ease;
    }
    .hero-badge-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .hero-sub-badge {
      background: var(--bg-elevated);
      color: var(--text-muted);
      border: 1px solid var(--border);
      font-weight: 700;
      font-size: 13px;
      padding: 4px 12px;
      border-radius: 999px;
    }
    .hero-title {
      font-size: 34px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .hero-subtitle {
      font-size: 17px;
      color: var(--text-muted);
      max-width: 980px;
      line-height: 1.5;
    }
    .safety-rules-details {
      margin-top: 16px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
      color: var(--text-muted);
    }
    .safety-rules-summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
    }
    .safety-hint {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-subtle);
      margin-left: 4px;
    }
    .safety-rules-content {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 6px;
      line-height: 1.5;
    }
    .safety-rules-content strong {
      color: var(--text);
    }

    /* URL Input Hero Form Panel */
    .hero-input-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 26px 30px;
      margin-bottom: 24px;
      box-shadow: var(--shadow);
      transition: all 0.25s ease;
    }
    .input-header-row {
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-subtitle {
      font-size: 15px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .hero-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .url-input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .input-label {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .input-with-button {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .large-url-input {
      flex: 1;
      min-width: 320px;
      background: var(--input-bg);
      border: 1.5px solid var(--input-border);
      border-radius: 10px;
      padding: 13px 18px;
      color: var(--text);
      font-family: inherit;
      font-size: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .large-url-input:focus {
      border-color: var(--input-border-focus);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    .check-site-btn {
      font-weight: 800;
      font-size: 16px;
      padding: 13px 28px;
      border-radius: 10px;
    }
    .permission-checkbox-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
    }
    .permission-checkbox {
      width: 19px;
      height: 19px;
      cursor: pointer;
      accent-color: var(--accent);
    }
    .permission-label {
      font-size: 15px;
      color: var(--text);
      cursor: pointer;
      user-select: none;
      line-height: 1.4;
    }

    /* Badges (Colour AND Text) */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    .badge-sm {
      font-size: 11.5px;
      padding: 2px 8px;
    }
    .badge-pass {
      background: var(--badge-pass-bg);
      color: var(--badge-pass-text);
      border: 1px solid var(--badge-pass-border);
    }
    .badge-fail {
      background: var(--badge-fail-bg);
      color: var(--badge-fail-text);
      border: 1px solid var(--badge-fail-border);
    }
    .badge-warn {
      background: var(--badge-warn-bg);
      color: var(--badge-warn-text);
      border: 1px solid var(--badge-warn-border);
    }
    .badge-info {
      background: var(--badge-info-bg);
      color: var(--badge-info-text);
      border: 1px solid var(--badge-info-border);
    }
    .badge-uncertain {
      background: var(--badge-uncertain-bg);
      color: var(--badge-uncertain-text);
      border: 1px solid var(--badge-uncertain-border);
    }

    /* axe-core Severity Badges with High Contrast */
    .badge-severity-critical {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #f87171;
    }
    .badge-severity-serious {
      background: #ffedd5;
      color: #9a3412;
      border: 1px solid #fb923c;
    }
    .badge-severity-moderate {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
    }
    .badge-severity-minor {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #7dd3fc;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      font-family: inherit;
      border: 1px solid transparent;
      line-height: 1.3;
    }
    .btn-primary {
      background: var(--accent);
      color: var(--accent-contrast);
      border-color: var(--accent);
      box-shadow: 0 2px 8px var(--accent-glow);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
      color: #ffffff;
    }
    .btn-secondary {
      background: var(--bg-elevated);
      color: var(--text);
      border-color: var(--border);
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--card-bg);
      border-color: var(--accent);
      color: var(--accent);
    }
    .btn-delete-check {
      background: var(--badge-fail-bg);
      color: var(--badge-fail-text);
      border-color: var(--badge-fail-border);
      font-size: 12.5px;
      font-weight: 700;
      padding: 5px 12px;
    }
    .btn-delete-check:hover:not(:disabled) {
      background: #dc2626;
      color: #ffffff;
      border-color: #dc2626;
    }
    .btn-sm {
      padding: 6px 14px;
      font-size: 13px;
    }
    .btn-xs {
      padding: 4px 10px;
      font-size: 12px;
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    /* Live Progress Panel */
    .live-progress-panel {
      margin-bottom: 28px;
      padding: 24px 26px;
      background: var(--card-bg);
      border: 1.5px solid var(--accent);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }
    .live-progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .live-progress-title-block {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .live-progress-timer {
      font-family: var(--mono);
      font-size: 14px;
      color: var(--accent);
      font-weight: 700;
      background: var(--accent-dim);
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid var(--accent);
    }
    .live-current-msg {
      font-size: 15px;
      color: var(--text);
      margin-bottom: 16px;
      padding: 10px 14px;
      background: var(--bg-elevated);
      border-radius: 8px;
      border-left: 4px solid var(--accent);
    }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 10px;
    }
    .step-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      transition: all 0.2s ease;
    }
    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .step-title {
      font-size: 12.5px;
      color: var(--text-muted);
    }

    /* RESULTS SUITE: 6 CARDS STACK */
    .site-check-result-group {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-bottom: 36px;
    }
    .result-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 22px 26px;
      box-shadow: var(--shadow);
      transition: all 0.25s ease;
    }
    .result-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .card-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .result-card-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-icon {
      font-size: 19px;
    }

    /* Card 1: Summary Details */
    .summary-details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .summary-item {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .summary-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .summary-value {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      word-break: break-all;
    }
    .link-url {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .link-url:hover {
      color: var(--accent-hover);
    }
    .redirect-arrow {
      color: var(--text-muted);
      font-weight: 700;
      margin-right: 4px;
    }

    /* Card 2: Forms and Buttons */
    .elements-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
    }
    .elements-column {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .elements-column-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .elements-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 240px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .element-item {
      font-size: 13.5px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 7px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .element-text {
      font-weight: 700;
      color: var(--text);
    }
    .element-desc {
      font-size: 12px;
      color: var(--text-muted);
    }
    .element-selector {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--accent);
      word-break: break-all;
    }
    .elements-empty {
      font-size: 14px;
      color: var(--text-muted);
      font-style: italic;
      padding: 6px 0;
    }

    /* Card 3: Links and Crawl */
    .broken-links-highlight {
      background: var(--badge-fail-bg);
      border: 1.5px solid var(--badge-fail-border);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 16px;
    }
    .broken-links-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .broken-links-title {
      color: var(--badge-fail-text);
      font-size: 15px;
    }
    .broken-links-table {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .broken-link-row {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--card-bg);
      border: 1px solid var(--badge-fail-border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      flex-wrap: wrap;
    }
    .broken-link-url {
      color: var(--badge-fail-text);
      font-weight: 600;
      word-break: break-all;
    }
    .broken-link-err {
      color: var(--text-muted);
      font-size: 13px;
      margin-left: auto;
    }
    .all-links-ok-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--badge-pass-bg);
      border: 1px solid var(--badge-pass-border);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .all-links-text {
      color: var(--badge-pass-text);
      font-size: 15px;
      font-weight: 600;
    }
    .crawl-breakdown-details {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
    }
    .crawl-breakdown-summary {
      font-weight: 700;
      color: var(--accent);
      cursor: pointer;
      user-select: none;
    }
    .crawl-breakdown-content {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }
    .subheading {
      font-size: 13px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .crawled-pages-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .crawled-page-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 12px;
      font-family: var(--mono);
      font-size: 13px;
      gap: 8px;
    }
    .crawled-url {
      color: var(--text);
      word-break: break-all;
    }
    .discovered-links-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 180px;
      overflow-y: auto;
    }
    .discovered-link-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 13px;
      gap: 8px;
    }
    .link-label {
      font-weight: 600;
      color: var(--text);
    }

    /* Card 4: Accessibility */
    .a11y-passed-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--badge-pass-bg);
      border: 1px solid var(--badge-pass-border);
      border-radius: 10px;
      padding: 12px 18px;
    }
    .a11y-passed-text {
      color: var(--badge-pass-text);
      font-weight: 600;
      font-size: 15px;
    }
    .a11y-violations-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .violation-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
    }
    .violation-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .violation-id-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .violation-id {
      font-family: var(--mono);
      font-size: 14.5px;
      color: var(--text);
    }
    .violation-nodes-count {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .violation-desc {
      font-size: 14.5px;
      color: var(--text);
      line-height: 1.5;
      margin-bottom: 6px;
    }
    .violation-help {
      font-size: 13.5px;
      color: var(--text-muted);
      line-height: 1.4;
      margin-bottom: 8px;
    }
    .link-wcag-rule {
      color: var(--accent);
      font-size: 13.5px;
      font-weight: 600;
      text-decoration: underline;
    }
    .link-wcag-rule:hover {
      color: var(--accent-hover);
    }

    /* Card 5: Screenshots (Desktop & Mobile Side by Side) */
    .screenshots-grid-side-by-side {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      align-items: start;
    }
    .screenshot-column {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .screenshot-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .screenshot-title {
      font-size: 15px;
      color: var(--text);
    }
    .screenshot-dim {
      font-size: 13px;
      color: var(--text-muted);
      font-family: var(--mono);
      background: var(--bg-elevated);
      padding: 2px 8px;
      border-radius: 6px;
    }
    .screenshot-preview-box {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .screenshot-anchor {
      display: block;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: #000000;
    }
    .screenshot-image {
      width: 100%;
      height: auto;
      max-height: 380px;
      object-fit: contain;
      display: block;
      transition: transform 0.2s ease;
    }
    .screenshot-anchor:hover .screenshot-image {
      transform: scale(1.02);
    }
    .mobile-img {
      max-height: 480px;
      margin: 0 auto;
    }
    .screenshot-footer {
      display: flex;
      justify-content: flex-end;
    }
    .link-artifact {
      color: var(--accent);
      font-size: 13.5px;
      font-weight: 700;
      text-decoration: underline;
    }
    .screenshot-unavailable {
      padding: 30px 20px;
      text-align: center;
    }

    /* Card 6: Proposed Tests */
    .section-desc {
      font-size: 14.5px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .proposals-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .proposal-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 18px;
      transition: all 0.2s ease;
    }
    .proposal-passed {
      border-color: #86efac;
    }
    .proposal-failed {
      border-color: #fca5a5;
    }
    .proposal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .proposal-title-block {
      flex: 1;
      min-width: 260px;
    }
    .proposal-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .proposal-title {
      font-size: 16px;
      color: var(--text);
    }
    .proposal-desc {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.45;
    }
    .proposal-result-bar {
      margin-top: 10px;
      padding: 10px 14px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 13.5px;
    }
    .result-status-text {
      color: var(--text);
    }
    .result-err {
      color: var(--badge-fail-text);
      font-weight: 700;
      margin-left: 8px;
    }
    .result-ok {
      color: var(--badge-pass-text);
      font-weight: 700;
      margin-left: 8px;
    }
    .result-evidence-links {
      display: flex;
      gap: 8px;
    }
    .proposal-code-details {
      margin-top: 10px;
    }
    .proposal-code-summary {
      font-size: 13.5px;
      color: var(--accent);
      cursor: pointer;
      font-weight: 600;
      user-select: none;
    }
    .code-preview {
      font-family: var(--mono);
      font-size: 12px;
      background: var(--code-bg);
      border: 1px solid var(--code-border);
      border-radius: 8px;
      padding: 10px 14px;
      overflow-x: auto;
      color: var(--code-text);
      white-space: pre;
      margin-top: 8px;
      max-height: 180px;
    }

    /* Alerts and Banners */
    .banner-error {
      background: var(--badge-fail-bg);
      border: 1px solid var(--badge-fail-border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 14.5px;
      color: var(--badge-fail-text);
    }
    .alert-uncertain {
      margin-top: 14px;
      background: var(--badge-uncertain-bg);
      border: 1px solid var(--badge-uncertain-border);
      border-radius: 8px;
      padding: 12px 16px;
    }
    .alert-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 700;
      color: var(--badge-uncertain-text);
    }
    .alert-list {
      margin-left: 24px;
      font-size: 13.5px;
      color: var(--badge-uncertain-text);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Past History Section */
    .history-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .history-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .history-title {
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
    }
    .clear-confirm-banner {
      background: var(--badge-fail-bg);
      border: 1.5px solid var(--badge-fail-border);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
    }
    .clear-confirm-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
    }
    .clear-confirm-warn {
      color: var(--badge-fail-text);
      font-size: 15px;
      font-weight: 600;
    }
    .clear-confirm-actions {
      display: flex;
      gap: 10px;
    }
    .btn-danger-confirm {
      background: #dc2626;
      color: #ffffff;
      border-color: #dc2626;
      font-weight: 700;
    }
    .btn-danger-confirm:hover {
      background: #b91c1c;
    }
    .no-history-box {
      padding: 40px;
      text-align: center;
      color: var(--text-muted);
      background: var(--card-bg);
      border: 1.5px dashed var(--border);
      border-radius: 14px;
      font-size: 16px;
      font-weight: 600;
    }

    /* Light Mode Overrides for Site Check */

    [data-theme="light"] .nav-brand-dot {
      box-shadow: none;
    }
    [data-theme="light"] .hero-sub-badge {
      background: #f1f5f9;
      color: #475569;
      border-color: #cbd5e1;
    }
    [data-theme="light"] .badge-severity-critical {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fca5a5;
    }
    [data-theme="light"] .badge-severity-serious {
      background: #ffedd5;
      color: #c2410c;
      border-color: #fdba74;
    }
    [data-theme="light"] .badge-severity-moderate {
      background: #fef3c7;
      color: #b45309;
      border-color: #fde68a;
    }
    [data-theme="light"] .badge-severity-minor {
      background: #e0f2fe;
      color: #0369a1;
      border-color: #bae6fd;
    }
    [data-theme="light"] .btn-delete-check {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fca5a5;
    }
    [data-theme="light"] .btn-delete-check:hover:not(:disabled) {
      background: #b91c1c;
      color: #ffffff;
      border-color: #b91c1c;
    }
    [data-theme="light"] .clear-confirm-banner {
      background: #fee2e2;
      border-color: #fca5a5;
    }
    [data-theme="light"] .clear-confirm-warn {
      color: #b91c1c;
    }
    [data-theme="light"] .btn-danger-confirm {
      background: #b91c1c;
      border-color: #b91c1c;
    }
    [data-theme="light"] .btn-danger-confirm:hover {
      background: #991b1b;
    }
    [data-theme="light"] .live-progress-panel {
      border-color: var(--accent);
      box-shadow: var(--shadow);
    }
    [data-theme="light"] .live-progress-timer {
      border-color: #99f6e4;
      color: #0f766e;
      background: #ccfbf1;
    }
    [data-theme="light"] .btn-primary {
      box-shadow: none;
    }

    @media (max-width: 768px) {
      body { padding: 16px 14px 48px; }
      .hero-title { font-size: 26px; }
      .hero-header { padding: 20px; }
      .hero-input-card { padding: 18px 20px; }
      .input-with-button { flex-direction: column; align-items: stretch; }
      .check-site-btn { width: 100%; min-height: 44px; }
      .result-card { padding: 18px; }
    }
    @media (max-width: 640px) {
      .btn, .btn-action, .btn-delete-check, .btn-clear-history, .btn-clear-confirm, .btn-clear-cancel {
        min-height: 40px;
        padding: 9px 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .permission-checkbox-row {
        min-height: 48px;
        padding: 12px 14px;
      }
      .permission-checkbox {
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        cursor: pointer;
      }
    }
  </style>
</head>
<body>
  <!-- Top Navigation Bar -->
  ${renderTopNavBar('site-check')}

  <main id="mainContent">
    <!-- Hero Header -->
    <header class="hero-header" role="banner">
      <div class="hero-badge-row">
        <span class="hero-sub-badge">Public Deployed Website Auditor</span>
      </div>
      <h1 class="hero-title">Site Check</h1>
      <p class="hero-subtitle">
        Automated Playwright audit for deployed public websites: accessibility, broken links, elements, and responsive screenshots.
      </p>

      <details class="safety-rules-details">
        <summary class="safety-rules-summary">
          <span aria-hidden="true">🛡️</span>
          <strong>Enforced Safety Rules &amp; Crawl Boundaries</strong>
          <span class="safety-hint">(SSRF protection, domain limits, read-only audit, permission constraints)</span>
        </summary>
        <div class="safety-rules-content">
          <div>• <strong>SSRF Guard:</strong> Accepts only <code>http://</code> and <code>https://</code>. Resolves hostname via DNS and strictly blocks loopback, link-local, private IP ranges (RFC 1918), and redirects to them. (Configured demo app APP_BASE_URL is allowlisted).</div>
          <div>• <strong>Crawl Boundaries:</strong> Same domain only, max 5 pages, max 20 links, 90-second timeout, 1-second delay between requests, and rate-limited. Respects <code>robots.txt</code> (shows <em>"skipped: disallowed by robots.txt"</em>).</div>
          <div>• <strong>Read-Only Inspection:</strong> Loads pages, inspects DOM, checks links, and takes screenshots. Never submits forms, signs up, or logs into another site during audit.</div>
          <div>• <strong>Form Submission Testing:</strong> Executing any proposed test that submits a form strictly requires checking <em>"I own this site or have permission to test it"</em>.</div>
          <div>• <strong>Bot Protection:</strong> Never bypasses CAPTCHA, OTP, or Cloudflare/bot challenges. If detected, halts and reports <em>"Blocked or manual step required"</em>.</div>
        </div>
      </details>
    </header>

    <!-- URL Input Form Panel -->
    <section class="hero-input-card" id="siteCheckInputPanel" aria-labelledby="inputSectionTitle">
      <div class="input-header-row">
        <h2 id="inputSectionTitle" class="section-title">
          <span aria-hidden="true">🔍</span> Enter Target Website
        </h2>
        <p class="section-subtitle">
          Type or paste any deployed public website URL.
        </p>
      </div>

      <form onsubmit="event.preventDefault(); window.runSiteCheck();" class="hero-form">
        <div class="url-input-group">
          <label for="siteCheckUrlInput" class="input-label">
            Website URL (http:// or https://):
          </label>
          <div class="input-with-button">
            <input
              id="siteCheckUrlInput"
              type="url"
              value=""
              placeholder="Paste a website URL"
              class="large-url-input"
              aria-required="true"
            />
            <button id="siteCheckBtn" type="submit" class="btn btn-primary check-site-btn">
              <span>🌐</span> Check site
            </button>
          </div>
        </div>

        <div class="permission-checkbox-row">
          <input type="checkbox" id="sitePermissionCheckbox" class="permission-checkbox" />
          <label for="sitePermissionCheckbox" class="permission-label">
            <strong>I own this site or have permission to test it</strong> (strictly required to execute any proposal that submits forms)
          </label>
        </div>
      </form>

      <div id="siteCheckFeedback" aria-live="polite" style="margin-top: 12px;"></div>
    </section>

    <!-- LIVE PROGRESS PANEL -->
    <section id="siteCheckLiveProgress" class="live-progress-panel" style="display: none;" aria-live="polite">
      <div class="live-progress-header">
        <div class="live-progress-title-block">
          <span id="liveProgressBadge" class="badge badge-warn">⏳ Audit in Progress</span>
          <strong style="font-size: 16px; color: var(--text);">Live Site Inspection</strong>
        </div>
        <div class="live-progress-timer">
          ⏱️ Elapsed: <span id="siteCheckElapsedTime">0.0s</span>
        </div>
      </div>

      <div id="siteCheckCurrentMsg" class="live-current-msg">
        Initializing automated inspection...
      </div>

      <div class="steps-grid">
        <div id="scStep_ssrf" class="step-card">
          <div class="step-header">
            <strong class="step-title">1. SSRF Safety</strong>
            <span id="scBadge_ssrf" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_robots" class="step-card">
          <div class="step-header">
            <strong class="step-title">2. robots.txt</strong>
            <span id="scBadge_robots" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_desktop" class="step-card">
          <div class="step-header">
            <strong class="step-title">3. Desktop Load</strong>
            <span id="scBadge_desktop" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_barrier" class="step-card">
          <div class="step-header">
            <strong class="step-title">4. Bot Barrier</strong>
            <span id="scBadge_barrier" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_elements" class="step-card">
          <div class="step-header">
            <strong class="step-title">5. Elements</strong>
            <span id="scBadge_elements" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_a11y" class="step-card">
          <div class="step-header">
            <strong class="step-title">6. axe-core</strong>
            <span id="scBadge_a11y" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_mobile" class="step-card">
          <div class="step-header">
            <strong class="step-title">7. Mobile View</strong>
            <span id="scBadge_mobile" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_links" class="step-card">
          <div class="step-header">
            <strong class="step-title">8. Broken Links</strong>
            <span id="scBadge_links" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_crawl" class="step-card">
          <div class="step-header">
            <strong class="step-title">9. Crawl</strong>
            <span id="scBadge_crawl" class="badge badge-sm">Queued</span>
          </div>
        </div>
        <div id="scStep_proposals" class="step-card">
          <div class="step-header">
            <strong class="step-title">10. Proposals</strong>
            <span id="scBadge_proposals" class="badge badge-sm">Queued</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ACTIVE RESULT CONTAINER (Inserted dynamically on check completion) -->
    <section id="activeSiteCheckContainer" aria-label="Latest site check results"></section>

    <!-- PAST SITE CHECKS HISTORY SECTION -->
    <section id="siteChecksHistorySection" style="margin-top: 32px;" aria-labelledby="historyHeading">
      <div class="history-header-row">
        <div class="history-title-group">
          <h2 id="historyHeading" class="history-title">📜 Past Site Checks History</h2>
          <span id="historyCountBadge" class="badge badge-pass">${records.length} check${records.length === 1 ? '' : 's'}</span>
        </div>
        <div>
          <button id="clearAllHistoryBtn" class="btn btn-delete-check" onclick="window.promptClearAllHistory()" style="display: ${records.length === 0 ? 'none' : 'inline-flex'};">
            🗑 Clear all history
          </button>
        </div>
      </div>

      <!-- Confirmation Banner for Clear All History -->
      <div id="clearAllConfirmBanner" class="clear-confirm-banner" style="display: none;" role="alert">
        <div class="clear-confirm-content">
          <div>
            <strong style="color: #991b1b; font-size: 15px;">⚠ Permanent Action:</strong>
            <span id="clearAllConfirmText" class="clear-confirm-warn" style="margin-left: 6px;">
              This permanently deletes ${records.length} site checks and their screenshots. This cannot be undone.
            </span>
          </div>
          <div class="clear-confirm-actions">
            <button id="cancelClearAllBtn" class="btn btn-secondary btn-sm" onclick="window.cancelClearAllHistory()">
              Cancel
            </button>
            <button id="confirmClearAllBtn" class="btn btn-danger-confirm btn-sm" onclick="window.executeClearAllHistory()">
              Delete
            </button>
          </div>
        </div>
      </div>

      <div id="historyActionFeedback" aria-live="polite" style="margin-bottom: 16px;"></div>

      <div id="siteChecksHistoryContainer">
        ${records.length === 0 ? `
          <div id="noHistoryPlaceholder" class="no-history-box">
            No site checks yet
          </div>
        ` : records.map(r => renderSiteCheckCard(r)).join('')}
      </div>
    </section>
  </main>

  <!-- Client JavaScript for Site Check Page -->
  <script>
    var isChecking = false;
    var timerInterval = null;
    var startTime = 0;

    var stepElements = ['ssrf', 'robots', 'desktop', 'barrier', 'elements', 'a11y', 'mobile', 'links', 'crawl', 'proposals'];

    function resetStepUI() {
      for (var i = 0; i < stepElements.length; i++) {
        var s = stepElements[i];
        var card = document.getElementById('scStep_' + s);
        var badge = document.getElementById('scBadge_' + s);
        if (card) { card.style.borderColor = 'var(--border)'; card.style.background = 'var(--bg-elevated)'; }
        if (badge) { badge.className = 'badge badge-sm'; badge.innerText = 'Queued'; }
      }
    }

    function updateStepUI(step, state, msg) {
      var card = document.getElementById('scStep_' + step);
      var badge = document.getElementById('scBadge_' + step);
      var msgEl = document.getElementById('siteCheckCurrentMsg');
      if (msg && msgEl) msgEl.innerText = msg;

      if (state === 'active') {
        if (card) { card.style.borderColor = 'var(--accent)'; card.style.background = 'var(--accent-dim)'; }
        if (badge) { badge.className = 'badge badge-warn badge-sm'; badge.innerText = '⏳ In Progress'; }
      } else if (state === 'done') {
        if (card) { card.style.borderColor = 'var(--badge-pass-border)'; card.style.background = 'var(--badge-pass-bg)'; }
        if (badge) { badge.className = 'badge badge-pass badge-sm'; badge.innerText = '✓ Done'; }
      } else if (state === 'error') {
        if (card) { card.style.borderColor = 'var(--badge-fail-border)'; card.style.background = 'var(--badge-fail-bg)'; }
        if (badge) { badge.className = 'badge badge-fail badge-sm'; badge.innerText = '✖ Error'; }
      }
    }

    function updateHistoryCountAndUI() {
      var cards = document.querySelectorAll('#siteChecksHistoryContainer .site-check-result-group, #siteChecksHistoryContainer .site-check-card');
      var count = cards.length;
      var countBadge = document.getElementById('historyCountBadge');
      if (countBadge) countBadge.innerText = count + ' check' + (count === 1 ? '' : 's');

      var clearBtn = document.getElementById('clearAllHistoryBtn');
      var banner = document.getElementById('clearAllConfirmBanner');
      if (clearBtn) clearBtn.style.display = count === 0 ? 'none' : 'inline-flex';
      if (count === 0 && banner) banner.style.display = 'none';

      var histContainer = document.getElementById('siteChecksHistoryContainer');
      if (count === 0 && histContainer) {
        histContainer.innerHTML = '<div id="noHistoryPlaceholder" class="no-history-box">No site checks yet</div>';
      }
    }

    window.runSiteCheck = async function() {
      if (isChecking) return;
      var urlInput = document.getElementById('siteCheckUrlInput');
      var targetUrl = (urlInput ? urlInput.value : '').trim();
      var feedback = document.getElementById('siteCheckFeedback');
      var btn = document.getElementById('siteCheckBtn');
      var progressPanel = document.getElementById('siteCheckLiveProgress');
      var elapsedEl = document.getElementById('siteCheckElapsedTime');
      var activeContainer = document.getElementById('activeSiteCheckContainer');

      if (!targetUrl) {
        if (feedback) feedback.innerHTML = '<div class="banner-error">⚠ Please enter or paste a valid website URL (http:// or https://).</div>';
        return;
      }

      if (feedback) feedback.innerHTML = '';
      isChecking = true;
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Checking site...';
      }

      resetStepUI();
      if (progressPanel) {
        progressPanel.style.display = 'block';
        progressPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      startTime = Date.now();
      timerInterval = setInterval(function() {
        if (elapsedEl) {
          elapsedEl.innerText = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        }
      }, 100);

      try {
        var response = await fetch('/api/site-check/run-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        });

        if (!response.ok) {
          var errData = await response.json().catch(function() { return { error: 'HTTP ' + response.status }; });
          throw new Error(errData.error || ('Server returned HTTP ' + response.status));
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var buffer = '';
        var lastStep = '';

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;

          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (var j = 0; j < lines.length; j++) {
            var line = lines[j].trim();
            if (!line) continue;
            try {
              var ev = JSON.parse(line);
              if (ev.type === 'progress') {
                if (lastStep && lastStep !== ev.data.step) {
                  updateStepUI(lastStep, 'done');
                }
                lastStep = ev.data.step;
                updateStepUI(ev.data.step, 'active', ev.data.message);
              } else if (ev.type === 'done') {
                if (lastStep) updateStepUI(lastStep, 'done');
                clearInterval(timerInterval);
                if (progressPanel) {
                  var pBadge = document.getElementById('liveProgressBadge');
                  if (pBadge) { pBadge.className = 'badge badge-pass'; pBadge.innerText = '✓ Audit Completed'; }
                }

                if (activeContainer && ev.cardHtml) {
                  activeContainer.innerHTML = '<div style="margin-bottom: 12px; font-size: 15px; font-weight: 700; color: var(--accent);">✓ Latest Audit Result:</div>' + ev.cardHtml;
                  activeContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }

                // Prepend to history container
                var histContainer = document.getElementById('siteChecksHistoryContainer');
                var placeholder = document.getElementById('noHistoryPlaceholder');
                if (placeholder) placeholder.remove();
                if (histContainer && ev.cardHtml) {
                  var tempDiv = document.createElement('div');
                  tempDiv.innerHTML = ev.cardHtml;
                  var newCard = tempDiv.firstElementChild;
                  if (newCard) histContainer.prepend(newCard);
                }

                updateHistoryCountAndUI();

              } else if (ev.type === 'error') {
                throw new Error(ev.error || 'Site check failed');
              }
            } catch (pErr) {
              if (pErr.message && !pErr.message.includes('JSON')) {
                throw pErr;
              }
            }
          }
        }
      } catch (err) {
        clearInterval(timerInterval);
        var errMsg = err.message || String(err);
        if (feedback) {
          feedback.innerHTML = '<div class="banner-error"><strong>✖ Check Failed:</strong> ' + errMsg + '</div>';
        }
        var pBadgeErr = document.getElementById('liveProgressBadge');
        if (pBadgeErr) { pBadgeErr.className = 'badge badge-fail'; pBadgeErr.innerText = '✖ Audit Aborted'; }
        var msgElErr = document.getElementById('siteCheckCurrentMsg');
        if (msgElErr) msgElErr.innerText = 'Halted: ' + errMsg;
      } finally {
        isChecking = false;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🌐</span> Check site';
        }
      }
    };

    window.deleteSiteCheck = async function(checkId) {
      var feedback = document.getElementById('historyActionFeedback');
      if (feedback) feedback.innerHTML = '';

      try {
        var res = await fetch('/api/site-checks/' + encodeURIComponent(checkId), {
          method: 'DELETE'
        });
        var data = await res.json().catch(function() { return { error: 'Invalid response from server' }; });
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to delete site check');
        }

        var cards = document.querySelectorAll('[id="check_card_' + checkId + '"]');
        if (cards && cards.length > 0) {
          cards.forEach(function(c) {
            c.remove();
          });
        }

        var activeContainer = document.getElementById('activeSiteCheckContainer');
        if (activeContainer && activeContainer.innerHTML.includes(checkId)) {
          activeContainer.innerHTML = '';
        }

        updateHistoryCountAndUI();

        if (feedback) {
          feedback.innerHTML = '<div class="a11y-passed-banner" style="margin-bottom: 12px;"><span class="badge badge-pass">✓ Deleted</span><span>Site check ' + checkId + ' permanently deleted from SQLite and disk.</span></div>';
          setTimeout(function() { feedback.innerHTML = ''; }, 4000);
        }
      } catch (err) {
        if (feedback) {
          feedback.innerHTML = '<div class="banner-error"><strong>✖ Deletion Error:</strong> ' + (err.message || String(err)) + '</div>';
        }
      }
    };

    window.promptClearAllHistory = function() {
      var cards = document.querySelectorAll('#siteChecksHistoryContainer .site-check-result-group, #siteChecksHistoryContainer .site-check-card');
      var count = cards.length;
      var banner = document.getElementById('clearAllConfirmBanner');
      var text = document.getElementById('clearAllConfirmText');
      if (text) {
        text.innerText = 'This permanently deletes ' + count + ' site checks and their screenshots. This cannot be undone.';
      }
      if (banner) {
        banner.style.display = 'block';
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    window.cancelClearAllHistory = function() {
      var banner = document.getElementById('clearAllConfirmBanner');
      if (banner) banner.style.display = 'none';
    };

    window.executeClearAllHistory = async function() {
      var banner = document.getElementById('clearAllConfirmBanner');
      var feedback = document.getElementById('historyActionFeedback');
      var confirmBtn = document.getElementById('confirmClearAllBtn');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = 'Deleting...'; }
      if (feedback) feedback.innerHTML = '';

      try {
        var res = await fetch('/api/site-checks', {
          method: 'DELETE'
        });
        var data = await res.json().catch(function() { return { error: 'Invalid response from server' }; });
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to clear site checks history');
        }

        if (banner) banner.style.display = 'none';

        var histContainer = document.getElementById('siteChecksHistoryContainer');
        if (histContainer) histContainer.innerHTML = '';

        var activeContainer = document.getElementById('activeSiteCheckContainer');
        if (activeContainer) activeContainer.innerHTML = '';

        updateHistoryCountAndUI();

        if (feedback) {
          feedback.innerHTML = '<div class="a11y-passed-banner" style="margin-bottom: 12px;"><span class="badge badge-pass">✓ Cleared</span><span>All ' + (data.count || 0) + ' site checks and screenshots permanently removed.</span></div>';
          setTimeout(function() { feedback.innerHTML = ''; }, 4000);
        }
      } catch (err) {
        if (feedback) {
          feedback.innerHTML = '<div class="banner-error"><strong>✖ Clear History Error:</strong> ' + (err.message || String(err)) + '</div>';
        }
      } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = 'Delete'; }
      }
    };

    window.approveSiteProposal = async function(checkId, proposalId, isFormSubmission) {
      var permCheckbox = document.getElementById('sitePermissionCheckbox');
      var isPermitted = permCheckbox ? permCheckbox.checked : false;

      if (isFormSubmission && !isPermitted) {
        alert("Permission required: The checkbox 'I own this site or have permission to test it' must be checked before running form submission tests.");
        return;
      }

      var btn = window.event ? window.event.target : null;
      if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Running test...';
      }

      try {
        var res = await fetch('/api/site-check/approve-proposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkId: checkId,
            proposalId: proposalId,
            permissionChecked: isPermitted,
          })
        });
        var data = await res.json();
        if (data.success) {
          var propBox = document.getElementById('prop_box_' + proposalId);
          if (propBox) {
            propBox.classList.add('proposal-passed');
            var badge = propBox.querySelector('.badge');
            if (badge) { badge.className = 'badge badge-pass'; badge.innerText = '✓ PASSED'; }
          }
          alert('✓ Test executed successfully: Passed in ' + (data.result ? data.result.durationMs : 0) + 'ms');
          window.location.reload();
        } else {
          alert('Execution Error: ' + (data.error || 'Failed to execute proposed test'));
          window.location.reload();
        }
      } catch (err) {
        alert('Network Error during test execution: ' + String(err));
      }
    };
  </script>
</body>
</html>
  `;
}
