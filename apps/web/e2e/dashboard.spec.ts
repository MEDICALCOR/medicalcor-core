import { test, expect } from '@playwright/test';

/**
 * Dashboard E2E Tests
 *
 * Tests the main dashboard functionality that doctors use daily.
 * These tests ensure the core experience remains stable.
 */
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays dashboard with key metrics', async ({ page }) => {
    // Check for main dashboard elements
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Verify key metrics cards are present (at least one)
    const cards = page.locator('[data-testid="metrics-card"], .card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('navigation sidebar works correctly', async ({ page }) => {
    // Open sidebar if on mobile
    const menuButton = page.getByRole('button', { name: /menu/i });
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }

    // Check for main navigation items
    const navItems = ['Pacienti', 'Workflows', 'Mesaje', 'Setari'];
    for (const item of navItems) {
      await expect(page.getByRole('link', { name: new RegExp(item, 'i') })).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('quick search opens with keyboard shortcut', async ({ page }) => {
    // Press Cmd+K / Ctrl+K to open quick search
    await page.keyboard.press('Control+k');

    // Check if search dialog opened
    await expect(
      page.getByRole('dialog').or(page.locator('[data-testid="quick-search"]'))
    ).toBeVisible({ timeout: 3000 });

    // Close with Escape
    await page.keyboard.press('Escape');
  });

  test('user can access settings', async ({ page }) => {
    // Click on user menu or settings link
    const settingsLink = page.getByRole('link', { name: /setari|settings/i });

    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page).toHaveURL(/.*settings.*/);
    }
  });

  test('real-time connection indicator is visible', async ({ page }) => {
    // Check for WebSocket connection status indicator
    const connectionStatus = page.locator(
      '[data-testid="connection-status"], [aria-label*="conectat"], [aria-label*="connection"]'
    );

    // Should show connection status (either connected or attempting)
    await expect(connectionStatus).toBeVisible({ timeout: 10000 });
  });
});
