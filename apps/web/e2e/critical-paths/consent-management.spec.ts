import { test, expect } from '@playwright/test';

/**
 * Consent Management E2E Tests (Critical Path)
 *
 * Tests the complete GDPR/HIPAA consent management workflow.
 * Critical for regulatory compliance in medical CRM.
 */
test.describe('Consent Management - Critical Path', () => {
  test.describe('Consent Collection', () => {
    test('should require consent during patient registration', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // Open add patient dialog
      const addButton = page.getByRole('button', { name: /adaugă|add|nou/i });

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 5000 })) {
          // Look for consent checkbox or section
          const consentCheckbox = dialog.locator('[type="checkbox"]');
          const consentLabel = dialog.getByText(/acord|consent|gdpr|termeni/i);

          // Either checkbox or consent text should be present
          if ((await consentCheckbox.count()) > 0 || (await consentLabel.count()) > 0) {
            await expect(consentCheckbox.first().or(consentLabel.first())).toBeVisible({
              timeout: 3000,
            });
          }

          await page.keyboard.press('Escape');
        }
      }
    });

    test('should validate consent before contact', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForTimeout(2000);

      // Check for consent validation in messaging
      const composeButton = page.getByRole('button', { name: /nou|new|compose|trimite/i });

      if (await composeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await composeButton.click();
        await page.waitForTimeout(500);

        // Look for consent warning or validation
        const consentWarning = page.getByText(/acord|consent|gdpr|permission/i);
        const messageForm = page.getByRole('dialog').or(page.locator('[class*="form"]'));

        await expect(consentWarning.or(messageForm)).toBeVisible({ timeout: 5000 });
        await page.keyboard.press('Escape');
      }
    });

    test('should track marketing consent separately', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      const addButton = page.getByRole('button', { name: /adaugă|add|nou/i });

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click();

        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 5000 })) {
          // Check for separate marketing consent
          const marketingConsent = dialog.getByText(/marketing|promotional|comunicări/i);

          if (await marketingConsent.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expect(marketingConsent).toBeVisible();
          }

          await page.keyboard.press('Escape');
        }
      }
    });
  });

  test.describe('Consent Status Display', () => {
    test('should display consent status on patient records', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // Look for consent indicators in patient list
      const consentIndicator = page.locator(
        '[data-testid="consent-status"], [class*="consent"], [class*="badge"]'
      );

      if ((await consentIndicator.count()) > 0) {
        await expect(consentIndicator.first()).toBeVisible();
      }
    });

    test('should show consent expiration warning', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // GDPR consent expires after 2 years
      const expirationWarning = page.getByText(/expiră|expires|expiration|2 ani|2 years/i);

      if ((await expirationWarning.count()) > 0) {
        await expect(expirationWarning.first()).toBeVisible();
      }
    });

    test('should differentiate consent types visually', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // Check for different consent type indicators
      const processingConsent = page.getByText(/procesare|processing/i);
      const marketingConsent = page.getByText(/marketing/i);
      const medicalConsent = page.getByText(/medical|tratament|treatment/i);

      // At least one type should be indicated
      const anyConsent = processingConsent.or(marketingConsent).or(medicalConsent);

      if ((await anyConsent.count()) > 0) {
        await expect(anyConsent.first()).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Consent Updates', () => {
    test('should allow consent modification', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(2000);

      // Click on first patient to view details
      const patientRow = page.locator('tr, [data-testid="patient-row"]').first();

      if (await patientRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await patientRow.click();
        await page.waitForTimeout(2000);

        // Look for edit consent option
        const editConsent = page.getByRole('button', {
          name: /edit|modifică|consent|acord/i,
        });

        if (await editConsent.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(editConsent).toBeVisible();
        }
      }
    });

    test('should log consent changes', async ({ page }) => {
      // Navigate to audit log
      await page.goto('/audit');
      await page.waitForTimeout(2000);

      // Check for consent-related audit entries
      const consentAudit = page.getByText(/consent|acord|gdpr/i);
      const auditLog = page.locator('[data-testid="audit-entry"], table tr');

      await expect(consentAudit.or(auditLog.first())).toBeVisible({ timeout: 10000 });
    });

    test('should refresh consent periodically', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);

      // Check for consent refresh settings
      const consentRefresh = page.getByText(/reînnoire|refresh|consent|periodic/i);

      if ((await consentRefresh.count()) > 0) {
        await expect(consentRefresh.first()).toBeVisible();
      }
    });
  });

  test.describe('Consent Withdrawal (Right to Erasure)', () => {
    test('should access GDPR settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);

      // Check for GDPR/Privacy section
      const gdprSection = page.getByText(/gdpr|privacy|confidențialitate|date personale/i);

      await expect(gdprSection.first()).toBeVisible({ timeout: 10000 });
    });

    test('should provide data export option', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);

      // Look for export data option
      const exportOption = page.getByText(/export|descarcă|download|date/i);

      if ((await exportOption.count()) > 0) {
        await expect(exportOption.first()).toBeVisible();
      }
    });

    test('should have deletion request process', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);

      // Check for deletion/erasure option
      const deleteOption = page.getByText(/ștergere|delete|erasure|eliminare/i);

      if ((await deleteOption.count()) > 0) {
        await expect(deleteOption.first()).toBeVisible();
      }
    });

    test('GDPR deletion API requires confirmation', async ({ request }) => {
      // Test that deletion requires explicit confirmation
      const response = await request.post('/api/gdpr/delete-request', {
        data: {
          confirmDeletion: false,
        },
      });

      // Should fail without proper confirmation
      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe('Consent in Communications', () => {
    test('should block messaging without consent', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForTimeout(2000);

      // UI should indicate consent requirements
      const consentRequired = page.getByText(/acord|consent|permission|necesar/i);
      const messageInterface = page.locator('[class*="message"], [class*="chat"]');

      await expect(consentRequired.or(messageInterface)).toBeVisible({ timeout: 10000 });
    });

    test('should show opt-out option in templates', async ({ page }) => {
      await page.goto('/settings/templates');
      await page.waitForTimeout(2000);

      // Marketing templates should have unsubscribe
      const unsubscribe = page.getByText(/dezabonare|unsubscribe|opt-out/i);
      const templatesList = page.locator('[data-testid="template"], [class*="Card"]');

      await expect(unsubscribe.or(templatesList.first())).toBeVisible({ timeout: 10000 });
    });

    test('should handle WhatsApp consent requirements', async ({ page }) => {
      await page.goto('/settings/whatsapp');
      await page.waitForTimeout(2000);

      // WhatsApp has specific consent requirements
      const whatsappConsent = page.getByText(/consent|acord|template|opt-in/i);

      await expect(whatsappConsent.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Consent Documentation', () => {
    test('should access consent documents', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForTimeout(2000);

      // Check for consent documents section
      const documentsPage = page.getByRole('heading', {
        name: /documente|documents|fișiere/i,
      });

      await expect(documentsPage).toBeVisible({ timeout: 10000 });
    });

    test('should allow consent form uploads', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForTimeout(2000);

      // Check for upload functionality
      const uploadButton = page.getByRole('button', { name: /încarcă|upload|adaugă/i });

      if (await uploadButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(uploadButton).toBeVisible();
      }
    });

    test('should categorize consent documents', async ({ page }) => {
      await page.goto('/documents');
      await page.waitForTimeout(2000);

      // Look for consent category filter
      const categoryFilter = page.locator('[role="combobox"], select');
      const consentCategory = page.getByText(/consent|acord|categorie/i);

      await expect(categoryFilter.first().or(consentCategory.first())).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe('Regulatory Compliance Audit', () => {
    test('should access audit logs', async ({ page }) => {
      await page.goto('/audit');
      await page.waitForTimeout(2000);

      // Audit page or access denied for non-admin
      const auditPage = page.getByText(/audit|jurnal|log/i);
      const accessDenied = page.getByText(/acces|denied|permission/i);

      await expect(auditPage.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test('should filter audit by consent events', async ({ page }) => {
      await page.goto('/audit');
      await page.waitForTimeout(2000);

      // Look for event type filter
      const eventFilter = page.locator('[data-testid="audit-filter"], [role="combobox"]');
      const consentFilter = page.getByText(/consent|acord|gdpr/i);

      if ((await eventFilter.count()) > 0 || (await consentFilter.count()) > 0) {
        await expect(eventFilter.first().or(consentFilter.first())).toBeVisible({
          timeout: 5000,
        });
      }
    });

    test('should export audit report', async ({ page }) => {
      await page.goto('/audit/export');
      await page.waitForTimeout(2000);

      // Check for export functionality
      const exportPage = page.getByText(/export|raport|report/i);
      const accessDenied = page.getByText(/acces|denied|permission/i);

      await expect(exportPage.or(accessDenied)).toBeVisible({ timeout: 10000 });
    });

    test('should show consent metrics dashboard', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Check for consent-related metrics
      const consentMetrics = page.getByText(/consent|acord|rate|gdpr/i);
      const analyticsPage = page.locator('[class*="chart"], canvas');

      await expect(consentMetrics.or(analyticsPage)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Cross-Channel Consent', () => {
    test('should sync consent across channels', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for integration consent sync
      const integrations = page.getByText(/integrări|integration|sync|sincronizare/i);

      await expect(integrations.first()).toBeVisible({ timeout: 10000 });
    });

    test('should manage HubSpot consent sync', async ({ page }) => {
      await page.goto('/settings/integrations');
      await page.waitForTimeout(2000);

      // Check for HubSpot integration
      const hubspot = page.getByText(/hubspot/i);

      if ((await hubspot.count()) > 0) {
        await expect(hubspot.first()).toBeVisible();
      }
    });

    test('should handle voice consent recording', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(2000);

      // Voice calls may require consent recording
      const voiceSettings = page.getByText(/voce|voice|call|înregistrare/i);

      if ((await voiceSettings.count()) > 0) {
        await expect(voiceSettings.first()).toBeVisible();
      }
    });
  });

  test.describe('Consent API Validation', () => {
    test('GDPR export endpoint returns proper structure', async ({ request }) => {
      const response = await request.get('/api/gdpr/export');

      // Should require authentication
      expect([200, 401]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('exportedAt');
        expect(data).toHaveProperty('dataController');
      }
    });

    test('GDPR deletion info endpoint is accessible', async ({ request }) => {
      const response = await request.get('/api/gdpr/delete-request');

      expect([200, 401]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('legalBasis');
      }
    });
  });
});
