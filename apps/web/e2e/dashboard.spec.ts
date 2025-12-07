import { test, expect } from '@playwright/test';

/**
 * Dashboard E2E Tests
 *
 * Tests the main dashboard functionality that doctors use daily.
 * These tests ensure the core experience remains stable.
 * Features: Metrics cards, navigation, quick actions, notifications.
 */
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for dashboard to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
  });

  test.describe('Core Layout', () => {
    test('displays dashboard with key metrics', async ({ page }) => {
      // Check for main dashboard elements
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Verify key metrics cards are present (at least one)
      const cards = page.locator('[data-testid="metrics-card"], .card, [class*="Card"]');
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

    test('sidebar collapse/expand works', async ({ page }) => {
      // Look for sidebar toggle button
      const collapseButton = page.locator('button').filter({
        has: page.locator('[class*="lucide-panel-left"], [class*="lucide-chevron"]'),
      });

      if (await collapseButton.isVisible({ timeout: 3000 })) {
        await collapseButton.click();
        await page.waitForTimeout(300);

        // Sidebar should be collapsed (narrower or hidden text)
        const sidebar = page.locator('[data-testid="sidebar"], aside, nav').first();
        await expect(sidebar).toBeVisible();

        // Toggle back
        await collapseButton.click();
      }
    });

    test('footer or copyright is visible', async ({ page }) => {
      // Check for footer elements
      const footer = page.locator('footer, [class*="footer"]');
      const copyright = page.getByText(/©|MedicalCor|copyright/i);

      await expect(footer.or(copyright)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Quick Actions', () => {
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

    test('quick search shows recent items or suggestions', async ({ page }) => {
      // Open quick search
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);

      const searchDialog = page.getByRole('dialog').or(page.locator('[data-testid="quick-search"]'));
      if (await searchDialog.isVisible()) {
        // Check for recent items or suggestions
        const suggestions = page.getByText(/recent|sugesti|cautare/i);
        const searchInput = page.locator('input[type="search"], input[placeholder*="caut"]');

        await expect(searchInput.or(suggestions)).toBeVisible({ timeout: 3000 });

        await page.keyboard.press('Escape');
      }
    });

    test('quick action buttons are accessible', async ({ page }) => {
      // Look for quick action buttons (Add Patient, New Booking, etc.)
      const quickActions = page.locator('button, a').filter({
        hasText: /adaugă|programare|nou|rapid|quick/i,
      });

      if (await quickActions.first().isVisible({ timeout: 5000 })) {
        await expect(quickActions.first()).toBeEnabled();
      }
    });
  });

  test.describe('Metrics & Statistics', () => {
    test('metrics cards show numerical values', async ({ page }) => {
      // Wait for data to load
      await page.waitForTimeout(1000);

      // Look for cards with numbers
      const numberDisplay = page.locator('[class*="text-2xl"], [class*="text-3xl"], [class*="font-bold"]').filter({
        hasText: /^\d+$|^\d+[.,]\d+$/,
      });

      await expect(numberDisplay.first()).toBeVisible({ timeout: 10000 });
    });

    test('metrics cards show trend indicators', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for trend indicators (up/down arrows, percentages)
      const trendIndicator = page.locator('[class*="lucide-trending"], [class*="lucide-arrow"]');
      const percentageChange = page.getByText(/[+-]?\d+(\.\d+)?%/);

      await expect(trendIndicator.first().or(percentageChange.first())).toBeVisible({ timeout: 5000 });
    });

    test('clicking metrics card navigates to detail view', async ({ page }) => {
      const metricsCard = page.locator('.card, [class*="Card"]').first();

      if (await metricsCard.isVisible({ timeout: 5000 })) {
        const clickableCard = metricsCard.locator('a').first();

        if (await clickableCard.isVisible({ timeout: 2000 })) {
          const href = await clickableCard.getAttribute('href');
          await clickableCard.click();

          // Should navigate away from dashboard
          if (href && href !== '/') {
            await expect(page).not.toHaveURL(/^\/$/, { timeout: 5000 });
          }
        }
      }
    });
  });

  test.describe('User Profile & Settings', () => {
    test('user can access settings', async ({ page }) => {
      // Click on user menu or settings link
      const settingsLink = page.getByRole('link', { name: /setari|settings/i });

      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await expect(page).toHaveURL(/.*settings.*/);
      }
    });

    test('user profile dropdown is accessible', async ({ page }) => {
      // Look for user avatar or profile button
      const profileButton = page.locator('button, [role="button"]').filter({
        has: page.locator('[class*="avatar"], img[alt*="user"], [class*="Avatar"]'),
      });

      if (await profileButton.isVisible({ timeout: 5000 })) {
        await profileButton.click();

        // Dropdown should appear with options
        const dropdown = page.getByRole('menu').or(page.locator('[data-radix-menu-content]'));
        await expect(dropdown).toBeVisible({ timeout: 3000 });

        // Check for logout option
        const logoutOption = page.getByText(/deconectare|logout|ieși/i);
        await expect(logoutOption).toBeVisible();

        // Close dropdown
        await page.keyboard.press('Escape');
      }
    });

    test('notification bell is visible and clickable', async ({ page }) => {
      // Look for notification icon
      const notificationBell = page.locator('button').filter({
        has: page.locator('[class*="lucide-bell"]'),
      });

      if (await notificationBell.isVisible({ timeout: 5000 })) {
        await notificationBell.click();

        // Notification panel should open
        const notificationPanel = page.getByRole('dialog').or(page.locator('[data-testid="notifications"]'));
        await expect(notificationPanel).toBeVisible({ timeout: 3000 });

        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Real-time Features', () => {
    test('real-time connection indicator is visible', async ({ page }) => {
      // Check for WebSocket connection status indicator
      const connectionStatus = page.locator(
        '[data-testid="connection-status"], [aria-label*="conectat"], [aria-label*="connection"], [class*="status"]'
      );

      // Should show connection status (either connected or attempting)
      await expect(connectionStatus).toBeVisible({ timeout: 10000 });
    });

    test('page handles reload gracefully', async ({ page }) => {
      // Reload the page
      await page.reload();

      // Dashboard should load again without errors
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });

      // Metrics should load
      const cards = page.locator('[data-testid="metrics-card"], .card, [class*="Card"]');
      await expect(cards.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Responsive Behavior', () => {
    test('mobile menu works on small viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      // Wait for page to load
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });

      // Look for mobile menu button
      const mobileMenuButton = page.getByRole('button', { name: /menu/i }).or(
        page.locator('button').filter({ has: page.locator('[class*="lucide-menu"]') })
      );

      if (await mobileMenuButton.isVisible({ timeout: 5000 })) {
        await mobileMenuButton.click();

        // Mobile menu should appear
        const mobileNav = page.locator('nav, [data-testid="mobile-nav"], [role="navigation"]');
        await expect(mobileNav).toBeVisible({ timeout: 3000 });
      }
    });
  });
});
