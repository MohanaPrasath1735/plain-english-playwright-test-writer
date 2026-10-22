import { test, expect } from '@playwright/test';

test.describe('TC2 - Sign up with modified button selector', () => {
  test('Sign up with altered button selector', async ({ page }) => {
    const credentials = {
      username: 'user_c6f0778d',
      email: 'agent_test_c6f0778d@example.com',
      password: 'P@ssword_c6f0778d!',
    };

    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle' });

    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // SIMULATED SELECTOR CHANGE / MUTATION:
    // Targeting an altered selector that does not exist in the DOM
    await page.locator('button.non-existent-btn-class-changed').click({ timeout: 5000 });

    // State assertion
    await expect(page.getByRole('link', { name: credentials.username })).toBeVisible({ timeout: 5000 });
  });
});
