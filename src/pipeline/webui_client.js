// Web UI Client JavaScript - Plain-English Playwright Test Writer Agent

// Global functions attached to window
window.toggleTimeline = function(id) {
  var row = document.getElementById(id);
  var btn = document.querySelector('[data-timeline-id="' + id + '"]');
  if (!row) return;
  if (row.style.display === 'none' || !row.style.display) {
    row.style.display = 'table-row';
    if (btn) btn.innerText = '⏱ Hide Timeline ▴';
  } else {
    row.style.display = 'none';
    if (btn) btn.innerText = '⏱ Timeline ▾';
  }
};

window.toggleHistory = function() {
  var container = document.getElementById('historyContainer');
  var btn = document.getElementById('toggleHistoryBtn');
  if (!container || !btn) return;
  var isHidden = container.style.display === 'none' || getComputedStyle(container).display === 'none';
  if (isHidden) {
    container.style.display = 'block';
    btn.innerText = '📁 Hide history';
    setTimeout(function() {
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  } else {
    container.style.display = 'none';
    var rows = container.querySelectorAll('tbody > tr:not(.timeline-row)');
    btn.innerText = rows.length > 0 ? '📂 Show history (' + rows.length + ' older runs)' : '📂 Show history';
  }
};

window.approveHealing = async function() {
  var btn = document.getElementById('approveHealingBtn');
  var badge = document.getElementById('healingStatusBadge');
  var feedback = document.getElementById('healingCardFeedback');
  var resultBox = document.getElementById('healingResultBox');
  
  if (btn) { btn.disabled = true; btn.innerText = 'Running healed spec...'; }
  if (badge) { badge.className = 'badge badge-warn'; badge.innerText = '⏳ Running...'; }
  if (feedback) {
    feedback.innerHTML = '<div style="color: var(--warning, #fbbf24); font-size: 13px; font-weight: 500;">⏳ Executing healed Playwright spec (tc2_healed.spec.ts) with fresh synthetic credentials...</div>';
  }

  try {
    var res = await fetch('/api/bonus/heal-tc2', { method: 'POST' });
    var data = await res.json().catch(function() { return { success: false, error: 'Server returned an invalid response' }; });
    
    if (res.ok && data.success && data.result && data.result.status === 'APPROVED_PASSED') {
      var exec = data.result.executionResult;
      if (badge) { badge.className = 'badge badge-pass'; badge.innerText = '✓ Approved & Verified'; }
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--success, #34d399); font-size: 13px; font-weight: 600;">✓ Pass: Healed spec executed successfully (' + exec.durationMs + 'ms) for user ' + exec.username + '. Verified in database.</div>';
      }
      if (resultBox) {
        resultBox.innerHTML = '<div class="healed-result-pass" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
          '<div class="healed-title" style="font-weight: 700; color: var(--success, #34d399); font-size: 14px; margin-bottom: 4px;">Healed Spec Run: ' + exec.status + ' (' + exec.durationMs + 'ms)</div>' +
          '<div style="font-size: 12px; color: var(--text-muted);">Executed with fresh synthetic user "' + exec.username + '" and verified in database.</div>' +
          '<div style="display: flex; gap: 8px; margin-top: 10px;">' +
            '<a class="btn" href="/evidence/tc2/tc2_healed.spec.ts" target="_blank">📄 Healed Spec</a>' +
            '<a class="btn" href="/evidence/tc2/tc2_healed_screenshot.png" target="_blank">📷 Screenshot</a>' +
            '<a class="btn" href="/evidence/tc2/tc2_healed_trace.zip" target="_blank">🔍 Trace</a>' +
          '</div>' +
        '</div>';
      }
      var actionArea = document.getElementById('healingActionArea');
      if (actionArea) {
        actionArea.innerHTML = '<div style="font-size: 13px; color: var(--success, #34d399); margin-bottom: 10px;">✓ Approved and executed on separate copy. Official TC2 record preserved.</div>' +
          '<button id="approveHealingBtn" class="btn" onclick="window.approveHealing()" style="width: 100%; justify-content: center; font-weight: 700;">✓ Re-run Healed Spec</button>';
      }
    } else {
      var errMsg = data.error || (data.result && data.result.executionResult && data.result.executionResult.error) || 'Execution failed';
      if (badge) { badge.className = 'badge badge-fail'; badge.innerText = '✖ Execution Failed'; }
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 10px; margin-top: 8px;">✖ Error: ' + errMsg + '</div>';
      }
      if (btn) { btn.disabled = false; btn.innerText = '✓ Retry Approve & Run'; }
    }
  } catch (err) {
    if (badge) { badge.className = 'badge badge-fail'; badge.innerText = '✖ Request Failed'; }
    if (feedback) {
      feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 10px; margin-top: 8px;">✖ Network Error: ' + String(err) + '</div>';
    }
    if (btn) { btn.disabled = false; btn.innerText = '✓ Retry Approve & Run'; }
  }
};

