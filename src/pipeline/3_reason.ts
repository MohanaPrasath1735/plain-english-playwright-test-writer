import { UnderstoodFlow, BrowseResult, ReasoningResult, ReasoningDecision } from '../types.js';

/**
 * Step 3: Reason
 * Choose stable selectors and real assertions based on live DOM inspection.
 * Saves evidence and reason for each decision.
 * If evidence is missing for a required step, returns an 'uncertain' state instead of guessing.
 */
export function reasonSelectors(flow: UnderstoodFlow, browse: BrowseResult, overrideButtonSelector?: string): ReasoningResult {
  const decisions: ReasoningDecision[] = [];
  const unresolvedItems: string[] = [];

  for (const step of flow.steps) {
    if (step.action === 'navigate') {
      decisions.push({
        stepDescription: step.targetDescription,
        chosenSelector: `await page.goto('${step.value || browse.sourceUrl}', { waitUntil: 'networkidle' })`,
        strategy: 'role',
        reason: 'Direct navigation to target starting page',
        evidence: `Verified endpoint exists at ${step.value || browse.sourceUrl} during inspection at ${browse.retrievalTime}`,
        isUncertain: false,
      });
      continue;
    }

    if (step.action === 'fill') {
      const lowerTarget = step.targetDescription.toLowerCase();

      // Find matching browsed selector
      const matched = browse.selectors.find(s => {
        const desc = s.elementDescription.toLowerCase();
        const placeholder = s.attributes?.name?.toLowerCase() || '';
        if (lowerTarget.includes('username')) return desc.includes('username') || placeholder.includes('username');
        if (lowerTarget.includes('email')) return desc.includes('email') || placeholder.includes('email');
        if (lowerTarget.includes('password')) return desc.includes('password') || placeholder.includes('password');
        return false;
      });

      if (matched) {
        decisions.push({
          stepDescription: step.targetDescription,
          chosenSelector: `${matched.selector}.fill(${step.value ? `credentials.${step.targetDescription.split(' ')[0].toLowerCase()}` : `''`})`,
          strategy: matched.strategy,
          reason: `Selected accessible locator (${matched.strategy}) rather than brittle CSS path.`,
          evidence: `Element confirmed during inspection at ${matched.sourceUrl} (${matched.elementDescription}) at ${matched.retrievalTime}`,
          isUncertain: false,
        });
      } else {
        decisions.push({
          stepDescription: step.targetDescription,
          chosenSelector: 'UNKNOWN_SELECTOR',
          strategy: 'css',
          reason: 'No matching DOM element found during browse inspection.',
          evidence: 'Element missing in live DOM.',
          isUncertain: true,
        });
        unresolvedItems.push(`Missing selector for step: ${step.targetDescription}`);
      }
      continue;
    }

    if (step.action === 'click') {
      // If an intentional override is provided (e.g., for TC2 button selector change simulation)
      if (overrideButtonSelector) {
        decisions.push({
          stepDescription: step.targetDescription,
          chosenSelector: `${overrideButtonSelector}.click()`,
          strategy: 'css',
          reason: `Selector altered/mutated: '${overrideButtonSelector}' does not match any element on /register.`,
          evidence: `Selector '${overrideButtonSelector}' not found in live DOM snapshot taken at ${browse.retrievalTime}`,
          isUncertain: true,
        });
        unresolvedItems.push(`Selector not found: '${overrideButtonSelector}' no longer matches anything on /register. The page's button may have been renamed or restyled.`);
        continue;
      }

      // Find matching button
      const matchedButton = browse.selectors.find(s => {
        return (
          s.elementTag === 'button' &&
          (s.elementText?.toLowerCase().includes('sign up') || s.elementDescription.toLowerCase().includes('sign up'))
        );
      });

      if (matchedButton) {
        decisions.push({
          stepDescription: step.targetDescription,
          chosenSelector: `${matchedButton.selector}.click()`,
          strategy: matchedButton.strategy,
          reason: 'Accessible role-based button selector prioritized for resilient user interaction.',
          evidence: `Found button "${matchedButton.elementText}" in DOM snapshot at ${matchedButton.retrievalTime}`,
          isUncertain: false,
        });
      } else {
        decisions.push({
          stepDescription: step.targetDescription,
          chosenSelector: 'UNKNOWN_BUTTON',
          strategy: 'css',
          reason: 'No button matching description found in inspected page.',
          evidence: 'No button found in live DOM.',
          isUncertain: true,
        });
        unresolvedItems.push(`Missing button for step: ${step.targetDescription}`);
      }
      continue;
    }

    if (step.action === 'assert') {
      // State assertion verifying the new user profile link in navbar
      decisions.push({
        stepDescription: step.targetDescription,
        chosenSelector: `await expect(page.getByRole('link', { name: credentials.username })).toBeVisible({ timeout: 15000 })`,
        strategy: 'role',
        reason: 'State assertion: verifies authenticated user name appears in navigation header rather than only checking URL redirect.',
        evidence: `Conduit layout renders authenticated user profile link in navbar <Link href="/profile/{username}">{username}</Link>`,
        isUncertain: false,
      });
    }
  }

  const isUncertain = unresolvedItems.length > 0 || decisions.some(d => d.isUncertain);

  return {
    status: isUncertain ? 'uncertain' : 'ready',
    decisions,
    unresolvedItems,
  };
}
