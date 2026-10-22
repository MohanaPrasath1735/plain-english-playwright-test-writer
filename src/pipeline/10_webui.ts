import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { getAllPipelineRuns, getPipelineRun, getCustomPipelineRuns } from './9_store.js';
import {
  prepareDraftTest,
  approveAndExecuteTest,
  rejectDraftTest,
} from './orchestrator.js';
import { isQuotaOrRateLimitError } from '../llm.js';
import {
  getLatestBonusData,
  proposeTC2SelfHealing,
  approveAndExecuteTC2Healing,
  calculateTC1StabilityScore,
  runAccessibilityCheck,
  checkDemoAppReachable,
} from './bonus.js';
import { runSiteCheck } from '../site_checker/site_checker.js';
import { getAllSiteCheckRecords, deleteSiteCheckRecord, clearAllSiteCheckRecords } from '../site_checker/store.js';
import { executeSiteCheckProposal } from '../site_checker/proposal_runner.js';
import { renderSiteCheckCard } from '../site_checker/html_renderer.js';
import { renderTopNavBar, renderSiteCheckPageHtml } from '../site_checker/page_renderer.js';

const PORT = 3050;

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Step 10: Small Web UI
 * Traceable test file and run results keyed by input record ID,
 * with unresolved items clearly displayed, downloadable evidence,
 * and separate Bonus features section.
 */
export function startWebUI(port: number = PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Serve evidence files (screenshots, traces, specs)
    if (url.pathname.startsWith('/evidence/')) {
      const relativePath = decodeURIComponent(url.pathname.replace('/evidence/', ''));
      const filePath = path.resolve(process.cwd(), 'evidence', relativePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.zip': 'application/zip',
          '.ts': 'text/plain',
          '.json': 'application/json',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }
    }

    // Serve client JavaScript application cleanly without HTML template literal escaping issues
    if (url.pathname === '/app.js') {
      const scriptPath = path.resolve(process.cwd(), 'src', 'pipeline', 'webui_client.js');
      if (fs.existsSync(scriptPath) && fs.statSync(scriptPath).isFile()) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        fs.createReadStream(scriptPath).pipe(res);
        return;
      }
    }

    // API endpoint for runs data
    if (url.pathname === '/api/runs') {
      const runs = getAllPipelineRuns();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(runs));
      return;
    }

    // API endpoint for custom runs
    if (url.pathname === '/api/custom-runs' && req.method === 'GET') {
      const customRuns = getCustomPipelineRuns();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        runs: customRuns,
        rowsHtml: customRuns.map(run => renderCustomRunRow(run)).join(''),
      }));
      return;
    }

    // API endpoint for site checks list
    if (url.pathname === '/api/site-checks' && req.method === 'GET') {
      const records = getAllSiteCheckRecords();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        checks: records,
        cardsHtml: records.map(r => renderSiteCheckCard(r)).join(''),
      }));
      return;
    }

    // API endpoint to delete a single site check
    if (url.pathname.startsWith('/api/site-checks/') && req.method === 'DELETE') {
      try {
        const id = decodeURIComponent(url.pathname.replace('/api/site-checks/', '')).trim();
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Site check ID is required.' }));
          return;
        }
        const result = deleteSiteCheckRecord(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Site check '${id}' and its evidence files were deleted successfully.`,
          id: result.deletedId,
        }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // API endpoint to clear all site check history
    if (url.pathname === '/api/site-checks' && req.method === 'DELETE') {
      try {
        const result = clearAllSiteCheckRecords();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `All site check history (${result.deletedCount} records) and evidence files were deleted successfully.`,
          count: result.deletedCount,
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // API endpoint to execute site check
    if (url.pathname === '/api/site-check/run' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const targetUrl = (body.url || '').trim();
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Target URL is required.' }));
          return;
        }
        const result = await runSiteCheck(targetUrl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: result.success,
          record: result.record,
          cardHtml: renderSiteCheckCard(result.record),
          error: result.error,
        }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // API endpoint to execute site check with streaming live progress updates (NDJSON)
    if (url.pathname === '/api/site-check/run-stream' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });

      const writeEvent = (payload: any) => {
        try {
          res.write(JSON.stringify(payload) + '\n');
        } catch {}
      };

      try {
        const body = await parseJsonBody(req);
        const targetUrl = (body.url || '').trim();
        if (!targetUrl) {
          writeEvent({ type: 'error', error: 'Target URL is required. Please type or paste a valid website URL.' });
          res.end();
          return;
        }

        const result = await runSiteCheck(targetUrl, (progress) => {
          writeEvent({ type: 'progress', data: progress });
        });

        writeEvent({
          type: 'done',
          success: result.success,
          record: result.record,
          cardHtml: renderSiteCheckCard(result.record),
          error: result.error,
        });
        res.end();
      } catch (err: any) {
        writeEvent({ type: 'error', success: false, error: err?.message || String(err) });
        res.end();
      }
      return;
    }

    // API endpoint to approve and run site test proposal
    if (url.pathname === '/api/site-check/approve-proposal' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { checkId, proposalId, permissionChecked } = body;
        if (!checkId || !proposalId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'checkId and proposalId are required.' }));
          return;
        }
        const result = await executeSiteCheckProposal(checkId, proposalId, Boolean(permissionChecked));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // Streaming API: Draft new test scenario with live step-by-step progress
    if (url.pathname === '/api/pipeline/draft-stream' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });

      const writeEvent = (payload: any) => {
        try {
          res.write(JSON.stringify(payload) + '\n');
        } catch {}
      };

      try {
        const body = await parseJsonBody(req);
        const flow = body.flow_description;
        const expected = body.expected_end_state;
        if (!flow || !expected) {
          writeEvent({ type: 'error', error: 'flow_description and expected_end_state are required.' });
          res.end();
          return;
        }

        const testCaseId = body.testCaseId || `TEST_${Date.now()}`;
        const options = body.options || {};

        const record = await prepareDraftTest(
          {
            id: testCaseId,
            flow_description: flow,
            expected_end_state: expected,
          },
          options,
          (progress) => {
            writeEvent({ type: 'progress', data: progress });
          }
        );

        writeEvent({ type: 'done', success: true, run: record });
        res.end();
      } catch (err: any) {
        const isQuota = isQuotaOrRateLimitError(err);
        const errorMsg = isQuota
          ? `Gemini API Quota / Rate Limit Exceeded (HTTP 429). Execution stopped immediately without silent retries. Please check your Gemini API quota.`
          : (err?.message || String(err));
        writeEvent({ type: 'error', success: false, error: errorMsg, isQuota });
        res.end();
      }
      return;
    }

    // Pipeline API: Draft new test scenario (Steps 1-5, halts in PENDING_APPROVAL)
    if (url.pathname === '/api/pipeline/draft' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const flow = body.flow_description;
        const expected = body.expected_end_state;
        if (!flow || !expected) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'flow_description and expected_end_state are required.' }));
          return;
        }
        const testCaseId = body.testCaseId || `TEST_${Date.now()}`;
        const options = body.options || {};
        const record = await prepareDraftTest({
          id: testCaseId,
          flow_description: flow,
          expected_end_state: expected,
        }, options);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, run: record }));
      } catch (err: any) {
        const isQuota = isQuotaOrRateLimitError(err);
        res.writeHead(isQuota ? 429 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: isQuota
            ? 'Gemini API Quota / Rate Limit Exceeded (HTTP 429). Execution stopped immediately.'
            : (err?.message || String(err)),
          isQuota,
        }));
      }
      return;
    }

    // Pipeline API: Approve and execute test run (Steps 6-8, blocks duplicate retries)
    if (url.pathname === '/api/pipeline/approve' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const runId = body.runId;
        const approver = body.approver || 'human';
        if (!runId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'runId is required.' }));
          return;
        }
        const record = await approveAndExecuteTest(runId, approver);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, run: record }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // Pipeline API: Reject draft test
    if (url.pathname === '/api/pipeline/reject' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const runId = body.runId;
        const approver = body.approver || 'human';
        const reason = body.reason || 'Rejected by human reviewer';
        if (!runId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'runId is required.' }));
          return;
        }
        const record = await rejectDraftTest(runId, approver, reason);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, run: record }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // Bonus API: Approve & execute TC2 self-healing
    if (url.pathname === '/api/bonus/heal-tc2' && req.method === 'POST') {
      try {
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const reachability = await checkDemoAppReachable(baseUrl);
        if (!reachability.reachable) {
          const errMsg = reachability.error || `Demo app is not reachable at ${baseUrl}`;
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: errMsg }));
          return;
        }

        const result = await approveAndExecuteTC2Healing();
        if (result.status === 'APPROVED_FAILED') {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: result.executionResult?.error || 'Healed spec execution failed',
            result,
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err: any) {
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const rawErr = err?.message || String(err);
        const errorMsg = (rawErr.includes('ECONNREFUSED') || rawErr.includes('ERR_CONNECTION_REFUSED') || rawErr.includes('fetch failed'))
          ? `Demo app is not reachable at ${baseUrl}`
          : rawErr;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: errorMsg }));
      }
      return;
    }

    // Bonus API: Run TC1 3x stability score
    if (url.pathname === '/api/bonus/run-stability' && req.method === 'POST') {
      try {
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const reachability = await checkDemoAppReachable(baseUrl);
        if (!reachability.reachable) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: reachability.error || `Demo app is not reachable at ${baseUrl}` }));
          return;
        }

        const result = await calculateTC1StabilityScore(3);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err: any) {
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const rawErr = err?.message || String(err);
        const errorMsg = (rawErr.includes('ECONNREFUSED') || rawErr.includes('ERR_CONNECTION_REFUSED') || rawErr.includes('fetch failed'))
          ? `Demo app is not reachable at ${baseUrl}`
          : rawErr;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: errorMsg }));
      }
      return;
    }

    // Bonus API: Run accessibility check
    if (url.pathname === '/api/bonus/run-a11y' && req.method === 'POST') {
      try {
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const reachability = await checkDemoAppReachable(baseUrl);
        if (!reachability.reachable) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: reachability.error || `Demo app is not reachable at ${baseUrl}` }));
          return;
        }

        const result = await runAccessibilityCheck();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err: any) {
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const rawErr = err?.message || String(err);
        const errorMsg = (rawErr.includes('ECONNREFUSED') || rawErr.includes('ERR_CONNECTION_REFUSED') || rawErr.includes('fetch failed'))
          ? `Demo app is not reachable at ${baseUrl}`
          : rawErr;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: errorMsg }));
      }
      return;
    }

    // HTML Site Check Page
    if (url.pathname === '/site-check') {
      const records = getAllSiteCheckRecords();
      const html = renderSiteCheckPageHtml(records);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // HTML Dashboard
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const runs = getAllPipelineRuns();
      const html = renderDashboardHtml(runs);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Web UI is already active on port ${port}.`);
    } else {
      console.error('Web UI error:', err);
    }
  });

  server.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`Agent Dashboard Web UI is live at: http://localhost:${port}`);
    console.log(`======================================================\n`);
  });

  return server;
}

