import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { AgentRunRecord, TestCaseInput } from '../types.js';

const DB_PATH = path.resolve(process.cwd(), 'agent_data.sqlite');
const SEED_PATH = path.resolve(process.cwd(), 'data', 'seed.sqlite');

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    if (!fs.existsSync(DB_PATH) && fs.existsSync(SEED_PATH)) {
      try {
        fs.copyFileSync(SEED_PATH, DB_PATH);
        console.log('Copied clean seed database to live agent_data.sqlite');
      } catch (err) {
        console.warn('Warning: Could not copy seed database:', err);
      }
    }
    dbInstance = new DatabaseSync(DB_PATH);
    initDatabase(dbInstance);
  }
  return dbInstance;
}

function initDatabase(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      test_case_id TEXT NOT NULL,
      input_json TEXT NOT NULL,
      source_url TEXT,
      retrieval_time TEXT,
      selectors_json TEXT,
      decision_reasons_json TEXT,
      draft_code TEXT,
      critic_feedback TEXT,
      approved_code TEXT,
      approval_status TEXT,
      run_1_status TEXT,
      run_2_status TEXT,
      actual_result TEXT,
      expected_result TEXT,
      evidence_path TEXT,
      unresolved_items_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bonus_healing (
      id TEXT PRIMARY KEY,
      test_case_id TEXT NOT NULL,
      failing_selector TEXT NOT NULL,
      proposed_selector TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bonus_stability (
      id TEXT PRIMARY KEY,
      test_case_id TEXT NOT NULL,
      total_runs INTEGER NOT NULL,
      passed_runs INTEGER NOT NULL,
      score_text TEXT NOT NULL,
      runs_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bonus_accessibility (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      inspected_at TEXT NOT NULL,
      violations_count INTEGER NOT NULL,
      violations_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  try { db.exec(`ALTER TABLE pipeline_runs ADD COLUMN approver TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE pipeline_runs ADD COLUMN step_events_json TEXT;`); } catch {}

  seedIfEmpty(db);
}

function seedIfEmpty(db: DatabaseSync) {
  if (!fs.existsSync(SEED_PATH)) return;
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM pipeline_runs').get() as any;
    if (row && row.count === 0) {
      console.log('Database pipeline_runs is empty. Seeding 4 official runs and bonus data from seed.sqlite...');
      const seedDb = new DatabaseSync(SEED_PATH);
      const runs = seedDb.prepare('SELECT * FROM pipeline_runs').all() as any[];
      const insertRun = db.prepare(`
        INSERT OR REPLACE INTO pipeline_runs (
          id, test_case_id, input_json, source_url, retrieval_time,
          selectors_json, decision_reasons_json, draft_code, critic_feedback,
          approved_code, approval_status, run_1_status, run_2_status,
          actual_result, expected_result, evidence_path, unresolved_items_json,
          approver, step_events_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of runs) {
        insertRun.run(
          r.id, r.test_case_id, r.input_json, r.source_url, r.retrieval_time,
          r.selectors_json, r.decision_reasons_json, r.draft_code, r.critic_feedback,
          r.approved_code, r.approval_status, r.run_1_status, r.run_2_status,
          r.actual_result, r.expected_result, r.evidence_path, r.unresolved_items_json,
          r.approver, r.step_events_json, r.created_at, r.updated_at
        );
      }

      try {
        const healings = seedDb.prepare('SELECT * FROM bonus_healing').all() as any[];
        const insertHeal = db.prepare(`INSERT OR REPLACE INTO bonus_healing (id, test_case_id, failing_selector, proposed_selector, reason, status, execution_result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const h of healings) {
          insertHeal.run(h.id, h.test_case_id, h.failing_selector, h.proposed_selector, h.reason, h.status, h.execution_result_json, h.created_at, h.updated_at);
        }
      } catch {}

      try {
        const stabs = seedDb.prepare('SELECT * FROM bonus_stability').all() as any[];
        const insertStab = db.prepare(`INSERT OR REPLACE INTO bonus_stability (id, test_case_id, total_runs, passed_runs, score_text, runs_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        for (const s of stabs) {
          insertStab.run(s.id, s.test_case_id, s.total_runs, s.passed_runs, s.score_text, s.runs_json, s.created_at);
        }
      } catch {}

      try {
        const a11ys = seedDb.prepare('SELECT * FROM bonus_accessibility').all() as any[];
        const insertA11y = db.prepare(`INSERT OR REPLACE INTO bonus_accessibility (id, url, inspected_at, violations_count, violations_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const a of a11ys) {
          insertA11y.run(a.id, a.url, a.inspected_at, a.violations_count, a.violations_json, a.created_at);
        }
      } catch {}

      seedDb.close();
      console.log('Database seeded successfully on startup.');
    }
  } catch (err) {
    console.warn('Could not check or seed empty database:', err);
  }
}

export function savePipelineRun(record: AgentRunRecord): void {
  const db = getDatabase();
  const stmt = db.prepare(`
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
    ON CONFLICT(id) DO UPDATE SET
      test_case_id=excluded.test_case_id,
      input_json=excluded.input_json,
      source_url=excluded.source_url,
      retrieval_time=excluded.retrieval_time,
      selectors_json=excluded.selectors_json,
      decision_reasons_json=excluded.decision_reasons_json,
      draft_code=excluded.draft_code,
      critic_feedback=excluded.critic_feedback,
      approved_code=excluded.approved_code,
      approval_status=excluded.approval_status,
      run_1_status=excluded.run_1_status,
      run_2_status=excluded.run_2_status,
      actual_result=excluded.actual_result,
      expected_result=excluded.expected_result,
      evidence_path=excluded.evidence_path,
      unresolved_items_json=excluded.unresolved_items_json,
      approver=excluded.approver,
      step_events_json=excluded.step_events_json,
      updated_at=excluded.updated_at;
  `);

  stmt.run(
    record.id,
    record.testCaseId,
    record.inputJson,
    record.sourceUrl,
    record.retrievalTime,
    record.selectorsJson,
    record.decisionReasonsJson,
    record.draftCode,
    record.criticFeedback,
    record.approvedCode,
    record.approvalStatus,
    record.run1Status,
    record.run2Status,
    record.actualResult,
    record.expectedResult,
    record.evidencePath,
    record.unresolvedItemsJson,
    record.approver || null,
    record.stepEventsJson || null,
    record.createdAt,
    record.updatedAt
  );
}

export function getPipelineRun(id: string): AgentRunRecord | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`);
  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    id: row.id,
    testCaseId: row.test_case_id,
    inputJson: row.input_json,
    sourceUrl: row.source_url,
    retrievalTime: row.retrieval_time,
    selectorsJson: row.selectors_json,
    decisionReasonsJson: row.decision_reasons_json,
    draftCode: row.draft_code,
    criticFeedback: row.critic_feedback,
    approvedCode: row.approved_code,
    approvalStatus: row.approval_status,
    run1Status: row.run_1_status,
    run2Status: row.run_2_status,
    actualResult: row.actual_result,
    expectedResult: row.expected_result,
    evidencePath: row.evidence_path,
    unresolvedItemsJson: row.unresolved_items_json,
    approver: row.approver || 'system',
    stepEventsJson: row.step_events_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllPipelineRuns(): AgentRunRecord[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM pipeline_runs ORDER BY created_at DESC`);
  const rows = stmt.all() as any[];
  return rows.map((row) => ({
    id: row.id,
    testCaseId: row.test_case_id,
    inputJson: row.input_json,
    sourceUrl: row.source_url,
    retrievalTime: row.retrieval_time,
    selectorsJson: row.selectors_json,
    decisionReasonsJson: row.decision_reasons_json,
    draftCode: row.draft_code,
    criticFeedback: row.critic_feedback,
    approvedCode: row.approved_code,
    approvalStatus: row.approval_status,
    run1Status: row.run_1_status,
    run2Status: row.run_2_status,
    actualResult: row.actual_result,
    expectedResult: row.expected_result,
    evidencePath: row.evidence_path,
    unresolvedItemsJson: row.unresolved_items_json,
    approver: row.approver || 'system',
    stepEventsJson: row.step_events_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getCustomPipelineRuns(): AgentRunRecord[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM pipeline_runs WHERE test_case_id NOT IN ('TC1', 'TC2', 'TC3', 'TC4') ORDER BY created_at DESC`);
  const rows = stmt.all() as any[];
  return rows.map((row) => ({
    id: row.id,
    testCaseId: row.test_case_id,
    inputJson: row.input_json,
    sourceUrl: row.source_url,
    retrievalTime: row.retrieval_time,
    selectorsJson: row.selectors_json,
    decisionReasonsJson: row.decision_reasons_json,
    draftCode: row.draft_code,
    criticFeedback: row.critic_feedback,
    approvedCode: row.approved_code,
    approvalStatus: row.approval_status,
    run1Status: row.run_1_status,
    run2Status: row.run_2_status,
    actualResult: row.actual_result,
    expectedResult: row.expected_result,
    evidencePath: row.evidence_path,
    unresolvedItemsJson: row.unresolved_items_json,
    approver: row.approver || 'human',
    stepEventsJson: row.step_events_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
