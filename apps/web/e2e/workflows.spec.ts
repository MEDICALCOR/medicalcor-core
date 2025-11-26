import { test, expect } from '@playwright/test';

/**
 * Workflow Management E2E Tests
 *
 * Tests the automation workflow features.
 * Critical for clinic efficiency and automated patient communication.
 */
test.describe('Workflow Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByRole('heading', { name: /workflow|automatizari/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('displays workflow list', async ({ page }) => {
    // Check for workflow list or empty state
    const workflowList = page.locator('[data-testid="workflow-list"], [role="list"]');
    const emptyState = page.getByText(/nu exista workflow|no workflows|creaza primul/i);

    await expect(workflowList.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('can toggle workflow active status (optimistic UI)', async ({ page }) => {
    // Find a workflow toggle switch
    const toggleSwitch = page.locator(
      '[data-testid="workflow-toggle"], [role="switch"]'
    ).first();

    if (await toggleSwitch.isVisible()) {
      // Get initial state
      const wasChecked = await toggleSwitch.getAttribute('aria-checked');

      // Click to toggle
      await toggleSwitch.click();

      // Should update immediately (optimistic UI)
      const expectedState = wasChecked === 'true' ? 'false' : 'true';
      await expect(toggleSwitch).toHaveAttribute('aria-checked', expectedState, {
        timeout: 500, // Should be instant due to optimistic UI
      });
    }
  });

  test('opens workflow creation modal', async ({ page }) => {
    // Click create workflow button
    const createButton = page.getByRole('button', { name: /creeaza|create|adauga/i });

    if (await createButton.isVisible()) {
      await createButton.click();

      // Modal should open
      await expect(
        page.getByRole('dialog').or(page.locator('[data-testid="workflow-modal"]'))
      ).toBeVisible({ timeout: 5000 });

      // Check essential form fields
      await expect(page.getByLabel(/nume|name/i)).toBeVisible();
    }
  });

  test('can duplicate a workflow', async ({ page }) => {
    // Find duplicate button on first workflow
    const workflowCard = page.locator(
      '[data-testid="workflow-card"], [data-testid="workflow-row"]'
    ).first();

    if (await workflowCard.isVisible()) {
      // Look for actions menu or duplicate button
      const actionsButton = workflowCard.getByRole('button', { name: /actiuni|actions|more/i });

      if (await actionsButton.isVisible()) {
        await actionsButton.click();

        // Click duplicate option
        const duplicateOption = page.getByRole('menuitem', { name: /duplica|duplicate|copy/i });
        if (await duplicateOption.isVisible()) {
          await duplicateOption.click();

          // Should show success message or new workflow appears
          await expect(
            page.getByText(/duplicat|copied|succes/i).or(
              page.locator('[data-testid="workflow-card"], [data-testid="workflow-row"]').nth(1)
            )
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('workflow templates are available', async ({ page }) => {
    // Look for templates section or button
    const templatesButton = page.getByRole('button', { name: /template|sablon/i });
    const templatesTab = page.getByRole('tab', { name: /template|sablon/i });

    if (await templatesButton.or(templatesTab).isVisible()) {
      await templatesButton.or(templatesTab).click();

      // Templates should be displayed
      await expect(
        page.locator('[data-testid="workflow-template"]').or(
          page.getByText(/template-ul|sablon pentru/i)
        )
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('can delete a workflow with confirmation', async ({ page }) => {
    // Find delete button on first workflow
    const workflowCard = page.locator(
      '[data-testid="workflow-card"], [data-testid="workflow-row"]'
    ).first();

    if (await workflowCard.isVisible()) {
      const actionsButton = workflowCard.getByRole('button', { name: /actiuni|actions|more/i });

      if (await actionsButton.isVisible()) {
        await actionsButton.click();

        const deleteOption = page.getByRole('menuitem', { name: /sterge|delete|remove/i });
        if (await deleteOption.isVisible()) {
          await deleteOption.click();

          // Confirmation dialog should appear
          await expect(
            page.getByRole('alertdialog').or(
              page.getByText(/sigur|confirma|confirm/i)
            )
          ).toBeVisible({ timeout: 3000 });

          // Cancel to avoid actually deleting
          const cancelButton = page.getByRole('button', { name: /anuleaza|cancel/i });
          if (await cancelButton.isVisible()) {
            await cancelButton.click();
          }
        }
      }
    }
  });
});
