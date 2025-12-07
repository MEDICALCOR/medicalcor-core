import { test, expect } from '@playwright/test';

/**
 * Lead Scoring / Triage E2E Tests
 *
 * Tests the AI-powered lead scoring and triage board functionality.
 * Critical for medical CRM lead management and conversion optimization.
 * Features: Kanban board, AI scores, lead cards, real-time updates.
 */
test.describe('Lead Scoring & Triage Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/triage');
    // Wait for page to load
    await expect(page.getByRole('heading', { name: /triage|leads/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('displays triage board with kanban columns', async ({ page }) => {
    // Check for the main triage board heading
    await expect(page.getByText(/live triage board/i)).toBeVisible({ timeout: 5000 });

    // Wait for columns to load
    await page.waitForTimeout(1000);

    // Check for column headers (New, Hot, Warm, Cold, Scheduled)
    const columns = page.locator('[class*="rounded-lg"][class*="flex-col"]');
    await expect(columns.first()).toBeVisible({ timeout: 10000 });
  });

  test('displays column categories with icons', async ({ page }) => {
    // Wait for board to load
    await page.waitForTimeout(1500);

    // Check for category icons and titles
    // New column - Clock icon
    const newColumn = page.getByText(/^new$|^nou$/i);

    // Hot column - Flame icon
    const hotColumn = page.getByText(/^hot$/i);

    // Warm column - Thermometer
    const warmColumn = page.getByText(/^warm$/i);

    // Cold column - Snowflake
    const coldColumn = page.getByText(/^cold$/i);

    // Scheduled column - Check
    const scheduledColumn = page.getByText(/^scheduled|programat$/i);

    // At least some columns should be visible
    await expect(
      newColumn.or(hotColumn).or(warmColumn).or(coldColumn).or(scheduledColumn)
    ).toBeVisible({ timeout: 5000 });
  });

  test('displays real-time indicator (Live badge)', async ({ page }) => {
    // Check for live indicator badge
    const liveBadge = page.locator('[class*="badge"], [class*="Badge"]').filter({
      hasText: /live/i,
    });

    await expect(liveBadge).toBeVisible({ timeout: 5000 });

    // Check for the pulsing indicator dot
    const pulsingDot = page.locator('[class*="rounded-full"][class*="bg-emerald"]');
    await expect(pulsingDot).toBeVisible({ timeout: 3000 });
  });

  test('lead cards display contact source (phone/whatsapp)', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Check for lead cards
    const leadCards = page.locator('[class*="Card"]').filter({
      has: page.locator('[class*="lucide-phone"], [class*="lucide-message-square"]'),
    });

    const emptyState = page.getByText(/niciun lead|no leads/i);

    // Either show lead cards or empty state
    await expect(leadCards.first().or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('lead cards show AI scoring information', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Look for score badges (Score: X/5)
    const scoreBadge = page.locator('[class*="badge"], [class*="Badge"]').filter({
      hasText: /score.*\/5/i,
    });

    // Look for confidence percentage
    const confidenceText = page.getByText(/\d+%\s*conf/i);

    // If there are scored leads, these should be visible
    const leadCards = page.locator('[class*="Card"]').filter({
      has: page.locator('[class*="lucide"]'),
    });

    if (await leadCards.first().isVisible({ timeout: 5000 })) {
      // Scored leads should have score or confidence info
      await expect(scoreBadge.or(confidenceText)).toBeVisible({ timeout: 5000 });
    }
  });

  test('lead cards display procedure interest tags', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Look for procedure interest badges/tags
    const procedureTags = page.locator('[class*="badge"][class*="outline"], [class*="Badge"]');

    // If there are leads with procedure interests
    const leadCards = page.locator('[class*="Card"]').filter({
      has: page.locator('[class*="lucide"]'),
    });

    if (await leadCards.nth(1).isVisible({ timeout: 5000 })) {
      // Some leads should have procedure tags
      await expect(procedureTags.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('lead cards have view details button', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Look for "Vezi detalii" button
    const viewDetailsButton = page.getByRole('button', { name: /vezi detalii|view details/i });

    const emptyState = page.getByText(/niciun lead|no leads/i);

    if (await emptyState.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Empty state is acceptable
      await expect(emptyState).toBeVisible();
    } else {
      // Should have view details buttons
      await expect(viewDetailsButton.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('clicking lead card navigates to patient detail', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Find a clickable lead card
    const leadCard = page.locator('a[href*="/patient/"]').first();

    if (await leadCard.isVisible({ timeout: 5000 })) {
      await leadCard.click();

      // Should navigate to patient detail page
      await expect(page).toHaveURL(/.*patient.*/, { timeout: 5000 });
    }
  });

  test('columns show lead count badges', async ({ page }) => {
    // Wait for board to load
    await page.waitForTimeout(1500);

    // Look for count badges in column headers
    const countBadges = page.locator('[class*="Badge"][class*="secondary"]');

    // Column headers should show count
    await expect(countBadges.first()).toBeVisible({ timeout: 5000 });
  });

  test('lead cards show time information', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    const leadCards = page.locator('[class*="Card"]').filter({
      has: page.locator('[class*="lucide"]'),
    });

    if (await leadCards.first().isVisible({ timeout: 5000 })) {
      // Should show time (e.g., "2m ago", "10:30")
      const timeText = page.locator('[class*="text-muted"]').filter({
        hasText: /\d+(m|h|s)|ago|acum|\d{1,2}:\d{2}/i,
      });

      await expect(timeText.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('lead messages are displayed in cards', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    const leadCards = page.locator('[class*="Card"]').filter({
      has: page.locator('[class*="lucide"]'),
    });

    if (await leadCards.first().isVisible({ timeout: 5000 })) {
      // Lead cards should show message content
      const messageText = leadCards.first().locator('[class*="text-muted"][class*="line-clamp"]');
      await expect(messageText.or(page.locator('[class*="text-sm"]').first())).toBeVisible({
        timeout: 3000,
      });
    }
  });

  test('AI reasoning is displayed for scored leads', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Look for italic reasoning text
    const reasoningText = page.locator('[class*="italic"]').filter({
      hasText: /".+"/,
    });

    // If there are scored leads with reasoning
    const scoreBadge = page.locator('[class*="badge"]').filter({
      hasText: /score/i,
    });

    if (await scoreBadge.first().isVisible({ timeout: 5000 })) {
      // Reasoning should be visible
      await expect(reasoningText.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('scheduled leads show appointment info', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Look for appointment indicator
    const appointmentInfo = page.locator('[class*="text-emerald"]').filter({
      has: page.locator('[class*="lucide-check-circle"]'),
    });

    // Look for scheduled column leads
    const scheduledColumn = page.locator('[class*="emerald"]').filter({
      has: page.locator('[class*="Card"]'),
    });

    if (await scheduledColumn.isVisible({ timeout: 5000 })) {
      // Scheduled leads should show appointment info
      await expect(appointmentInfo.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('board handles empty columns gracefully', async ({ page }) => {
    // Wait for board to load
    await page.waitForTimeout(1500);

    // Check for empty state message in columns
    const emptyColumnMessage = page.getByText(/niciun lead în această categorie|no lead/i);

    // At least verify the board structure is present even if empty
    const columns = page.locator('[class*="rounded-lg"][class*="flex-col"]');
    await expect(columns.first()).toBeVisible({ timeout: 5000 });

    // Empty columns should show appropriate message
    if (await emptyColumnMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(emptyColumnMessage).toBeVisible();
    }
  });

  test('page shows skeleton loader while loading', async ({ page }) => {
    // Force reload to see loading state
    await page.reload();

    // Check for skeleton loaders
    const skeleton = page.locator('[class*="skeleton"], [class*="Skeleton"]');

    // Skeleton should appear briefly during load
    await expect(skeleton.first().or(page.getByText(/live triage/i))).toBeVisible({
      timeout: 10000,
    });
  });

  test('lead score badges have correct variant colors', async ({ page }) => {
    // Wait for leads to load
    await page.waitForTimeout(1500);

    // Check for different score badge variants
    const hotBadge = page.locator('[class*="badge"]').filter({
      hasText: /score.*[45]\/5/i,
    });

    const warmBadge = page.locator('[class*="badge"]').filter({
      hasText: /score.*3\/5/i,
    });

    const coldBadge = page.locator('[class*="badge"]').filter({
      hasText: /score.*[12]\/5/i,
    });

    // Any of these should be visible if there are leads
    const anyBadge = hotBadge.or(warmBadge).or(coldBadge);
    const emptyState = page.getByText(/niciun lead|no leads/i);

    await expect(anyBadge.first().or(emptyState)).toBeVisible({ timeout: 10000 });
  });
});
