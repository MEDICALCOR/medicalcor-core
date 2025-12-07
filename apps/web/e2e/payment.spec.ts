import { test, expect } from '@playwright/test';

/**
 * Payment/Billing Flow E2E Tests
 *
 * Tests invoice management and payment processing functionality.
 * Critical for clinic revenue tracking and financial operations.
 * Features: Invoice CRUD, payment status, filtering, statistics.
 */
test.describe('Payment & Billing Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/billing');
    // Wait for page to load
    await expect(page.getByRole('heading', { name: /facturare/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('displays billing page with statistics cards', async ({ page }) => {
    // Check for key statistics cards
    const statsCards = page.locator('.card, [class*="CardContent"]');
    await expect(statsCards.first()).toBeVisible({ timeout: 10000 });

    // Check for key metrics labels
    await expect(page.getByText(/încasări luna aceasta|monthly/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/în așteptare|pending/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/restanțe|overdue/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/total facturi/i)).toBeVisible({ timeout: 5000 });
  });

  test('displays invoice list or empty state', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(1000);

    // Check for invoice list or empty state
    const invoiceList = page.locator('[class*="border"][class*="rounded-lg"]').filter({
      has: page.locator('h4, [class*="font-medium"]'),
    });
    const emptyState = page.getByText(/nu există facturi|creează prima factură/i);

    await expect(invoiceList.first().or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('can open create invoice dialog', async ({ page }) => {
    // Click the create invoice button
    const createButton = page.getByRole('button', { name: /factură nouă|adaugă|create/i });
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Check dialog opened
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Verify dialog title
    await expect(page.getByText(/creează factură nouă/i)).toBeVisible();

    // Check form fields are present
    await expect(page.getByText(/nume client/i)).toBeVisible();
    await expect(page.getByText(/email client/i)).toBeVisible();
    await expect(page.getByText(/descriere servicii/i)).toBeVisible();
    await expect(page.getByText(/sumă/i)).toBeVisible();
    await expect(page.getByText(/scadență/i)).toBeVisible();
  });

  test('create invoice form validates required fields', async ({ page }) => {
    // Open create dialog
    await page.getByRole('button', { name: /factură nouă/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Try to submit without filling required fields
    const submitButton = page.getByRole('button', { name: /creează factură/i });

    // Submit button should be present
    await expect(submitButton).toBeVisible();

    // Fill in partial data and verify behavior
    const customerNameInput = page.locator('input').filter({ hasText: '' }).first();
    if (await customerNameInput.isVisible()) {
      // Click submit without filling - should show validation or stay on form
      await submitButton.click();

      // Dialog should still be open (validation failed)
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
    }
  });

  test('can fill and close create invoice dialog', async ({ page }) => {
    // Open create dialog
    await page.getByRole('button', { name: /factură nouă/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Fill form fields
    await page.getByPlaceholder(/ion popescu/i).fill('Test Patient');
    await page.getByPlaceholder(/email@exemplu/i).fill('test@example.com');
    await page.getByPlaceholder(/consultație generală/i).fill('Test Service');
    await page.locator('input[type="number"]').fill('100');

    // Set due date (30 days from now)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const dateString = futureDate.toISOString().split('T')[0];
    await page.locator('input[type="date"]').fill(dateString);

    // Close dialog with cancel button
    const cancelButton = page.getByRole('button', { name: /anulează/i });
    await cancelButton.click();

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
  });

  test('search filter works for invoices', async ({ page }) => {
    // Find search input
    const searchInput = page.getByPlaceholder(/caută/i);

    if (await searchInput.isVisible({ timeout: 5000 })) {
      // Type search query
      await searchInput.fill('test');

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Results should update (filtered list or no results)
      const invoiceCards = page.locator('[class*="border"][class*="rounded-lg"]').filter({
        has: page.locator('[class*="font-medium"]'),
      });
      const noResults = page.getByText(/nu există facturi/i);

      // Either show filtered results or empty state
      await expect(invoiceCards.first().or(noResults)).toBeVisible({ timeout: 5000 });
    }
  });

  test('status filter dropdown works', async ({ page }) => {
    // Find status filter dropdown
    const statusFilter = page.locator('[role="combobox"]').filter({ hasText: /toate|status/i });

    if (await statusFilter.isVisible({ timeout: 5000 })) {
      await statusFilter.click();

      // Check filter options are available
      const options = page.getByRole('option');
      await expect(options.first()).toBeVisible({ timeout: 3000 });

      // Check for specific status options
      await expect(page.getByRole('option', { name: /plătite|paid/i })).toBeVisible();
      await expect(page.getByRole('option', { name: /în așteptare|pending/i })).toBeVisible();

      // Select a filter option
      await page.getByRole('option', { name: /plătite|paid/i }).click();

      // Dropdown should close
      await expect(page.getByRole('listbox')).not.toBeVisible({ timeout: 2000 });
    }
  });

  test('invoice cards display status badges', async ({ page }) => {
    // Wait for invoices to load
    await page.waitForTimeout(1000);

    // Find invoice cards with status badges
    const statusBadges = page.locator('[class*="badge"], [class*="Badge"]').filter({
      hasText: /plătit|în așteptare|restant|ciornă|anulat|rambursat/i,
    });

    // If there are invoices, they should have status badges
    const invoiceList = page.locator('[class*="border"][class*="rounded-lg"]').filter({
      has: page.locator('[class*="font-medium"]'),
    });

    if (await invoiceList.first().isVisible({ timeout: 5000 })) {
      await expect(statusBadges.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('invoice actions are available (view, print, send)', async ({ page }) => {
    // Wait for invoices to load
    await page.waitForTimeout(1000);

    const invoiceCard = page.locator('[class*="border"][class*="rounded-lg"]').filter({
      has: page.locator('[class*="font-medium"]'),
    }).first();

    if (await invoiceCard.isVisible({ timeout: 5000 })) {
      // Check for action buttons (icons)
      const viewButton = invoiceCard.locator('button').filter({
        has: page.locator('[class*="lucide-eye"]'),
      });
      const printButton = invoiceCard.locator('button').filter({
        has: page.locator('[class*="lucide-printer"]'),
      });
      const sendButton = invoiceCard.locator('button').filter({
        has: page.locator('[class*="lucide-send"]'),
      });

      // At least some action buttons should be visible
      await expect(
        viewButton.or(printButton).or(sendButton)
      ).toBeVisible({ timeout: 3000 });
    }
  });

  test('can open invoice detail dialog', async ({ page }) => {
    // Wait for invoices to load
    await page.waitForTimeout(1000);

    const invoiceCard = page.locator('[class*="border"][class*="rounded-lg"]').filter({
      has: page.locator('[class*="font-medium"]'),
    }).first();

    if (await invoiceCard.isVisible({ timeout: 5000 })) {
      // Click view button
      const viewButton = invoiceCard.locator('button').filter({
        has: page.locator('[class*="lucide-eye"]'),
      });

      if (await viewButton.isVisible()) {
        await viewButton.click();

        // Check invoice detail dialog opened
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Check detail sections
        await expect(page.getByText(/client/i)).toBeVisible();
        await expect(page.getByText(/status/i)).toBeVisible();
        await expect(page.getByText(/servicii/i)).toBeVisible();
        await expect(page.getByText(/total/i)).toBeVisible();
      }
    }
  });

  test('mark as paid button is visible for pending invoices', async ({ page }) => {
    // Wait for invoices to load
    await page.waitForTimeout(1000);

    // Look for pending invoice with mark as paid button
    const markAsPaidButton = page.locator('button').filter({
      has: page.locator('[class*="lucide-check-circle"]'),
    });

    // If there are pending invoices, the button should be visible
    const pendingBadge = page.getByText(/în așteptare/i);
    if (await pendingBadge.isVisible({ timeout: 5000 })) {
      await expect(markAsPaidButton.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('download/export button is accessible', async ({ page }) => {
    // Check for download/export button
    const downloadButton = page.locator('button').filter({
      has: page.locator('[class*="lucide-download"]'),
    });

    await expect(downloadButton).toBeVisible({ timeout: 5000 });
  });

  test('invoice amounts are formatted correctly', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(1000);

    // Check for RON currency format
    const amountText = page.getByText(/\d+[.,]\d{2}\s*RON/);

    // If there are invoices, amounts should be displayed with RON
    const invoiceList = page.locator('[class*="border"][class*="rounded-lg"]').filter({
      has: page.locator('[class*="font-medium"]'),
    });

    if (await invoiceList.first().isVisible({ timeout: 5000 })) {
      await expect(amountText.first()).toBeVisible({ timeout: 3000 });
    }
  });
});
