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

  // Fill in credentials - REQUIRED via environment variables
  // SECURITY: No default credentials to prevent accidental use in production
  const testEmail = process.env.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD;

  if (!testEmail || !testPassword) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables are required for E2E tests. ' +
        'Set them in your CI pipeline or .env.local file.'
    );
  }

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
 * REQUIRED environment variables:
 * - TEST_USER_EMAIL: Email of test user
 * - TEST_USER_PASSWORD: Password of test user
 *
 * For local development, create a .env.local file with your test user credentials.
 * NEVER commit real credentials to version control.
 */
