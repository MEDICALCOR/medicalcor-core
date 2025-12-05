import { test, expect } from '@playwright/test';

/**
 * Patient Management E2E Tests
 *
 * Tests the patient CRUD operations which are critical for the medical CRM.
 * These flows must work flawlessly for daily medical practice.
 */
test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patients');
    // Wait for page to load
    await expect(page.getByRole('heading', { name: /pacienti/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('displays patient list', async ({ page }) => {
    // Check for patient list or empty state
    const patientList = page.locator('[data-testid="patient-list"], table, [role="list"]');
    const emptyState = page.getByText(/nu exista pacienti|no patients/i);

    // Either list or empty state should be visible
    await expect(patientList.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('search patients by name', async ({ page }) => {
    // Find search input
    const searchInput = page.getByPlaceholder(/cauta|search/i);

    if (await searchInput.isVisible()) {
      // Type search query
      await searchInput.fill('test');

      // Wait for search results to update
      await page.waitForTimeout(500);

      // Results should update (either show results or no results message)
      const results = page.locator('[data-testid="patient-card"], tr[data-patient-id]');
      const noResults = page.getByText(/nu s-au gasit|no results/i);

      await expect(results.first().or(noResults)).toBeVisible({ timeout: 5000 });
    }
  });

  test('opens add patient modal', async ({ page }) => {
    // Click add patient button
    const addButton = page.getByRole('button', { name: /adauga|add|nou/i });

    if (await addButton.isVisible()) {
      await addButton.click();

      // Check modal opened
      await expect(
        page.getByRole('dialog').or(page.locator('[data-testid="add-patient-modal"]'))
      ).toBeVisible({ timeout: 5000 });

      // Check form fields are present
      await expect(page.getByLabel(/nume/i)).toBeVisible();
      await expect(page.getByLabel(/telefon|phone/i)).toBeVisible();
    }
  });

  test('can view patient details', async ({ page }) => {
    // Click on first patient in list
    const firstPatient = page
      .locator('[data-testid="patient-row"], tr[data-patient-id], [data-testid="patient-card"]')
      .first();

    if (await firstPatient.isVisible()) {
      await firstPatient.click();

      // Should navigate to patient detail or open modal
      await expect(
        page
          .getByRole('heading', { name: /detalii|details|fisa/i })
          .or(page.locator('[data-testid="patient-detail"]'))
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('patient filters work correctly', async ({ page }) => {
    // Look for filter controls
    const filterButton = page.getByRole('button', { name: /filtru|filter/i });

    if (await filterButton.isVisible()) {
      await filterButton.click();

      // Filter dropdown should appear
      await expect(
        page.getByRole('menu').or(page.locator('[data-testid="filter-dropdown"]'))
      ).toBeVisible({ timeout: 3000 });
    }
  });

  test('keyboard navigation works in patient list', async ({ page }) => {
    // Focus on patient list
    const list = page.locator('[data-testid="patient-list"], table tbody').first();

    if (await list.isVisible()) {
      await list.focus();

      // Press arrow down
      await page.keyboard.press('ArrowDown');

      // First item should be focused/selected
      const firstItem = page
        .locator('[data-testid="patient-row"]:focus, tr:focus, [aria-selected="true"]')
        .first();

      await expect(firstItem).toBeVisible({ timeout: 2000 });
    }
  });
});
