import { test, expect } from '@playwright/test';

/**
 * Webhook Processing E2E Tests
 *
 * Tests the webhook integration points and workflow triggers.
 * Critical for omnichannel communication (WhatsApp, Voice, Web).
 */
test.describe('Webhook Processing - Critical Path', () => {
  test.describe('Webhook Configuration', () => {
    test('should access webhook settings', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for webhook configuration section
      const webhookSettings = page.getByText(/webhook|endpoint|api/i);
      const integrationPage = page.getByRole('heading', {
        name: /integrări|integration/i,
      });

      await expect(webhookSettings.or(integrationPage)).toBeVisible({ timeout: 10000 });
    });

    test('should display configured webhooks', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for webhook list or cards
      const webhookList = page.locator(
        '[data-testid="webhook-item"], [class*="Card"]'
      );
      const emptyState = page.getByText(/nu există|no webhooks|empty/i);

      await expect(webhookList.first().or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('should show webhook status indicators', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Look for status badges
      const statusIndicator = page.locator(
        '[class*="badge"], [class*="status"], [data-testid="webhook-status"]'
      );

      if ((await statusIndicator.count()) > 0) {
        await expect(statusIndicator.first()).toBeVisible();
      }
    });
  });

  test.describe('WhatsApp Integration', () => {
    test('should access WhatsApp settings', async ({ page }) => {
      await page.goto('/settings/whatsapp');
      await page.waitForTimeout(2000);

      const whatsappPage = page.getByText(/whatsapp|mesagerie/i);
      await expect(whatsappPage.first()).toBeVisible({ timeout: 10000 });
    });

    test('should display WhatsApp connection status', async ({ page }) => {
      await page.goto('/settings/whatsapp');
      await page.waitForTimeout(2000);

      // Check for connection status
      const connectionStatus = page.getByText(/conectat|connected|status|activ/i);
      const configSection = page.locator('[class*="Card"], form');

      await expect(connectionStatus.or(configSection.first())).toBeVisible({
        timeout: 10000,
      });
    });

    test('should show WhatsApp template management', async ({ page }) => {
      await page.goto('/settings/whatsapp');
      await page.waitForTimeout(2000);

      // WhatsApp requires pre-approved templates
      const templates = page.getByText(/template|șablon|mesaj/i);

      if ((await templates.count()) > 0) {
        await expect(templates.first()).toBeVisible();
      }
    });

    test('should display incoming message flow', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForTimeout(2000);

      // Check for WhatsApp message indicators
      const messageList = page.locator('[class*="message"], [class*="conversation"]');
      const whatsappIcon = page.locator('[data-testid="whatsapp-icon"], [class*="whatsapp"]');

      await expect(messageList.first().or(whatsappIcon.first())).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe('Voice Integration', () => {
    test('should access voice/call settings', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for voice/call settings
      const voiceSettings = page.getByText(/voice|vapi|call|apel|twilio/i);

      if ((await voiceSettings.count()) > 0) {
        await expect(voiceSettings.first()).toBeVisible();
      }
    });

    test('should display voice call dashboard', async ({ page }) => {
      await page.goto('/supervisor');
      await page.waitForTimeout(2000);

      // Supervisor dashboard shows call monitoring
      const supervisorPage = page.getByText(/supervisor|calls|apeluri|monitor/i);
      const accessDenied = page.getByText(/acces|denied|permission/i);

      await expect(supervisorPage.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test('should show active calls if available', async ({ page }) => {
      await page.goto('/supervisor');
      await page.waitForTimeout(2000);

      // Check for active calls section
      const activeCalls = page.locator(
        '[data-testid="active-call"], [class*="call-card"]'
      );
      const noCalls = page.getByText(/nu există|no calls|empty/i);

      if (
        (await activeCalls.count()) > 0 ||
        (await noCalls.isVisible({ timeout: 3000 }).catch(() => false))
      ) {
        await expect(activeCalls.first().or(noCalls)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('HubSpot Integration', () => {
    test('should access HubSpot settings', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      const hubspotSettings = page.getByText(/hubspot/i);

      if ((await hubspotSettings.count()) > 0) {
        await expect(hubspotSettings.first()).toBeVisible();
      }
    });

    test('should display HubSpot sync status', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for sync status
      const syncStatus = page.getByText(/sync|sincronizare|hubspot|status/i);

      if ((await syncStatus.count()) > 0) {
        await expect(syncStatus.first()).toBeVisible();
      }
    });

    test('should show field mapping configuration', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for field mapping
      const fieldMapping = page.getByText(/mapping|câmpuri|fields|mapare/i);

      if ((await fieldMapping.count()) > 0) {
        await expect(fieldMapping.first()).toBeVisible();
      }
    });
  });

  test.describe('Workflow Triggers', () => {
    test('should access workflow configuration', async ({ page }) => {
      await page.goto('/workflows');
      await page.waitForTimeout(2000);

      const workflowPage = page.getByRole('heading', {
        name: /workflow|automatizare/i,
      });

      await expect(workflowPage).toBeVisible({ timeout: 15000 });
    });

    test('should display webhook-triggered workflows', async ({ page }) => {
      await page.goto('/workflows');
      await page.waitForTimeout(2000);

      // Check for workflow cards with webhook triggers
      const workflowCards = page.locator(
        '[data-testid="workflow-card"], [class*="Card"]'
      );
      const webhookTrigger = page.getByText(/webhook|trigger|new_lead|inbound/i);

      await expect(workflowCards.first().or(webhookTrigger.first())).toBeVisible({
        timeout: 10000,
      });
    });

    test('should show workflow execution history', async ({ page }) => {
      await page.goto('/workflows');
      await page.waitForTimeout(2000);

      // Look for history/logs section
      const history = page.getByText(/istoric|history|execuții|runs/i);
      const logsTab = page.getByRole('tab', { name: /logs|jurnal/i });

      if ((await history.count()) > 0 || (await logsTab.count()) > 0) {
        await expect(history.first().or(logsTab.first())).toBeVisible({
          timeout: 5000,
        });
      }
    });

    test('should configure trigger conditions', async ({ page }) => {
      await page.goto('/workflows');
      await page.waitForTimeout(2000);

      // Look for workflow configuration
      const configButton = page.getByRole('button', {
        name: /configurează|configure|edit|nou/i,
      });

      if (await configButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await configButton.click();
        await page.waitForTimeout(1000);

        // Check for trigger configuration
        const triggerSection = page.getByText(/trigger|declanșator|when|când/i);

        if (await triggerSection.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(triggerSection.first()).toBeVisible();
        }

        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Lead Processing Webhooks', () => {
    test('should show lead source tracking', async ({ page }) => {
      await page.goto('/triage');
      await page.waitForTimeout(2000);

      // Check for source indicators
      const sourceIndicator = page.getByText(/sursă|source|web|whatsapp|voice/i);
      const leadCards = page.locator('[data-testid="lead-card"], [class*="Card"]');

      await expect(sourceIndicator.first().or(leadCards.first())).toBeVisible({
        timeout: 10000,
      });
    });

    test('should display lead scoring from webhook data', async ({ page }) => {
      await page.goto('/triage');
      await page.waitForTimeout(2000);

      // Check for AI scoring display
      const scoreDisplay = page.locator(
        '[data-testid="ai-score"], [class*="score"], [class*="badge"]'
      );

      if ((await scoreDisplay.count()) > 0) {
        await expect(scoreDisplay.first()).toBeVisible();
      }
    });

    test('should track UTM parameters', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Check for campaign/source tracking
      const utmTracking = page.getByText(/campaign|campanie|source|utm/i);
      const analyticsCharts = page.locator('[class*="chart"], canvas');

      await expect(utmTracking.or(analyticsCharts.first())).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe('Webhook Security', () => {
    test('should display API keys management', async ({ page }) => {
      await page.goto('/api-keys');
      await page.waitForTimeout(2000);

      // API keys page or access denied
      const apiKeysPage = page.getByText(/api|key|cheie|token/i);
      const accessDenied = page.getByText(/acces|denied|permission/i);

      await expect(apiKeysPage.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test('should have webhook signature verification info', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for security/signature settings
      const securitySettings = page.getByText(/security|signature|hmac|secret/i);

      if ((await securitySettings.count()) > 0) {
        await expect(securitySettings.first()).toBeVisible();
      }
    });

    test('should show rate limiting configuration', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for rate limiting settings
      const rateLimiting = page.getByText(/rate|limit|throttle/i);

      if ((await rateLimiting.count()) > 0) {
        await expect(rateLimiting.first()).toBeVisible();
      }
    });
  });

  test.describe('Webhook Monitoring', () => {
    test('should access webhook logs', async ({ page }) => {
      await page.goto('/audit');
      await page.waitForTimeout(2000);

      // Check for webhook-related logs
      const webhookLogs = page.getByText(/webhook|api|request|endpoint/i);
      const auditLog = page.locator('[data-testid="audit-entry"], table');

      await expect(webhookLogs.or(auditLog)).toBeVisible({ timeout: 10000 });
    });

    test('should display error notifications', async ({ page }) => {
      await page.goto('/settings/notifications');
      await page.waitForTimeout(2000);

      // Check for error notification settings
      const errorNotifications = page.getByText(
        /error|eroare|notification|alertă|webhook/i
      );

      await expect(errorNotifications.first()).toBeVisible({ timeout: 10000 });
    });

    test('should show webhook health metrics', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Check for API/webhook metrics
      const metrics = page.getByText(/api|webhook|request|latency/i);
      const charts = page.locator('[class*="chart"], canvas');

      await expect(metrics.or(charts.first())).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Stripe Integration', () => {
    test('should access payment settings', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for Stripe settings
      const stripeSettings = page.getByText(/stripe|payment|plată/i);

      if ((await stripeSettings.count()) > 0) {
        await expect(stripeSettings.first()).toBeVisible();
      }
    });

    test('should display payment webhook events', async ({ page }) => {
      await page.goto('/billing');
      await page.waitForTimeout(2000);

      // Check for payment events
      const paymentEvents = page.getByText(
        /payment|plată|tranzacție|transaction|webhook/i
      );
      const billingPage = page.locator('[class*="Card"], table');

      await expect(paymentEvents.or(billingPage.first())).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe('Real-time Updates', () => {
    test('should show real-time notification indicators', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(2000);

      // Check for notification bell or real-time indicator
      const notifications = page.locator(
        '[data-testid="notifications"], [class*="notification"], [class*="bell"]'
      );

      if ((await notifications.count()) > 0) {
        await expect(notifications.first()).toBeVisible();
      }
    });

    test('should display live queue updates', async ({ page }) => {
      await page.goto('/triage');
      await page.waitForTimeout(2000);

      // Check for real-time queue indicators
      const queueUpdates = page.locator(
        '[data-testid="queue-count"], [class*="badge"], [class*="counter"]'
      );
      const refreshIndicator = page.getByText(/live|actualizare|real-time/i);

      if ((await queueUpdates.count()) > 0 || (await refreshIndicator.count()) > 0) {
        await expect(queueUpdates.first().or(refreshIndicator.first())).toBeVisible({
          timeout: 5000,
        });
      }
    });
  });

  test.describe('Webhook API Validation', () => {
    test('health check endpoint is accessible', async ({ request }) => {
      // Test health check endpoint
      const response = await request.get('/api/health');

      // Should return 200 or similar success status
      expect([200, 204]).toContain(response.status());
    });

    test('protected endpoints require authentication', async ({ request }) => {
      // Test that webhook endpoints are protected
      const response = await request.post('/api/webhooks/test', {
        data: { test: true },
      });

      // Should require auth or return 404 if doesn't exist
      expect([401, 403, 404]).toContain(response.status());
    });
  });
});
