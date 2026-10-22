import { ApprovalRecord } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

const APPROVALS_DIR = path.resolve(process.cwd(), 'evidence', 'approvals');

/**
 * Step 6: Human Approval
 * Displays the drafted test code and records human approval.
 * Stores approved version.
 * Blocks duplicate execution on retries.
 */
export class ApprovalGate {
  private static executedRuns = new Set<string>();

  /**
   * Check if a duplicate execution is being attempted for the same exact hash/code
   */
  public static isDuplicateExecution(testId: string, code: string): boolean {
    const runKey = `${testId}::${simpleHash(code)}`;
    return this.executedRuns.has(runKey);
  }

  /**
   * Register that a run with this code was completed to prevent accidental duplicate reruns
   */
  public static markExecuted(testId: string, code: string): void {
    const runKey = `${testId}::${simpleHash(code)}`;
    this.executedRuns.add(runKey);
  }

  /**
   * Approve and store the approved code
   */
  public static approve(
    testId: string,
    code: string,
    mode: 'manual' | 'pre-approved' = 'manual'
  ): ApprovalRecord {
    if (!fs.existsSync(APPROVALS_DIR)) {
      fs.mkdirSync(APPROVALS_DIR, { recursive: true });
    }

    const record: ApprovalRecord = {
      testId,
      approved: true,
      approvedCode: code,
      approvedAt: new Date().toISOString(),
      approvalMode: mode,
    };

    const filePath = path.join(APPROVALS_DIR, `${testId.toLowerCase()}_approved.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    return record;
  }

  public static getStoredApproval(testId: string): ApprovalRecord | null {
    const filePath = path.join(APPROVALS_DIR, `${testId.toLowerCase()}_approved.json`);
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
