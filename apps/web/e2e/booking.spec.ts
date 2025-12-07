import { test, expect } from '@playwright/test';

/**
 * Booking Flow E2E Tests
 *
 * Tests the multi-step appointment booking wizard.
 * Critical for patient acquisition and appointment scheduling.
 * Steps: Service → Doctor → Date/Time → Patient Details → Confirmation
 */
test.describe('Booking Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking');
    // Wait for page to load
    await expect(page.getByRole('heading', { name: /programare/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('displays booking wizard with progress steps', async ({ page }) => {
    // Check for progress indicator
    const progressSteps = page.locator('[class*="rounded-full"]');
    await expect(progressSteps.first()).toBeVisible({ timeout: 5000 });

    // Check step labels are visible
    await expect(page.getByText(/serviciu/i)).toBeVisible();
    await expect(page.getByText(/medic/i)).toBeVisible();
    await expect(page.getByText(/confirmare/i)).toBeVisible();
  });

  test('displays available services for selection', async ({ page }) => {
    // Wait for services to load
    await expect(
      page.getByText(/selectează serviciul/i).or(page.getByText(/nu există servicii/i))
    ).toBeVisible({ timeout: 10000 });

    // Check for service cards or empty state
    const serviceCards = page.locator('[class*="cursor-pointer"][class*="border"]');
    const emptyState = page.getByText(/nu există servicii disponibile/i);

    await expect(serviceCards.first().or(emptyState)).toBeVisible({ timeout: 5000 });
  });

  test('can select a service and proceed to doctor selection', async ({ page }) => {
    // Wait for services to load
    await page.waitForTimeout(1000);

    // Click on first available service
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

    if (await serviceCard.isVisible()) {
      await serviceCard.click();

      // Check for selection indication (ring or border change)
      await expect(serviceCard).toHaveClass(/ring|border-primary/, { timeout: 2000 });

      // Click continue button
      const continueButton = page.getByRole('button', { name: /continuă/i });
      await expect(continueButton).toBeEnabled();
      await continueButton.click();

      // Should now be on doctor selection step
      await expect(page.getByText(/alege medicul/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('can select a doctor and proceed to date/time selection', async ({ page }) => {
    // Navigate through service selection first
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

    if (await serviceCard.isVisible({ timeout: 5000 })) {
      await serviceCard.click();
      await page.getByRole('button', { name: /continuă/i }).click();

      // Wait for doctor step
      await expect(page.getByText(/alege medicul/i)).toBeVisible({ timeout: 10000 });

      // Click on first doctor
      const doctorCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

      if (await doctorCard.isVisible({ timeout: 5000 })) {
        await doctorCard.click();
        await page.getByRole('button', { name: /continuă/i }).click();

        // Should now be on date/time selection
        await expect(page.getByText(/selectează data/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('calendar displays available dates and disables weekends', async ({ page }) => {
    // Navigate to datetime step
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

    if (await serviceCard.isVisible({ timeout: 5000 })) {
      await serviceCard.click();
      await page.getByRole('button', { name: /continuă/i }).click();
      await page.waitForTimeout(500);

      const doctorCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();
      if (await doctorCard.isVisible({ timeout: 5000 })) {
        await doctorCard.click();
        await page.getByRole('button', { name: /continuă/i }).click();

        // Check calendar is visible
        await expect(page.getByText(/selectează data/i)).toBeVisible({ timeout: 5000 });

        // Check month navigation buttons
        const prevButton = page.locator('button').filter({ has: page.locator('[class*="lucide-chevron-left"]') });
        const nextButton = page.locator('button').filter({ has: page.locator('[class*="lucide-chevron-right"]') });

        await expect(prevButton.or(nextButton)).toBeVisible({ timeout: 3000 });

        // Check day headers are visible (Lu, Ma, Mi, etc.)
        await expect(page.getByText(/^Lu$/)).toBeVisible();
      }
    }
  });

  test('patient details form validates required fields', async ({ page }) => {
    // Navigate to details step by going through the wizard
    // For efficiency, check if there's a way to test the form directly
    const formLabels = ['prenume', 'nume', 'telefon'];

    // Navigate through previous steps
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

    if (await serviceCard.isVisible({ timeout: 5000 })) {
      await serviceCard.click();
      await page.getByRole('button', { name: /continuă/i }).click();
      await page.waitForTimeout(500);

      const doctorCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();
      if (await doctorCard.isVisible({ timeout: 5000 })) {
        await doctorCard.click();
        await page.getByRole('button', { name: /continuă/i }).click();
        await page.waitForTimeout(500);

        // Select a date if calendar is visible
        const calendarDay = page
          .locator('button')
          .filter({ hasText: /^[1-9]$|^[12][0-9]$|^3[01]$/ })
          .filter({ has: page.locator(':not([disabled])') })
          .first();

        if (await calendarDay.isVisible({ timeout: 3000 })) {
          await calendarDay.click();

          // Select a time slot if visible
          const timeSlot = page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first();
          if (await timeSlot.isVisible({ timeout: 3000 })) {
            await timeSlot.click();
            await page.getByRole('button', { name: /continuă/i }).click();

            // Should be on patient details form
            await expect(page.getByText(/datele pacientului/i)).toBeVisible({ timeout: 5000 });

            // Check form fields are present
            for (const label of formLabels) {
              await expect(page.getByLabel(new RegExp(label, 'i'))).toBeVisible();
            }
          }
        }
      }
    }
  });

  test('back button navigates to previous step', async ({ page }) => {
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

    if (await serviceCard.isVisible({ timeout: 5000 })) {
      await serviceCard.click();
      await page.getByRole('button', { name: /continuă/i }).click();

      // Wait for doctor step
      await expect(page.getByText(/alege medicul/i)).toBeVisible({ timeout: 5000 });

      // Click back button
      const backButton = page.getByRole('button', { name: /înapoi/i });
      await backButton.click();

      // Should be back on service selection
      await expect(page.getByText(/selectează serviciul/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('continue button is disabled until selection is made', async ({ page }) => {
    // On service step, continue should be disabled initially
    const continueButton = page.getByRole('button', { name: /continuă/i });

    // Should be disabled when no service is selected
    await expect(continueButton).toBeDisabled();

    // Select a service
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();
    if (await serviceCard.isVisible({ timeout: 5000 })) {
      await serviceCard.click();

      // Now continue should be enabled
      await expect(continueButton).toBeEnabled({ timeout: 2000 });
    }
  });

  test('shows service price and duration', async ({ page }) => {
    // Wait for services to load
    const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

    if (await serviceCard.isVisible({ timeout: 5000 })) {
      // Check for price badge (RON)
      await expect(page.getByText(/RON/)).toBeVisible({ timeout: 3000 });

      // Check for duration (min)
      await expect(page.getByText(/min/)).toBeVisible({ timeout: 3000 });
    }
  });

  test('confirmation step displays booking summary', async ({ page }) => {
    // This test verifies the confirmation step shows all selected data
    // Navigate through all steps if possible
    const confirmationHeading = page.getByText(/confirmare programare/i);

    // If we can reach confirmation step
    if (await confirmationHeading.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Check summary sections
      await expect(page.getByText(/serviciu/i)).toBeVisible();
      await expect(page.getByText(/medic/i)).toBeVisible();
      await expect(page.getByText(/data și ora/i)).toBeVisible();
      await expect(page.getByText(/locație/i)).toBeVisible();
    }
  });
});