window.runStabilityScore = async function() {
  var btn = document.getElementById('runStabilityBtn');
  var badge = document.getElementById('stabilityStatusBadge');
  var feedback = document.getElementById('stabilityCardFeedback');
  var resultBox = document.getElementById('stabilityResultBox');

  if (btn) { btn.disabled = true; btn.innerText = 'Running 3 iterations...'; }
  if (badge) { badge.className = 'badge badge-warn'; badge.innerText = '⏳ Running...'; }
  if (feedback) {
    feedback.innerHTML = '<div style="color: var(--warning, #fbbf24); font-size: 13px; font-weight: 500;">⏳ Running 3 consecutive test iterations with fresh synthetic data...</div>';
  }

  try {
    var res = await fetch('/api/bonus/run-stability', { method: 'POST' });
    var data = await res.json();

    if (data.success && data.result) {
      var resObj = data.result;
      var isFullPass = resObj.passedRuns === resObj.totalRuns;
      if (badge) {
        badge.className = isFullPass ? 'badge badge-pass' : 'badge badge-fail';
        badge.innerText = resObj.scoreText;
      }
      if (feedback) {
        feedback.innerHTML = '<div style="color: ' + (isFullPass ? 'var(--success, #34d399)' : 'var(--danger, #f87171)') + '; font-size: 13px; font-weight: 600;">Result: ' + resObj.scoreText + '</div>';
      }
      if (resultBox && resObj.runs) {
        var html = '<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">';
        for (var i = 0; i < resObj.runs.length; i++) {
          var r = resObj.runs[i];
          html += '<div class="stability-run-item" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 6px; padding: 8px 12px; font-size: 13px;">' +
            '<div><strong>Run ' + r.runIndex + ':</strong> <span class="badge ' + (r.status === 'PASSED' ? 'badge-pass' : 'badge-fail') + '">' + r.status + '</span> <span style="font-size: 12px; color: var(--text-muted); margin-left: 6px;">(' + r.durationMs + 'ms)</span></div>' +
            '<div style="font-size: 12px; color: var(--text-muted); font-family: monospace;">' + r.username + '</div>' +
          '</div>';
        }
        html += '</div>';
        resultBox.innerHTML = html;
      }
    } else {
      var errMsg = data.error || 'Calculation failed';
      if (badge) { badge.className = 'badge badge-fail'; badge.innerText = '✖ Failed'; }
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600;">✖ Error: ' + errMsg + '</div>';
      }
    }
  } catch (err) {
    if (badge) { badge.className = 'badge badge-fail'; badge.innerText = '✖ Failed'; }
    if (feedback) {
      feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600;">✖ Network Error: ' + String(err) + '</div>';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '⚡ Recalculate 3x Stability Score'; }
  }
};

