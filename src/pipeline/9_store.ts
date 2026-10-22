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
