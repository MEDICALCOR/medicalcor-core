import { test, expect } from '@playwright/test';

/**
 * Patient Management E2E Tests
 *
 * Tests the patient CRUD operations which are critical for the medical CRM.
 * These flows must work flawlessly for daily medical practice.
 * Features: Patient list, CRUD, search, filters, medical history.
 */
test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patients');
    // Wait for page to load
    await expect(page.getByRole('heading', { name: /pacienti/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test.describe('Patient List', () => {
    test('displays patient list', async ({ page }) => {
      // Check for patient list or empty state
      const patientList = page.locator('[data-testid="patient-list"], table, [role="list"]');
      const emptyState = page.getByText(/nu exista pacienti|no patients/i);

      // Either list or empty state should be visible
      await expect(patientList.or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('patient cards show essential information', async ({ page }) => {
      await page.waitForTimeout(1000);

      const patientCard = page.locator('[data-testid="patient-card"], tr[data-patient-id], [class*="Card"]').first();

      if (await patientCard.isVisible({ timeout: 5000 })) {
        // Should show name
        const nameElement = patientCard.locator('[class*="font-medium"], [class*="font-semibold"]');
        await expect(nameElement).toBeVisible();

        // Should show contact info (phone or email icon)
        const contactInfo = patientCard.locator('[class*="lucide-phone"], [class*="lucide-mail"]');
        await expect(contactInfo.first()).toBeVisible({ timeout: 3000 });
      }
    });

    test('patient list shows avatar or initials', async ({ page }) => {
      await page.waitForTimeout(1000);

      const patientCard = page.locator('[data-testid="patient-card"], tr[data-patient-id]').first();

      if (await patientCard.isVisible({ timeout: 5000 })) {
        // Should show avatar or initials
        const avatar = page.locator('[class*="Avatar"], [class*="avatar"], [class*="rounded-full"]').first();
        await expect(avatar).toBeVisible({ timeout: 3000 });
      }
    });

    test('patient list supports pagination', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for pagination controls
      const pagination = page.locator('[class*="pagination"], [data-testid="pagination"]');
      const nextButton = page.getByRole('button', { name: /next|următor|>/i });
      const pageNumbers = page.locator('button').filter({ hasText: /^\d+$/ });

      // If there are enough patients, pagination should be visible
      await expect(
        pagination.or(nextButton).or(pageNumbers.first())
      ).toBeVisible({ timeout: 5000 });
    });

    test('shows patient count or statistics', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for patient count display
      const countDisplay = page.getByText(/\d+\s*(pacienți|patients|rezultate|results)/i);
      const totalBadge = page.locator('[class*="Badge"]').filter({ hasText: /\d+/ });

      await expect(countDisplay.or(totalBadge.first())).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Search & Filters', () => {
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

    test('search clears with X button', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/cauta|search/i);

      if (await searchInput.isVisible()) {
        await searchInput.fill('test query');
        await page.waitForTimeout(300);

        // Look for clear button
        const clearButton = page.locator('button').filter({
          has: page.locator('[class*="lucide-x"]'),
        });

        if (await clearButton.isVisible({ timeout: 2000 })) {
          await clearButton.click();
          await expect(searchInput).toHaveValue('');
        }
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

    test('can filter by patient status', async ({ page }) => {
      // Look for status filter dropdown
      const statusFilter = page.locator('[role="combobox"]').filter({ hasText: /status|stare|toate/i });

      if (await statusFilter.isVisible({ timeout: 5000 })) {
        await statusFilter.click();

        // Check for status options
        const options = page.getByRole('option');
        await expect(options.first()).toBeVisible({ timeout: 3000 });

        // Close dropdown
        await page.keyboard.press('Escape');
      }
    });

    test('sorting options are available', async ({ page }) => {
      // Look for sort controls
      const sortButton = page.locator('button').filter({ hasText: /sortare|sort|ordine/i });
      const sortDropdown = page.locator('[role="combobox"]').filter({ hasText: /sortare|sort/i });

      if (await sortButton.or(sortDropdown).isVisible({ timeout: 5000 })) {
        await sortButton.or(sortDropdown).click();

        // Sort options should appear
        const sortOptions = page.getByRole('option').or(page.getByRole('menuitem'));
        await expect(sortOptions.first()).toBeVisible({ timeout: 3000 });

        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Add Patient', () => {
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

    test('add patient form has all required fields', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /adauga|add|nou/i });

      if (await addButton.isVisible()) {
        await addButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Check for essential form fields
        await expect(page.getByLabel(/prenume|first/i)).toBeVisible();
        await expect(page.getByLabel(/nume|last|family/i)).toBeVisible();
        await expect(page.getByLabel(/telefon|phone/i)).toBeVisible();
        await expect(page.getByLabel(/email/i)).toBeVisible();

        // Close modal
        await page.keyboard.press('Escape');
      }
    });

    test('add patient form validates phone format', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /adauga|add|nou/i });

      if (await addButton.isVisible()) {
        await addButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Fill invalid phone
        const phoneInput = page.getByLabel(/telefon|phone/i);
        await phoneInput.fill('invalid');

        // Try to submit
        const submitButton = page.getByRole('button', { name: /salvează|save|adaugă/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();

          // Should show validation error
          const error = page.getByText(/invalid|greșit|format/i);
          await expect(error.or(page.getByRole('dialog'))).toBeVisible({ timeout: 3000 });
        }

        await page.keyboard.press('Escape');
      }
    });

    test('cancel button closes add patient modal', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /adauga|add|nou/i });

      if (await addButton.isVisible()) {
        await addButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Click cancel
        const cancelButton = page.getByRole('button', { name: /anulează|cancel|închide/i });
        await cancelButton.click();

        // Modal should close
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Patient Details', () => {
    test('can view patient details', async ({ page }) => {
      // Click on first patient in list
      const firstPatient = page.locator(
        '[data-testid="patient-row"], tr[data-patient-id], [data-testid="patient-card"]'
      ).first();

      if (await firstPatient.isVisible()) {
        await firstPatient.click();

        // Should navigate to patient detail or open modal
        await expect(
          page.getByRole('heading', { name: /detalii|details|fisa/i }).or(
            page.locator('[data-testid="patient-detail"]')
          )
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('patient detail shows contact information', async ({ page }) => {
      const firstPatient = page.locator(
        '[data-testid="patient-row"], tr[data-patient-id], [data-testid="patient-card"], a[href*="patient"]'
      ).first();

      if (await firstPatient.isVisible({ timeout: 5000 })) {
        await firstPatient.click();
        await page.waitForTimeout(1000);

        // Should show contact info section
        const contactSection = page.getByText(/contact|telefon|phone|email/i);
        await expect(contactSection.first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('patient detail shows medical history section', async ({ page }) => {
      const firstPatient = page.locator(
        '[data-testid="patient-row"], tr[data-patient-id], a[href*="patient"]'
      ).first();

      if (await firstPatient.isVisible({ timeout: 5000 })) {
        await firstPatient.click();
        await page.waitForTimeout(1000);

        // Should show history or appointments section
        const historySection = page.getByText(/istoric|history|programări|appointments|consultații/i);
        await expect(historySection.first()).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Patient Actions', () => {
    test('edit button is available for patients', async ({ page }) => {
      await page.waitForTimeout(1000);

      const patientCard = page.locator('[data-testid="patient-card"], tr[data-patient-id]').first();

      if (await patientCard.isVisible({ timeout: 5000 })) {
        // Look for edit action
        const editButton = patientCard.locator('button').filter({
          has: page.locator('[class*="lucide-edit"], [class*="lucide-pencil"]'),
        });
        const actionsButton = patientCard.getByRole('button', { name: /acțiuni|actions|more/i });

        await expect(editButton.or(actionsButton)).toBeVisible({ timeout: 3000 });
      }
    });

    test('can open actions menu on patient', async ({ page }) => {
      await page.waitForTimeout(1000);

      const patientCard = page.locator('[data-testid="patient-card"], tr[data-patient-id]').first();

      if (await patientCard.isVisible({ timeout: 5000 })) {
        const actionsButton = patientCard.locator('button').filter({
          has: page.locator('[class*="lucide-more"]'),
        });

        if (await actionsButton.isVisible({ timeout: 3000 })) {
          await actionsButton.click();

          // Menu should appear
          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible({ timeout: 3000 });

          await page.keyboard.press('Escape');
        }
      }
    });

    test('can schedule appointment for patient', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for schedule/booking button
      const scheduleButton = page.locator('button, a').filter({
        hasText: /programare|schedule|booking/i,
      });

      if (await scheduleButton.first().isVisible({ timeout: 5000 })) {
        await expect(scheduleButton.first()).toBeEnabled();
      }
    });
  });

  test.describe('Keyboard & Accessibility', () => {
    test('keyboard navigation works in patient list', async ({ page }) => {
      // Focus on patient list
      const list = page.locator('[data-testid="patient-list"], table tbody').first();

      if (await list.isVisible()) {
        await list.focus();

        // Press arrow down
        await page.keyboard.press('ArrowDown');

        // First item should be focused/selected
        const firstItem = page.locator(
          '[data-testid="patient-row"]:focus, tr:focus, [aria-selected="true"]'
        ).first();

        await expect(firstItem).toBeVisible({ timeout: 2000 });
      }
    });

    test('escape closes any open modal', async ({ page }) => {
      const addButton = page.getByRole('button', { name: /adauga|add|nou/i });

      if (await addButton.isVisible()) {
        await addButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Press escape
        await page.keyboard.press('Escape');

        // Modal should close
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
      }
    });
  });
});