window.runA11yCheck = async function() {
  var btn = document.getElementById('runA11yBtn');
  var badge = document.getElementById('a11yStatusBadge');
  var feedback = document.getElementById('a11yCardFeedback');
  var resultBox = document.getElementById('a11yResultBox');
  var timestampEl = document.getElementById('a11yTimestamp');

  if (btn) { btn.disabled = true; btn.innerText = 'Running axe-core...'; }
  if (badge) { badge.className = 'badge badge-warn'; badge.innerText = '⏳ Auditing...'; }
  if (feedback) {
    feedback.innerHTML = '<div style="color: var(--warning, #fbbf24); font-size: 13px; font-weight: 500;">⏳ Inspecting DOM with axe-core on http://localhost:3000/register...</div>';
  }

  try {
    var res = await fetch('/api/bonus/run-a11y', { method: 'POST' });
    var data = await res.json();

    if (data.success && data.result) {
      var a11y = data.result;
      if (timestampEl) timestampEl.innerText = new Date(a11y.inspectedAt).toLocaleTimeString();
      if (badge) {
        badge.className = a11y.violationsCount === 0 ? 'badge badge-pass' : 'badge badge-warn';
        badge.innerText = a11y.violationsCount + ' violations found';
      }
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--success, #34d399); font-size: 13px; font-weight: 600;">✓ Audit complete: ' + a11y.violationsCount + ' accessibility violations identified.</div>';
      }
      if (resultBox && a11y.violations) {
        if (a11y.violations.length === 0) {
          resultBox.innerHTML = '<div style="padding: 16px; font-size: 13px; color: var(--success, #34d399);">✓ No accessibility violations found!</div>';
        } else {
          var html = '<div tabindex="0" style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">';
          function clientEscape(str) {
            return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          }
          for (var i = 0; i < a11y.violations.length; i++) {
            var v = a11y.violations[i];
            html += '<div class="a11y-violation-item" style="background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 6px; padding: 8px 12px; font-size: 12px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                '<strong class="a11y-violation-id" style="color: var(--flow-title, #60a5fa);">' + clientEscape(v.id) + '</strong>' +
                '<span class="badge badge-fail" style="font-size: 11px; padding: 2px 6px;">' + clientEscape(v.impact) + '</span>' +
              '</div>' +
              '<div class="a11y-violation-desc" style="color: var(--text, #cbd5e1); margin-bottom: 4px;">' + clientEscape(v.description) + '</div>' +
              '<a href="' + clientEscape(v.helpUrl) + '" target="_blank" class="a11y-violation-link" style="color: var(--accent, #93c5fd); text-decoration: underline; font-size: 11px;">Rule details ↗</a>' +
            '</div>';
          }
          html += '</div>';
          resultBox.innerHTML = html;
        }
      }
    } else {
      var errMsg = data.error || 'Audit failed';
      if (badge) { badge.className = 'badge badge-fail'; badge.innerText = '✖ Audit Failed'; }
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600;">✖ Error: ' + errMsg + '</div>';
      }
    }
  } catch (err) {
    if (badge) { badge.className = 'badge badge-fail'; badge.innerText = '✖ Audit Failed'; }
    if (feedback) {
      feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600;">✖ Network Error: ' + String(err) + '</div>';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '🔍 Run Accessibility Check'; }
  }
};

window.runBonusSuite = async function() {
  await window.runStabilityScore();
  await window.runA11yCheck();
};

window.currentDraftRunId = null;

