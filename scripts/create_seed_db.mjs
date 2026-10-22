import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve('data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const seedPath = path.join(dataDir, 'seed.sqlite');
if (fs.existsSync(seedPath)) {
  fs.unlinkSync(seedPath);
}

const srcDb = new DatabaseSync('agent_data.sqlite');
const destDb = new DatabaseSync(seedPath);

// 1. Create tables in destDb with identical schemas
const tableDefs = srcDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
for (const td of tableDefs) {
  destDb.exec(td.sql);
}

// 2. Copy the 4 official runs
const officialIds = [
  'TC1_1792328284361',
  'TC2_1792328317252',
  'TC3_1792328345366',
  'TC4_1792328367409'
];

const insertRunStmt = destDb.prepare(`
  INSERT INTO pipeline_runs (
    id, test_case_id, input_json, source_url, retrieval_time,
    selectors_json, decision_reasons_json, draft_code, critic_feedback,
    approved_code, approval_status, run_1_status, run_2_status,
    actual_result, expected_result, evidence_path, unresolved_items_json,
    approver, step_events_json, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?
  )
`);

for (const id of officialIds) {
  const row = srcDb.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id);
  if (!row) {
    throw new Error(`Official run ${id} not found in agent_data.sqlite!`);
  }
  insertRunStmt.run(
    row.id, row.test_case_id, row.input_json, row.source_url, row.retrieval_time,
    row.selectors_json, row.decision_reasons_json, row.draft_code, row.critic_feedback,
    row.approved_code, row.approval_status, row.run_1_status, row.run_2_status,
    row.actual_result, row.expected_result, row.evidence_path, row.unresolved_items_json,
    row.approver, row.step_events_json, row.created_at, row.updated_at
  );
}

// 3. Copy bonus results
// Healing:
const healingRows = srcDb.prepare('SELECT * FROM bonus_healing ORDER BY created_at DESC LIMIT 1').all();
const insertHealingStmt = destDb.prepare(`
  INSERT INTO bonus_healing (
    id, test_case_id, failing_selector, proposed_selector, reason,
    status, execution_result_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const h of healingRows) {
  insertHealingStmt.run(
    h.id, h.test_case_id, h.failing_selector, h.proposed_selector, h.reason,
    h.status, h.execution_result_json, h.created_at, h.updated_at
  );
}

// Stability:
const stabilityRows = srcDb.prepare('SELECT * FROM bonus_stability ORDER BY created_at DESC LIMIT 1').all();
const insertStabilityStmt = destDb.prepare(`
  INSERT INTO bonus_stability (
    id, test_case_id, total_runs, passed_runs, score_text, runs_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const s of stabilityRows) {
  insertStabilityStmt.run(
    s.id, s.test_case_id, s.total_runs, s.passed_runs, s.score_text, s.runs_json, s.created_at
  );
}

// Accessibility:
const a11yRows = srcDb.prepare('SELECT * FROM bonus_accessibility ORDER BY created_at DESC LIMIT 1').all();
const insertA11yStmt = destDb.prepare(`
  INSERT INTO bonus_accessibility (
    id, url, inspected_at, violations_count, violations_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);
for (const a of a11yRows) {
  insertA11yStmt.run(
    a.id, a.url, a.inspected_at, a.violations_count, a.violations_json, a.created_at
  );
}

// Ensure site_checks table exists and is empty
destDb.exec('CREATE TABLE IF NOT EXISTS site_checks (id TEXT PRIMARY KEY, requested_url TEXT NOT NULL, final_url TEXT, retrieval_time TEXT, status_code INTEGER, title TEXT, console_errors_json TEXT, elements_json TEXT, broken_links_json TEXT, a11y_violations_json TEXT, desktop_screenshot_path TEXT, mobile_screenshot_path TEXT, crawled_pages_json TEXT, proposals_json TEXT, status TEXT, status_message TEXT, evidence_complete INTEGER, created_at TEXT, updated_at TEXT);');

// Verify counts
const runCount = destDb.prepare('SELECT COUNT(*) as count FROM pipeline_runs').get().count;
const healCount = destDb.prepare('SELECT COUNT(*) as count FROM bonus_healing').get().count;
const stabCount = destDb.prepare('SELECT COUNT(*) as count FROM bonus_stability').get().count;
const a11yCount = destDb.prepare('SELECT COUNT(*) as count FROM bonus_accessibility').get().count;
const scCount = destDb.prepare('SELECT COUNT(*) as count FROM site_checks').get().count;

console.log('Seed Database Created at:', seedPath);
console.log(`- Official Pipeline Runs: ${runCount} (expected 4)`);
console.log(`- Bonus Healing: ${healCount} (expected 1)`);
console.log(`- Bonus Stability: ${stabCount} (expected 1)`);
console.log(`- Bonus Accessibility: ${a11yCount} (expected 1)`);
console.log(`- Site Checks: ${scCount} (expected 0)`);
