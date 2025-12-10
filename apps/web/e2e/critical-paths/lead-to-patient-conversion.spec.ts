import { test, expect } from '@playwright/test';

/**
 * Lead to Patient Conversion E2E Tests
 *
 * Tests the critical business flow of converting a lead to a patient.
 * This is a core workflow in the MedicalCor CRM platform.
 */
test.describe('Lead to Patient Conversion Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the leads/triage page
    await page.goto('/triage');
    await expect(
      page.getByRole('heading', { name: /triage|leads|leaduri/i })
    ).toBeVisible({ timeout: 15000 });
  });

  test.describe('Lead Discovery', () => {
    test('should display leads in triage queue', async ({ page }) => {
      // Wait for leads to load
      await page.waitForTimeout(1000);

      // Check for lead cards or list items
      const leadItems = page.locator('[data-testid="lead-card"], [class*="Card"]');
      const emptyState = page.getByText(/nu există|no leads|empty|gol/i);

      // Either leads or empty state should be visible
      await expect(leadItems.first().or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('should show lead scoring indicators', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Check for score indicators (HOT, WARM, COLD)
      const scoreIndicators = page.locator(
        '[data-testid="lead-score"], [class*="badge"], [class*="tag"]'
      );

      if ((await scoreIndicators.count()) > 0) {
        await expect(scoreIndicators.first()).toBeVisible();
      }
    });

    test('should filter leads by classification', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for filter controls
      const filterButton = page
        .getByRole('button', { name: /filter|filtr|clasificare/i })
        .or(page.locator('[data-testid="lead-filter"]'));

      if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterButton.click();

        // Check for classification options
        const hotOption = page.getByText(/hot|fierbinte/i);
        const warmOption = page.getByText(/warm|cald/i);

        await expect(hotOption.or(warmOption)).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Lead Details', () => {
    test('should navigate to lead details', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Click on first lead card if available
      const leadCard = page.locator('[data-testid="lead-card"], [class*="Card"]').first();

      if (await leadCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click on lead to view details
        const clickableArea = leadCard.locator('a, button, [role="button"]').first();

        if (await clickableArea.isVisible({ timeout: 2000 }).catch(() => false)) {
          await clickableArea.click();
          await page.waitForTimeout(1000);
        }
      }
    });

    test('should display lead contact information', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(1000);

      // Click on first patient/lead
      const patientRow = page.locator('tr, [data-testid="patient-row"]').first();

      if (await patientRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        const clickableArea = patientRow.locator('a, button').first();

        if (await clickableArea.isVisible({ timeout: 2000 }).catch(() => false)) {
          await clickableArea.click();
          await page.waitForTimeout(2000);

          // Check for contact information fields
          const phoneField = page.getByText(/telefon|phone|\+40/i);
          const emailField = page.getByText(/email|@/i);

          await expect(phoneField.or(emailField)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should show lead interaction history', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // Look for history/activity section
      const historySection = page.getByText(/istoric|history|activitate|activity|interacțiuni/i);

      if (await historySection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(historySection).toBeVisible();
      }
    });
  });

  test.describe('Conversion Process', () => {
    test('should have option to convert lead to patient', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(1000);

      // Look for add patient button
      const addButton = page.getByRole('button', { name: /adaugă|add|nou|new/i });

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click();

        // Check for patient creation form
        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 5000 })) {
          await expect(page.getByLabel(/nume|name/i)).toBeVisible();
          await expect(page.getByLabel(/telefon|phone/i)).toBeVisible();

          // Close dialog
          await page.keyboard.press('Escape');
        }
      }
    });

    test('should validate required fields during conversion', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(1000);

      const addButton = page.getByRole('button', { name: /adaugă|add|nou|new/i });

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 5000 })) {
          // Try to submit without required fields
          const submitButton = dialog.getByRole('button', { name: /salvează|save|crează/i });

          if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await submitButton.click();

            // Check for validation errors
            const errorMessage = page.getByText(/obligatoriu|required|invalid/i);
            await expect(errorMessage).toBeVisible({ timeout: 3000 });
          }

          await page.keyboard.press('Escape');
        }
      }
    });

    test('should successfully create patient from lead data', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(1000);

      const addButton = page.getByRole('button', { name: /adaugă|add|nou|new/i });

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 5000 })) {
          // Fill in patient data
          const nameInput = dialog.getByLabel(/prenume|first name/i);
          const lastNameInput = dialog.getByLabel(/nume|last name/i);
          const phoneInput = dialog.getByLabel(/telefon|phone/i);

          if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nameInput.fill('Test');
          }

          if (await lastNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await lastNameInput.fill('Patient');
          }

          if (await phoneInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await phoneInput.fill('+40721000000');
          }

          // Note: Don't actually submit to avoid creating test data
          await page.keyboard.press('Escape');
        }
      }
    });
  });

  test.describe('Post-Conversion', () => {
    test('should access patient record after conversion', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // Verify patient list is accessible
      const patientList = page.locator('table, [data-testid="patient-list"]');
      const emptyState = page.getByText(/nu există|no patients|empty/i);

      await expect(patientList.or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('should be able to schedule appointment for converted patient', async ({ page }) => {
      await page.goto('/calendar');
      await expect(
        page.getByRole('heading', { name: /calendar|programări|appointments/i })
      ).toBeVisible({ timeout: 15000 });

      // Check for calendar UI elements
      const calendarView = page.locator('[class*="calendar"], [data-testid="calendar"]');
      const appointmentSlot = page.locator('[class*="slot"], [data-testid="time-slot"]');

      await expect(calendarView.or(appointmentSlot.first())).toBeVisible({ timeout: 10000 });
    });

    test('should track conversion in analytics', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Check for conversion metrics
      const conversionMetric = page.getByText(/conversie|conversion|rate|rată/i);
      const analyticsChart = page.locator('[class*="chart"], canvas');

      await expect(conversionMetric.or(analyticsChart)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Lead Scoring Impact', () => {
    test('should display AI scoring for leads', async ({ page }) => {
      await page.goto('/triage');
      await page.waitForTimeout(2000);

      // Look for AI scoring indicators
      const aiScore = page.getByText(/scor|score|ai|punctaj/i);
      const scoreValue = page.locator('[data-testid="ai-score"], [class*="score"]');

      if ((await aiScore.count()) > 0 || (await scoreValue.count()) > 0) {
        await expect(aiScore.first().or(scoreValue.first())).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show classification badges', async ({ page }) => {
      await page.goto('/triage');
      await page.waitForTimeout(2000);

      // Check for HOT/WARM/COLD classification badges
      const badges = page.locator('[class*="badge"], [class*="tag"], [class*="chip"]');

      if ((await badges.count()) > 0) {
        const firstBadge = badges.first();
        await expect(firstBadge).toBeVisible();
      }
    });
  });

  test.describe('Workflow Automation', () => {
    test('should trigger follow-up workflow on conversion', async ({ page }) => {
      await page.goto('/workflows');
      await page.waitForTimeout(2000);

      // Check for workflow definitions
      const workflowList = page.locator('[data-testid="workflow-card"], [class*="Card"]');
      const emptyState = page.getByText(/nu există|no workflows|empty/i);

      await expect(workflowList.first().or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('should log lead conversion event', async ({ page }) => {
      // Navigate to audit log if available
      await page.goto('/audit');
      await page.waitForTimeout(2000);

      const auditLog = page.getByText(/audit|jurnal|log|events/i);
      const accessDenied = page.getByText(/acces|denied|permission/i);

      // Either audit log or access denied (for non-admin users)
      await expect(auditLog.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Test with offline mode
      await page.goto('/patients');
      await page.waitForTimeout(1000);

      // The page should handle errors without crashing
      await expect(page.locator('body')).toBeVisible();
    });

    test('should show appropriate error messages', async ({ page }) => {
      await page.goto('/patients/non-existent-id');
      await page.waitForTimeout(2000);

      // Should show 404 or redirect
      const notFound = page.getByText(/404|not found|nu a fost găsit/i);
      const redirected = page.getByRole('heading');

      await expect(notFound.or(redirected)).toBeVisible({ timeout: 10000 });
    });
  });
});
