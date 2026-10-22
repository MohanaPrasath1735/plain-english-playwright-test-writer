import { z } from 'zod';

export const TestCaseInputSchema = z.object({
  id: z.string().min(1, 'ID must not be empty'),
  flow_description: z.string().min(1, 'flow_description must not be empty'),
  expected_end_state: z.string().min(1, 'expected_end_state must not be empty'),
});

export type TestCaseInput = z.infer<typeof TestCaseInputSchema>;

export interface FlowStep {
  stepNumber: number;
  action: 'navigate' | 'fill' | 'click' | 'assert' | 'custom';
  targetDescription: string;
  value?: string;
}

export interface UnderstoodFlow {
  testId: string;
  rawFlow: string;
  steps: FlowStep[];
  expectedEndState: string;
  targetInitialUrl: string;
}

export interface BrowsedSelector {
  selector: string;
  strategy: 'role' | 'label' | 'placeholder' | 'testid' | 'css';
  elementDescription: string;
  elementTag: string;
  elementText?: string;
  attributes?: Record<string, string>;
  sourceUrl: string;
  retrievalTime: string;
}

export interface BrowseResult {
  sourceUrl: string;
  retrievalTime: string;
  selectors: BrowsedSelector[];
  screenshotPath?: string;
}

export interface ReasoningDecision {
  stepDescription: string;
  chosenSelector: string;
  strategy: 'role' | 'label' | 'placeholder' | 'testid' | 'css';
  reason: string;
  evidence: string;
  isUncertain: boolean;
}

export interface ReasoningResult {
  status: 'ready' | 'uncertain';
  decisions: ReasoningDecision[];
  unresolvedItems: string[];
}

export interface CriticResult {
  approved: boolean;
  hasStateAssertion: boolean;
  hasOnlyUrlAssertion: boolean;
  feedback: string;
  revisedCode?: string;
}

export interface ApprovalRecord {
  testId: string;
  approved: boolean;
  approvedCode: string;
  approvedAt: string;
  approvalMode: 'manual' | 'pre-approved';
}

export interface SingleExecutionResult {
  runNumber: number;
  status: 'PASSED' | 'FAILED';
  durationMs: number;
  tracePath: string;
  screenshotPath: string;
  logs: string[];
  error?: string;
  createdUserData?: {
    username: string;
    email: string;
  };
}

export interface TestExecutionSuiteResult {
  run1: SingleExecutionResult;
  run2Rerun: SingleExecutionResult;
  isStable: boolean;
}

export interface VerificationResult {
  passed: boolean;
  expectedResult: string;
  actualResult: string;
  message: string;
  dbAssertionResult?: string;
}

export interface AgentRunRecord {
  id: string;
  testCaseId: string;
  inputJson: string;
  sourceUrl: string;
  retrievalTime: string;
  selectorsJson: string;
  decisionReasonsJson: string;
  draftCode: string;
  criticFeedback: string;
  approvedCode: string;
  approvalStatus: string;
  run1Status: string;
  run2Status: string;
  actualResult: string;
  expectedResult: string;
  evidencePath: string;
  unresolvedItemsJson: string;
  approver?: string;
  stepEventsJson?: string;
  createdAt: string;
  updatedAt: string;
}
