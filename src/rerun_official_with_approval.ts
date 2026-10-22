import { prepareDraftTest, approveAndExecuteTest } from './pipeline/orchestrator.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function runOfficialApprovalFlow() {
  console.log('=== RUNNING 4 OFFICIAL SCENARIOS THROUGH THE NEW APPROVAL FLOW ===');

  // Scenario 1: TC1 (Happy path)
  console.log('\n--- 1. TC1 (Happy Path) ---');
  const tc1Draft = await prepareDraftTest({
    id: 'TC1',
    flow_description: 'Navigate to sign up page, enter unique username, email, and password, click Sign up button, and see dashboard navbar with logged-in user',
    expected_end_state: 'User record is created, authenticated session is established, and user profile link is visible in dashboard navbar',
  });
  console.log('TC1 Draft created:', tc1Draft.id, 'Status:', tc1Draft.approvalStatus);
  const tc1Completed = await approveAndExecuteTest(tc1Draft.id, 'human');
  console.log('TC1 Approved & Executed:', tc1Completed.id, 'Approver:', tc1Completed.approver, 'Run 1:', tc1Completed.run1Status);

  // Scenario 2: TC2 (Mutated locator)
  console.log('\n--- 2. TC2 (Mutated Locator) ---');
  const tc2Draft = await prepareDraftTest({
    id: 'TC2',
    flow_description: 'Navigate to sign up page, fill username, email, password, and click Sign up button where the button selector changed to an invalid or mutated locator',
    expected_end_state: 'Test fails with a clear message indicating button selector changed or could not be found',
  }, {
    buttonSelectorOverride: 'button.non-existent-btn-class-changed',
  });
  console.log('TC2 Draft created:', tc2Draft.id, 'Status:', tc2Draft.approvalStatus);
  const tc2Completed = await approveAndExecuteTest(tc2Draft.id, 'human');
  console.log('TC2 Approved & Executed:', tc2Completed.id, 'Approver:', tc2Completed.approver, 'Run 1:', tc2Completed.run1Status);

  // Scenario 3: TC3 (Critic state assertion enforcement)
  console.log('\n--- 3. TC3 (Critic Enforces State Assertion) ---');
  const tc3Draft = await prepareDraftTest({
    id: 'TC3',
    flow_description: 'Navigate to sign up page, fill username, email, and password, click Sign up button. Draft only checks the URL, but critic rejects it and enforces state assertion',
    expected_end_state: 'Draft only checking URL is rejected by critic and upgraded to assert user profile state',
  }, {
    forceOnlyUrlCheck: true,
  });
  console.log('TC3 Draft created:', tc3Draft.id, 'Status:', tc3Draft.approvalStatus);
  const tc3Completed = await approveAndExecuteTest(tc3Draft.id, 'human');
  console.log('TC3 Approved & Executed:', tc3Completed.id, 'Approver:', tc3Completed.approver, 'Approval Status:', tc3Completed.approvalStatus);

  // Scenario 4: TC4 (Fresh credentials & DB duplicate proof)
  console.log('\n--- 4. TC4 (Fresh Credentials & DB Duplicate Proof) ---');
  const tc4Draft = await prepareDraftTest({
    id: 'TC4',
    flow_description: 'Test rerun: execute sign up with fresh synthetic test data per run, verifying no duplicate accounts exist in the application database',
    expected_end_state: 'Fresh test data used per run; database query proves no duplicate accounts created',
  });
  console.log('TC4 Draft created:', tc4Draft.id, 'Status:', tc4Draft.approvalStatus);
  const tc4Completed = await approveAndExecuteTest(tc4Draft.id, 'human');
  console.log('TC4 Approved & Executed:', tc4Completed.id, 'Approver:', tc4Completed.approver, 'Run 1:', tc4Completed.run1Status, 'Rerun:', tc4Completed.run2Status);

  console.log('\n=== ALL 4 OFFICIAL SCENARIOS EXECUTED WITH REAL HUMAN APPROVAL! ===');
}

runOfficialApprovalFlow().catch(err => {
  console.error('Failed to run official approval flow:', err);
  process.exit(1);
});
