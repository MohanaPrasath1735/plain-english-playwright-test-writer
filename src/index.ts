import * as dotenv from 'dotenv';
import * as path from 'path';
import { runAgentPipeline } from './pipeline/orchestrator.js';
import { startWebUI } from './pipeline/10_webui.js';
import { checkConduitDatabaseForDuplicates } from './pipeline/8_verify.js';
import { TestCaseInput } from './types.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TEST_CASES: Record<string, TestCaseInput> = {
  TC1: {
    id: 'TC1',
    flow_description: 'Navigate to sign up page, enter unique username, email, and password, click Sign up button, and see dashboard navbar with logged-in user',
    expected_end_state: 'User record is created, authenticated session is established, and user profile link is visible in dashboard navbar',
  },
  TC2: {
    id: 'TC2',
    flow_description: 'Navigate to sign up page, fill username, email, password, and click Sign up button where the button selector changed to an invalid or mutated locator',
    expected_end_state: 'Test fails with a clear message indicating button selector changed or could not be found',
  },
  TC3: {
    id: 'TC3',
    flow_description: 'Navigate to sign up page, fill username, email, and password, click Sign up button. Draft only checks the URL, but critic rejects it and enforces state assertion',
    expected_end_state: 'Draft only checking URL is rejected by critic and upgraded to assert user profile state',
  },
  TC4: {
    id: 'TC4',
    flow_description: 'Test rerun: execute sign up with fresh synthetic test data per run, verifying no duplicate accounts exist in the application database',
    expected_end_state: 'Fresh test data used per run; database query proves no duplicate accounts created',
  },
};

async function main() {
  const args = process.argv.slice(2);
  const targetTc = args[0]?.toUpperCase() || 'TC1';

  // Start the small web UI
  startWebUI(3050);

  if (targetTc === 'TC1') {
    console.log('\n>>> EXECUTING TC1: "Sign up and see dashboard" <<<\n');
    const result = await runAgentPipeline(TEST_CASES.TC1, {
      approvalMode: 'pre-approved',
    });
    console.log(`\n======================================================`);
    console.log(`TC1 Result: ${result.verificationPassed ? 'PASSED ✓' : 'FAILED ✗'}`);
    console.log(`======================================================\n`);
    return;
  }

  if (targetTc === 'TC2') {
    console.log('\n>>> EXECUTING TC2: "Button selector changes" (Expected Failure) <<<\n');
    const result = await runAgentPipeline(TEST_CASES.TC2, {
      buttonSelectorOverride: 'button.non-existent-btn-class-changed',
      approvalMode: 'pre-approved',
    });
    console.log(`\n======================================================`);
    console.log(`TC2 Result: ${result.verificationPassed ? 'PASSED ✓ (Correctly diagnosed selector change failure)' : 'FAILED ✗'}`);
    console.log(`======================================================\n`);
    return;
  }

  if (targetTc === 'TC3') {
    console.log('\n>>> EXECUTING TC3: "Draft only checks the URL" (Critic Rejection & State Enforce) <<<\n');
    const result = await runAgentPipeline(TEST_CASES.TC3, {
      forceOnlyUrlCheck: true,
      approvalMode: 'pre-approved',
    });
    console.log(`\n======================================================`);
    console.log(`TC3 Result: ${result.verificationPassed ? 'PASSED ✓ (Critic successfully replaced URL-only assertion with state assertion)' : 'FAILED ✗'}`);
    console.log(`======================================================\n`);
    return;
  }

  if (targetTc === 'TC4') {
    console.log('\n>>> EXECUTING TC4: "Test rerun" (Fresh Synthetic Data & DB Duplicate Check) <<<\n');
    const result = await runAgentPipeline(TEST_CASES.TC4, {
      approvalMode: 'pre-approved',
    });
    const dupCheck = checkConduitDatabaseForDuplicates('agent_test_');
    console.log(`\nConduit Database Duplicate Account Analysis:`);
    console.log(`Total agent test accounts in DB: ${dupCheck.totalAccounts}`);
    console.log(`Accounts list:`, dupCheck.accounts.map(a => `${a.username} (${a.email})`));
    console.log(`======================================================`);
    console.log(`TC4 Result: ${result.verificationPassed ? 'PASSED ✓ (Proved fresh data per run and verified database state)' : 'FAILED ✗'}`);
    console.log(`======================================================\n`);
    return;
  }

  if (targetTc === 'ALL') {
    console.log('\n>>> EXECUTING ALL 4 TEST CASES SEQUENTIALLY <<<\n');
    console.log('--- RUNNING TC1 ---');
    const r1 = await runAgentPipeline(TEST_CASES.TC1, { approvalMode: 'pre-approved' });
    console.log(`TC1 Result: ${r1.verificationPassed ? 'PASSED ✓' : 'FAILED ✗'}\n`);

    console.log('--- RUNNING TC2 (Expected Failure) ---');
    const r2 = await runAgentPipeline(TEST_CASES.TC2, {
      buttonSelectorOverride: 'button.non-existent-btn-class-changed',
      approvalMode: 'pre-approved',
    });
    console.log(`TC2 Result: ${r2.verificationPassed ? 'PASSED ✓ (Correctly diagnosed selector change failure)' : 'FAILED ✗'}\n`);

    console.log('--- RUNNING TC3 (Critic URL-only Rejection & State Enforcement) ---');
    const r3 = await runAgentPipeline(TEST_CASES.TC3, {
      forceOnlyUrlCheck: true,
      approvalMode: 'pre-approved',
    });
    console.log(`TC3 Result: ${r3.verificationPassed ? 'PASSED ✓ (Critic replaced URL-only draft with state assertion)' : 'FAILED ✗'}\n`);

    console.log('--- RUNNING TC4 (Fresh Data per Rerun & Real DB Duplicate Query) ---');
    const r4 = await runAgentPipeline(TEST_CASES.TC4, { approvalMode: 'pre-approved' });
    const dupCheck = checkConduitDatabaseForDuplicates('agent_test_');
    console.log(`\nConduit Database Duplicate Account Analysis:`);
    console.log(`Total agent test accounts in DB: ${dupCheck.totalAccounts}`);
    console.log(`Accounts list:`, dupCheck.accounts.map(a => `${a.username} (${a.email})`));
    console.log(`TC4 Result: ${r4.verificationPassed ? 'PASSED ✓ (Proved fresh data per run and verified database state)' : 'FAILED ✗'}\n`);

    console.log('\n======================================================');
    console.log('All 4 test cases completed! Review dashboard at http://localhost:3050');
    console.log('======================================================\n');
  }
}

main().catch(err => {
  console.error('Fatal agent error:', err);
  process.exit(1);
});