window.fillScenario = function(type) {
  var s = document.getElementById('scenarioInput');
  var e = document.getElementById('expectedInput');
  if (!s || !e) return;
  if (type === 'TC1') {
    s.value = 'Navigate to sign up page, enter unique username, email, and password, click Sign up button, and see dashboard navbar with logged-in user';
    e.value = 'User record is created, authenticated session is established, and user profile link is visible in dashboard navbar';
  } else if (type === 'TC2') {
    s.value = 'Navigate to sign up page, fill username, email, password, and click Sign up button where the button selector changed to an invalid or mutated locator';
    e.value = 'Test fails with a clear message indicating button selector changed or could not be found';
  } else if (type === 'TC3') {
    s.value = 'Navigate to sign up page, fill username, email, and password, click Sign up button. Draft only checks the URL, but critic rejects it and enforces state assertion';
    e.value = 'Draft only checking URL is rejected by critic and upgraded to assert user profile state';
  } else if (type === 'TC4') {
    s.value = 'Test rerun: execute sign up with fresh synthetic test data per run, verifying no duplicate accounts exist in the application database';
    e.value = 'Fresh test data used per run; database query proves no duplicate accounts created';
  }
};

window.draftNewTest = async function() {
  var scenario = (document.getElementById('scenarioInput').value || '').trim();
  var expected = (document.getElementById('expectedInput').value || '').trim();
  var feedback = document.getElementById('newTestFeedback');
  var btn = document.getElementById('draftTestBtn');
  var container = document.getElementById('pendingApprovalContainer');
  var progressContainer = document.getElementById('draftProgressContainer');
  var progressBadge = document.getElementById('draftProgressBadge');
  var elapsedEl = document.getElementById('draftElapsedTime');
  var statusBanner = document.getElementById('draftStatusBanner');

  if (!scenario || !expected) {
    if (feedback) feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px;">⚠ Please enter both scenario flow and expected end state.</div>';
    return;
  }

  if (btn) { btn.disabled = true; btn.innerText = '⏳ Drafting test...'; }
  if (feedback) feedback.innerHTML = '';
  if (container) container.style.display = 'none';

  // Show and reset progress container
  if (progressContainer) {
    progressContainer.style.display = 'block';
    progressContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  var steps = ['understand', 'browse', 'reason', 'draft', 'critic'];
  for (var sIdx = 0; sIdx < steps.length; sIdx++) {
    var sName = steps[sIdx];
    var card = document.getElementById('pStep_' + sName);
    var badge = document.getElementById('pBadge_' + sName);
    var msg = document.getElementById('pMsg_' + sName);
    if (card) { card.style.borderColor = 'var(--border, #1e293b)'; card.style.background = 'var(--card-bg, rgba(0,0,0,0.35))'; }
    if (badge) { badge.className = 'badge'; badge.innerText = 'Queued'; }
    if (msg) { msg.innerText = 'Waiting...'; msg.style.color = 'var(--text-muted, #64748b)'; }
  }

  if (progressBadge) { progressBadge.className = 'badge badge-warn'; progressBadge.innerText = '⏳ Drafting in Progress'; }
  if (statusBanner) statusBanner.innerHTML = '<span style="color: var(--accent, #38bdf8);">Connecting to pipeline...</span>';

  // Live timer ticking every 100ms
  var startTime = Date.now();
  var timerInterval = setInterval(function() {
    if (elapsedEl) {
      var elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      elapsedEl.innerText = elapsedSec + 's';
    }
  }, 100);

  function stopTimer() {
    clearInterval(timerInterval);
    if (elapsedEl) {
      var finalSec = ((Date.now() - startTime) / 1000).toFixed(2);
      elapsedEl.innerText = finalSec + 's';
    }
  }

  function updateStepUI(step, state, durationMs, message) {
    var card = document.getElementById('pStep_' + step);
    var badge = document.getElementById('pBadge_' + step);
    var msg = document.getElementById('pMsg_' + step);
    if (state === 'started') {
      if (card) { card.style.borderColor = 'var(--accent, #38bdf8)'; card.style.background = 'rgba(15, 118, 110, 0.08)'; }
      if (badge) { badge.className = 'badge badge-warn'; badge.innerText = 'Running...'; }
      if (msg) { msg.innerText = message || 'In progress...'; msg.style.color = 'var(--accent, #38bdf8)'; }
      if (statusBanner) statusBanner.innerHTML = '<span style="color: var(--accent, #38bdf8);">' + (message || 'Processing ' + step) + '</span>';
    } else if (state === 'completed') {
      if (card) { card.style.borderColor = 'var(--success, #10b981)'; card.style.background = 'rgba(21, 128, 61, 0.08)'; }
      if (badge) { badge.className = 'badge badge-pass'; badge.innerText = '✓ ' + (durationMs !== undefined ? durationMs + 'ms' : 'Done'); }
      if (msg) { msg.innerText = message || 'Completed'; msg.style.color = 'var(--success, #34d399)'; }
    }
  }

  var options = {};
  if (scenario.includes('mutated') || scenario.includes('selector changed')) {
    options.buttonSelectorOverride = 'button.non-existent-btn-class-changed';
  }
  if (scenario.includes('only checks the URL') || scenario.includes('only check')) {
    options.forceOnlyUrlCheck = true;
  }

  try {
    var response = await fetch('/api/pipeline/draft-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_description: scenario, expected_end_state: expected, options: options })
    });

    if (!response.body) {
      throw new Error('ReadableStream is not supported in this browser.');
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var completedRun = null;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        var evt;
        try {
          evt = JSON.parse(line);
        } catch (pErr) {
          continue;
        }

        if (evt.type === 'progress' && evt.data) {
          updateStepUI(evt.data.step, evt.data.state, evt.data.durationMs, evt.data.message);
        } else if (evt.type === 'done' && evt.run) {
          completedRun = evt.run;
        } else if (evt.type === 'error') {
          var errObj = new Error(evt.error || 'Server error occurred during drafting');
          if (evt.isQuota) errObj.isQuota = true;
          throw errObj;
        }
      }
    }

    stopTimer();

    if (completedRun) {
      var totalSec = ((Date.now() - startTime) / 1000).toFixed(2);
      if (progressBadge) { progressBadge.className = 'badge badge-pass'; progressBadge.innerText = '✓ Completed in ' + totalSec + 's'; }
      if (statusBanner) statusBanner.innerHTML = '<span style="color: var(--success, #34d399); font-weight: 700;">✓ Pipeline Steps 1–5 completed in ' + totalSec + 's. Halted for human approval gate.</span>';

      window.currentDraftRunId = completedRun.id;
      var pendingRunId = document.getElementById('pendingRunId');
      var pendingSelectors = document.getElementById('pendingSelectors');
      var pendingCritic = document.getElementById('pendingCritic');
      var pendingSpecCode = document.getElementById('pendingSpecCode');
      var approveBtn = document.getElementById('approveDraftBtn');
      var rejectBtn = document.getElementById('rejectDraftBtn');
      var approvalFeedback = document.getElementById('approvalActionFeedback');

      if (pendingRunId) pendingRunId.innerText = 'Run ID: ' + completedRun.id;
      if (pendingSpecCode) pendingSpecCode.innerText = completedRun.approvedCode || completedRun.draftCode;

      var selectorsArr = [];
      try { selectorsArr = JSON.parse(completedRun.selectorsJson || '[]'); } catch(e){}
      if (pendingSelectors) {
        pendingSelectors.innerHTML = '<div>Found <strong>' + selectorsArr.length + '</strong> interactive selectors from <code>' + (completedRun.sourceUrl || '') + '</code>:</div>' +
          '<ul style="margin-left: 16px; margin-top: 4px;">' +
          selectorsArr.slice(0, 5).map(function(s){ return '<li><code>' + (s.selector || s.locator) + '</code> (' + (s.role || s.type || 'element') + ')</li>'; }).join('') +
          '</ul>';
      }

      if (pendingCritic) {
        pendingCritic.innerHTML = '<div><strong>Verdict:</strong> <span class="badge ' + (completedRun.criticFeedback && completedRun.criticFeedback.includes('Intentional failing') ? 'badge-warn' : 'badge-pass') + '">' + (completedRun.criticFeedback && completedRun.criticFeedback.includes('Intentional failing') ? 'Negative Test' : 'Approved') + '</span></div>' +
          '<div style="margin-top: 4px; color: var(--text, #cbd5e1);">' + (completedRun.criticFeedback || 'State assertion verified') + '</div>';
      }

      if (approveBtn) { approveBtn.disabled = false; approveBtn.innerText = '✓ Approve & Execute Test'; }
      if (rejectBtn) { rejectBtn.disabled = false; rejectBtn.innerText = '✖ Reject'; }
      if (approvalFeedback) approvalFeedback.innerHTML = '';

      if (container) {
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Update custom runs table immediately without reloading
      if (window.loadCustomRuns) {
        window.loadCustomRuns();
      }
    } else {
      throw new Error('Drafting process ended without returning a run record.');
    }
  } catch (err) {
    stopTimer();
    var errMsg = (err && err.message) ? err.message : String(err);
    var isQuota = errMsg.includes('429') || errMsg.includes('Quota') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || (err && err.isQuota);

    if (progressBadge) { progressBadge.className = 'badge badge-fail'; progressBadge.innerText = isQuota ? '✖ Quota Exceeded (429)' : '✖ Draft Failed'; }

    if (statusBanner) {
      if (isQuota) {
        statusBanner.innerHTML = '<div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--danger, #ef4444); border-radius: 8px; padding: 12px; margin-top: 6px;">' +
          '<div style="color: var(--danger, #f87171); font-weight: 700; font-size: 13.5px; margin-bottom: 4px;">🚨 Gemini API Quota Exceeded (HTTP 429)</div>' +
          '<div style="color: var(--danger, #fca5a5); font-size: 12px; line-height: 1.4;">' + errMsg + '</div>' +
          '<div style="color: var(--text-muted, #94a3b8); font-size: 11.5px; margin-top: 6px;">Execution stopped immediately without silent retries. Please wait or check your Gemini API quota in Google AI Studio.</div>' +
        '</div>';
      } else {
        statusBanner.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 12.5px; font-weight: 600; padding: 8px 0;">✖ Draft Error: ' + errMsg + '</div>';
      }
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '🚀 Draft test (Steps 1–5)'; }
  }
};

