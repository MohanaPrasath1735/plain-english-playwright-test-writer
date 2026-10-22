import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  const credentials = {
    username: 'user_ed77a022',
    email: 'agent_test_ed77a022@example.com',
    password: 'P@ssword_ed77a022!',
  };

  test('TC1 - should register a new user and verify dashboard navbar displays user profile', async ({ page }) => {
    // 1. Navigate to the sign up page
    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle' });

    // 2. Fill in registration credentials using accessible locators
    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // 3. Submit registration form
    await page.getByRole('button', { name: 'Sign up' }).click();

    // 4. Assert user is authenticated and profile link appears in navbar
    const userProfileLink = page.getByRole('link', { name: credentials.username });
    await expect(userProfileLink).toBeVisible({ timeout: 15000 });
  });
});