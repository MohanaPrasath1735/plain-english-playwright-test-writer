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

// Attach listeners cleanly via addEventListener
function setupEventListeners() {
  var histBtn = document.getElementById('toggleHistoryBtn');
  if (histBtn) {
    histBtn.onclick = function(e) {
      if (e) e.preventDefault();
      window.toggleHistory();
    };
  }

  var timelineBtns = document.querySelectorAll('.timeline-toggle-btn');
  for (var i = 0; i < timelineBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var tid = btn.getAttribute('data-timeline-id');
        if (tid) window.toggleTimeline(tid);
      });
    })(timelineBtns[i]);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEventListeners);
} else {
  setupEventListeners();
}
