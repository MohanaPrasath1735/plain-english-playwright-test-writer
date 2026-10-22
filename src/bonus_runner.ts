import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  proposeTC2SelfHealing,
  calculateTC1StabilityScore,
  runAccessibilityCheck,
  approveAndExecuteTC2Healing,
} from './pipeline/bonus.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const arg = process.argv[2]?.toLowerCase();

  if (arg === 'heal-approve') {
    console.log('\n>>> EXECUTING TC2 SELF-HEALING (Human Approval Confirmed) <<<\n');
    const result = await approveAndExecuteTC2Healing();
    console.log(`Status: ${result.status}`);
    console.log(`Execution Details:`, result.executionResult);
    console.log('\nHealed spec executed! Review results on dashboard at http://localhost:3050\n');
    return;
  }

  console.log('\n======================================================');
  console.log('>>> EXECUTING BONUS SUITE (Separate Evaluation) <<<');
  console.log('======================================================\n');

  console.log('[Bonus 1: Self-Healing Proposal for TC2]');
  const proposal = await proposeTC2SelfHealing();
  console.log(`  - Failing Selector: ${proposal.failingSelector}`);
  console.log(`  - Proposed Replacement: ${proposal.proposedSelector}`);
  console.log(`  - Status: Proposed fix, awaiting approval (NOT applied automatically)`);
  console.log(`  - Reason: ${proposal.reason}\n`);

  console.log('[Bonus 2: Stability Score for TC1 (3 Consecutive Runs with Fresh Data)]');
  const stability = await calculateTC1StabilityScore(3);
  console.log(`  - Result: ${stability.scoreText}`);
  stability.runs.forEach(r => {
    console.log(`    • Run ${r.runIndex}: ${r.status} (${r.durationMs}ms) | User: ${r.username} | DB Verified: ${r.dbVerified}`);
  });
  console.log('');

  console.log('[Bonus 3: Accessibility Audit (axe-core on /register)]');
  const a11y = await runAccessibilityCheck();
  console.log(`  - Page URL: ${a11y.url}`);
  console.log(`  - Inspected At: ${a11y.inspectedAt}`);
  console.log(`  - Violations Count: ${a11y.violationsCount}`);
  if (a11y.violations.length === 0) {
    console.log(`  - Result: none found`);
  } else {
    a11y.violations.forEach(v => {
      console.log(`    • [${v.impact.toUpperCase()}] ${v.id}: ${v.description}`);
      console.log(`      Help: ${v.help} (${v.helpUrl})`);
    });
  }

  console.log('\n======================================================');
  console.log('Bonus evaluation complete! Review dashboard at http://localhost:3050');
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Bonus runner error:', err);
  process.exit(1);
});
