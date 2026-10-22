import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { getDatabase } from '../pipeline/9_store.js';

export interface DiscoveredElementsSummary {
  forms: Array<{ id?: string; name?: string; action?: string; selector: string }>;
  buttons: Array<{ text: string; role: string; selector: string; type?: string }>;
  inputs: Array<{ name?: string; type: string; placeholder?: string; label?: string; selector: string }>;
  links: Array<{ text: string; href: string; selector: string }>;
}

export interface SiteCheckProposal {
  id: string;
  title: string;
  description: string;
  isFormSubmission: boolean;
  specCode: string;
  status: 'PROPOSED' | 'APPROVED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'REJECTED';
  executionResult?: {
    status: 'PASSED' | 'FAILED';
    durationMs: number;
    error?: string;
    screenshotPath?: string;
    tracePath?: string;
    executedAt: string;
  };
}

export interface SiteCheckRecord {
  id: string;
  requestedUrl: string;
  finalUrl: string;
  retrievalTime: string;
  statusCode: number;
  title: string;
  consoleErrorsJson: string; // string[]
  elementsJson: string; // DiscoveredElementsSummary
  brokenLinksJson: string; // BrokenLinkInfo[]
  a11yViolationsJson: string; // AccessibilityViolation[]
  desktopScreenshotPath: string;
  mobileScreenshotPath: string;
  crawledPagesJson: string; // CrawledPageInfo[]
  proposalsJson: string; // SiteCheckProposal[]
  status: 'COMPLETED' | 'BLOCKED' | 'ERROR';
  statusMessage: string;
  evidenceComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

let tableInitialized = false;

export function initSiteChecksTable() {
  if (tableInitialized) return;
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_checks (
      id TEXT PRIMARY KEY,
      requested_url TEXT NOT NULL,
      final_url TEXT NOT NULL,
      retrieval_time TEXT NOT NULL,
      status_code INTEGER,
      title TEXT,
      console_errors_json TEXT,
      elements_json TEXT,
      broken_links_json TEXT,
      a11y_violations_json TEXT,
      desktop_screenshot_path TEXT,
      mobile_screenshot_path TEXT,
      crawled_pages_json TEXT,
      proposals_json TEXT,
      status TEXT NOT NULL,
      status_message TEXT,
      evidence_complete INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  tableInitialized = true;
}

export function saveSiteCheckRecord(record: SiteCheckRecord): void {
  initSiteChecksTable();
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO site_checks (
      id,
      requested_url,
      final_url,
      retrieval_time,
      status_code,
      title,
      console_errors_json,
      elements_json,
      broken_links_json,
      a11y_violations_json,
      desktop_screenshot_path,
      mobile_screenshot_path,
      crawled_pages_json,
      proposals_json,
      status,
      status_message,
      evidence_complete,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      requested_url = excluded.requested_url,
      final_url = excluded.final_url,
      retrieval_time = excluded.retrieval_time,
      status_code = excluded.status_code,
      title = excluded.title,
      console_errors_json = excluded.console_errors_json,
      elements_json = excluded.elements_json,
      broken_links_json = excluded.broken_links_json,
      a11y_violations_json = excluded.a11y_violations_json,
      desktop_screenshot_path = excluded.desktop_screenshot_path,
      mobile_screenshot_path = excluded.mobile_screenshot_path,
      crawled_pages_json = excluded.crawled_pages_json,
      proposals_json = excluded.proposals_json,
      status = excluded.status,
      status_message = excluded.status_message,
      evidence_complete = excluded.evidence_complete,
      updated_at = excluded.updated_at;
  `);

  stmt.run(
    record.id,
    record.requestedUrl,
    record.finalUrl,
    record.retrievalTime,
    record.statusCode,
    record.title,
    record.consoleErrorsJson,
    record.elementsJson,
    record.brokenLinksJson,
    record.a11yViolationsJson,
    record.desktopScreenshotPath,
    record.mobileScreenshotPath,
    record.crawledPagesJson,
    record.proposalsJson,
    record.status,
    record.statusMessage,
    record.evidenceComplete ? 1 : 0,
    record.createdAt,
    record.updatedAt
  );
}

export function getSiteCheckRecord(id: string): SiteCheckRecord | null {
  initSiteChecksTable();
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM site_checks WHERE id = ?`);
  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    id: row.id,
    requestedUrl: row.requested_url,
    finalUrl: row.final_url,
    retrievalTime: row.retrieval_time,
    statusCode: row.status_code,
    title: row.title,
    consoleErrorsJson: row.console_errors_json,
    elementsJson: row.elements_json,
    brokenLinksJson: row.broken_links_json,
    a11yViolationsJson: row.a11y_violations_json,
    desktopScreenshotPath: row.desktop_screenshot_path,
    mobileScreenshotPath: row.mobile_screenshot_path,
    crawledPagesJson: row.crawled_pages_json,
    proposalsJson: row.proposals_json,
    status: row.status,
    statusMessage: row.status_message,
    evidenceComplete: Boolean(row.evidence_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllSiteCheckRecords(): SiteCheckRecord[] {
  initSiteChecksTable();
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM site_checks ORDER BY created_at DESC`);
  const rows = stmt.all() as any[];

  return rows.map(row => ({
    id: row.id,
    requestedUrl: row.requested_url,
    finalUrl: row.final_url,
    retrievalTime: row.retrieval_time,
    statusCode: row.status_code,
    title: row.title,
    consoleErrorsJson: row.console_errors_json,
    elementsJson: row.elements_json,
    brokenLinksJson: row.broken_links_json,
    a11yViolationsJson: row.a11y_violations_json,
    desktopScreenshotPath: row.desktop_screenshot_path,
    mobileScreenshotPath: row.mobile_screenshot_path,
    crawledPagesJson: row.crawled_pages_json,
    proposalsJson: row.proposals_json,
    status: row.status,
    statusMessage: row.status_message,
    evidenceComplete: Boolean(row.evidence_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function deleteSiteCheckRecord(id: string): { success: boolean; deletedId: string; error?: string } {
  initSiteChecksTable();
  const db = getDatabase();

  const existing = getSiteCheckRecord(id);
  if (!existing) {
    throw new Error(`Site check with ID '${id}' not found.`);
  }

  // Delete evidence folder from disk
  try {
    const evidenceDir = path.resolve(process.cwd(), 'evidence', 'site_checks', id);
    if (fs.existsSync(evidenceDir)) {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    console.warn(`[Store] Could not delete evidence folder for ${id}:`, err?.message);
  }

  // Delete from SQLite
  const stmt = db.prepare(`DELETE FROM site_checks WHERE id = ?`);
  stmt.run(id);

  return { success: true, deletedId: id };
}

export function clearAllSiteCheckRecords(): { success: boolean; deletedCount: number; error?: string } {
  initSiteChecksTable();
  const db = getDatabase();

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM site_checks`).get() as any;
  const count = Number(countRow?.cnt || 0);

  // Delete evidence folders from disk
  try {
    const baseEvidenceDir = path.resolve(process.cwd(), 'evidence', 'site_checks');
    if (fs.existsSync(baseEvidenceDir)) {
      fs.rmSync(baseEvidenceDir, { recursive: true, force: true });
      fs.mkdirSync(baseEvidenceDir, { recursive: true });
    }
  } catch (err: any) {
    console.warn(`[Store] Could not clear evidence folder:`, err?.message);
  }

  // Delete all records from SQLite
  db.exec(`DELETE FROM site_checks;`);

  return { success: true, deletedCount: count };
}
