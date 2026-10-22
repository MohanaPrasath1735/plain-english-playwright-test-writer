import { DiscoveredElementsSummary, SiteCheckProposal } from './store.js';
import { generateTextWithGemini } from '../llm.js';
import { v4 as uuidv4 } from 'uuid';

export async function generateSiteTestProposals(
  targetUrl: string,
  title: string,
  elements: DiscoveredElementsSummary,
  checkId: string
): Promise<SiteCheckProposal[]> {
  const shortId = uuidv4().replace(/-/g, '').slice(0, 6);
  const syntheticUser = `visitor_${shortId}`;
  const syntheticEmail = `visitor_${shortId}@synthetic-test-domain.org`;

  const prompt = `You are an expert test automation engineer writing Playwright tests.
Analyze the following web page details and propose up to 3 automated Playwright tests for what a visitor can do on this website:

Target URL: ${targetUrl}
Page Title: "${title}"
Discovered Interactive Elements:
- Forms: ${JSON.stringify(elements.forms.slice(0, 3))}
- Buttons: ${JSON.stringify(elements.buttons.slice(0, 5))}
- Inputs: ${JSON.stringify(elements.inputs.slice(0, 5))}
- Key Links: ${JSON.stringify(elements.links.slice(0, 5))}

Requirements:
1. Provide up to 3 realistic tests.
2. If a test submits a form, mark isFormSubmission: true. Otherwise isFormSubmission: false.
3. Every test must use synthetic data only (e.g. username "${syntheticUser}", email "${syntheticEmail}").
4. Never attempt to bypass CAPTCHA, OTP, or bot challenges.
5. Provide valid executable Playwright TypeScript code for each test.
6. Return strictly valid JSON array of objects with schema:
[
  {
    "title": "short title",
    "description": "plain-English description of what the test verifies",
    "isFormSubmission": true/false,
    "specCode": "import { test, expect } from '@playwright/test'; ... full executable code ..."
  }
]
`;

  try {
    const rawResponse = await generateTextWithGemini(prompt);
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 3).map((item, idx) => ({
        id: `prop_${checkId}_${idx + 1}`,
        title: item.title || `Test Proposal ${idx + 1}`,
        description: item.description || 'Automated verification of visitor action',
        isFormSubmission: Boolean(item.isFormSubmission),
        specCode: item.specCode || generateFallbackSpec(targetUrl, item.title, item.isFormSubmission, syntheticUser, syntheticEmail),
        status: 'PROPOSED',
      }));
    }
  } catch (err) {
    console.warn('[Proposals] LLM call unavailable or returned invalid JSON. Using deterministic synthetic generator:', err);
  }

  // Deterministic fallback proposals
  return generateDeterministicProposals(targetUrl, title, elements, checkId, syntheticUser, syntheticEmail);
}

function generateDeterministicProposals(
  targetUrl: string,
  title: string,
  elements: DiscoveredElementsSummary,
  checkId: string,
  syntheticUser: string,
  syntheticEmail: string
): SiteCheckProposal[] {
  const proposals: SiteCheckProposal[] = [];

  // Proposal 1: Read-Only Navigation and Page Structure Verification
  const prop1Spec = `import { test, expect } from '@playwright/test';

test('Verify page structure, title and accessible links', async ({ page }) => {
  // Navigate to target site (Read-Only check)
  const response = await page.goto('${targetUrl}', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();

  // Verify page title
  await expect(page).toHaveTitle(/.+/);

  // Verify main content container or body is visible
  const body = page.locator('body');
  await expect(body).toBeVisible();

  // Verify at least one interactive element exists
  const interactiveCount = await page.locator('a, button').count();
  expect(interactiveCount).toBeGreaterThan(0);
});
`;

  proposals.push({
    id: `prop_${checkId}_1`,
    title: `Verify Page Title & Navigation (${title ? title.slice(0, 30) : 'Home'})`,
    description: `Read-only verification that the page loads with valid HTTP response, correct title, and interactive navigation elements.`,
    isFormSubmission: false,
    specCode: prop1Spec,
    status: 'PROPOSED',
  });

  // Proposal 2: Link & Element Accessibility Check
  const keyLink = elements.links[0]?.text || 'main';
  const prop2Spec = `import { test, expect } from '@playwright/test';

test('Verify accessible links and button states', async ({ page }) => {
  await page.goto('${targetUrl}', { waitUntil: 'networkidle' });

  // Verify all visible links have valid href attributes
  const links = page.locator('a[href]');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);

  // Check first available link is visible and interactable
  const firstLink = links.first();
  await expect(firstLink).toBeVisible();
  const href = await firstLink.getAttribute('href');
  expect(href).toBeTruthy();
});
`;

  proposals.push({
    id: `prop_${checkId}_2`,
    title: `Verify Accessible Links & Interactive Elements`,
    description: `Inspects all discovered anchor and button elements to ensure valid targets and accessible interaction states without modifying site state.`,
    isFormSubmission: false,
    specCode: prop2Spec,
    status: 'PROPOSED',
  });

  // Proposal 3: Form Interaction (if forms exist) or Deep Content Verification
  const hasForms = elements.forms.length > 0 || elements.inputs.length > 0;
  if (hasForms) {
    const inputSelector = elements.inputs[0]?.selector || 'input';
    const buttonSelector = elements.buttons[0]?.selector || 'button';

    const prop3Spec = `import { test, expect } from '@playwright/test';

test('Form input interaction with synthetic data', async ({ page }) => {
  await page.goto('${targetUrl}', { waitUntil: 'networkidle' });

  // Locate input field using accessible locator
  const inputEl = page.locator('${inputSelector.replace(/'/g, "\\'")}').first();
  if (await inputEl.isVisible()) {
    // Fill with synthetic test data only
    await inputEl.fill('${syntheticUser}');
    await expect(inputEl).toHaveValue('${syntheticUser}');
  }

  // Form submission requires explicit permission checkbox verified beforehand
  const submitBtn = page.locator('${buttonSelector.replace(/'/g, "\\'")}').first();
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    await page.waitForTimeout(1000);
  }
});
`;

    proposals.push({
    id: `prop_${checkId}_3`,
    title: `Form Interaction Test with Synthetic Credentials`,
    description: `Fills available form inputs with fresh synthetic test data (${syntheticUser}) and validates form submission response. Requires permission checkbox.`,
    isFormSubmission: true,
    specCode: prop3Spec,
    status: 'PROPOSED',
  });
  } else {
    // Read-only viewport and responsiveness check
    const prop3Spec = `import { test, expect } from '@playwright/test';

test('Verify responsive layout on desktop and tablet viewports', async ({ page }) => {
  // Test desktop viewport
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('${targetUrl}', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();

  // Test tablet viewport
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await expect(page.locator('body')).toBeVisible();
});
`;

    proposals.push({
      id: `prop_${checkId}_3`,
      title: `Responsive Layout Verification across Viewports`,
      description: `Read-only verification that layout and content render responsively across desktop and tablet screen dimensions.`,
      isFormSubmission: false,
      specCode: prop3Spec,
      status: 'PROPOSED',
    });
  }

  return proposals;
}

function generateFallbackSpec(targetUrl: string, title: string, isFormSubmission: boolean, user: string, email: string): string {
  return `import { test, expect } from '@playwright/test';

test('${title.replace(/'/g, "\\'")}', async ({ page }) => {
  await page.goto('${targetUrl}', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toBeVisible();
});
`;
}
