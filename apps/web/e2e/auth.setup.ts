import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

/**
 * Authentication Setup
 *
 * This test runs once before all other tests to authenticate and save the session.
 * Other tests will reuse this authenticated state.
 */
setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Wait for the login form to be visible
  await expect(page.getByRole('heading', { name: /conectare/i })).toBeVisible();

  // Fill in credentials
  // Note: In CI, use environment variables for test credentials
  const testEmail = process.env.TEST_USER_EMAIL ?? 'test@medicalcor.ro';
  const testPassword = process.env.TEST_USER_PASSWORD ?? 'test-password-123';

  await page.getByLabel(/email/i).fill(testEmail);
  await page.getByLabel(/parola/i).fill(testPassword);

  // Click login button
  await page.getByRole('button', { name: /conectare|login/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 15000 });

  // Verify we're logged in by checking for dashboard elements
  await expect(page.getByRole('heading', { name: /dashboard|bord/i })).toBeVisible({
    timeout: 10000,
  });

  // Save authentication state
  await page.context().storageState({ path: authFile });
});

/**
 * Test credentials for CI:
 *
 * Set these environment variables in your CI pipeline:
 * - TEST_USER_EMAIL: Email of test user
 * - TEST_USER_PASSWORD: Password of test user
 *
 * For local development, you can create a .env.local file:
 * TEST_USER_EMAIL=test@medicalcor.ro
 * TEST_USER_PASSWORD=test-password-123
 */