window.approveCurrentDraft = async function() {
  if (!window.currentDraftRunId) return;
  var approveBtn = document.getElementById('approveDraftBtn');
  var rejectBtn = document.getElementById('rejectDraftBtn');
  var feedback = document.getElementById('approvalActionFeedback');

  if (approveBtn) { approveBtn.disabled = true; approveBtn.innerText = '⏳ Executing Run 1 & Stability Rerun...'; }
  if (rejectBtn) { rejectBtn.disabled = true; }
  if (feedback) feedback.innerHTML = '<div style="color: var(--warning, #fbbf24); font-size: 13px; font-weight: 600;">⏳ Executing test suite against demo app... Verifying backend database...</div>';

  try {
    var res = await fetch('/api/pipeline/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: window.currentDraftRunId, approver: 'human' })
    });
    var data = await res.json();
    if (data.success && data.run) {
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--success, #34d399); font-size: 13px; font-weight: 700;">✓ Approved by human! Execution complete. Run 1: ' + data.run.run1Status + ', Rerun: ' + data.run.run2Status + '. Persisted in SQLite. Custom runs updated below.</div>';
      }
      if (approveBtn) { approveBtn.disabled = false; approveBtn.innerText = '✓ Approve & Execute Test'; }
      if (rejectBtn) { rejectBtn.disabled = false; }
      if (window.loadCustomRuns) await window.loadCustomRuns();
    } else {
      var errMsg = data.error || 'Approval execution failed';
      if (feedback) {
        feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600;">✖ ' + errMsg + '</div>';
      }
      if (approveBtn) { approveBtn.disabled = false; approveBtn.innerText = '✓ Approve & Execute Test'; }
      if (rejectBtn) { rejectBtn.disabled = false; }
    }
  } catch(err) {
    if (feedback) feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 600;">✖ Network Error: ' + String(err) + '</div>';
    if (approveBtn) { approveBtn.disabled = false; approveBtn.innerText = '✓ Approve & Execute Test'; }
    if (rejectBtn) { rejectBtn.disabled = false; }
  }
};

