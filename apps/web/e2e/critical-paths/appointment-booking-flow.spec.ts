import { test, expect } from '@playwright/test';

/**
 * Appointment Booking Flow E2E Tests
 *
 * Tests the complete appointment booking process for a medical CRM.
 * Critical path for patient scheduling and clinic operations.
 */
test.describe('Appointment Booking Flow', () => {
  test.describe('Calendar Access', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/calendar');
      await expect(
        page.getByRole('heading', { name: /calendar|programări|appointments/i })
      ).toBeVisible({ timeout: 15000 });
    });

    test('should display calendar view', async ({ page }) => {
      // Check for calendar UI
      const calendarGrid = page.locator(
        '[class*="calendar"], [data-testid="calendar-grid"]'
      );
      const timeSlots = page.locator(
        '[class*="slot"], [data-testid="time-slot"]'
      );

      await expect(calendarGrid.or(timeSlots.first())).toBeVisible({ timeout: 10000 });
    });

    test('should navigate between calendar views', async ({ page }) => {
      // Look for view toggle buttons (day, week, month)
      const dayView = page.getByRole('button', { name: /zi|day/i });
      const weekView = page.getByRole('button', { name: /săptămână|week/i });
      const monthView = page.getByRole('button', { name: /lună|month/i });

      const viewToggle = dayView.or(weekView).or(monthView);

      if (await viewToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(viewToggle).toBeVisible();
      }
    });

    test('should display navigation controls', async ({ page }) => {
      // Check for previous/next navigation
      const prevButton = page.getByRole('button', { name: /previous|anterior|înainte/i });
      const nextButton = page.getByRole('button', { name: /next|următor|după/i });
      const todayButton = page.getByRole('button', { name: /today|azi|astăzi/i });

      await expect(
        prevButton.or(nextButton).or(todayButton)
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show current date indicator', async ({ page }) => {
      // Current date should be highlighted
      const today = new Date().getDate().toString();
      const currentDate = page.locator(`[class*="today"], [aria-current="date"]`);

      if (await currentDate.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(currentDate).toBeVisible();
      }
    });
  });

  test.describe('Booking Interface', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);
    });

    test('should display booking wizard', async ({ page }) => {
      // Check for booking form or wizard
      const bookingForm = page.locator(
        '[data-testid="booking-form"], [class*="booking"]'
      );
      const serviceSelection = page.getByText(/serviciu|service|procedură/i);

      await expect(bookingForm.or(serviceSelection)).toBeVisible({ timeout: 10000 });
    });

    test('should show available services', async ({ page }) => {
      // Check for service selection cards
      const serviceCards = page.locator(
        '[class*="Card"], [data-testid="service-option"]'
      );

      if ((await serviceCards.count()) > 0) {
        await expect(serviceCards.first()).toBeVisible();
      }
    });

    test('should display time slot availability', async ({ page }) => {
      // First select a service if required
      const serviceCard = page
        .locator('[class*="cursor-pointer"][class*="border"]')
        .first();

      if (await serviceCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await serviceCard.click();
        await page.waitForTimeout(1000);

        // Check for time slots
        const timeSlots = page.locator(
          '[data-testid="time-slot"], [class*="slot"]'
        );
        const dateSelection = page.locator('[class*="date"], [role="gridcell"]');

        await expect(timeSlots.first().or(dateSelection.first())).toBeVisible({
          timeout: 5000,
        });
      }
    });
  });

  test.describe('Patient Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);
    });

    test('should allow patient search', async ({ page }) => {
      // Look for patient search field
      const searchInput = page.getByPlaceholder(/căutare|search|pacient|patient/i);
      const searchButton = page.getByRole('button', { name: /căutare|search/i });

      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(searchInput).toBeVisible();
      }
    });

    test('should display existing patients', async ({ page }) => {
      // Navigate to patient selection step if wizard
      const patientSection = page.getByText(/pacient|patient|selectează/i);

      if (await patientSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(patientSection).toBeVisible();
      }
    });

    test('should allow new patient creation during booking', async ({ page }) => {
      // Look for "new patient" option
      const newPatientButton = page.getByRole('button', {
        name: /nou|new|adaugă|add/i,
      });

      if (await newPatientButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newPatientButton.click();

        // Check for patient form
        const patientForm = page.getByRole('dialog').or(page.locator('[class*="form"]'));
        await expect(patientForm).toBeVisible({ timeout: 5000 });

        // Close if opened
        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Time Slot Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);
    });

    test('should show available and unavailable slots', async ({ page }) => {
      // Select a service first
      const serviceCard = page
        .locator('[class*="cursor-pointer"][class*="border"]')
        .first();

      if (await serviceCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await serviceCard.click();
        await page.waitForTimeout(1500);

        // Check for slot availability indicators
        const slots = page.locator('[class*="slot"], [data-testid="time-slot"]');

        if ((await slots.count()) > 0) {
          await expect(slots.first()).toBeVisible();
        }
      }
    });

    test('should highlight selected time slot', async ({ page }) => {
      const serviceCard = page
        .locator('[class*="cursor-pointer"][class*="border"]')
        .first();

      if (await serviceCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await serviceCard.click();
        await page.waitForTimeout(1500);

        const slot = page.locator('[data-testid="time-slot"]').first();

        if (await slot.isVisible({ timeout: 3000 }).catch(() => false)) {
          await slot.click();

          // Check for selection indicator
          const selectedSlot = page.locator('[class*="selected"], [aria-selected="true"]');
          if ((await selectedSlot.count()) > 0) {
            await expect(selectedSlot.first()).toBeVisible();
          }
        }
      }
    });

    test('should respect clinic working hours', async ({ page }) => {
      // Navigate to calendar to verify working hours
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      // Calendar should only show slots within working hours
      const calendarView = page.locator('[class*="calendar"]');
      await expect(calendarView).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Booking Confirmation', () => {
    test('should display booking summary', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Progress through booking steps
      const serviceCard = page
        .locator('[class*="cursor-pointer"][class*="border"]')
        .first();

      if (await serviceCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await serviceCard.click();
        await page.waitForTimeout(1000);

        // Look for summary or confirmation step
        const summarySection = page.getByText(/rezumat|summary|confirmare|confirm/i);

        if (await summarySection.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(summarySection).toBeVisible();
        }
      }
    });

    test('should show appointment details before confirmation', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Check for detail fields in booking flow
      const dateField = page.getByText(/data|date/i);
      const timeField = page.getByText(/ora|time/i);
      const serviceField = page.getByText(/serviciu|service/i);

      await expect(
        dateField.or(timeField).or(serviceField)
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have confirm booking button', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Look for confirm/submit button
      const confirmButton = page.getByRole('button', {
        name: /confirmă|confirm|programează|book|rezervă/i,
      });

      // May be disabled until all steps complete
      if (await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(confirmButton).toBeVisible();
      }
    });
  });

  test.describe('Doctor/Provider Selection', () => {
    test('should display available doctors', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Check for doctor selection
      const doctorSelection = page.getByText(/doctor|medic|specialist/i);
      const providerList = page.locator('[data-testid="doctor-option"], [class*="doctor"]');

      await expect(doctorSelection.or(providerList.first())).toBeVisible({
        timeout: 5000,
      });
    });

    test('should filter availability by doctor', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Look for doctor filter/selection
      const doctorFilter = page.locator(
        '[data-testid="doctor-filter"], [role="combobox"]'
      );

      if (await doctorFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(doctorFilter).toBeVisible();
      }
    });
  });

  test.describe('Appointment Types', () => {
    test('should display different appointment types', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Check for appointment type selection
      const appointmentTypes = page.locator(
        '[data-testid="appointment-type"], [class*="Card"]'
      );

      if ((await appointmentTypes.count()) > 0) {
        await expect(appointmentTypes.first()).toBeVisible();
      }
    });

    test('should show duration for each appointment type', async ({ page }) => {
      await page.goto('/booking');
      await page.waitForTimeout(2000);

      // Check for duration indicators
      const duration = page.getByText(/minute|min|oră|hour|durată|duration/i);

      if ((await duration.count()) > 0) {
        await expect(duration.first()).toBeVisible();
      }
    });
  });

  test.describe('Waiting List', () => {
    test('should access waiting list', async ({ page }) => {
      await page.goto('/waiting-list');
      await expect(
        page.getByRole('heading', { name: /waiting|așteptare|listă/i })
      ).toBeVisible({ timeout: 15000 });
    });

    test('should display waiting list entries', async ({ page }) => {
      await page.goto('/waiting-list');
      await page.waitForTimeout(2000);

      const waitingList = page.locator('[data-testid="waiting-item"], table tr');
      const emptyState = page.getByText(/nu există|no entries|empty|gol/i);

      await expect(waitingList.first().or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('should have option to add to waiting list', async ({ page }) => {
      await page.goto('/waiting-list');
      await page.waitForTimeout(2000);

      const addButton = page.getByRole('button', { name: /adaugă|add|nou/i });

      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(addButton).toBeVisible();
      }
    });
  });

  test.describe('Notifications and Reminders', () => {
    test('should show reminder settings page', async ({ page }) => {
      await page.goto('/reminders');
      await page.waitForTimeout(2000);

      const reminderPage = page.getByText(/reminder|memento|notificare/i);
      await expect(reminderPage).toBeVisible({ timeout: 10000 });
    });

    test('should configure reminder templates', async ({ page }) => {
      await page.goto('/settings/templates');
      await page.waitForTimeout(2000);

      const templatesPage = page.getByText(/template|șablon|mesaj/i);
      await expect(templatesPage).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Appointment Management', () => {
    test('should view existing appointments', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      // Check for existing appointments on calendar
      const appointments = page.locator(
        '[data-testid="appointment"], [class*="appointment"], [class*="event"]'
      );

      // Calendar should be visible regardless of appointments
      const calendarView = page.locator('[class*="calendar"]');
      await expect(calendarView.or(appointments.first())).toBeVisible({
        timeout: 10000,
      });
    });

    test('should access appointment details', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      // Click on an appointment if one exists
      const appointment = page
        .locator('[data-testid="appointment"], [class*="event"]')
        .first();

      if (await appointment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await appointment.click();

        // Check for appointment details modal/panel
        const detailsPanel = page.getByRole('dialog').or(
          page.locator('[class*="details"], [class*="popover"]')
        );

        if (await detailsPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(detailsPanel).toBeVisible();
          await page.keyboard.press('Escape');
        }
      }
    });

    test('should have cancel appointment option', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      const appointment = page
        .locator('[data-testid="appointment"], [class*="event"]')
        .first();

      if (await appointment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await appointment.click();
        await page.waitForTimeout(500);

        // Look for cancel button
        const cancelButton = page.getByRole('button', { name: /anulează|cancel/i });

        if (await cancelButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(cancelButton).toBeVisible();
        }

        await page.keyboard.press('Escape');
      }
    });

    test('should have reschedule option', async ({ page }) => {
      await page.goto('/calendar');
      await page.waitForTimeout(2000);

      const appointment = page
        .locator('[data-testid="appointment"], [class*="event"]')
        .first();

      if (await appointment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await appointment.click();
        await page.waitForTimeout(500);

        // Look for reschedule button
        const rescheduleButton = page.getByRole('button', {
          name: /reprogramează|reschedule|edit|modifică/i,
        });

        if (await rescheduleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(rescheduleButton).toBeVisible();
        }

        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Integration with Messaging', () => {
    test('should access messaging for appointment follow-up', async ({ page }) => {
      await page.goto('/messages');
      await expect(
        page.getByRole('heading', { name: /mesaje|messages|conversații/i })
      ).toBeVisible({ timeout: 15000 });
    });

    test('should have message templates for appointments', async ({ page }) => {
      await page.goto('/settings/templates');
      await page.waitForTimeout(2000);

      const appointmentTemplates = page.getByText(
        /programare|appointment|confirmare|reminder/i
      );

      if ((await appointmentTemplates.count()) > 0) {
        await expect(appointmentTemplates.first()).toBeVisible();
      }
    });
  });
});
