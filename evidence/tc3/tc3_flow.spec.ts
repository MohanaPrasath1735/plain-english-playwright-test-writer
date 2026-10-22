import { test, expect } from '@playwright/test';

test.describe('TC3 - Sign up flow', () => {
  test('Sign up and check URL only', async ({ page }) => {
    // Fresh synthetic credentials (no PII)
    const credentials = {
      username: 'user_93fd8605',
      email: 'agent_test_93fd8605@example.com',
      password: 'P@ssword_93fd8605!',
    };

    // Navigate to registration page
    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle' });

    // Fill form
    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // Submit
    await page.getByRole('button', { name: 'Sign up' }).click();

    // DRAFT FLAW: only checks URL without state assertion
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const hostPattern = baseUrl.replace(/^https?:///, '').replace(//$/, '');
    // REPLACED BY CRITIC: Enforce state assertion instead of URL-only check
    const userNavLink = page.getByRole('link', { name: credentials.username });
    await expect(userNavLink).toBeVisible({ timeout: 15000 });
  });
});