window.rejectCurrentDraft = async function() {
  if (!window.currentDraftRunId) return;
  var approveBtn = document.getElementById('approveDraftBtn');
  var rejectBtn = document.getElementById('rejectDraftBtn');
  var feedback = document.getElementById('approvalActionFeedback');

  if (rejectBtn) { rejectBtn.disabled = true; rejectBtn.innerText = 'Rejecting...'; }
  if (approveBtn) { approveBtn.disabled = true; }

  try {
    var res = await fetch('/api/pipeline/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: window.currentDraftRunId, approver: 'human', reason: 'Rejected by human reviewer' })
    });
    var data = await res.json();
    if (data.success) {
      if (feedback) feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px; font-weight: 700;">✖ Draft rejected by human. Pipeline halted. Custom runs updated below.</div>';
      if (rejectBtn) { rejectBtn.disabled = false; rejectBtn.innerText = '✖ Reject'; }
      if (approveBtn) { approveBtn.disabled = false; }
      if (window.loadCustomRuns) await window.loadCustomRuns();
    }
  } catch(err) {
    if (feedback) feedback.innerHTML = '<div style="color: var(--danger, #f87171); font-size: 13px;">✖ ' + String(err) + '</div>';
    if (rejectBtn) { rejectBtn.disabled = false; rejectBtn.innerText = '✖ Reject'; }
    if (approveBtn) { approveBtn.disabled = false; }
  }
};

