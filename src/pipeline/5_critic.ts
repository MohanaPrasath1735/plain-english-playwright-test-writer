import { CriticResult } from '../types.js';

/**
 * Step 5: Critic
 * Purely deterministic check in code (0 LLM calls).
 * Rejects drafts whose only assertion is on the URL (e.g., toHaveURL, page.url())
 * and requires a verifiable assertion on visible in-page DOM state
 * (e.g., user profile link, avatar, or visible text in the navbar/dashboard).
 *
 * If URL-only, it automatically upgrades the draft to assert visible UI state.
 */
export async function criticReview(draftCode: string): Promise<CriticResult> {
  // Check for URL assertions
  const hasUrlAssertion = /toHaveURL|page\.url\(\)/.test(draftCode);

  // Check for visible in-page UI state assertions
  const hasStateAssertion = (
    /getByRole\(\s*['"]link['"].*username/i.test(draftCode) ||
    /getByRole\(\s*['"]link['"].*credentials\./i.test(draftCode) ||
    /getByText\(.*username/i.test(draftCode) ||
    /getByText\(.*credentials\./i.test(draftCode) ||
    /toBeVisible\s*\(/i.test(draftCode) ||
    /toHaveText\s*\(/i.test(draftCode) ||
    /toContainText\s*\(/i.test(draftCode)
  ) && !/^\s*\/\//m.test(draftCode); // not commented out

  const isOnlyUrl = hasUrlAssertion && !hasStateAssertion;

  if (isOnlyUrl) {
    // Generate revised code that injects the required state assertion
    const revisedCode = replaceUrlOnlyAssertionWithStateAssertion(draftCode);
    return {
      approved: false,
      hasStateAssertion: false,
      hasOnlyUrlAssertion: true,
      feedback: 'REJECTED by Deterministic Critic: Draft asserts only page URL. Tests must verify visible in-page UI state (e.g. username link visible in navbar). Upgraded with state assertion.',
      revisedCode,
    };
  }

  // If no URL assertion and no state assertion either, enforce state assertion
  if (!hasStateAssertion) {
    const revisedCode = replaceUrlOnlyAssertionWithStateAssertion(draftCode);
    return {
      approved: false,
      hasStateAssertion: false,
      hasOnlyUrlAssertion: false,
      feedback: 'REJECTED by Deterministic Critic: Draft lacks visible DOM state assertion. Upgraded to assert logged-in profile visibility.',
      revisedCode,
    };
  }

  return {
    approved: true,
    hasStateAssertion: true,
    hasOnlyUrlAssertion: false,
    feedback: 'APPROVED by Deterministic Critic: Test contains verifiable in-page state assertion checking authenticated UI elements.',
  };
}

/**
 * Automatically rewrites a URL-only test into a state-verifying test
 */
export function replaceUrlOnlyAssertionWithStateAssertion(code: string): string {
  const stateAssertionCode = `
    // ENFORCED BY CRITIC: Assert visible in-page state instead of URL-only check
    const userNavLink = page.getByRole('link', { name: credentials.username });
    await expect(userNavLink).toBeVisible({ timeout: 15000 });
`;

  if (/await expect\(page\)\.toHaveURL\(.*?\);/.test(code)) {
    return code.replace(/await expect\(page\)\.toHaveURL\(.*?\);/, stateAssertionCode.trim());
  }

  // If no exact toHaveURL match, append before test block closing
  return code.replace(/(\n\s*\}\);\s*\}\);)/, `\n${stateAssertionCode}$1`);
}
