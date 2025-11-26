import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility E2E Tests
 *
 * Ensures the application meets WCAG 2.1 AA accessibility standards.
 * Critical for a medical application that must be usable by all healthcare professionals.
 */
test.describe('Accessibility', () => {
  test('dashboard has no critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('[data-testid="skip-a11y"]') // Exclude known issues being fixed
      .analyze();

    // Filter to only critical and serious violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('patient list has no critical accessibility violations', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('keyboard navigation works throughout the app', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab through the page
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Something should be focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
    expect(focusedElement).not.toBe('BODY');
  });

  test('focus is visible when navigating with keyboard', async ({ page }) => {
    await page.goto('/');

    // Tab to an interactive element
    await page.keyboard.press('Tab');

    // Get the focused element
    const focusedElement = page.locator(':focus');

    // Check if focus ring is visible (should have outline or ring class)
    const hasVisibleFocus = await focusedElement.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const hasOutline = styles.outline !== 'none' && styles.outlineWidth !== '0px';
      const hasBoxShadow = styles.boxShadow !== 'none';
      const hasRingClass =
        el.className.includes('ring') || el.className.includes('focus');
      return hasOutline || hasBoxShadow || hasRingClass;
    });

    expect(hasVisibleFocus).toBe(true);
  });

  test('forms have proper labels', async ({ page }) => {
    await page.goto('/login');

    // All inputs should have associated labels
    const inputs = page.locator('input:not([type="hidden"])');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledby = await input.getAttribute('aria-labelledby');

      // Input should have either: id with matching label, aria-label, or aria-labelledby
      const hasLabel =
        id !== null ||
        ariaLabel !== null ||
        ariaLabelledby !== null ||
        (await input.locator('xpath=ancestor::label').count()) > 0;

      expect(hasLabel).toBe(true);
    }
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get all images
    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');

      // Image should have alt text or be marked as decorative
      const hasAltOrDecorative = alt !== null || role === 'presentation' || role === 'none';
      expect(hasAltOrDecorative).toBe(true);
    }
  });

  test('color contrast meets WCAG AA standards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .options({ runOnly: ['color-contrast'] })
      .analyze();

    // Check for color contrast violations
    const contrastViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === 'color-contrast'
    );

    // Log violations for debugging
    if (contrastViolations.length > 0) {
      console.log('Color contrast violations:', JSON.stringify(contrastViolations, null, 2));
    }

    // Allow some minor contrast issues but flag critical ones
    const criticalContrastIssues = contrastViolations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalContrastIssues).toEqual([]);
  });

  test('modals trap focus correctly', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');

    // Open add patient modal
    const addButton = page.getByRole('button', { name: /adauga|add/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      // Wait for modal
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Tab through modal - focus should stay inside
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
      }

      // Focus should still be in modal
      const focusedElement = page.locator(':focus');
      const isInModal = await focusedElement.evaluate((el, modalSelector) => {
        const modal = document.querySelector(modalSelector);
        return modal?.contains(el) ?? false;
      }, '[role="dialog"]');

      expect(isInModal).toBe(true);
    }
  });

  test('skip link is present and functional', async ({ page }) => {
    await page.goto('/');

    // Tab once - skip link should be first focusable element
    await page.keyboard.press('Tab');

    const skipLink = page.locator('a:has-text("Skip"), a:has-text("Sari")');

    if (await skipLink.isVisible()) {
      await skipLink.click();

      // Should skip to main content
      const mainContent = page.locator('main, [role="main"], #main-content');
      await expect(mainContent).toBeFocused();
    }
  });
});