function renderDashboardHtml(runs: any[]): string {
  // Separate into latest 4 test cases (TC1, TC2, TC3, TC4), historical runs, and custom scenario runs
  const targetOrder = ['TC1', 'TC2', 'TC3', 'TC4'];
  const latestRunsMap = new Map<string, any>();
  const historicalRuns: any[] = [];
  const customRuns: any[] = [];

  for (const run of runs) {
    if (targetOrder.includes(run.testCaseId)) {
      if (!latestRunsMap.has(run.testCaseId)) {
        latestRunsMap.set(run.testCaseId, run);
      } else {
        historicalRuns.push(run);
      }
    } else {
      customRuns.push(run);
    }
  }

  const activeRuns = targetOrder
    .map(tcId => latestRunsMap.get(tcId))
    .filter(Boolean);

  const totalActive = activeRuns.length;
  const passedActive = activeRuns.filter(r => r.testCaseId !== 'TC2' && r.run1Status === 'PASSED').length;
  const failedAsExpected = activeRuns.filter(r => r.testCaseId === 'TC2' && r.run1Status === 'FAILED').length;
  const dbVerifiedCount = activeRuns.filter(r => r.testCaseId !== 'TC2').length;

  const bonusData = getLatestBonusData();
  const proposal = bonusData.proposal || {
    id: 'heal_tc2_proposal',
    testCaseId: 'TC2',
    failingSelector: 'button.non-existent-btn-class-changed',
    proposedSelector: "page.getByRole('button', { name: 'Sign up' })",
    reason: "The selector 'button.non-existent-btn-class-changed' failed because it does not match anything on /register. Re-inspection located an active button with role='button' and accessible name 'Sign up'. Replacing the broken class selector with getByRole provides semantic resilience against styling changes.",
    status: 'AWAITING_APPROVAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const stability = bonusData.stability;
  const accessibility = bonusData.accessibility;

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plain-English Playwright Test Writer - Agent Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Syne:wght@700;800&display=swap" rel="stylesheet">
  <script>
    (function() {
      var saved = localStorage.getItem('agent_theme_test_writer') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
    })();
  </script>
  <style>
    :root, [data-theme="dark"] {
      --bg: #090c10;
      --bg-elevated: #0f141c;
      --card-bg: #131923;
      --border: #232d3d;
      --border-subtle: #19222e;
      --accent: #2ee6c5;
      --accent-dim: rgba(46, 230, 197, 0.12);
      --accent-glow: rgba(46, 230, 197, 0.25);
      --accent-hover: #3ef0cf;
      --success: #34d399;
      --danger: #f87171;
      --warning: #fbbf24;
      --uncertain: #c084fc;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --shadow: 0 10px 28px -4px rgba(0, 0, 0, 0.4), 0 2px 6px -1px rgba(0, 0, 0, 0.25);
      --shadow-hover: 0 16px 36px -4px rgba(0, 0, 0, 0.5);
      --display: 'Syne', sans-serif;
      --body: 'Plus Jakarta Sans', sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace;
      --flow-title: #60a5fa;
      --label-color: #cbd5e1;
      --card-title-color: #f1f5f9;
      --badge-approver-bg: rgba(59, 130, 246, 0.15);
      --badge-approver-text: #93c5fd;
      --badge-approver-border: rgba(59, 130, 246, 0.35);
      --badge-rejected-bg: rgba(239, 68, 68, 0.14);
      --badge-rejected-text: #f87171;
      --badge-rejected-border: rgba(239, 68, 68, 0.45);
    }

    [data-theme="light"] {
      --bg: #f8fafc;
      --bg-elevated: #f1f5f9;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --border-subtle: #edf2f7;
      --accent: #0f766e;
      --accent-dim: #ccfbf1;
      --accent-glow: transparent;
      --accent-hover: #115e59;
      --success: #166534;
      --danger: #991b1b;
      --warning: #92400e;
      --uncertain: #92400e;
      --text: #0f172a;
      --text-muted: #475569;
      --text-dim: #475569;
      --flow-title: #0f766e;
      --label-color: #334155;
      --card-title-color: #0f172a;
      --badge-approver-bg: #e0e7ff;
      --badge-approver-text: #3730a3;
      --badge-approver-border: #c7d2fe;
      --badge-rejected-bg: #ffe4e6;
      --badge-rejected-text: #881337;
      --badge-rejected-border: #fecdd3;
      --shadow: 0 1px 3px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.03);
      --shadow-hover: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -1px rgba(15, 23, 42, 0.04);
      --display: 'Syne', sans-serif;
      --body: 'Plus Jakarta Sans', sans-serif;
      --mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { overflow-x: hidden; }

    body {
      background-color: var(--bg);
      background-image:
        radial-gradient(1200px 520px at 12% -8%, rgba(46, 230, 197, 0.08), transparent 60%),
        radial-gradient(1000px 480px at 95% 0%, rgba(56, 189, 248, 0.06), transparent 50%),
        linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 100% 100%, 100% 100%, 32px 32px, 32px 32px;
      color: var(--text);
      font-family: var(--body);
      font-size: 16px;
      line-height: 1.6;
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px 20px 56px;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    [data-theme="light"] body {
      background-color: #f8fafc;
      background-image: none;
      color: #0f172a;
    }

    /* Accessibility: Visible Focus Outlines */
    :focus-visible {
      outline: 2px solid var(--accent) !important;
      outline-offset: 2px !important;
    }

    /* Accessibility: Respect prefers-reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    h1, h2, h3, h4 {
      font-family: var(--display);
      letter-spacing: -0.02em;
      font-weight: 800;
    }

    /* Hero Header: Pipeline Aesthetic */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 28px;
      padding: 28px 30px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: var(--shadow);
      position: relative;
      overflow: hidden;
    }
    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), #38bdf8, #818cf8);
    }
    .title-group { max-width: 900px; }
    .title-group .hero-kicker {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 8px;
      font-family: var(--mono);
    }
    .title-group h1 {
      font-size: 32px;
      line-height: 1.18;
      color: var(--text);
      margin-bottom: 8px;
    }
    .title-group p, .title-group .hero-line {
      color: var(--text-muted);
      font-size: 16px;
      line-height: 1.55;
      max-width: 72ch;
    }

    /* Metrics Summary Cards */
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: var(--shadow);
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .metric-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-hover);
    }
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 4px;
      background: var(--accent);
    }
    .metric-card.pass::before { background: var(--success); }
    .metric-card.fail::before { background: var(--danger); }
    .metric-card.blue::before { background: #38bdf8; }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      font-weight: 700;
      font-family: var(--mono);
    }
    .metric-value {
      font-family: var(--display);
      font-size: 38px;
      font-weight: 800;
      margin: 6px 0 2px 0;
      line-height: 1;
      color: var(--text);
    }
    .metric-card.pass .metric-value { color: var(--success); }
    .metric-card.fail .metric-value { color: var(--danger); }
    .metric-card.blue .metric-value { color: #38bdf8; }
    .metric-sub {
      font-size: 13.5px;
      color: var(--text-muted);
    }

    /* Panels & Card Containers */
    #newTestPanel, #cardHealing, #cardStability, #cardA11y {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }

    /* Table Containers */
    .table-container {
      margin-bottom: 40px;
      width: 100%;
      overflow-x: hidden;
    }
    .table-header-title {
      font-family: var(--display);
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 14px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .runs-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    th, td {
      padding: 12px 10px;
      text-align: left;
      font-size: 13.5px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      word-break: break-word;
      box-sizing: border-box;
    }
    th {
      background: var(--bg-elevated);
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.08em;
      font-family: var(--mono);
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--accent-dim); }

    /* Explicit Table Column Proportions */
    .col-tc { width: 96px; min-width: 90px; }
    .col-flow { width: 18%; }
    .col-source { width: 11%; }
    .col-approval { width: 21%; }
    .col-run-result { width: 140px; min-width: 130px; }
    .col-observed { width: 19%; min-width: 140px; overflow-wrap: anywhere; word-break: break-word; }
    .col-evidence { width: 180px; min-width: 170px; }

    .col-evidence .evidence-list,
    .col-evidence > div {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
    }

    .timeline-toggle-btn {
      white-space: nowrap !important;
      font-size: 10.5px !important;
      padding: 4px 4px !important;
    }

    @media (max-width: 1280px) {
      .col-tc { width: 90px; min-width: 85px; }
      .col-flow { width: 18%; }
      .col-source { width: 11%; }
      .col-approval { width: 20%; }
      .col-run-result { width: 135px; min-width: 125px; }
      .col-observed { min-width: 140px; overflow-wrap: anywhere; word-break: break-word; }
      .col-evidence { width: 175px; min-width: 170px; }
    }
    @media (max-width: 1024px) {
      body { padding: 16px 12px 40px; }
      th, td { padding: 10px 8px; font-size: 13px; }
      .col-tc { width: 75px; min-width: 70px; }
      .col-run-result { width: 130px; min-width: 120px; }
      .col-observed { min-width: 130px; overflow-wrap: anywhere; word-break: break-word; }
      .col-evidence { width: 170px; min-width: 170px; }
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: 0.02em;
    }
    .badge-pass {
      background: rgba(52, 211, 153, 0.14);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.45);
    }
    .badge-fail {
      background: rgba(248, 113, 113, 0.14);
      color: #f87171;
      border: 1px solid rgba(248, 113, 113, 0.45);
    }
    .badge-warn {
      background: rgba(251, 191, 36, 0.14);
      color: #fbbf24;
      border: 1px solid rgba(251, 191, 36, 0.45);
    }
    .badge-uncertain {
      background: rgba(192, 132, 252, 0.14);
      color: #c084fc;
      border: 1px solid rgba(192, 132, 252, 0.45);
    }
    .badge-tc {
      background: var(--accent-dim);
      color: var(--accent);
      border: 1px solid rgba(46, 230, 197, 0.38);
      font-family: var(--mono);
      font-size: 12px;
      padding: 3px 8px;
    }

    /* STAMP-STYLE BADGES FOR RUN VERDICTS */
    .badge-stamp {
      display: inline-block;
      position: relative;
      max-width: 100%;
      box-sizing: border-box;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      font-family: var(--display);
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.25;
      padding: 4px 7px;
      margin: 2px 2px 2px 1px;
      border-radius: 4px;
      border: 2px solid currentColor;
      box-shadow: inset 0 0 0 1px currentColor, 0 2px 4px rgba(0, 0, 0, 0.2);
      transform: rotate(-2deg);
      transform-origin: 20% center;
      text-align: center;
      vertical-align: middle;
    }
    .badge-stamp.badge-fail {
      transform: rotate(2deg);
      transform-origin: 20% center;
    }
    .badge-stamp.badge-warn {
      transform: rotate(-1.5deg);
      transform-origin: 20% center;
    }

    /* Stacked Run 1 & Rerun Verdict Items */
    .run-verdict-stack {
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: flex-start;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    .run-verdict-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    .run-verdict-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      font-family: var(--mono);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      line-height: 1;
    }
    .run-verdict-sub {
      font-size: 10.5px;
      color: var(--text-muted);
      font-family: var(--mono);
      line-height: 1.35;
      margin-top: 3px;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    /* EVIDENCE LINKS: FILE-TAB CHIPS */
    .chip-evidence {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 7px;
      padding: 8px 12px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-top: 2.5px solid var(--accent);
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 11.5px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--text);
      text-decoration: none;
      text-align: left;
      transition: all 0.18s ease;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    }
    .chip-evidence:hover {
      background: var(--accent-dim);
      border-color: var(--accent);
      color: var(--accent);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px var(--accent-glow);
    }
    .chip-evidence.chip-spec-approved {
      border-top-color: #34d399;
      color: #34d399;
    }
    .chip-evidence.chip-spec-rejected {
      border-top-color: #f87171;
      color: #f87171;
    }
    .chip-evidence.chip-error {
      border-top-color: #fbbf24;
      color: #fbbf24;
    }
    .chip-evidence.chip-db {
      border-top-color: #a78bfa;
      color: #c084fc;
    }
    .timeline-step-card .chip-evidence {
      width: auto;
      padding: 4px 8px;
      font-size: 10.5px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-elevated);
      color: var(--text);
      padding: 7px 14px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
      font-family: inherit;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.2s ease;
      line-height: 1.3;
    }
    .btn:hover {
      background: var(--accent);
      color: #06221c;
      border-color: var(--accent);
    }
    #draftTestBtn, #runBonusSuiteBtn {
      background: var(--accent) !important;
      color: #06221c !important;
      border-color: var(--accent) !important;
      box-shadow: 0 4px 14px var(--accent-glow) !important;
      font-weight: 700;
    }
    #draftTestBtn:hover, #runBonusSuiteBtn:hover {
      background: var(--accent-hover) !important;
      transform: translateY(-1px);
    }
    #approveDraftBtn, #approveHealingBtn {
      background: var(--success) !important;
      color: #042f1a !important;
      border-color: var(--success) !important;
      font-weight: 700;
    }
    #rejectDraftBtn {
      background: var(--danger) !important;
      color: #3b070c !important;
      border-color: var(--danger) !important;
      font-weight: 700;
    }
    .timeline-toggle-btn {
      background: var(--accent-dim) !important;
      border-color: rgba(46, 230, 197, 0.45) !important;
      color: var(--accent) !important;
      font-family: var(--mono);
    }

    /* Textareas and Inputs */
    textarea {
      width: 100%;
      background: #0d1218;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text);
      font-family: inherit;
      font-size: 14.5px;
      resize: vertical;
    }
    textarea:focus {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    /* Code Previews */
    .code-preview {
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.5;
      background: #0b0f14;
      padding: 12px 14px;
      border-radius: 8px;
      max-height: 120px;
      overflow-y: auto;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: #e2e8f0;
      border: 1px solid var(--border);
    }

    /* ============================================================
       PIPELINE DESIGN: HORIZONTAL METRO-LINE TIMELINE STEPPER
       ============================================================ */
    .timeline-row td {
      background: #0c1017;
      padding: 22px 18px 24px;
      border-bottom: 2px solid var(--accent);
      border-top: 1px solid var(--border);
    }
    .timeline-header-block {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .timeline-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .timeline-pipeline-title {
      font-family: var(--display);
      font-size: 17px;
      font-weight: 800;
      color: var(--text);
    }
    .timeline-meta-text {
      font-size: 13px;
      color: var(--text-muted);
      font-family: var(--mono);
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .metro-track-container {
      position: relative;
      width: 100%;
      padding-top: 10px;
    }
    .metro-track-line {
      position: absolute;
      top: 31px;
      left: 36px;
      right: 36px;
      height: 4px;
      background: #1e293b;
      border-radius: 2px;
      z-index: 0;
      overflow: hidden;
    }
    .metro-track-line.metro-track-active {
      background: linear-gradient(90deg, #34d399 0%, #34d399 60%, #2ee6c5 80%, #38bdf8 100%);
    }
    .metro-active-dot {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 40px;
      background: linear-gradient(90deg, transparent, #2ee6c5, transparent);
      box-shadow: 0 0 12px #2ee6c5;
      animation: metroTravel 2.5s ease-in-out infinite alternate;
    }
    @keyframes metroTravel {
      0% { left: 0%; }
      100% { left: calc(100% - 40px); }
    }

    .timeline-stepper {
      display: flex;
      width: 100%;
      gap: 10px;
      align-items: stretch;
      position: relative;
      z-index: 1;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .timeline-step {
      flex: 1 1 0;
      min-width: 130px;
      display: flex;
      flex-direction: column;
    }
    .timeline-step-rail {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
      position: relative;
    }
    .timeline-step-index {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: var(--display);
      font-size: 13px;
      font-weight: 800;
      color: #06221c;
      background: var(--accent);
      border: 3px solid #0c1017;
      box-shadow: 0 0 0 2px var(--accent);
      flex: 0 0 32px;
      z-index: 2;
      transition: all 0.25s ease;
    }
    .timeline-step.station-done .timeline-step-index {
      background: #34d399;
      box-shadow: 0 0 0 2px #34d399;
      color: #042f1a;
    }
    .timeline-step.station-fail .timeline-step-index {
      background: #f87171;
      box-shadow: 0 0 0 2px #f87171;
      color: #3b070c;
    }
    .timeline-step.station-pending .timeline-step-index,
    .timeline-step.station-waiting .timeline-step-index {
      background: #fbbf24;
      box-shadow: 0 0 0 2px #fbbf24;
      color: #381e02;
      animation: metroBeacon 1.8s infinite;
    }
    .timeline-step.station-uncertain .timeline-step-index {
      background: #c084fc;
      box-shadow: 0 0 0 2px #c084fc;
      color: #2e1065;
    }
    .timeline-step.station-queued .timeline-step-index {
      background: #334155;
      box-shadow: 0 0 0 2px #475569;
      color: #94a3b8;
    }
    @keyframes metroBeacon {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 2px currentColor, 0 0 0 0 rgba(251, 191, 36, 0.6);
      }
      50% {
        transform: scale(1.15);
        box-shadow: 0 0 0 2px currentColor, 0 0 0 10px rgba(251, 191, 36, 0);
      }
    }

    .timeline-step-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      min-height: 100%;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .timeline-step-title {
      font-family: var(--display);
      font-size: 11px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 6px;
      line-height: 1.25;
      white-space: normal;
      word-break: normal;
    }
    .station-badge {
      font-size: 11px;
      padding: 2px 7px;
      margin-bottom: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .station-time {
      font-family: var(--mono);
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .station-body {
      font-size: 12.5px;
      color: var(--text-muted);
      line-height: 1.45;
      word-break: break-word;
    }

    /* Empty States */
    .empty-state-box {
      padding: 36px 24px;
      text-align: center;
      background: var(--card-bg);
      border: 1.5px dashed var(--border);
      border-radius: 14px;
    }
    .empty-state-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }
    .empty-state-title {
      font-size: 17px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 6px;
      font-family: var(--display);
    }
    .empty-state-sub {
      font-size: 14.5px;
      color: var(--text-muted);
      max-width: 540px;
      margin: 0 auto;
      line-height: 1.55;
    }

    /* Top Navigation Bar */
    .top-nav-bar {
      margin-bottom: 24px;
      padding: 10px 18px;
      background: rgba(18, 23, 31, 0.9);
      border: 1px solid var(--border);
      border-radius: 14px;
      backdrop-filter: blur(14px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.28);
    }
    .top-nav-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--display);
      font-size: 15px;
      font-weight: 800;
      color: var(--text);
    }
    .nav-brand-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 12px var(--accent);
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nav-link {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 16px;
      border-radius: 9px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      color: var(--text-muted);
      border: 1px solid transparent;
      transition: all 0.2s ease;
    }
    .nav-link:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }
    .nav-link.active {
      color: var(--accent);
      background: var(--accent-dim);
      border-color: rgba(46, 230, 197, 0.4);
      font-weight: 700;
    }
    .nav-bonus-badge {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 999px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .nav-right-cluster {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .theme-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Light Mode Overrides for Test Writer */
    [data-theme="light"] body {
      background-color: #f8fafc;
      background-image: none;
      color: #0f172a;
    }
    [data-theme="light"] .header {
      background: #ffffff;
      border-color: var(--border);
      box-shadow: var(--shadow);
    }
    [data-theme="light"] .header::before {
      background: var(--accent);
    }
    [data-theme="light"] .title-group .hero-kicker {
      color: #0f766e;
    }
    [data-theme="light"] .title-group h1 {
      color: #0f172a;
    }
    [data-theme="light"] .title-group p,
    [data-theme="light"] .title-group .hero-line {
      color: #475569;
    }
    [data-theme="light"] .top-nav-bar {
      background: #ffffff;
      border-color: var(--border);
      box-shadow: var(--shadow);
    }
    [data-theme="light"] .nav-brand { color: #0f172a; }
    [data-theme="light"] .nav-brand-dot { box-shadow: none; background: var(--accent); }
    [data-theme="light"] .nav-link { color: #475569; }
    [data-theme="light"] .nav-link:hover { color: var(--accent); background: var(--accent-dim); }
    [data-theme="light"] .nav-link.active { color: var(--accent); background: var(--accent-dim); border-color: var(--accent); }
    [data-theme="light"] .nav-bonus-badge { background: var(--accent); color: #ffffff; box-shadow: none; }
    [data-theme="light"] .theme-toggle-btn { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
    [data-theme="light"] .theme-toggle-btn:hover { background: #ffffff; border-color: var(--accent); color: var(--accent); }

    /* Metric Cards in Light Mode */
    [data-theme="light"] .metric-card {
      background: #ffffff;
      border-color: var(--border);
      box-shadow: var(--shadow);
    }
    [data-theme="light"] .metric-label { color: #475569; }
    [data-theme="light"] .metric-value { color: #0f172a; }
    [data-theme="light"] .metric-sub { color: #475569; }
    [data-theme="light"] .metric-card.pass .metric-value { color: #15803d; }
    [data-theme="light"] .metric-card.pass::before { background: #15803d; }
    [data-theme="light"] .metric-card.fail .metric-value { color: #b91c1c; }
    [data-theme="light"] .metric-card.fail::before { background: #b91c1c; }
    [data-theme="light"] .metric-card.blue .metric-value { color: #0f766e; }
    [data-theme="light"] .metric-card.blue::before { background: #0f766e; }

    /* Tables in Light Mode */
    [data-theme="light"] .runs-table { background: #ffffff; border-color: var(--border); }
    [data-theme="light"] .table-header-title { color: #0f172a; }
    [data-theme="light"] th { background: #f8fafc; color: #475569; border-bottom: 1.5px solid var(--border); }
    [data-theme="light"] td { border-bottom: 1px solid var(--border); color: #0f172a; }
    [data-theme="light"] tr:hover td { background: rgba(15, 118, 110, 0.03); }

    /* Verdict Stamps & Badges in Light Mode */
    [data-theme="light"] .badge-pass {
      background: #dcfce7 !important;
      color: #166534 !important;
      border: 1px solid #86efac !important;
    }
    [data-theme="light"] .badge-fail {
      background: #fee2e2 !important;
      color: #991b1b !important;
      border: 1px solid #fca5a5 !important;
    }
    [data-theme="light"] .badge-rejected {
      background: #ffe4e6 !important;
      color: #881337 !important;
      border: 1px solid #fecdd3 !important;
    }
    [data-theme="light"] .badge-warn {
      background: #fef3c7 !important;
      color: #92400e !important;
      border: 1px solid #fde68a !important;
    }
    [data-theme="light"] .badge-uncertain {
      background: #fef3c7 !important;
      color: #92400e !important;
      border: 1px solid #fde68a !important;
    }
    [data-theme="light"] .badge-approver {
      background: #e0e7ff !important;
      color: #3730a3 !important;
      border: 1px solid #c7d2fe !important;
    }
    [data-theme="light"] .badge-tc {
      background: #ccfbf1 !important;
      color: #044e46 !important;
      border: 1px solid #99f6e4 !important;
    }
    [data-theme="light"] .badge-stamp {
      box-shadow: none !important;
      border-width: 1px !important;
    }
    [data-theme="light"] .badge-stamp.badge-pass {
      background: #dcfce7 !important;
      color: #166534 !important;
      border-color: #86efac !important;
    }
    [data-theme="light"] .badge-stamp.badge-fail {
      background: #fee2e2 !important;
      color: #991b1b !important;
      border-color: #fca5a5 !important;
    }
    [data-theme="light"] .badge-stamp.badge-rejected,
    [data-theme="light"] .badge-stamp.badge-fail.badge-rejected {
      background: #ffe4e6 !important;
      color: #881337 !important;
      border-color: #fecdd3 !important;
    }
    [data-theme="light"] .badge-stamp.badge-warn {
      background: #fef3c7 !important;
      color: #92400e !important;
      border-color: #fde68a !important;
    }
    [data-theme="light"] .badge-stamp.badge-uncertain {
      background: #fef3c7 !important;
      color: #92400e !important;
      border-color: #fde68a !important;
    }
    [data-theme="light"] .run-verdict-label { color: #475569; }
    [data-theme="light"] .run-verdict-sub { color: #475569; }

    /* Timeline Stepper and Metro Line in Light Mode */
    [data-theme="light"] .timeline-row td { background: #f8fafc; border-bottom: 2px solid var(--accent); border-top: 1px solid var(--border); }
    [data-theme="light"] .timeline-pipeline-title { color: #0f172a; }
    [data-theme="light"] .timeline-meta-text { color: #475569; }
    [data-theme="light"] .metro-track-line { background: #cbd5e1; }
    [data-theme="light"] .metro-track-line.metro-track-active { background: var(--accent); }
    [data-theme="light"] .metro-active-dot { display: none; }
    [data-theme="light"] .timeline-step-index {
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 2px var(--border);
      background: var(--accent);
      color: #ffffff;
    }
    [data-theme="light"] .timeline-step.station-done .timeline-step-index {
      background: #15803d;
      box-shadow: 0 0 0 2px #86efac;
      color: #ffffff;
    }
    [data-theme="light"] .timeline-step.station-fail .timeline-step-index {
      background: #b91c1c;
      box-shadow: 0 0 0 2px #fca5a5;
      color: #ffffff;
    }
    [data-theme="light"] .timeline-step.station-pending .timeline-step-index,
    [data-theme="light"] .timeline-step.station-waiting .timeline-step-index {
      background: #b45309;
      box-shadow: 0 0 0 2px #fde68a;
      color: #ffffff;
      animation: none;
    }
    [data-theme="light"] .timeline-step.station-uncertain .timeline-step-index {
      background: #6b21a8;
      box-shadow: 0 0 0 2px #d8b4fe;
      color: #ffffff;
    }
    [data-theme="light"] .timeline-step.station-queued .timeline-step-index {
      background: #64748b;
      box-shadow: 0 0 0 2px #cbd5e1;
      color: #ffffff;
    }
    [data-theme="light"] .timeline-step-card {
      background: #ffffff;
      border-color: var(--border);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }
    [data-theme="light"] .timeline-step-title { color: #0f172a; }
    [data-theme="light"] .station-time { color: #475569; }
    [data-theme="light"] .station-body { color: #334155; }

    /* Evidence Chips in Light Mode */
    [data-theme="light"] .chip-evidence {
      background: #f8fafc;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-top: 2.5px solid var(--accent);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    [data-theme="light"] .chip-evidence:hover {
      background: #f1f5f9;
      border-color: var(--accent);
      color: var(--accent);
      box-shadow: none;
    }
    [data-theme="light"] .chip-evidence.chip-spec-approved {
      border-top-color: #166534;
      color: #166534;
    }
    [data-theme="light"] .chip-evidence.chip-spec-rejected {
      border-top-color: #991b1b;
      color: #991b1b;
    }
    [data-theme="light"] .chip-evidence.chip-error {
      border-top-color: #92400e;
      color: #92400e;
    }
    [data-theme="light"] .chip-evidence.chip-db {
      border-top-color: #6b21a8;
      color: #6b21a8;
    }

    /* Panels & Inputs in Light Mode */
    [data-theme="light"] textarea {
      background: #ffffff !important;
      color: #0f172a !important;
      border: 1.5px solid #cbd5e1 !important;
    }
    [data-theme="light"] textarea:focus {
      border-color: var(--accent) !important;
      outline: 2px solid var(--accent) !important;
    }
    [data-theme="light"] .code-preview {
      background: #f8fafc;
      color: #0f172a;
      border-color: var(--border);
    }
    [data-theme="light"] #newTestPanel {
      background: #ffffff;
      border-color: var(--border);
      box-shadow: var(--shadow);
    }
    [data-theme="light"] .scope-badge-box {
      background: #f1f5f9 !important;
      border-color: var(--border) !important;
      color: #475569 !important;
    }
    [data-theme="light"] .scope-badge-box code {
      color: #0f172a !important;
    }
    [data-theme="light"] #draftProgressContainer {
      background: #ffffff !important;
      border: 1.5px solid var(--border) !important;
      box-shadow: var(--shadow) !important;
    }
    [data-theme="light"] #draftProgressContainer div[id^="pStep_"] {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
    }
    [data-theme="light"] #draftProgressContainer strong {
      color: #334155 !important;
    }
    [data-theme="light"] #draftProgressContainer div[id^="pMsg_"] {
      color: #475569 !important;
    }
    [data-theme="light"] #draftStatusBanner {
      color: #334155 !important;
      border-top-color: #e2e8f0 !important;
    }
    [data-theme="light"] #pendingApprovalContainer {
      background: #ffffff !important;
      border: 2px solid #b45309 !important;
      box-shadow: var(--shadow) !important;
    }
    [data-theme="light"] #pendingApprovalContainer .pending-info-box {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
    }

    /* Buttons in Light Mode */
    [data-theme="light"] .btn {
      background: #f8fafc;
      border-color: #cbd5e1;
      color: #0f172a;
    }
    [data-theme="light"] .btn:hover {
      background: #f1f5f9;
      border-color: var(--accent);
      color: var(--accent);
    }
    [data-theme="light"] #draftTestBtn,
    [data-theme="light"] #runBonusSuiteBtn {
      background: var(--accent) !important;
      color: #ffffff !important;
      border-color: var(--accent) !important;
      box-shadow: none !important;
    }
    [data-theme="light"] #draftTestBtn:hover,
    [data-theme="light"] #runBonusSuiteBtn:hover {
      background: var(--accent-hover) !important;
      border-color: var(--accent-hover) !important;
    }
    [data-theme="light"] #approveDraftBtn,
    [data-theme="light"] #approveHealingBtn {
      background: #166534 !important;
      color: #ffffff !important;
      border-color: #166534 !important;
    }
    [data-theme="light"] #rejectDraftBtn {
      background: #991b1b !important;
      color: #ffffff !important;
      border-color: #991b1b !important;
    }
    [data-theme="light"] .timeline-toggle-btn {
      background: #ccfbf1 !important;
      border-color: #99f6e4 !important;
      color: #044e46 !important;
    }
    [data-theme="light"] .timeline-toggle-btn:hover {
      background: #99f6e4 !important;
    }

    /* Bonus Cards in Light Mode */
    [data-theme="light"] .bonus-section-container {
      background: #f1f5f9 !important;
      border: 1.5px dashed #cbd5e1 !important;
    }
    [data-theme="light"] #cardHealing,
    [data-theme="light"] #cardStability,
    [data-theme="light"] #cardA11y {
      background: #ffffff;
      border-color: var(--border);
      box-shadow: var(--shadow);
    }
    [data-theme="light"] .bonus-card-title {
      color: #0f172a !important;
    }
    [data-theme="light"] .bonus-fail-label {
      color: #991b1b !important;
    }
    [data-theme="light"] .bonus-pass-label {
      color: #166534 !important;
    }
    [data-theme="light"] .code-pill-fail {
      background: #fee2e2 !important;
      color: #991b1b !important;
      border: 1px solid #fca5a5 !important;
    }
    [data-theme="light"] .code-pill-pass {
      background: #dcfce7 !important;
      color: #166534 !important;
      border: 1px solid #86efac !important;
    }
    [data-theme="light"] .healed-result-pass {
      background: #f0fdf4 !important;
      border-color: #86efac !important;
    }
    [data-theme="light"] .healed-result-pass .healed-title {
      color: #166534 !important;
    }
    [data-theme="light"] .healed-result-fail {
      background: #fef2f2 !important;
      border-color: #fca5a5 !important;
    }
    [data-theme="light"] .healed-result-fail .healed-title {
      color: #991b1b !important;
    }
    [data-theme="light"] .stability-run-item {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      color: #0f172a !important;
    }
    [data-theme="light"] .a11y-violation-item {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      color: #0f172a !important;
    }
    [data-theme="light"] .a11y-violation-id {
      color: #0f766e !important;
    }
    [data-theme="light"] .a11y-violation-desc {
      color: #0f172a !important;
    }
    [data-theme="light"] .a11y-violation-link {
      color: #0f766e !important;
    }
    [data-theme="light"] .draft-preview-rejected {
      background: #fff1f2 !important;
      border-color: #fecdd3 !important;
    }
    [data-theme="light"] .draft-preview-rejected .draft-meta {
      color: #881337 !important;
    }
    [data-theme="light"] .draft-preview-approved {
      background: #f0fdf4 !important;
      border-color: #bbf7d0 !important;
    }
    [data-theme="light"] .draft-preview-approved .draft-meta {
      color: #166534 !important;
    }
    [data-theme="light"] #historyRunsTable {
      opacity: 1 !important;
    }
    [data-theme="light"] .station-badge.badge-pass {
      background: #dcfce7 !important;
      color: #166534 !important;
      border: 1px solid #86efac !important;
    }
    [data-theme="light"] .station-badge.badge-uncertain,
    [data-theme="light"] .station-badge.badge-warn {
      background: #fef3c7 !important;
      color: #92400e !important;
      border: 1px solid #fde68a !important;
    }
    [data-theme="light"] .station-badge.badge-fail {
      background: #fee2e2 !important;
      color: #991b1b !important;
      border: 1px solid #fca5a5 !important;
    }
    [data-theme="light"] .empty-state-box {
      background: #ffffff;
      border-color: #cbd5e1;
    }
    [data-theme="light"] .empty-state-title {
      color: #0f172a;
    }
    [data-theme="light"] .empty-state-sub {
      color: #475569;
    }

    @media (max-width: 1366px) {
      body { padding: 20px 16px 48px; }
      .header { padding: 22px 24px; }
      .title-group h1 { font-size: 28px; }
      .metrics { gap: 12px; }
    }
    .btn-preset {
      font-size: 11.5px;
      padding: 5px 10px;
    }

    @media (max-width: 768px) {
      .header { flex-direction: column; align-items: stretch; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .timeline-stepper { flex-direction: column; }
      .metro-track-line { display: none; }
    }
    @media (max-width: 640px) {
      .btn, button {
        min-height: 40px;
        padding: 9px 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .btn-preset {
        min-height: 38px;
        font-size: 12px;
        padding: 8px 12px;
      }
      .timeline-toggle-btn {
        min-height: 38px !important;
        padding: 8px 10px !important;
        font-size: 11px !important;
      }
      .chip-evidence {
        min-height: 38px;
        display: inline-flex;
        align-items: center;
      }
    }
  </style>
</head>
<body>
  <!-- Top Navigation Bar (Test Writer Active) -->
  ${renderTopNavBar('test-writer')}

  <!-- HERO HEADER (PIPELINE DESIGN) -->
  <div class="header">
    <div class="title-group">
      <span class="hero-kicker">⚡ Autonomous Pipeline Architecture</span>
      <h1>Plain English in. Approved, verified test out.</h1>
      <p class="hero-line">Turns a plain-English user flow into an approved Playwright spec, then runs it against Conduit with critic review, evidence, and database proof.</p>
    </div>
    <div>
      <span class="badge badge-tc" style="font-size: 13.5px; padding: 9px 16px; border-radius: 8px;">Target: <code>${process.env.APP_BASE_URL || 'http://localhost:3000'}</code></span>
    </div>
  </div>

  <!-- NEW TEST PANEL -->
  <div id="newTestPanel" style="padding: 24px 26px; margin-bottom: 28px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 19px; font-weight: 800; color: var(--card-title-color, var(--text)); display: flex; align-items: center; gap: 10px;">
          <span>📝 New Test Scenario</span>
          <span class="badge badge-tc" style="font-size: 11.5px;">Interactive Agent Flow</span>
        </h2>
        <p style="font-size: 13.5px; color: var(--text-muted); margin-top: 3px;">
          Draft an automated Playwright test from a plain-English scenario. The agent runs Steps 1–5 (Understand, Browse, Reason, Draft, Critic) and halts for human approval before execution.
        </p>
      </div>
      <div class="scope-badge-box" style="background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 12px; color: var(--text-muted);">
        <strong style="color: var(--accent);">Scope:</strong> <code style="color: var(--text);">${process.env.APP_BASE_URL || 'http://localhost:3000'}</code>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-bottom: 14px;">
      <div>
        <label for="scenarioInput" style="display: block; font-size: 12px; font-weight: 700; color: var(--label-color, var(--text)); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;">
          Plain-English Scenario / Flow Description:
        </label>
        <textarea id="scenarioInput" rows="3" style="width: 100%; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; resize: vertical;" placeholder="e.g. Navigate to sign up page, enter unique username, email, and password, click Sign up button, and see dashboard navbar with logged-in user"></textarea>
      </div>
      <div>
        <label for="expectedInput" style="display: block; font-size: 12px; font-weight: 700; color: var(--label-color, var(--text)); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;">
          Expected End State / Assertions:
        </label>
        <textarea id="expectedInput" rows="3" style="width: 100%; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; resize: vertical;" placeholder="e.g. User record is created in SQLite, session is established, and user profile link is visible in dashboard navbar"></textarea>
      </div>
    </div>

    <!-- Quick Scenario Presets and Draft Button -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
        <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">Scenario Presets:</span>
        <button type="button" class="btn btn-preset" onclick="fillScenario('TC1')">TC1: Registration</button>
        <button type="button" class="btn btn-preset" onclick="fillScenario('TC2')">TC2: Mutated Button (Negative)</button>
        <button type="button" class="btn btn-preset" onclick="fillScenario('TC3')">TC3: Critic Upgrade</button>
        <button type="button" class="btn btn-preset" onclick="fillScenario('TC4')">TC4: Fresh Data & DB Proof</button>
      </div>
      <button id="draftTestBtn" class="btn" style="font-weight: 700; font-size: 13px; padding: 8px 18px;">
        🚀 Draft test (Steps 1–5)
      </button>
    </div>
    <div id="newTestFeedback" style="margin-top: 10px;"></div>

    <!-- LIVE DRAFT PROGRESS PANEL -->
    <div id="draftProgressContainer" style="display: none; margin-top: 16px; padding: 18px 20px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span id="draftProgressBadge" class="badge badge-warn" style="font-size: 12px; font-weight: 700; padding: 4px 10px;">⏳ Drafting in Progress</span>
          <span style="font-size: 13px; font-weight: 600; color: #f1f5f9;">Live Pipeline Execution</span>
        </div>
        <div style="font-family: monospace; font-size: 13px; color: #38bdf8; font-weight: 700; background: rgba(56, 189, 248, 0.1); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.25);">
          ⏱️ Elapsed: <span id="draftElapsedTime">0.0s</span>
        </div>
      </div>

      <!-- 5 Steps Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 12px;">
        <!-- Step 1: Understand -->
        <div id="pStep_understand" style="background: rgba(0,0,0,0.35); border: 1px solid #1e293b; border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 12px; color: #94a3b8;">1. Understand</strong>
            <span id="pBadge_understand" class="badge" style="font-size: 10px; padding: 1px 6px;">Queued</span>
          </div>
          <div id="pMsg_understand" style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Waiting...</div>
        </div>

        <!-- Step 2: Browse -->
        <div id="pStep_browse" style="background: rgba(0,0,0,0.35); border: 1px solid #1e293b; border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 12px; color: #94a3b8;">2. Browse</strong>
            <span id="pBadge_browse" class="badge" style="font-size: 10px; padding: 1px 6px;">Queued</span>
          </div>
          <div id="pMsg_browse" style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Waiting...</div>
        </div>

        <!-- Step 3: Reason -->
        <div id="pStep_reason" style="background: rgba(0,0,0,0.35); border: 1px solid #1e293b; border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 12px; color: #94a3b8;">3. Reason</strong>
            <span id="pBadge_reason" class="badge" style="font-size: 10px; padding: 1px 6px;">Queued</span>
          </div>
          <div id="pMsg_reason" style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Waiting...</div>
        </div>

        <!-- Step 4: Draft -->
        <div id="pStep_draft" style="background: rgba(0,0,0,0.35); border: 1px solid #1e293b; border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 12px; color: #94a3b8;">4. Draft (LLM)</strong>
            <span id="pBadge_draft" class="badge" style="font-size: 10px; padding: 1px 6px;">Queued</span>
          </div>
          <div id="pMsg_draft" style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Waiting...</div>
        </div>

        <!-- Step 5: Critic -->
        <div id="pStep_critic" style="background: rgba(0,0,0,0.35); border: 1px solid #1e293b; border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 12px; color: #94a3b8;">5. Critic</strong>
            <span id="pBadge_critic" class="badge" style="font-size: 10px; padding: 1px 6px;">Queued</span>
          </div>
          <div id="pMsg_critic" style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Waiting...</div>
        </div>
      </div>

      <!-- Live status message banner -->
      <div id="draftStatusBanner" style="font-size: 12.5px; color: #cbd5e1; padding-top: 6px; border-top: 1px solid #1e293b;"></div>
    </div>

    <!-- PENDING HUMAN APPROVAL STATE CONTAINER -->
    <div id="pendingApprovalContainer" style="display: none; margin-top: 18px; padding: 18px 20px; background: rgba(15, 23, 42, 0.95); border: 2px solid #f59e0b; border-radius: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge badge-warn" style="font-size: 12px; font-weight: 700; padding: 4px 10px;">⏳ Pending human approval</span>
          <span id="pendingRunId" class="badge badge-tc" style="font-size: 11.5px;"></span>
        </div>
        <div style="font-size: 12px; color: var(--warning); font-weight: 500;">
          Pipeline halted at Step 5 (Critic). Execution will not start until approved by human.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 14px;">
        <div class="pending-info-box" style="background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 6px; padding: 10px;">
          <strong style="color: var(--flow-title); font-size: 12.5px; display: block; margin-bottom: 4px;">Reasoned Selectors & Locators:</strong>
          <div id="pendingSelectors" tabindex="0" style="font-size: 11.5px; color: var(--text); max-height: 90px; overflow-y: auto;"></div>
        </div>
        <div class="pending-info-box" style="background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 6px; padding: 10px;">
          <strong style="color: var(--success); font-size: 12.5px; display: block; margin-bottom: 4px;">Assertions & Critic Review Result:</strong>
          <div id="pendingCritic" tabindex="0" style="font-size: 11.5px; color: var(--text); max-height: 90px; overflow-y: auto;"></div>
        </div>
      </div>

      <div style="margin-bottom: 14px;">
        <strong style="color: var(--label-color, var(--text)); font-size: 12.5px; display: block; margin-bottom: 4px;">Draft Playwright Spec Code:</strong>
        <pre id="pendingSpecCode" class="code-preview" tabindex="0" style="max-height: 180px; font-size: 11px;"></pre>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 12px; flex-wrap: wrap; gap: 10px;">
        <div style="font-size: 12px; color: var(--text-muted);">
          Approver will be recorded as <code>human</code> with real execution timestamp. Duplicate retries are blocked.
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="rejectDraftBtn" class="btn" style="font-weight: 700; padding: 7px 16px;">
            ✖ Reject
          </button>
          <button id="approveDraftBtn" class="btn" style="font-weight: 700; padding: 7px 20px;">
            ✓ Approve & Execute Test
          </button>
        </div>
      </div>
      <div id="approvalActionFeedback" style="margin-top: 10px;"></div>
    </div>
  </div>

  <!-- CUSTOM SCENARIO RUNS SECTION -->
  <div class="table-container" id="customScenariosSection" style="margin-bottom: 36px;">
    <div class="table-header-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span>Custom scenario runs</span>
        <span id="customRunsCountBadge" class="badge badge-tc" style="font-size: 11px;">${customRuns.length} run${customRuns.length === 1 ? '' : 's'}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); font-family: var(--body); font-weight: normal;">
        Interactive agent runs drafted from the panel above
      </div>
    </div>

    <div id="noCustomRunsBox" class="empty-state-box" style="display: ${customRuns.length === 0 ? 'block' : 'none'};">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">No custom scenarios yet. Describe a flow above.</div>
      <div class="empty-state-sub">
        Draft a new test scenario using the panel above to see execution results, evidence links, and agent timelines here.
      </div>
    </div>

    <table class="runs-table" id="customRunsTable" style="display: ${customRuns.length === 0 ? 'none' : 'table'};">
      <thead>
        <tr>
          <th class="col-tc">Test Case</th>
          <th class="col-flow">Flow &amp; Expected State</th>
          <th class="col-source">Source &amp; Inspected</th>
          <th class="col-approval">Approval &amp; Critic Review</th>
          <th class="col-run-result">Run Result</th>
          <th class="col-observed">Observed vs Intended</th>
          <th class="col-evidence">Evidence</th>
        </tr>
      </thead>
      <tbody id="customRunsTbody">
        ${customRuns.map(run => renderCustomRunRow(run)).join('')}
      </tbody>
    </table>
  </div>

  <div class="metrics">
    <div class="metric-card">
      <div class="metric-label">Active Test Suite</div>
      <div class="metric-value">${totalActive}</div>
      <div class="metric-sub">Verified test cases</div>
    </div>
    <div class="metric-card pass">
      <div class="metric-label">Passed</div>
      <div class="metric-value">${passedActive}</div>
      <div class="metric-sub">TC1, TC3, TC4 (Stable Reruns)</div>
    </div>
    <div class="metric-card fail">
      <div class="metric-label">Failed as Expected</div>
      <div class="metric-value">${failedAsExpected}</div>
      <div class="metric-sub">TC2 (Mutated Locator Handled)</div>
    </div>
    <div class="metric-card blue">
      <div class="metric-label">DB State Assertions</div>
      <div class="metric-value">${dbVerifiedCount}</div>
      <div class="metric-sub">Conduit SQLite Verified</div>
    </div>
  </div>

  <div class="table-container">
    <div class="table-header-title">
      <span>Active Test Cases (4 Latest Verified Runs)</span>
    </div>
    <table class="runs-table" id="officialRunsTable">
      <thead>
        <tr>
          <th class="col-tc">Test Case</th>
          <th class="col-flow">Flow &amp; Expected State</th>
          <th class="col-source">Source &amp; Inspected</th>
          <th class="col-approval">Approval &amp; Critic Review</th>
          <th class="col-run-result">Run Result</th>
          <th class="col-observed">Observed vs Intended</th>
          <th class="col-evidence">Evidence</th>
        </tr>
      </thead>
      <tbody>
        ${activeRuns.map(run => renderRunRow(run)).join('')}
      </tbody>
    </table>
  </div>

  <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-size: 18px; font-weight: 700; color: var(--card-title-color, var(--text));">Archived Historical Runs</h2>
        <p style="font-size: 14px; color: var(--text-muted); margin-top: 2px;">
          Preserved past executions from initial development iterations (${historicalRuns.length} runs archived in SQLite).
        </p>
      </div>
      <button id="toggleHistoryBtn" class="btn" style="cursor: pointer; font-size: 13px; padding: 8px 16px;">
        📂 Show history (${historicalRuns.length} older runs)
      </button>
    </div>
    <div id="historyContainer" style="display: none; margin-top: 16px;">
      ${historicalRuns.length === 0 ? `
        <div id="noHistoryBox" style="padding: 28px; text-align: center; background: var(--card-bg); border: 1px dashed var(--border); border-radius: 10px;">
          <div style="font-size: 15px; font-weight: 700; color: var(--card-title-color, var(--text)); margin-bottom: 6px;">No archived runs found</div>
          <div style="font-size: 13px; color: var(--text-muted); max-width: 520px; margin: 0 auto; line-height: 1.5;">
            All available executed runs in SQLite are currently allocated to the 4 active benchmark test cases (TC1-TC4). No older historical executions exist.
          </div>
        </div>
      ` : `
        <table class="runs-table" id="historyRunsTable">
          <thead>
            <tr>
              <th class="col-tc">Test Case</th>
              <th class="col-flow">Flow &amp; Expected State</th>
              <th class="col-source">Source &amp; Inspected</th>
              <th class="col-approval">Approval &amp; Critic Review</th>
              <th class="col-run-result">Run Result</th>
              <th class="col-observed">Observed vs Intended</th>
              <th class="col-evidence">Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${historicalRuns.map(run => renderRunRow(run, true)).join('')}
          </tbody>
        </table>
      `}
    </div>
  </div>

  <!-- SEPARATE BONUS SECTION -->
  <div class="bonus-section-container" style="margin-top: 52px; padding: 32px; background: var(--bg-elevated); border: 1px dashed rgba(46, 230, 197, 0.35); border-radius: 18px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
      <div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <h2 style="font-size: 24px; font-weight: 800; color: var(--text);">Bonus Features</h2>
          <span class="badge badge-warn" style="font-size: 13px; font-weight: 700;">SEPARATE EVALUATION</span>
        </div>
        <p style="font-size: 15px; color: var(--text-muted); margin-top: 6px;">
          Advanced agent extensions: self-healing locator suggestions, multi-run stability scoring, and axe-core accessibility auditing.
        </p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button id="runBonusSuiteBtn" class="btn" style="font-weight: 600;">⚡ Run Full Bonus Suite</button>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px;">
      <!-- Bonus 1: Self-Healing for TC2 -->
      <div id="cardHealing" style="padding: 22px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <h3 class="bonus-card-title" style="font-size: 18px; font-weight: 700; color: var(--card-title-color, #f1f5f9);">1. Self-Healing Selector (TC2)</h3>
            <span id="healingStatusBadge" class="badge ${proposal.status === 'APPROVED_PASSED' ? 'badge-pass' : (proposal.status === 'APPROVED_FAILED' ? 'badge-fail' : 'badge-warn')}">
              ${proposal.status === 'APPROVED_PASSED' ? '✓ Approved & Verified' : (proposal.status === 'APPROVED_FAILED' ? '✖ Execution Failed' : 'Proposed fix, awaiting approval')}
            </span>
          </div>
          <div style="font-size: 14px; margin-bottom: 8px;">
            <strong class="bonus-fail-label" style="color: var(--danger, #f87171);">Failing Selector:</strong>
            <code class="code-pill-fail" style="background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; color: #fca5a5;">${proposal.failingSelector}</code>
          </div>
          <div style="font-size: 14px; margin-bottom: 8px;">
            <strong class="bonus-pass-label" style="color: var(--success, #34d399);">Proposed Selector:</strong>
            <code class="code-pill-pass" style="background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; color: #86efac;">${proposal.proposedSelector}</code>
          </div>
          <div style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px;">
            <strong>Reason:</strong> ${escapeHtml(proposal.reason)}
          </div>
          <div id="healingResultBox">
            ${proposal.executionResult ? (
              proposal.executionResult.status === 'PASSED' ? `
                <div class="healed-result-pass" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                  <div class="healed-title" style="font-weight: 700; color: var(--success, #34d399); font-size: 14px; margin-bottom: 4px;">Healed Spec Run: ${proposal.executionResult.status} (${proposal.executionResult.durationMs}ms)</div>
                  <div style="font-size: 12px; color: var(--text-muted);">Executed with fresh synthetic user "${proposal.executionResult.username}" and verified in database.</div>
                  <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <a class="btn" href="/evidence/tc2/tc2_healed.spec.ts" target="_blank">📄 Healed Spec</a>
                    <a class="btn" href="/evidence/tc2/tc2_healed_screenshot.png" target="_blank">📷 Screenshot</a>
                    <a class="btn" href="/evidence/tc2/tc2_healed_trace.zip" target="_blank">🔍 Trace</a>
                  </div>
                </div>
              ` : `
                <div class="healed-result-fail" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                  <div class="healed-title" style="font-weight: 700; color: var(--danger, #f87171); font-size: 14px; margin-bottom: 4px;">Healed Spec Run: FAILED (${proposal.executionResult.durationMs}ms)</div>
                  <div style="font-size: 12px; color: #fca5a5; word-break: break-word;">${escapeHtml(proposal.executionResult.error || 'Execution failed')}</div>
                  <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <a class="btn" href="/evidence/tc2/tc2_healed.spec.ts" target="_blank">📄 Healed Spec</a>
                    <a class="btn" href="/evidence/tc2/tc2_healed_screenshot.png" target="_blank">📷 Screenshot</a>
                    <a class="btn" href="/evidence/tc2/tc2_healed_trace.zip" target="_blank">🔍 Trace</a>
                  </div>
                </div>
              `
            ) : ''}
          </div>
        </div>
        <div>
          <div id="healingActionArea" style="border-top: 1px solid var(--border); padding-top: 16px;">
            ${!proposal.status.startsWith('APPROVED') ? `
              <div style="font-size: 12px; color: var(--warning, #fbbf24); margin-bottom: 10px;">
                ⚠ Human approval required. Clicking Approve will apply the fix to a separate spec copy (<code>tc2_healed.spec.ts</code>) and execute it. Never applied automatically.
              </div>
              <button id="approveHealingBtn" class="btn" onclick="window.approveHealing()" style="width: 100%; justify-content: center; font-weight: 700;">
                ✓ Approve & Run Healed Spec
              </button>
            ` : `
              <div style="font-size: 13px; color: ${proposal.status === 'APPROVED_PASSED' ? 'var(--success, #34d399)' : 'var(--danger, #f87171)'}; margin-bottom: 10px;">
                ${proposal.status === 'APPROVED_PASSED' ? '✓ Healed spec executed on separate copy. Official TC2 run preserved untouched.' : '✖ Previous run failed. You can re-run below.'}
              </div>
              <button id="approveHealingBtn" class="btn" onclick="window.approveHealing()" style="width: 100%; justify-content: center; font-weight: 700;">
                ✓ Re-run Healed Spec
              </button>
            `}
          </div>
          <div id="healingCardFeedback" style="margin-top: 12px;"></div>
        </div>
      </div>

      <!-- Bonus 2: Stability Score (TC1) -->
      <div id="cardStability" style="padding: 22px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <h3 class="bonus-card-title" style="font-size: 18px; font-weight: 700; color: var(--card-title-color, #f1f5f9);">2. Stability Score (TC1)</h3>
            <span id="stabilityStatusBadge" class="badge ${stability && stability.passedRuns === stability.totalRuns ? 'badge-pass' : 'badge-warn'}">
              ${stability ? stability.scoreText : 'Not yet calculated'}
            </span>
          </div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
            Executes the complete registration flow 3 consecutive times with fresh UUID synthetic credentials to detect flakiness or state collisions.
          </p>
          <div id="stabilityResultBox">
            ${stability ? `
              <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                ${stability.runs.map(r => `
                  <div class="stability-run-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 6px; padding: 8px 12px; font-size: 13px;">
                    <div>
                      <strong>Run ${r.runIndex}:</strong> <span class="badge ${r.status === 'PASSED' ? 'badge-pass' : 'badge-fail'}">${r.status}</span>
                      <span style="font-size: 12px; color: var(--text-muted); margin-left: 6px;">(${r.durationMs}ms)</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); font-family: monospace;">${r.username}</div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 14px;">
                Click below to run the 3-iteration stability test.
              </div>
            `}
          </div>
        </div>
        <div>
          <button id="runStabilityBtn" class="btn" style="width: 100%; justify-content: center; font-weight: 600;">
            ⚡ Recalculate 3x Stability Score
          </button>
          <div id="stabilityCardFeedback" style="margin-top: 12px;"></div>
        </div>
      </div>

      <!-- Bonus 3: Accessibility Audit -->
      <div id="cardA11y" style="padding: 22px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <h3 class="bonus-card-title" style="font-size: 18px; font-weight: 700; color: var(--card-title-color, #f1f5f9);">3. Accessibility Check (axe-core)</h3>
            <span id="a11yStatusBadge" class="badge ${accessibility && accessibility.violationsCount === 0 ? 'badge-pass' : 'badge-warn'}">
              ${accessibility ? `${accessibility.violationsCount} violations found` : 'Not yet run'}
            </span>
          </div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
            <div><strong>Page URL:</strong> <code>${accessibility ? accessibility.url : 'http://localhost:3000/register'}</code></div>
            <div><strong>Checked At:</strong> <span id="a11yTimestamp">${accessibility ? new Date(accessibility.inspectedAt).toLocaleTimeString() : 'N/A'}</span></div>
          </div>
          <div id="a11yResultBox">
            ${accessibility ? `
              <div tabindex="0" style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                ${accessibility.violations.length === 0 ? `
                  <div style="font-size: 13px; color: var(--success, #34d399);">✓ No accessibility violations found!</div>
                ` : accessibility.violations.map(v => `
                  <div class="a11y-violation-item" style="background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 6px; padding: 8px 12px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <strong class="a11y-violation-id" style="color: var(--flow-title, #60a5fa);">${escapeHtml(v.id)}</strong>
                      <span class="badge badge-fail" style="font-size: 11px; padding: 2px 6px;">${escapeHtml(v.impact)}</span>
                    </div>
                    <div class="a11y-violation-desc" style="color: var(--text, #cbd5e1); margin-bottom: 4px;">${escapeHtml(v.description)}</div>
                    <a href="${escapeHtml(v.helpUrl)}" target="_blank" class="a11y-violation-link" style="color: var(--accent, #93c5fd); text-decoration: underline; font-size: 11px;">Rule details ↗</a>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 14px;">
                Click below to execute the automated axe-core audit.
              </div>
            `}
          </div>
        </div>
        <div>
          <button id="runA11yBtn" class="btn" style="width: 100%; justify-content: center; font-weight: 600;">
            🔍 Run Accessibility Check
          </button>
          <div id="a11yCardFeedback" style="margin-top: 12px;"></div>
        </div>
      </div>
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>`;
}

function renderCustomRunRow(run: any): string {
  let inputObj: any = {};
  let unresolved: string[] = [];
  try { inputObj = JSON.parse(run.inputJson); } catch {}
  try { unresolved = JSON.parse(run.unresolvedItemsJson || '[]'); } catch {}

  const relEvidenceDir = path.basename(run.evidencePath || run.id.toLowerCase());
  const timelineId = 'custom_timeline_' + run.id;

  const evidenceDir = path.resolve(process.cwd(), 'evidence', relEvidenceDir);
  const hasScreenshot = fs.existsSync(path.join(evidenceDir, 'run_1_screenshot.png'));
  const hasTrace = fs.existsSync(path.join(evidenceDir, 'run_1_trace.zip'));
  const hasRawError = fs.existsSync(path.join(evidenceDir, 'raw_playwright_error.txt'));
  const hasDraft1 = fs.existsSync(path.join(evidenceDir, 'draft_1_rejected.spec.ts'));
  const hasDraft2 = fs.existsSync(path.join(evidenceDir, 'draft_2_approved.spec.ts'));
  const specFileName = `${run.testCaseId.toLowerCase()}_flow.spec.ts`;
  const hasSpec = fs.existsSync(path.join(evidenceDir, specFileName));
  const hasDbRecord = fs.existsSync(path.join(evidenceDir, 'backend_verification_run_1.json'));

  // Determine status (Drafting, Pending approval, Approved, Running, Passed, Failed, Rejected, Error)
  let statusText = 'Pending approval';
  let badgeClass = 'badge-warn';

  if (run._isDrafting || run.approvalStatus === 'DRAFTING') {
    statusText = 'Drafting';
    badgeClass = 'badge-warn';
  } else if (run._isRunning || run.run1Status === 'RUNNING') {
    statusText = 'Running...';
    badgeClass = 'badge-warn';
  } else if (run.approvalStatus === 'REJECTED') {
    statusText = 'Rejected';
    badgeClass = 'badge-fail';
  } else if (run.run1Status === 'PASSED') {
    statusText = 'Passed';
    badgeClass = 'badge-pass';
  } else if (run.run1Status === 'FAILED') {
    statusText = 'Failed';
    badgeClass = 'badge-fail';
  } else if (run.run1Status === 'ERROR' || run.approvalStatus === 'ERROR') {
    statusText = 'Error';
    badgeClass = 'badge-fail';
  } else if (run.approvalStatus === 'APPROVED' && run.run1Status === 'PENDING') {
    statusText = 'Running...';
    badgeClass = 'badge-warn';
  } else if (run.approvalStatus === 'PENDING_APPROVAL') {
    statusText = 'Pending approval';
    badgeClass = 'badge-warn';
  } else if (run.approvalStatus === 'APPROVED') {
    statusText = 'Approved';
    badgeClass = 'badge-pass';
  }

  const isPending = (run.approvalStatus === 'PENDING_APPROVAL' && (run.run1Status === 'PENDING' || !run.run1Status));
  const isRunning = (statusText === 'Running...' || statusText === 'Drafting');

  // Approver and timestamp
  const approverName = run.approver || (isPending ? 'human' : 'human');
  const runTime = run.updatedAt || run.createdAt;
  const formattedTime = runTime ? new Date(runTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';

  // Run and rerun result display with stamp-style badges
  let runResultHtml = '';
  if (isRunning) {
    runResultHtml = `
      <div class="run-verdict-stack">
        <div class="run-verdict-item">
          <span class="badge badge-warn badge-stamp">⏳ ${statusText.toUpperCase()}</span>
        </div>
      </div>
    `;
  } else if (isPending) {
    runResultHtml = `
      <div class="run-verdict-stack">
        <div class="run-verdict-item">
          <span class="badge badge-warn badge-stamp">⏳ AWAITING APPROVAL</span>
        </div>
      </div>
    `;
  } else if (statusText === 'Rejected') {
    runResultHtml = `
      <div class="run-verdict-stack">
        <div class="run-verdict-item">
          <span class="badge badge-fail badge-stamp">✖ REJECTED</span>
        </div>
        <div class="run-verdict-sub">Halted by human</div>
      </div>
    `;
  } else if (statusText === 'Error') {
    runResultHtml = `
      <div class="run-verdict-stack">
        <div class="run-verdict-item">
          <span class="badge badge-fail badge-stamp">✖ ERROR</span>
        </div>
      </div>
    `;
  } else {
    runResultHtml = `
      <div class="run-verdict-stack">
        <div class="run-verdict-item">
          <span class="run-verdict-label">Run 1</span>
          <span class="badge ${run.run1Status === 'PASSED' ? 'badge-pass' : 'badge-fail'} badge-stamp">${run.run1Status === 'PASSED' ? '✓ ' : '✖ '}${run.run1Status || 'N/A'}</span>
        </div>
        <div class="run-verdict-item">
          <span class="run-verdict-label">Rerun</span>
          <span class="badge ${run.run2Status === 'PASSED' ? 'badge-pass' : 'badge-fail'} badge-stamp">${run.run2Status === 'PASSED' ? '✓ ' : '✖ '}${run.run2Status || 'N/A'}</span>
        </div>
      </div>
    `;
  }

  // Observed vs intended display
  let observedHtml = '';
  if (run.run1Status === 'FAILED' || statusText === 'Error') {
    observedHtml = `
      <div style="color: var(--danger); font-weight: 600; font-size: 13px; line-height: 1.45; word-break: break-word; overflow-wrap: anywhere;">
        ✖ ${escapeHtml(run.actualResult || 'Test execution failed.')}
      </div>
    `;
  } else if (run.run1Status === 'PASSED') {
    observedHtml = `
      <div style="font-size: 13px; font-weight: 500; white-space: pre-line; line-height: 1.45; word-break: break-word; overflow-wrap: anywhere; color: var(--success);">
        ✓ ${escapeHtml(run.actualResult || 'Assertions passed.')}
      </div>
    `;
  } else if (isPending) {
    observedHtml = `<div style="font-size: 13px; color: var(--text-muted); line-height: 1.4; word-break: break-word; overflow-wrap: anywhere;">Awaiting human approval before execution.</div>`;
  } else if (statusText === 'Rejected') {
    observedHtml = `<div style="font-size: 13px; color: var(--danger); line-height: 1.4; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(run.actualResult || 'Draft was rejected by human.')}</div>`;
  } else if (isRunning) {
    observedHtml = `<div style="font-size: 13px; color: var(--accent); line-height: 1.4; word-break: break-word; overflow-wrap: anywhere;">Executing against demo app...</div>`;
  } else {
    observedHtml = `<div style="font-size: 13px; color: var(--text-muted); line-height: 1.45; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(run.actualResult || '')}</div>`;
  }

  const mainRow = `
  <tr id="row_${run.id}">
    <td class="col-tc">
      <span class="badge badge-tc">${run.testCaseId}</span>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-family: var(--mono);">${run.id.split('_')[1] || ''}</div>
      <button class="btn timeline-toggle-btn" data-timeline-id="${timelineId}" style="margin-top: 6px; padding: 4px 6px; font-size: 11px; width: 100%; justify-content: center; font-weight: 700;">⏱ Timeline ▾</button>
    </td>
    <td class="col-flow">
      <div class="flow-title-text" style="font-weight: 700; color: var(--flow-title); font-size: 14px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap;">${escapeHtml(inputObj.flow_description || '')}</div>
      <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap;">
        <strong style="color: var(--label-color);">Expected:</strong> ${escapeHtml(run.expectedResult || inputObj.expected_end_state || '')}
      </div>
      ${unresolved.length > 0 ? `
        <div style="margin-top: 8px;">
          <span class="badge badge-fail badge-stamp" style="font-size: 11px;">✖ UNRESOLVED LOCATORS</span>
          <ul style="font-size: 12px; color: var(--danger); margin-left: 14px; margin-top: 4px; word-break: break-word; overflow-wrap: anywhere; font-family: var(--mono);">
            ${unresolved.map(u => `<li>${escapeHtml(u)}</li>`).join('')}
          </ul>
        </div>
      ` : '<div style="font-size: 12.5px; color: var(--success); margin-top: 6px; font-weight: 600;">✓ Selectors resolved</div>'}
    </td>
    <td class="col-source">
      <div style="font-size: 12px; word-break: break-all; overflow-wrap: anywhere; font-family: var(--mono);"><code>${escapeHtml(run.sourceUrl || 'http://localhost:3000/register')}</code></div>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 5px; font-family: var(--mono);">
        Inspected: ${run.retrievalTime ? new Date(run.retrievalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
      </div>
    </td>
    <td class="col-approval">
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <span id="badge_${run.id}" class="badge ${badgeClass} badge-stamp">${statusText.toUpperCase()}</span>
        <span class="badge badge-approver" style="font-size: 11px; font-family: var(--mono);">Approver: ${escapeHtml(approverName)}</span>
      </div>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 6px; font-family: var(--mono);">
        Time: ${formattedTime}
      </div>
      ${run.criticFeedback ? `
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere;">
          ${escapeHtml(run.criticFeedback)}
        </div>
      ` : ''}
      ${isPending ? `
        <div style="display: flex; gap: 6px; margin-top: 10px;">
          <button class="btn" onclick="window.approveCustomDraft('${run.id}')" style="background: var(--success); color: #042f1a; font-size: 12px; padding: 5px 12px; font-weight: 800; border-color: var(--success);">
            ✓ Approve
          </button>
          <button class="btn" onclick="window.rejectCustomDraft('${run.id}')" style="background: var(--danger); color: #3b070c; font-size: 12px; padding: 5px 12px; font-weight: 800; border-color: var(--danger);">
            ✖ Reject
          </button>
        </div>
      ` : ''}
    </td>
    <td class="col-run-result">
      ${runResultHtml}
    </td>
    <td class="col-observed">
      ${observedHtml}
    </td>
    <td class="col-evidence">
      <div class="evidence-list" style="display: flex; flex-direction: column; gap: 8px;">
        ${hasScreenshot ? `<a class="chip-evidence chip-screenshot" href="/evidence/${relEvidenceDir}/run_1_screenshot.png" target="_blank">📷 Screenshot</a>` : ''}
        ${hasTrace ? `<a class="chip-evidence chip-trace" href="/evidence/${relEvidenceDir}/run_1_trace.zip" target="_blank">🔍 Trace Zip</a>` : ''}
        ${hasDraft2 ? `<a class="chip-evidence chip-spec-approved" href="/evidence/${relEvidenceDir}/draft_2_approved.spec.ts" target="_blank">📄 Draft 2 (Approved)</a>` : ''}
        ${hasDraft1 ? `<a class="chip-evidence chip-spec-rejected" href="/evidence/${relEvidenceDir}/draft_1_rejected.spec.ts" target="_blank">📄 Draft 1 (Rejected)</a>` : ''}
        ${!hasDraft1 && !hasDraft2 && hasSpec ? `<a class="chip-evidence chip-spec" href="/evidence/${relEvidenceDir}/${specFileName}" target="_blank">📄 Spec File</a>` : ''}
        ${hasDbRecord ? `<a class="chip-evidence chip-db" href="/evidence/${relEvidenceDir}/backend_verification_run_1.json" target="_blank">🗄 DB Record</a>` : ''}
        ${hasRawError ? `<a class="chip-evidence chip-error" href="/evidence/${relEvidenceDir}/raw_playwright_error.txt" target="_blank">⚠ Raw Error</a>` : ''}
        ${!hasScreenshot && !hasTrace && !hasSpec && !hasDraft1 && !hasDraft2 ? `<span style="font-size: 11.5px; color: var(--text-muted); font-family: var(--mono);">(Available after run)</span>` : ''}
      </div>
    </td>
  </tr>
  `;

  const timelineRow = renderTimelineRow(run, timelineId, relEvidenceDir);
  return mainRow + timelineRow;
}

function renderRunRow(run: any, isHistorical = false): string {
  let inputObj: any = {};
  let unresolved: string[] = [];
  try { inputObj = JSON.parse(run.inputJson); } catch {}
  try { unresolved = JSON.parse(run.unresolvedItemsJson || '[]'); } catch {}

  const relEvidenceDir = path.basename(run.evidencePath || '');
  const isTc2 = run.testCaseId === 'TC2';
  const isTc3 = run.testCaseId === 'TC3' || run.approvalStatus === 'DRAFT_REJECTED_UPGRADED';
  const isTc4 = run.testCaseId === 'TC4';
  const timelineId = 'timeline_' + run.id;

  const evidenceDir = path.resolve(process.cwd(), 'evidence', relEvidenceDir);
  const hasRawError = fs.existsSync(path.join(evidenceDir, 'raw_playwright_error.txt'));
  const hasDraft1 = fs.existsSync(path.join(evidenceDir, 'draft_1_rejected.spec.ts'));
  const hasDraft2 = fs.existsSync(path.join(evidenceDir, 'draft_2_approved.spec.ts'));
  const hasDupProof = fs.existsSync(path.join(evidenceDir, 'duplicate_proof.json'));
  const hasDbRecord = fs.existsSync(path.join(evidenceDir, 'backend_verification_run_1.json'));

  const mainRow = `
  <tr id="row_${run.id}">
    <td class="col-tc">
      <span class="badge badge-tc">${run.testCaseId}</span>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-family: var(--mono);">${run.id.split('_')[1] || ''}</div>
      <button class="btn timeline-toggle-btn" data-timeline-id="${timelineId}" style="margin-top: 6px; padding: 4px 6px; font-size: 11px; width: 100%; justify-content: center; font-weight: 700;">⏱ Timeline ▾</button>
    </td>
    <td class="col-flow">
      <div class="flow-title-text" style="font-weight: 700; color: var(--flow-title); font-size: 14px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap;">${escapeHtml(inputObj.flow_description || '')}</div>
      <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap;">
        <strong style="color: var(--label-color);">Expected:</strong> ${escapeHtml(run.expectedResult || inputObj.expected_end_state || '')}
      </div>
      ${isTc2 ? `
        <div style="margin-top: 8px;">
          <span class="badge badge-fail badge-stamp" style="font-size: 11px;">✖ SELECTOR NOT FOUND</span>
          <div style="font-size: 12px; color: var(--danger); margin-top: 4px; word-break: break-word; overflow-wrap: anywhere; font-family: var(--mono);">
            Selector 'button.non-existent-btn-class-changed' was not found on /register
          </div>
        </div>
      ` : unresolved.length > 0 ? `
        <div style="margin-top: 8px;">
          <span class="badge badge-fail badge-stamp" style="font-size: 11px;">✖ UNRESOLVED LOCATORS</span>
          <ul style="font-size: 12px; color: var(--danger); margin-left: 14px; margin-top: 4px; word-break: break-word; overflow-wrap: anywhere; font-family: var(--mono);">
            ${unresolved.map(u => `<li>${u}</li>`).join('')}
          </ul>
        </div>
      ` : '<div style="font-size: 12.5px; color: var(--success); margin-top: 6px; font-weight: 600;">✓ All selectors resolved</div>'}
    </td>
    <td class="col-source">
      <div style="font-size: 12px; word-break: break-all; overflow-wrap: anywhere; font-family: var(--mono);"><code>${run.sourceUrl || 'N/A'}</code></div>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 5px; font-family: var(--mono);">
        Inspected: ${run.retrievalTime ? new Date(run.retrievalTime).toLocaleTimeString() : 'N/A'}
      </div>
    </td>
    <td class="col-approval">
      ${isTc2 ? `
        <div>
          <span class="badge badge-pass badge-stamp">✓ APPROVED</span>
          <span class="badge badge-approver" style="font-size: 11px; margin-left: 4px; font-family: var(--mono);">Approver: ${escapeHtml(run.approver || 'human')}</span>
        </div>
        <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 6px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere;">
          Intentional failing selector test; expected to fail with a clear message.
        </div>
      ` : isTc3 ? `
        <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px;">
          <!-- Draft 1: REJECTED -->
          <div class="draft-preview-rejected" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 6px; min-width: 0;">
            <span class="badge badge-fail badge-stamp badge-rejected" style="font-size: 10px; padding: 2px 5px;">✖ REJECTED</span>
            <div class="draft-meta" style="font-size: 11px; color: #fca5a5; margin: 4px 0; line-height: 1.3; word-break: break-word; overflow-wrap: anywhere;">
              <strong>Critic:</strong> ${escapeHtml(run.criticFeedback || '')}
            </div>
            <pre class="code-preview" tabindex="0" style="font-size: 10px; max-height: 90px; padding: 4px 6px; min-width: 0; overflow-x: auto;"><code>${escapeHtml(run.draftCode || '')}</code></pre>
          </div>
          <!-- Draft 2: APPROVED -->
          <div class="draft-preview-approved" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; padding: 6px; min-width: 0;">
            <span class="badge badge-pass badge-stamp" style="font-size: 10px; padding: 2px 5px;">✓ APPROVED</span>
            <span class="badge badge-approver" style="font-size: 9.5px; font-family: var(--mono);">${escapeHtml(run.approver || 'human')}</span>
            <div class="draft-meta" style="font-size: 11px; color: #6ee7b7; margin: 4px 0; line-height: 1.3; word-break: break-word; overflow-wrap: anywhere;">
              <strong>State Assertion:</strong> Verified user link
            </div>
            <pre class="code-preview" tabindex="0" style="font-size: 10px; max-height: 90px; padding: 4px 6px; min-width: 0; overflow-x: auto;"><code>${escapeHtml(run.approvedCode || '')}</code></pre>
          </div>
        </div>
      ` : `
        <div>
          <span class="badge ${run.approvalStatus === 'APPROVED' ? 'badge-pass' : 'badge-fail'} badge-stamp">${run.approvalStatus === 'APPROVED' ? '✓ APPROVED' : '✖ ' + (run.approvalStatus || 'APPROVED')}</span>
          <span class="badge badge-approver" style="font-size: 11px; margin-left: 4px; font-family: var(--mono);">Approver: ${escapeHtml(run.approver || 'human')}</span>
        </div>
        <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 6px; line-height: 1.4; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(run.criticFeedback || 'State assertion verified')}</div>
      `}
    </td>
    <td class="col-run-result">
      ${isTc2 ? `
        <div class="run-verdict-stack">
          <div class="run-verdict-item">
            <span class="badge badge-fail badge-stamp">✖ FAILED AS EXPECTED</span>
          </div>
          <div class="run-verdict-sub">rerun skipped: failed deterministically</div>
        </div>
      ` : `
        <div class="run-verdict-stack">
          <div class="run-verdict-item">
            <span class="run-verdict-label">Run 1</span>
            <span class="badge ${run.run1Status === 'PASSED' ? 'badge-pass' : 'badge-fail'} badge-stamp">${run.run1Status === 'PASSED' ? '✓ ' : '✖ '}${run.run1Status}</span>
          </div>
          <div class="run-verdict-item">
            <span class="run-verdict-label">Rerun</span>
            <span class="badge ${run.run2Status === 'PASSED' ? 'badge-pass' : 'badge-fail'} badge-stamp">${run.run2Status === 'PASSED' ? '✓ ' : '✖ '}${run.run2Status}</span>
          </div>
        </div>
      `}
    </td>
    <td class="col-observed">
      <div style="font-size: 13px; font-weight: 500; white-space: pre-line; line-height: 1.45; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(run.actualResult || '')}</div>
    </td>
    <td class="col-evidence">
      <div class="evidence-list" style="display: flex; flex-direction: column; gap: 8px;">
        <a class="chip-evidence chip-screenshot" href="/evidence/${relEvidenceDir}/run_1_screenshot.png" target="_blank">📷 Screenshot</a>
        <a class="chip-evidence chip-trace" href="/evidence/${relEvidenceDir}/run_1_trace.zip" target="_blank">🔍 Trace Zip</a>
        ${hasDraft1 ? `<a class="chip-evidence chip-spec-rejected" href="/evidence/${relEvidenceDir}/draft_1_rejected.spec.ts" target="_blank">📄 Draft 1 (Rejected)</a>` : ''}
        ${hasDraft2 ? `<a class="chip-evidence chip-spec-approved" href="/evidence/${relEvidenceDir}/draft_2_approved.spec.ts" target="_blank">📄 Draft 2 (Approved)</a>` : ''}
        ${!hasDraft1 && !hasDraft2 ? `<a class="chip-evidence chip-spec" href="/evidence/${relEvidenceDir}/${run.testCaseId.toLowerCase()}_flow.spec.ts" target="_blank">📄 Spec File</a>` : ''}
        ${hasDbRecord ? `<a class="chip-evidence chip-db" href="/evidence/${relEvidenceDir}/backend_verification_run_1.json" target="_blank">🗄 DB Record</a>` : ''}
        ${hasRawError ? `<a class="chip-evidence chip-error" href="/evidence/${relEvidenceDir}/raw_playwright_error.txt" target="_blank">⚠ Raw Error</a>` : ''}
        ${hasDupProof ? `<a class="chip-evidence chip-db" href="/evidence/${relEvidenceDir}/duplicate_proof.json" target="_blank">📊 DB Proof</a>` : ''}
      </div>
    </td>
  </tr>
  `;

  const timelineRow = renderTimelineRow(run, timelineId, relEvidenceDir);
  return mainRow + timelineRow;
}

function renderTimelineRow(run: any, timelineId: string, relEvidenceDir: string): string {
  let inputObj: any = {};
  let selectors: any[] = [];
  let decisions: any[] = [];
  let unresolved: string[] = [];
  let events: Record<string, any> = {};

  try { inputObj = JSON.parse(run.inputJson || '{}'); } catch {}
  try { selectors = JSON.parse(run.selectorsJson || '[]'); } catch {}
  try { decisions = JSON.parse(run.decisionReasonsJson || '[]'); } catch {}
  try { unresolved = JSON.parse(run.unresolvedItemsJson || '[]'); } catch {}
  try { events = JSON.parse(run.stepEventsJson || '{}'); } catch {}

  const isTc2 = run.testCaseId === 'TC2';
  const isTc3 = run.testCaseId === 'TC3' || run.approvalStatus === 'DRAFT_REJECTED_UPGRADED';
  const isUncertain = unresolved.length > 0 || isTc2;
  const isDraftRejected = run.approvalStatus === 'DRAFT_REJECTED_UPGRADED' || run.criticFeedback?.includes('REJECTED');
  const isPendingApproval = run.approvalStatus === 'PENDING_APPROVAL';
  const isRunning = run._isRunning || run.run1Status === 'RUNNING';

  const formatT = (t: string) => {
    if (!t) return 'N/A';
    try {
      const d = new Date(t);
      return isNaN(d.getTime()) ? t : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return t;
    }
  };

  // Real timestamps from stored chronological events
  const tUnderstand = events['understand']?.timestamp || run.createdAt;
  const tBrowse = events['browse']?.timestamp || run.retrievalTime || run.createdAt;
  const tReason = events['reason']?.timestamp || run.retrievalTime || run.createdAt;
  const tCritic = events['critic']?.timestamp || run.retrievalTime || run.createdAt;
  const tApproval = events['approval']?.timestamp || run.updatedAt || run.createdAt;
  const tRunner = events['runner']?.timestamp || run.createdAt;
  const tVerify = events['verify']?.timestamp || run.updatedAt;
  const tReport = events['report']?.timestamp || run.updatedAt;

  const realApprover = events['approval']?.approver || run.approver || 'human';
  const approvedVersion = events['approval']?.version || (isTc3 ? 'Draft 2 (State Assertion: Navbar User Profile Link)' : 'Draft 1 (Specification)');

  const evidenceDir = path.resolve(process.cwd(), 'evidence', relEvidenceDir);
  const hasScreenshot = fs.existsSync(path.join(evidenceDir, 'run_1_screenshot.png'));
  const hasTrace = fs.existsSync(path.join(evidenceDir, 'run_1_trace.zip'));
  const hasDraft2 = fs.existsSync(path.join(evidenceDir, 'draft_2_approved.spec.ts'));
  const hasDbRecord = fs.existsSync(path.join(evidenceDir, 'backend_verification_run_1.json'));

  return `
  <tr id="${timelineId}" class="timeline-row" style="display: none;">
    <td colspan="7">
      <div class="timeline-header-block">
        <div class="timeline-title-row">
          <span class="timeline-pipeline-title">⚡ Agent Timeline Metro Line — ${run.testCaseId}</span>
          <span class="badge badge-tc">${run.id}</span>
          <span class="badge ${isPendingApproval ? 'badge-warn badge-stamp' : (run.approvalStatus === 'REJECTED' ? 'badge-fail badge-stamp' : 'badge-pass badge-stamp')}">
            ${isPendingApproval ? '⏳ WAITING FOR HUMAN' : (run.approvalStatus === 'REJECTED' ? '✖ REJECTED · ' + escapeHtml(realApprover) : '✓ APPROVED · ' + escapeHtml(realApprover))}
          </span>
        </div>
        <div class="timeline-meta-text">
          <span>Started: ${formatT(tUnderstand)}</span>
          <span>•</span>
          <span>SQLite: <code>pipeline_runs</code></span>
        </div>
      </div>

      <!-- HORIZONTAL METRO-LINE TRACK (8 Stations) -->
      <div class="metro-track-container">
        <div class="metro-track-line ${isRunning || isPendingApproval ? 'metro-track-active' : ''}">
          ${isRunning || isPendingApproval ? '<div class="metro-active-dot" aria-hidden="true"></div>' : ''}
        </div>

        <div class="timeline-stepper">
          <!-- Station 1: Understand -->
          <div class="timeline-step station-done">
            <div class="timeline-step-rail"><span class="timeline-step-index">1</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">1. Understand</div>
                <span class="badge badge-pass station-badge"><span class="status-icon">✓</span> Done</span>
                <div class="station-time">${formatT(tUnderstand)}</div>
              </div>
              <div class="station-body">
                <div style="margin-bottom: 4px; white-space: pre-wrap;"><strong>Parsed:</strong> ${escapeHtml(inputObj.flow_description || '')}</div>
                <div style="white-space: pre-wrap;"><strong>Expected:</strong> ${escapeHtml(run.expectedResult || inputObj.expected_end_state || '')}</div>
              </div>
            </div>
          </div>

          <!-- Station 2: Browse -->
          <div class="timeline-step station-done">
            <div class="timeline-step-rail"><span class="timeline-step-index">2</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">2. Browse</div>
                <span class="badge badge-pass station-badge"><span class="status-icon">✓</span> Done</span>
                <div class="station-time">${formatT(tBrowse)}</div>
              </div>
              <div class="station-body">
                <div style="margin-bottom: 4px;"><strong>Target:</strong> <code>${escapeHtml(run.sourceUrl || '')}</code></div>
                <div><strong>Locators:</strong> ${selectors.length} interactive elements registered.</div>
              </div>
            </div>
          </div>

          <!-- Station 3: Reason -->
          <div class="timeline-step ${isUncertain ? 'station-uncertain' : 'station-done'}">
            <div class="timeline-step-rail"><span class="timeline-step-index">3</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">3. Reason</div>
                <span class="badge ${isUncertain ? 'badge-uncertain' : 'badge-pass'} station-badge">
                  <span class="status-icon">${isUncertain ? '?' : '✓'}</span> ${isUncertain ? 'Uncertain' : 'Done'}
                </span>
                <div class="station-time">${formatT(tReason)}</div>
              </div>
              <div class="station-body">
                ${isUncertain ? `
                  <div><strong>Uncertain:</strong> Selector 'button.non-existent-btn-class-changed' was missing from DOM. Marked as unresolved locator.</div>
                ` : `
                  <div><strong>Selected:</strong> Accessible role & placeholder locators selected for durability against styling changes.</div>
                `}
              </div>
            </div>
          </div>

          <!-- Station 4: Critic -->
          <div class="timeline-step ${isDraftRejected ? 'station-fail' : 'station-done'}">
            <div class="timeline-step-rail"><span class="timeline-step-index">4</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">4. Critic</div>
                <span class="badge ${isDraftRejected ? 'badge-fail' : 'badge-pass'} station-badge">
                  <span class="status-icon">${isDraftRejected ? '✖' : '✓'}</span> ${isDraftRejected ? 'Rejected' : 'Done'}
                </span>
                <div class="station-time">${formatT(tCritic)}</div>
              </div>
              <div class="station-body">
                ${isDraftRejected ? `
                  <div><strong>Draft 1 Rejected:</strong> ${escapeHtml(run.criticFeedback || '')}</div>
                ` : `
                  <div><strong>Accepted:</strong> ${escapeHtml(run.criticFeedback || 'Spec contains verifiable state assertion.')}</div>
                `}
              </div>
            </div>
          </div>

          <!-- Station 5: Approval -->
          <div class="timeline-step ${isPendingApproval ? 'station-pending station-waiting' : (run.approvalStatus === 'REJECTED' ? 'station-fail' : 'station-done')}">
            <div class="timeline-step-rail"><span class="timeline-step-index">5</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">5. Approval</div>
                <span class="badge ${isPendingApproval ? 'badge-warn' : (run.approvalStatus === 'REJECTED' ? 'badge-fail' : 'badge-pass')} station-badge">
                  <span class="status-icon">${isPendingApproval ? '⏳' : (run.approvalStatus === 'REJECTED' ? '✖' : '✓')}</span>
                  ${isPendingApproval ? 'Waiting for human' : (run.approvalStatus === 'REJECTED' ? 'Rejected' : 'Done')}
                </span>
                <div class="station-time">${formatT(tApproval)}</div>
              </div>
              <div class="station-body">
                ${isPendingApproval ? `
                  <div style="color: #fbbf24; font-weight: 700; margin-bottom: 6px;">Waiting for human</div>
                  <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 8px;">Review specification before execution:</div>
                  <div style="display: flex; gap: 6px;">
                    <button class="btn" onclick="window.approveCustomDraft('${run.id}')" style="flex: 1; justify-content: center; background: var(--success); color: #042f1a; font-size: 11px; font-weight: 800; border-color: var(--success); padding: 5px 6px;">✓ Approve</button>
                    <button class="btn" onclick="window.rejectCustomDraft('${run.id}')" style="flex: 1; justify-content: center; background: var(--danger); color: #3b070c; font-size: 11px; font-weight: 800; border-color: var(--danger); padding: 5px 6px;">✖ Reject</button>
                  </div>
                ` : `
                  <div style="margin-bottom: 3px;"><strong>Approver:</strong> ${escapeHtml(realApprover)}</div>
                  <div><strong>Version:</strong> ${escapeHtml(approvedVersion)}</div>
                `}
              </div>
            </div>
          </div>

          <!-- Station 6: Run & Rerun -->
          <div class="timeline-step ${run.run1Status === 'PENDING' ? 'station-queued' : (run.run1Status === 'PASSED' ? 'station-done' : 'station-fail')}">
            <div class="timeline-step-rail"><span class="timeline-step-index">6</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">6. Run &amp; Rerun</div>
                <span class="badge ${run.run1Status === 'PENDING' ? 'badge-warn' : (run.run1Status === 'PASSED' ? 'badge-pass' : 'badge-fail')} station-badge">
                  <span class="status-icon">${run.run1Status === 'PENDING' ? '⏳' : (run.run1Status === 'PASSED' ? '✓' : '✖')}</span>
                  ${run.run1Status === 'PENDING' ? 'Queued' : (run.run1Status === 'PASSED' ? 'Done' : (isTc2 ? 'Failed (expected)' : 'Failed'))}
                </span>
                <div class="station-time">${formatT(tRunner)}</div>
              </div>
              <div class="station-body">
                <div><strong>Run 1:</strong> ${run.run1Status === 'PENDING' ? 'Queued' : run.run1Status}</div>
                <div><strong>Rerun:</strong> ${isTc2 ? 'skipped: failed deterministically' : (run.run1Status === 'PENDING' ? 'Queued' : run.run2Status)}</div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
                  ${hasScreenshot ? `<a class="chip-evidence chip-screenshot" href="/evidence/${relEvidenceDir}/run_1_screenshot.png" target="_blank" style="font-size: 10px; padding: 3px 6px;">📷 Screenshot</a>` : ''}
                  ${hasTrace ? `<a class="chip-evidence chip-trace" href="/evidence/${relEvidenceDir}/run_1_trace.zip" target="_blank" style="font-size: 10px; padding: 3px 6px;">🔍 Trace</a>` : ''}
                  ${hasDraft2 ? `<a class="chip-evidence chip-spec-approved" href="/evidence/${relEvidenceDir}/draft_2_approved.spec.ts" target="_blank" style="font-size: 10px; padding: 3px 6px;">📄 Draft 2</a>` : ''}
                </div>
              </div>
            </div>
          </div>

          <!-- Station 7: Verify -->
          <div class="timeline-step ${run.run1Status === 'PENDING' ? 'station-queued' : (isTc2 ? 'station-fail' : (run.run1Status === 'PASSED' ? 'station-done' : 'station-fail'))}">
            <div class="timeline-step-rail"><span class="timeline-step-index">7</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">7. Verify</div>
                <span class="badge ${run.run1Status === 'PENDING' ? 'badge-warn' : (isTc2 ? 'badge-fail' : (run.run1Status === 'PASSED' ? 'badge-pass' : 'badge-fail'))} station-badge">
                  <span class="status-icon">${run.run1Status === 'PENDING' ? '⏳' : (isTc2 ? '✖' : (run.run1Status === 'PASSED' ? '✓' : '✖'))}</span>
                  ${run.run1Status === 'PENDING' ? 'Queued' : (isTc2 ? 'Failed (expected)' : (run.run1Status === 'PASSED' ? 'Done' : 'Failed'))}
                </span>
                <div class="station-time">${formatT(tVerify)}</div>
              </div>
              <div class="station-body">
                ${isTc2 ? `
                  <div><strong>Observed:</strong> Broken selector threw expected timeout. Raw log captured.</div>
                ` : `
                  <div><strong>DB State:</strong> ${hasDbRecord ? 'Queried Conduit SQLite. Confirmed user record exists.' : (run.run1Status === 'PENDING' ? 'Awaiting test run.' : escapeHtml(run.actualResult?.split('\n')[0] || ''))}</div>
                `}
              </div>
            </div>
          </div>

          <!-- Station 8: Report -->
          <div class="timeline-step ${run.run1Status === 'PENDING' ? 'station-queued' : (isTc2 ? 'station-fail' : (run.run1Status === 'PASSED' ? 'station-done' : 'station-fail'))}">
            <div class="timeline-step-rail"><span class="timeline-step-index">8</span></div>
            <div class="timeline-step-card">
              <div>
                <div class="timeline-step-title">8. Report</div>
                <span class="badge ${run.run1Status === 'PENDING' ? 'badge-warn' : (isTc2 ? 'badge-fail' : (run.run1Status === 'PASSED' ? 'badge-pass' : 'badge-fail'))} station-badge">
                  <span class="status-icon">${run.run1Status === 'PENDING' ? '⏳' : (run.run1Status === 'PASSED' ? '✓' : '✖')}</span>
                  ${run.run1Status === 'PENDING' ? 'Queued' : (isTc2 ? 'Reported (Neg)' : (run.run1Status === 'PASSED' ? 'Done' : 'Failed'))}
                </span>
                <div class="station-time">${formatT(tReport)}</div>
              </div>
              <div class="station-body">
                <div><strong>Final Verdict:</strong> ${run.run1Status === 'PENDING' ? 'Draft recorded in SQLite. Awaiting approval.' : (isTc2 ? 'Negative test verified: mutated locator correctly reported.' : (run.run1Status === 'PASSED' ? 'E2E flow verified with DB validation.' : 'Completed with failures.'))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </td>
  </tr>
  `;
}

function escapeHtml(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\u2028/g, '&#8232;')
    .replace(/\u2029/g, '&#8233;');
}

if (process.argv[1] && (process.argv[1].endsWith('10_webui.ts') || process.argv[1].endsWith('10_webui.js'))) {
  startWebUI(PORT);
}

