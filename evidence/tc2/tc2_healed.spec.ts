import { test, expect } from '@playwright/test';

test.describe('TC2 (Healed Copy) - Self-Healing Button Selector', () => {
  test('Sign up with healed selector', async ({ page }) => {
    const credentials = {
      username: 'user_healed_35df19e0',
      email: 'agent_test_healed_35df19e0@example.com',
      password: 'P@ssword_35df19e0!',
    };

    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle' });

    await page.getByPlaceholder('Username').fill(credentials.username);
    await page.getByPlaceholder('Email').fill(credentials.email);
    await page.getByPlaceholder('Password').fill(credentials.password);

    // HEALED SELECTOR (Approved by reviewer):
    await page.getByRole('button', { name: 'Sign up' }).click();

    // Verify user profile appears in navbar
    const userNavLink = page.getByRole('link', { name: credentials.username });
    await expect(userNavLink).toBeVisible({ timeout: 15000 });
  });
});