// Custom scenario runs live management
window.loadCustomRuns = async function() {
  try {
    var res = await fetch('/api/custom-runs');
    if (!res.ok) return;
    var data = await res.json();
    var runs = data.runs || [];
    var countBadge = document.getElementById('customRunsCountBadge');
    var noRunsBox = document.getElementById('noCustomRunsBox');
    var table = document.getElementById('customRunsTable');
    var tbody = document.getElementById('customRunsTbody');

    if (countBadge) {
      countBadge.innerText = runs.length + ' run' + (runs.length === 1 ? '' : 's');
    }

    if (runs.length === 0) {
      if (noRunsBox) noRunsBox.style.display = 'block';
      if (table) table.style.display = 'none';
      if (tbody) tbody.innerHTML = '';
    } else {
      if (noRunsBox) noRunsBox.style.display = 'none';
      if (table) table.style.display = 'table';
      if (tbody && data.rowsHtml) {
        // Track currently expanded timeline IDs to preserve state across polls
        var openTimelineIds = [];
        var openRows = tbody.querySelectorAll('.timeline-row');
        for (var o = 0; o < openRows.length; o++) {
          if (openRows[o].style.display !== 'none') {
            openTimelineIds.push(openRows[o].id);
          }
        }

        tbody.innerHTML = data.rowsHtml;

        // Restore expanded timelines
        for (var p = 0; p < openTimelineIds.length; p++) {
          var openRow = document.getElementById(openTimelineIds[p]);
          var toggleBtn = document.querySelector('[data-timeline-id="' + openTimelineIds[p] + '"]');
          if (openRow) openRow.style.display = 'table-row';
          if (toggleBtn) toggleBtn.innerText = '⏱ Hide Timeline ▴';
        }

        // Re-attach timeline button handlers
        var timelineBtns = tbody.querySelectorAll('.timeline-toggle-btn');
        for (var t = 0; t < timelineBtns.length; t++) {
          (function(btn) {
            btn.onclick = function(e) {
              if (e) e.preventDefault();
              var tid = btn.getAttribute('data-timeline-id');
              if (tid) window.toggleTimeline(tid);
            };
          })(timelineBtns[t]);
        }
      }
    }
  } catch (err) {
    // Handled gracefully on next cycle
  }
};

