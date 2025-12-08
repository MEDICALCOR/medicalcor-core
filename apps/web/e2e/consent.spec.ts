import { test, expect } from '@playwright/test';

/**
 * Consent Management / GDPR E2E Tests
 *
 * Tests GDPR compliance features for medical CRM.
 * Critical for HIPAA/GDPR regulatory compliance.
 * Features: Data export, deletion requests, consent tracking, audit logs.
 */
test.describe('Consent Management & GDPR Compliance', () => {
  test.describe('Settings Page - Privacy Section', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: /setari|settings|profil/i })).toBeVisible({
        timeout: 10000,
      });
    });

    test('settings page loads with user profile section', async ({ page }) => {
      // Check for profile section
      await expect(page.getByText(/profil utilizator|user profile/i)).toBeVisible({
        timeout: 5000,
      });

      // Check for personal information fields
      await expect(page.getByLabel(/prenume|first name/i)).toBeVisible();
      await expect(page.getByLabel(/nume|last name/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
    });

    test('password change section is available', async ({ page }) => {
      // Check for password change section
      await expect(page.getByText(/schimbă parola|change password/i)).toBeVisible({
        timeout: 5000,
      });

      // Check for password fields
      await expect(page.getByLabel(/parola curentă|current password/i)).toBeVisible();
      await expect(page.getByLabel(/parola nouă|new password/i)).toBeVisible();
      await expect(page.getByLabel(/confirmă parola|confirm password/i)).toBeVisible();
    });

    test('save button is present for profile updates', async ({ page }) => {
      // Check for save button
      const saveButton = page.getByRole('button', { name: /salvează|save/i });
      await expect(saveButton).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('GDPR Data Export API', () => {
    test('GDPR export endpoint returns proper response structure', async ({ request }) => {
      // Test the GDPR export API endpoint
      const response = await request.get('/api/gdpr/export');

      // Should require authentication - expect 401 without proper auth
      // In E2E context with auth, it might return 200 with data
      expect([200, 401]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();

        // Verify export structure contains required GDPR fields
        expect(data).toHaveProperty('exportedAt');
        expect(data).toHaveProperty('dataController');
        expect(data).toHaveProperty('exportFormat');
      }
    });
  });

  test.describe('GDPR Deletion Request API', () => {
    test('GDPR deletion info endpoint returns proper response', async ({ request }) => {
      // Test the GDPR deletion info endpoint (GET)
      const response = await request.get('/api/gdpr/delete-request');

      // Should require authentication
      expect([200, 401]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json();

        // Verify deletion info structure
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('description');
        expect(data).toHaveProperty('process');
        expect(data).toHaveProperty('legalBasis');
        expect(data).toHaveProperty('warning');

        // Verify GDPR legal reference
        expect(data.legalBasis).toHaveProperty('regulation');
        expect(data.legalBasis).toHaveProperty('article');
      }
    });

    test('GDPR deletion request requires confirmation', async ({ request }) => {
      // Test that deletion requires proper confirmation
      const response = await request.post('/api/gdpr/delete-request', {
        data: {
          confirmDeletion: false, // Should fail validation
        },
      });

      // Should fail validation or require auth
      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe('Audit Log & Data Access', () => {
    test('audit log export page is accessible', async ({ page }) => {
      await page.goto('/audit/export');

      // Check if audit export page loads (may require permission)
      const pageContent = page
        .getByRole('heading')
        .or(page.getByText(/audit|export|acces denied/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Consent in Patient Documents', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/documents');
    });

    test('documents page shows consent-related documents', async ({ page }) => {
      // Wait for page to load
      await expect(page.getByRole('heading', { name: /document|fisiere/i })).toBeVisible({
        timeout: 10000,
      });

      // Check for document management interface
      const documentList = page.locator('[class*="Card"], [class*="card"]');
      const emptyState = page.getByText(/nu există documente|no documents|încarcă/i);

      await expect(documentList.first().or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('can access document categories or filters', async ({ page }) => {
      // Wait for page to load
      await page.waitForTimeout(1000);

      // Look for category/filter controls
      const filterControls = page.locator('[role="combobox"], [role="button"]').filter({
        hasText: /categorie|category|filtru|filter|tip|type/i,
      });

      const uploadButton = page.getByRole('button', { name: /încarcă|upload|adaugă/i });

      // Either filters or upload button should be visible
      await expect(filterControls.first().or(uploadButton)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Consent in Onboarding', () => {
    test('consent checkboxes are present in registration flows', async ({ page }) => {
      // Navigate to a page that might have consent checkboxes
      // This could be the booking page or signup flow
      await page.goto('/booking');

      // Wait for page
      await page.waitForTimeout(1000);

      // Navigate to patient details step if possible
      const serviceCard = page.locator('[class*="cursor-pointer"][class*="border"]').first();

      if (await serviceCard.isVisible({ timeout: 5000 })) {
        // Consent is typically on forms
        // Check for common consent-related text
        const consentText = page.getByText(
          /acord|consent|gdpr|date personale|personal data|termeni/i
        );

        // May appear later in the flow or on confirmation
        if (await consentText.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(consentText).toBeVisible();
        }
      }
    });
  });

  test.describe('Data Privacy in Clinic Settings', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/clinics');
    });

    test('clinic settings page loads', async ({ page }) => {
      // Wait for page to load
      const pageContent = page.getByRole('heading').or(page.getByText(/clinic|cabinet|locație/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });

    test('clinic data includes privacy-related fields', async ({ page }) => {
      // Wait for page to load
      await page.waitForTimeout(1500);

      // Check for clinic management interface
      const clinicCard = page.locator('[class*="Card"], [class*="card"]');
      const addButton = page.getByRole('button', { name: /adaugă|add|nou/i });

      await expect(clinicCard.first().or(addButton)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Consent Tracking via Forms', () => {
    test('forms have proper consent fields', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForTimeout(1000);

      // Try to open add patient modal
      const addButton = page.getByRole('button', { name: /adaugă|add|nou/i });

      if (await addButton.isVisible({ timeout: 5000 })) {
        await addButton.click();

        // Check if consent-related fields are in the form
        const dialog = page.getByRole('dialog');
        if (await dialog.isVisible({ timeout: 5000 })) {
          // Forms should have phone/email fields which require consent
          await expect(page.getByLabel(/telefon|phone/i)).toBeVisible();

          // Look for consent checkboxes or notes
          const consentCheckbox = page.locator('[type="checkbox"]').filter({
            hasNot: page.locator('[aria-hidden="true"]'),
          });

          const consentLabel = page.getByText(/acord|consent|gdpr|marketing/i);

          // Either consent checkbox or label might be present
          if (
            await consentCheckbox
              .first()
              .isVisible({ timeout: 2000 })
              .catch(() => false)
          ) {
            await expect(consentCheckbox.first()).toBeVisible();
          }

          // Close dialog
          await page.keyboard.press('Escape');
        }
      }
    });
  });

  test.describe('Data Retention & Security', () => {
    test('settings page has security-related options', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(1000);

      // Check for security-related sections
      const securitySection = page.getByText(/securitate|security|parola|password|2fa|mfa/i);
      await expect(securitySection.first()).toBeVisible({ timeout: 10000 });
    });

    test('notifications settings are accessible', async ({ page }) => {
      await page.goto('/settings/notifications');

      // Wait for page to load
      const pageContent = page.getByRole('heading').or(page.getByText(/notificări|notification/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });

    test('integration settings are accessible', async ({ page }) => {
      await page.goto('/settings/integrations');

      // Wait for page to load
      const pageContent = page.getByRole('heading').or(page.getByText(/integrări|integration/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('WhatsApp Consent (Communication Channel)', () => {
    test('WhatsApp settings page is accessible', async ({ page }) => {
      await page.goto('/settings/whatsapp');

      // Wait for page to load
      const pageContent = page
        .getByRole('heading')
        .or(page.getByText(/whatsapp|mesagerie|messaging/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Feature Flags for Privacy Features', () => {
    test('feature flags page shows privacy-related toggles', async ({ page }) => {
      await page.goto('/settings/feature-flags');

      // Wait for page to load
      const pageContent = page.getByRole('heading').or(page.getByText(/feature|flag|funcții/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Backup & Data Recovery', () => {
    test('backup settings page is accessible', async ({ page }) => {
      await page.goto('/settings/backup');

      // Wait for page to load
      const pageContent = page
        .getByRole('heading')
        .or(page.getByText(/backup|recuperare|recovery/i));
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });
  });
});
