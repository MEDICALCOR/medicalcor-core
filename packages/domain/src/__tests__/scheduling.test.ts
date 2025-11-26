import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedulingService, ConsentRequiredError } from '../scheduling/scheduling-service.js';
import type { ConsentService, ConsentType } from '../consent/consent-service.js';

// Mock ConsentService
function createMockConsentService(overrides: Partial<ConsentService> = {}): ConsentService {
  return {
    hasRequiredConsents: vi.fn().mockResolvedValue({ valid: true, missing: [] }),
    hasValidConsent: vi.fn().mockResolvedValue(true),
    recordConsent: vi.fn(),
    grantConsent: vi.fn(),
    withdrawConsent: vi.fn(),
    getConsent: vi.fn(),
    getConsentsForContact: vi.fn(),
    getAuditTrail: vi.fn(),
    getContactAuditTrail: vi.fn(),
    exportConsentData: vi.fn(),
    eraseConsentData: vi.fn(),
    parseConsentFromMessage: vi.fn(),
    generateConsentMessage: vi.fn(),
    ...overrides,
  } as unknown as ConsentService;
}

describe('SchedulingService', () => {
  describe('consent validation', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should not require consent when requireConsent is false', async () => {
      const mockConsentService = createMockConsentService();

      const service = new SchedulingService({
        consentService: mockConsentService,
        requireConsent: false,
      });

      // bookAppointment will fail due to no pool, but consent should not be checked
      try {
        await service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        });
      } catch (e) {
        // Expected to fail due to no database connection
        expect((e as Error).message).toContain('Database connection not configured');
      }

      // Consent service should not have been called
      expect(mockConsentService.hasRequiredConsents).not.toHaveBeenCalled();
      expect(mockConsentService.hasValidConsent).not.toHaveBeenCalled();
    });

    it('should validate consent when requireConsent is true', async () => {
      const mockConsentService = createMockConsentService();

      const service = new SchedulingService({
        consentService: mockConsentService,
        requireConsent: true,
      });

      try {
        await service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        });
      } catch (e) {
        // Will fail after consent check due to no database
        expect((e as Error).message).toContain('Database connection not configured');
      }

      // Consent service should have been called
      expect(mockConsentService.hasRequiredConsents).toHaveBeenCalledWith('contact-123');
      expect(mockConsentService.hasValidConsent).toHaveBeenCalledWith(
        'contact-123',
        'appointment_reminders'
      );
    });

    it('should throw ConsentRequiredError when required consents are missing', async () => {
      const mockConsentService = createMockConsentService({
        hasRequiredConsents: vi.fn().mockResolvedValue({
          valid: false,
          missing: ['data_processing'] as ConsentType[],
        }),
      });

      const service = new SchedulingService({
        consentService: mockConsentService,
        requireConsent: true,
      });

      await expect(
        service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        })
      ).rejects.toThrow(ConsentRequiredError);

      await expect(
        service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        })
      ).rejects.toThrow(/data_processing/);
    });

    it('should throw ConsentRequiredError when appointment_reminders consent is missing', async () => {
      const mockConsentService = createMockConsentService({
        hasRequiredConsents: vi.fn().mockResolvedValue({ valid: true, missing: [] }),
        hasValidConsent: vi.fn().mockResolvedValue(false),
      });

      const service = new SchedulingService({
        consentService: mockConsentService,
        requireConsent: true,
      });

      await expect(
        service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        })
      ).rejects.toThrow(ConsentRequiredError);

      await expect(
        service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        })
      ).rejects.toThrow(/appointment_reminders/);
    });

    it('should allow booking when all consents are granted', async () => {
      const mockConsentService = createMockConsentService({
        hasRequiredConsents: vi.fn().mockResolvedValue({ valid: true, missing: [] }),
        hasValidConsent: vi.fn().mockResolvedValue(true),
      });

      const service = new SchedulingService({
        consentService: mockConsentService,
        requireConsent: true,
      });

      // Should pass consent check but fail on database connection
      try {
        await service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        });
      } catch (e) {
        // Expected to fail due to no database connection (after consent passes)
        expect((e as Error).message).toContain('Database connection not configured');
      }

      // Verify consent was checked
      expect(mockConsentService.hasRequiredConsents).toHaveBeenCalledWith('contact-123');
      expect(mockConsentService.hasValidConsent).toHaveBeenCalledWith(
        'contact-123',
        'appointment_reminders'
      );
    });

    it('should skip consent check in development when no consent service is provided', async () => {
      process.env.NODE_ENV = 'development';

      const service = new SchedulingService({
        requireConsent: true,
        // No consent service provided
      });

      // Should pass consent check but fail on database connection
      try {
        await service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        });
      } catch (e) {
        // Expected to fail due to no database connection
        expect((e as Error).message).toContain('Database connection not configured');
      }
    });

    it('should fail in production when no consent service is provided but consent is required', async () => {
      process.env.NODE_ENV = 'production';

      const service = new SchedulingService({
        requireConsent: true,
        // No consent service provided
      });

      await expect(
        service.bookAppointment({
          hubspotContactId: 'contact-123',
          phone: '+40721000000',
          slotId: 'slot-1',
          procedureType: 'consultation',
        })
      ).rejects.toThrow('Consent service not configured');
    });
  });

  describe('ConsentRequiredError', () => {
    it('should contain contact ID and missing consents', () => {
      const error = new ConsentRequiredError('contact-456', [
        'data_processing',
        'appointment_reminders',
      ]);

      expect(error.contactId).toBe('contact-456');
      expect(error.missingConsents).toEqual(['data_processing', 'appointment_reminders']);
      expect(error.name).toBe('ConsentRequiredError');
      expect(error.message).toContain('contact-456');
      expect(error.message).toContain('data_processing');
      expect(error.message).toContain('appointment_reminders');
    });
  });

  describe('getAvailableSlots', () => {
    it('should return empty array when no pool is configured', async () => {
      const service = new SchedulingService({});
      const slots = await service.getAvailableSlots('consultation');
      expect(slots).toEqual([]);
    });
  });

  describe('getUpcomingAppointments', () => {
    it('should return empty array when no pool is configured', async () => {
      const service = new SchedulingService({});
      const appointments = await service.getUpcomingAppointments(new Date(), new Date());
      expect(appointments).toEqual([]);
    });
  });
});