window.approveCustomDraft = async function(runId) {
  var badge = document.getElementById('badge_' + runId);
  if (badge) {
    badge.className = 'badge badge-warn';
    badge.innerText = '⏳ Running...';
  }
  var row = document.getElementById('row_' + runId);
  if (row) {
    var btns = row.querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) {
      if (!btns[b].classList.contains('timeline-toggle-btn')) {
        btns[b].disabled = true;
      }
    }
  }

  try {
    var res = await fetch('/api/pipeline/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: runId, approver: 'human' })
    });
    var data = await res.json();
    if (!data.success) {
      alert('Approval Error: ' + (data.error || 'Execution failed'));
    }
    await window.loadCustomRuns();
  } catch(err) {
    alert('Network Error during approval: ' + String(err));
    await window.loadCustomRuns();
  }
};

window.rejectCustomDraft = async function(runId) {
  var badge = document.getElementById('badge_' + runId);
  if (badge) {
    badge.className = 'badge badge-fail';
    badge.innerText = '✖ Rejecting...';
  }
  var row = document.getElementById('row_' + runId);
  if (row) {
    var btns = row.querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) {
      if (!btns[b].classList.contains('timeline-toggle-btn')) {
        btns[b].disabled = true;
      }
    }
  }

  try {
    var res = await fetch('/api/pipeline/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: runId, approver: 'human', reason: 'Rejected by human reviewer' })
    });
    var data = await res.json();
    if (!data.success) {
      alert('Rejection Error: ' + (data.error || 'Rejection failed'));
    }
    await window.loadCustomRuns();
  } catch(err) {
    alert('Network Error during rejection: ' + String(err));
    await window.loadCustomRuns();
  }
};

// Attach listeners cleanly via addEventListener
function setupEventListeners() {
  var healBtn = document.getElementById('approveHealingBtn');
  if (healBtn) healBtn.addEventListener('click', window.approveHealing);

  var stabBtn = document.getElementById('runStabilityBtn');
  if (stabBtn) stabBtn.addEventListener('click', window.runStabilityScore);

  var a11yBtn = document.getElementById('runA11yBtn');
  if (a11yBtn) a11yBtn.addEventListener('click', window.runA11yCheck);

  var suiteBtn = document.getElementById('runBonusSuiteBtn');
  if (suiteBtn) suiteBtn.addEventListener('click', window.runBonusSuite);

  var histBtn = document.getElementById('toggleHistoryBtn');
  if (histBtn) {
    histBtn.onclick = function(e) {
      if (e) e.preventDefault();
      window.toggleHistory();
    };
  }

  var draftBtn = document.getElementById('draftTestBtn');
  if (draftBtn) draftBtn.addEventListener('click', window.draftNewTest);

  var approveDraftBtn = document.getElementById('approveDraftBtn');
  if (approveDraftBtn) approveDraftBtn.addEventListener('click', window.approveCurrentDraft);

  var rejectDraftBtn = document.getElementById('rejectDraftBtn');
  if (rejectDraftBtn) rejectDraftBtn.addEventListener('click', window.rejectCurrentDraft);

  var timelineBtns = document.querySelectorAll('.timeline-toggle-btn');
  for (var i = 0; i < timelineBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var tid = btn.getAttribute('data-timeline-id');
        if (tid) window.toggleTimeline(tid);
      });
    })(timelineBtns[i]);
  }

  // Initial load of custom runs via GET /api/custom-runs
  window.loadCustomRuns();

  // Live polling every 3 seconds to update custom scenario runs live with no manual reload
  setInterval(window.loadCustomRuns, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEventListeners);
} else {
  setupEventListeners();
}


