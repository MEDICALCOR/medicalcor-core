/**
 * Appointment helpers tests
 *
 * @module trigger/jobs/cron/shared/__tests__/appointment-helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getContactLanguage,
  getWhatsAppLang,
  getReminderConfig,
  filterContactsForReminder,
  sendAppointmentReminder,
  type AppointmentLanguage,
  type ReminderType,
} from '../appointment-helpers.js';
import type { HubSpotContactResult } from '../types.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockContact(
  overrides: Partial<HubSpotContactResult['properties']> = {}
): HubSpotContactResult {
  return {
    id: 'contact-123',
    properties: {
      firstname: 'Test',
      lastname: 'User',
      email: 'test@example.com',
      phone: '+40722123456',
      next_appointment_date: '2025-06-16T14:00:00.000Z',
      hs_language: 'ro',
      reminder_24h_sent: 'false',
      reminder_2h_sent: 'false',
      ...overrides,
    },
  };
}

// ============================================================================
// LANGUAGE HELPERS TESTS
// ============================================================================

describe('getContactLanguage', () => {
  it('should return "ro" for Romanian language', () => {
    expect(getContactLanguage('ro')).toBe('ro');
  });

  it('should return "en" for English language', () => {
    expect(getContactLanguage('en')).toBe('en');
  });

  it('should return "de" for German language', () => {
    expect(getContactLanguage('de')).toBe('de');
  });

  it('should return "ro" as default for undefined language', () => {
    expect(getContactLanguage(undefined)).toBe('ro');
  });

  it('should return "ro" as default for unsupported language', () => {
    expect(getContactLanguage('fr')).toBe('ro');
    expect(getContactLanguage('es')).toBe('ro');
    expect(getContactLanguage('')).toBe('ro');
  });
});

describe('getWhatsAppLang', () => {
  it('should return the same language for "ro"', () => {
    expect(getWhatsAppLang('ro')).toBe('ro');
  });

  it('should return the same language for "en"', () => {
    expect(getWhatsAppLang('en')).toBe('en');
  });

  it('should return the same language for "de"', () => {
    expect(getWhatsAppLang('de')).toBe('de');
  });
});

// ============================================================================
// REMINDER CONFIG TESTS
// ============================================================================

describe('getReminderConfig', () => {
  describe('24h reminder', () => {
    it('should return correct config for 24h reminder', () => {
      const config = getReminderConfig('24h');

      expect(config.templateName).toBe('appointment_reminder_24h');
      expect(config.flagProperty).toBe('reminder_24h_sent');
      expect(typeof config.buildParams).toBe('function');
    });

    it('should build correct params for 24h reminder', () => {
      const config = getReminderConfig('24h');
      const contact = createMockContact({
        firstname: 'Maria',
        next_appointment_date: '2025-06-16T14:00:00.000Z',
      });

      const params = config.buildParams(contact, 'ro');

      expect(params).toHaveLength(3);
      expect(params[0]).toEqual({ type: 'text', text: 'Maria' });
      expect(params[1]!.type).toBe('text');
      expect(params[2]!.type).toBe('text');
    });

    it('should use "Pacient" when firstname is missing', () => {
      const config = getReminderConfig('24h');
      const contact = createMockContact({
        firstname: undefined,
        next_appointment_date: '2025-06-16T14:00:00.000Z',
      });

      const params = config.buildParams(contact, 'ro');

      expect(params[0]).toEqual({ type: 'text', text: 'Pacient' });
    });
  });

  describe('2h reminder', () => {
    it('should return correct config for 2h reminder', () => {
      const config = getReminderConfig('2h');

      expect(config.templateName).toBe('appointment_reminder_2h');
      expect(config.flagProperty).toBe('reminder_2h_sent');
      expect(typeof config.buildParams).toBe('function');
    });

    it('should build correct params for 2h reminder', () => {
      const config = getReminderConfig('2h');
      const contact = createMockContact({
        next_appointment_date: '2025-06-16T14:00:00.000Z',
      });

      const params = config.buildParams(contact, 'ro');

      expect(params).toHaveLength(1);
      expect(params[0]!.type).toBe('text');
    });
  });
});

// ============================================================================
// FILTER CONTACTS TESTS
// ============================================================================

describe('filterContactsForReminder', () => {
  const alwaysTrue = () => true;
  const alwaysFalse = () => false;

  it('should filter contacts that pass time check and have not received reminder', () => {
    const contacts = [
      createMockContact({
        reminder_24h_sent: 'false',
        next_appointment_date: '2025-06-16T14:00:00Z',
      }),
      createMockContact({
        reminder_24h_sent: 'true',
        next_appointment_date: '2025-06-16T15:00:00Z',
      }),
    ];

    const result = filterContactsForReminder(contacts, '24h', alwaysTrue);

    expect(result).toHaveLength(1);
    expect(result[0]!.properties.reminder_24h_sent).toBe('false');
  });

  it('should exclude contacts without appointment date', () => {
    const contacts = [
      createMockContact({ next_appointment_date: undefined }),
      createMockContact({ next_appointment_date: '2025-06-16T14:00:00Z' }),
    ];

    const result = filterContactsForReminder(contacts, '24h', alwaysTrue);

    expect(result).toHaveLength(1);
  });

  it('should exclude contacts that already received reminder', () => {
    const contacts = [
      createMockContact({
        reminder_24h_sent: 'true',
        next_appointment_date: '2025-06-16T14:00:00Z',
      }),
      createMockContact({
        reminder_24h_sent: 'true',
        next_appointment_date: '2025-06-16T15:00:00Z',
      }),
    ];

    const result = filterContactsForReminder(contacts, '24h', alwaysTrue);

    expect(result).toHaveLength(0);
  });

  it('should exclude contacts that fail time check', () => {
    const contacts = [
      createMockContact({
        reminder_24h_sent: 'false',
        next_appointment_date: '2025-06-16T14:00:00Z',
      }),
    ];

    const result = filterContactsForReminder(contacts, '24h', alwaysFalse);

    expect(result).toHaveLength(0);
  });

  it('should work with 2h reminder type', () => {
    const contacts = [
      createMockContact({
        reminder_2h_sent: 'false',
        next_appointment_date: '2025-06-16T14:00:00Z',
      }),
      createMockContact({
        reminder_2h_sent: 'true',
        next_appointment_date: '2025-06-16T15:00:00Z',
      }),
    ];

    const result = filterContactsForReminder(contacts, '2h', alwaysTrue);

    expect(result).toHaveLength(1);
    expect(result[0]!.properties.reminder_2h_sent).toBe('false');
  });

  it('should use custom time checker function', () => {
    const contacts = [
      createMockContact({ next_appointment_date: '2025-06-16T14:00:00Z' }),
      createMockContact({ next_appointment_date: '2025-06-17T14:00:00Z' }),
    ];

    const onlyFirstDate = (dateStr: string) => dateStr.includes('06-16');
    const result = filterContactsForReminder(contacts, '24h', onlyFirstDate);

    expect(result).toHaveLength(1);
    expect(result[0]!.properties.next_appointment_date).toContain('06-16');
  });
});

// ============================================================================
// SEND REMINDER TESTS
// ============================================================================

describe('sendAppointmentReminder', () => {
  it('should send WhatsApp template and update HubSpot', async () => {
    const mockWhatsApp = {
      sendTemplate: vi.fn().mockResolvedValue({}),
    };
    const mockHubSpot = {
      updateContact: vi.fn().mockResolvedValue({}),
    };

    const contact = createMockContact({
      phone: '+40722123456',
      hs_language: 'ro',
      next_appointment_date: '2025-06-16T14:00:00.000Z',
    });

    await sendAppointmentReminder(contact, '24h', {
      whatsapp: mockWhatsApp as never,
      hubspot: mockHubSpot as never,
    });

    expect(mockWhatsApp.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+40722123456',
        templateName: 'appointment_reminder_24h',
        language: 'ro',
      })
    );

    expect(mockHubSpot.updateContact).toHaveBeenCalledWith('contact-123', {
      reminder_24h_sent: 'true',
    });
  });

  it('should work without HubSpot client', async () => {
    const mockWhatsApp = {
      sendTemplate: vi.fn().mockResolvedValue({}),
    };

    const contact = createMockContact();

    await sendAppointmentReminder(contact, '24h', {
      whatsapp: mockWhatsApp as never,
      hubspot: null,
    });

    expect(mockWhatsApp.sendTemplate).toHaveBeenCalled();
  });

  it('should use English language when specified', async () => {
    const mockWhatsApp = {
      sendTemplate: vi.fn().mockResolvedValue({}),
    };
    const mockHubSpot = {
      updateContact: vi.fn().mockResolvedValue({}),
    };

    const contact = createMockContact({
      hs_language: 'en',
    });

    await sendAppointmentReminder(contact, '24h', {
      whatsapp: mockWhatsApp as never,
      hubspot: mockHubSpot as never,
    });

    expect(mockWhatsApp.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'en',
      })
    );
  });

  it('should send 2h reminder correctly', async () => {
    const mockWhatsApp = {
      sendTemplate: vi.fn().mockResolvedValue({}),
    };
    const mockHubSpot = {
      updateContact: vi.fn().mockResolvedValue({}),
    };

    const contact = createMockContact();

    await sendAppointmentReminder(contact, '2h', {
      whatsapp: mockWhatsApp as never,
      hubspot: mockHubSpot as never,
    });

    expect(mockWhatsApp.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'appointment_reminder_2h',
      })
    );

    expect(mockHubSpot.updateContact).toHaveBeenCalledWith('contact-123', {
      reminder_2h_sent: 'true',
    });
  });
});
