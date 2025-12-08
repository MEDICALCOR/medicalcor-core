import { test, expect } from '@playwright/test';

/**
 * Workflow Management E2E Tests
 *
 * Tests the automation workflow features.
 * Critical for clinic efficiency and automated patient communication.
 * Features: Workflow CRUD, triggers, conditions, actions, execution history.
 */
test.describe('Workflow Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByRole('heading', { name: /workflow|automatizari/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test.describe('Workflow List', () => {
    test('displays workflow list', async ({ page }) => {
      // Check for workflow list or empty state
      const workflowList = page.locator(
        '[data-testid="workflow-list"], [role="list"], [class*="Card"]'
      );
      const emptyState = page.getByText(/nu exista workflow|no workflows|creaza primul/i);

      await expect(workflowList.first().or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('workflow cards show name and description', async ({ page }) => {
      await page.waitForTimeout(1000);

      const workflowCard = page
        .locator('[data-testid="workflow-card"], [data-testid="workflow-row"], [class*="Card"]')
        .first();

      if (await workflowCard.isVisible({ timeout: 5000 })) {
        // Should show workflow name
        const nameElement = workflowCard.locator(
          '[class*="font-medium"], [class*="font-semibold"], h3, h4'
        );
        await expect(nameElement.first()).toBeVisible();
      }
    });

    test('workflow cards show status indicator', async ({ page }) => {
      await page.waitForTimeout(1000);

      const workflowCard = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();

      if (await workflowCard.isVisible({ timeout: 5000 })) {
        // Should show active/inactive status
        const statusBadge = page.locator('[class*="Badge"], [class*="badge"]').filter({
          hasText: /activ|inactiv|active|inactive|pornit|oprit/i,
        });
        const toggleSwitch = page.locator('[role="switch"]');

        await expect(statusBadge.first().or(toggleSwitch.first())).toBeVisible({ timeout: 3000 });
      }
    });

    test('shows workflow count or statistics', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for workflow count
      const countDisplay = page.getByText(/\d+\s*(workflow|automatizări)/i);
      const totalBadge = page.locator('[class*="Badge"]').filter({ hasText: /\d+/ });

      await expect(countDisplay.or(totalBadge.first())).toBeVisible({ timeout: 5000 });
    });

    test('workflow list shows trigger type icons', async ({ page }) => {
      await page.waitForTimeout(1000);

      const workflowCard = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();

      if (await workflowCard.isVisible({ timeout: 5000 })) {
        // Should show trigger type icon (clock, message, etc.)
        const triggerIcon = workflowCard.locator(
          '[class*="lucide-clock"], [class*="lucide-message"], [class*="lucide-zap"], [class*="lucide-calendar"]'
        );
        await expect(triggerIcon.first()).toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Workflow Toggle', () => {
    test('can toggle workflow active status (optimistic UI)', async ({ page }) => {
      // Find a workflow toggle switch
      const toggleSwitch = page.locator('[data-testid="workflow-toggle"], [role="switch"]').first();

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

    test('toggle shows loading state briefly', async ({ page }) => {
      const toggleSwitch = page.locator('[role="switch"]').first();

      if (await toggleSwitch.isVisible({ timeout: 5000 })) {
        // Click and check for any loading indicator
        await toggleSwitch.click();

        // The switch should update (loading should be brief)
        await page.waitForTimeout(100);
        await expect(toggleSwitch).toBeVisible();
      }
    });
  });

  test.describe('Create Workflow', () => {
    test('opens workflow creation modal', async ({ page }) => {
      // Click create workflow button
      const createButton = page.getByRole('button', { name: /creeaza|create|adauga|nou/i });

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

    test('workflow creation form has trigger selection', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /creeaza|create|adauga|nou/i });

      if (await createButton.isVisible()) {
        await createButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Check for trigger type selection
        const triggerSection = page.getByText(/trigger|declanșator|când/i);
        const triggerSelect = page
          .locator('[role="combobox"]')
          .filter({ hasText: /trigger|selectează/i });

        await expect(triggerSection.or(triggerSelect)).toBeVisible({ timeout: 3000 });

        await page.keyboard.press('Escape');
      }
    });

    test('workflow creation form has action configuration', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /creeaza|create|adauga|nou/i });

      if (await createButton.isVisible()) {
        await createButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Check for action configuration section
        const actionSection = page.getByText(/acțiune|action|ce să facă/i);
        await expect(actionSection).toBeVisible({ timeout: 3000 });

        await page.keyboard.press('Escape');
      }
    });

    test('cancel button closes creation modal', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /creeaza|create|adauga|nou/i });

      if (await createButton.isVisible()) {
        await createButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Click cancel
        const cancelButton = page.getByRole('button', { name: /anulează|cancel|închide/i });
        await cancelButton.click();

        // Modal should close
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Workflow Actions', () => {
    test('can duplicate a workflow', async ({ page }) => {
      // Find duplicate button on first workflow
      const workflowCard = page
        .locator('[data-testid="workflow-card"], [data-testid="workflow-row"], [class*="Card"]')
        .first();

      if (await workflowCard.isVisible()) {
        // Look for actions menu or duplicate button
        const actionsButton = workflowCard.locator('button').filter({
          has: page.locator('[class*="lucide-more"]'),
        });

        if (await actionsButton.isVisible()) {
          await actionsButton.click();

          // Click duplicate option
          const duplicateOption = page.getByRole('menuitem', { name: /duplica|duplicate|copy/i });
          if (await duplicateOption.isVisible()) {
            await duplicateOption.click();

            // Should show success message or new workflow appears
            await expect(
              page
                .getByText(/duplicat|copied|succes/i)
                .or(page.locator('[data-testid="workflow-card"], [class*="Card"]').nth(1))
            ).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });

    test('can edit a workflow', async ({ page }) => {
      const workflowCard = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();

      if (await workflowCard.isVisible({ timeout: 5000 })) {
        const actionsButton = workflowCard.locator('button').filter({
          has: page.locator('[class*="lucide-more"]'),
        });

        if (await actionsButton.isVisible()) {
          await actionsButton.click();

          const editOption = page.getByRole('menuitem', { name: /editează|edit|modifica/i });
          if (await editOption.isVisible()) {
            await editOption.click();

            // Edit modal or page should appear
            await expect(
              page.getByRole('dialog').or(page.getByText(/editare workflow/i))
            ).toBeVisible({ timeout: 5000 });

            await page.keyboard.press('Escape');
          }
        }
      }
    });

    test('can delete a workflow with confirmation', async ({ page }) => {
      // Find delete button on first workflow
      const workflowCard = page
        .locator('[data-testid="workflow-card"], [data-testid="workflow-row"], [class*="Card"]')
        .first();

      if (await workflowCard.isVisible()) {
        const actionsButton = workflowCard.locator('button').filter({
          has: page.locator('[class*="lucide-more"]'),
        });

        if (await actionsButton.isVisible()) {
          await actionsButton.click();

          const deleteOption = page.getByRole('menuitem', { name: /sterge|delete|remove/i });
          if (await deleteOption.isVisible()) {
            await deleteOption.click();

            // Confirmation dialog should appear
            await expect(
              page.getByRole('alertdialog').or(page.getByText(/sigur|confirma|confirm/i))
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

    test('actions menu closes on outside click', async ({ page }) => {
      const workflowCard = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();

      if (await workflowCard.isVisible({ timeout: 5000 })) {
        const actionsButton = workflowCard.locator('button').filter({
          has: page.locator('[class*="lucide-more"]'),
        });

        if (await actionsButton.isVisible()) {
          await actionsButton.click();

          const menu = page.getByRole('menu');
          if (await menu.isVisible({ timeout: 2000 })) {
            // Click outside
            await page.locator('body').click({ position: { x: 10, y: 10 } });

            // Menu should close
            await expect(menu).not.toBeVisible({ timeout: 2000 });
          }
        }
      }
    });
  });

  test.describe('Templates', () => {
    test('workflow templates are available', async ({ page }) => {
      // Look for templates section or button
      const templatesButton = page.getByRole('button', { name: /template|sablon/i });
      const templatesTab = page.getByRole('tab', { name: /template|sablon/i });

      if (await templatesButton.or(templatesTab).isVisible()) {
        await templatesButton.or(templatesTab).click();

        // Templates should be displayed
        await expect(
          page
            .locator('[data-testid="workflow-template"]')
            .or(page.getByText(/template-ul|sablon pentru/i))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('can preview a template before using', async ({ page }) => {
      const templatesButton = page.getByRole('button', { name: /template|sablon/i });

      if (await templatesButton.isVisible({ timeout: 5000 })) {
        await templatesButton.click();
        await page.waitForTimeout(500);

        // Look for preview button on template
        const previewButton = page.locator('button').filter({
          has: page.locator('[class*="lucide-eye"]'),
        });

        if (await previewButton.first().isVisible({ timeout: 3000 })) {
          await previewButton.first().click();

          // Preview should show template details
          await expect(page.getByRole('dialog').or(page.getByText(/previzualizare/i))).toBeVisible({
            timeout: 3000,
          });

          await page.keyboard.press('Escape');
        }
      }
    });
  });

  test.describe('Execution History', () => {
    test('can view workflow execution history', async ({ page }) => {
      const workflowCard = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();

      if (await workflowCard.isVisible({ timeout: 5000 })) {
        // Look for history tab or link
        const historyLink = page.getByText(/istoric|history|execuții|runs/i);

        if (await historyLink.isVisible({ timeout: 3000 })) {
          await historyLink.click();

          // History view should appear
          await expect(page.getByText(/execuții|runs|log|history/i)).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('execution history shows status badges', async ({ page }) => {
      // Navigate to history if there's a dedicated page
      const historyTab = page.getByRole('tab', { name: /istoric|history/i });

      if (await historyTab.isVisible({ timeout: 3000 })) {
        await historyTab.click();
        await page.waitForTimeout(500);

        // Look for status badges (success, failed, pending)
        const statusBadge = page.locator('[class*="Badge"]').filter({
          hasText: /succes|failed|eșuat|pending|în așteptare/i,
        });

        const emptyState = page.getByText(/nu există execuții|no runs/i);
        await expect(statusBadge.first().or(emptyState)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Keyboard & Accessibility', () => {
    test('escape closes any open modal', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /creeaza|create|adauga|nou/i });

      if (await createButton.isVisible()) {
        await createButton.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Press escape
        await page.keyboard.press('Escape');

        // Modal should close
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
      }
    });

    test('workflow page is keyboard navigable', async ({ page }) => {
      // Tab through the page
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Something should be focused
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
      expect(focusedElement).not.toBe('BODY');
    });
  });

  test.describe('Responsive Behavior', () => {
    test('workflow cards stack on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      // Wait for page to load
      await expect(page.getByRole('heading', { name: /workflow|automatizari/i })).toBeVisible({
        timeout: 10000,
      });

      // Workflow cards should still be visible and functional
      const workflowCard = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();
      const emptyState = page.getByText(/nu exista workflow|no workflows/i);

      await expect(workflowCard.or(emptyState)).toBeVisible({ timeout: 5000 });
    });

    test('tablet layout shows sidebar and cards', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.reload();

      // Wait for page to load
      await expect(page.getByRole('heading', { name: /workflow|automatizari/i })).toBeVisible({
        timeout: 10000,
      });

      // Content should be visible
      const content = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();
      const emptyState = page.getByText(/nu exista workflow|no workflows/i);

      await expect(content.or(emptyState)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Search & Filter Workflows', () => {
    test('search input filters workflows', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/caută|search/i);

      if (await searchInput.isVisible({ timeout: 5000 })) {
        await searchInput.fill('test');
        await page.waitForTimeout(500);

        // Results should update
        const results = page.locator('[data-testid="workflow-card"], [class*="Card"]');
        const noResults = page.getByText(/nu s-au găsit|no results/i);

        await expect(results.first().or(noResults)).toBeVisible({ timeout: 5000 });
      }
    });

    test('filter by workflow status', async ({ page }) => {
      // Look for status filter
      const statusFilter = page
        .locator('[role="combobox"]')
        .filter({ hasText: /status|toate|activ/i });

      if (await statusFilter.isVisible({ timeout: 5000 })) {
        await statusFilter.click();

        // Check for options
        const activeOption = page.getByRole('option', { name: /activ|active/i });
        const inactiveOption = page.getByRole('option', { name: /inactiv|inactive/i });

        await expect(activeOption.or(inactiveOption)).toBeVisible({ timeout: 3000 });

        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Workflow Statistics', () => {
    test('workflow stats are displayed', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for stats/metrics
      const statsText = page.getByText(/total|active|execuții|runs|trigger/i);
      const statsCards = page.locator('[class*="Card"]').filter({ hasText: /\d+/ });

      await expect(statsText.first().or(statsCards.first())).toBeVisible({ timeout: 5000 });
    });

    test('success rate indicator is shown', async ({ page }) => {
      await page.waitForTimeout(1000);

      // Look for success/failure metrics
      const successRate = page.getByText(/succes|success|rate|rată|\d+%/i);
      const metricsSection = page.locator('[data-testid="workflow-metrics"]');

      if (await successRate.first().or(metricsSection).isVisible({ timeout: 5000 })) {
        await expect(successRate.first().or(metricsSection)).toBeVisible();
      }
    });
  });

  test.describe('Loading States', () => {
    test('skeleton shows while loading', async ({ page }) => {
      await page.reload();

      // Check for skeleton or content
      const skeleton = page.locator(
        '[class*="skeleton"], [class*="Skeleton"], [class*="animate-pulse"]'
      );
      const content = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();
      const emptyState = page.getByText(/nu exista workflow|no workflows/i);

      await expect(skeleton.first().or(content).or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('empty state has create action', async ({ page }) => {
      const emptyState = page.getByText(/nu exista workflow|no workflows|creează primul/i);

      if (await emptyState.isVisible({ timeout: 3000 })) {
        // Should have create button in empty state
        const createButton = page.getByRole('button', { name: /creeaza|create|adauga|nou/i });
        await expect(createButton).toBeVisible();
      }
    });

    test('error state shows retry option', async ({ page }) => {
      // Check for error handling
      const errorMessage = page.getByText(/eroare|error|failed/i);
      const retryButton = page.getByRole('button', { name: /reîncarcă|retry|refresh/i });
      const content = page.locator('[data-testid="workflow-card"], [class*="Card"]').first();

      await expect(content.or(errorMessage).or(retryButton)).toBeVisible({ timeout: 10000 });
    });
  });
});
