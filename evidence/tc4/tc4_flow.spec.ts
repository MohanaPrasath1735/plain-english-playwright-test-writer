import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  const credentials = {
    username: 'user_649454ea',
    email: 'agent_test_649454ea@example.com',
    password: 'P@ssword_649454ea!',
  };

  test('TC4 - execute sign up with synthetic test data and verify authenticated session', async ({ page }) => {
    // 1. Navigate to the registration page
    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle' });

    // 2. Fill in the registration form
    const usernameInput = page.getByPlaceholder('Username').or(page.getByRole('textbox', { name: /username/i }));
    const emailInput = page.getByPlaceholder('Email').or(page.getByRole('textbox', { name: /email/i }));
    const passwordInput = page.getByPlaceholder('Password');

    await usernameInput.fill(credentials.username);
    await emailInput.fill(credentials.email);
    await passwordInput.fill(credentials.password);

    // 3. Submit the registration form
    const signUpButton = page.getByRole('button', { name: /sign up/i });
    await signUpButton.click();

    // 4. Assert user profile link or username is visible in dashboard navbar
    const profileLink = page.getByRole('link', { name: credentials.username });
    await expect(profileLink).toBeVisible({ timeout: 15000 });
  });
});