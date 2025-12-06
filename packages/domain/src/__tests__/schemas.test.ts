/**
 * Zod Validation Schemas Tests
 * Tests for domain validation schemas and helper functions
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  ContactIdSchema,
  PhoneNumberSchema,
  EmailSchema,
  ISODateStringSchema,
  SupportedLanguageSchema,
  ConsentTypeSchema,
  ConsentStatusSchema,
  ConsentChannelSchema,
  ConsentMethodSchema,
  ConsentSourceSchema,
  ConsentRequestSchema,
  LeadChannelSchema,
  MessageHistoryEntrySchema,
  UTMParametersSchema,
  AIScoringContextSchema,
  LeadScoreClassificationSchema,
  TriageInputSchema,
  TimeSlotSchema,
  DateStringSchema,
  ProcedureTypeSchema,
  AppointmentSlotSchema,
  BookAppointmentRequestSchema,
  AvailableSlotsRequestSchema,
  LanguageDetectionRequestSchema,
  TranslationRequestSchema,
  validateWithResult,
  withValidation,
} from '../shared/schemas.js';

describe('ContactIdSchema', () => {
  it('should accept valid numeric ID', () => {
    expect(ContactIdSchema.parse('123456')).toBe('123456');
  });

  it('should reject empty string', () => {
    expect(() => ContactIdSchema.parse('')).toThrow();
  });

  it('should reject non-numeric string', () => {
    expect(() => ContactIdSchema.parse('abc')).toThrow(/numeric/);
  });
});

describe('PhoneNumberSchema', () => {
  it('should accept valid phone numbers', () => {
    expect(PhoneNumberSchema.parse('+40712345678')).toBe('+40712345678');
    expect(PhoneNumberSchema.parse('0712345678')).toBe('0712345678');
    expect(PhoneNumberSchema.parse('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
  });

  it('should reject too short phone', () => {
    expect(() => PhoneNumberSchema.parse('12345')).toThrow(/short/);
  });

  it('should reject invalid characters', () => {
    expect(() => PhoneNumberSchema.parse('abc12345678')).toThrow(/Invalid/);
  });
});

describe('EmailSchema', () => {
  it('should accept valid email', () => {
    expect(EmailSchema.parse('test@example.com')).toBe('test@example.com');
  });

  it('should reject invalid email', () => {
    expect(() => EmailSchema.parse('not-an-email')).toThrow();
  });
});

describe('ISODateStringSchema', () => {
  it('should accept valid ISO date', () => {
    expect(ISODateStringSchema.parse('2024-01-15T10:30:00.000Z')).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should reject invalid date', () => {
    expect(() => ISODateStringSchema.parse('2024-01-15')).toThrow(/ISO/);
  });
});

describe('SupportedLanguageSchema', () => {
  it('should accept supported languages', () => {
    expect(SupportedLanguageSchema.parse('ro')).toBe('ro');
    expect(SupportedLanguageSchema.parse('en')).toBe('en');
    expect(SupportedLanguageSchema.parse('de')).toBe('de');
  });

  it('should reject unsupported language', () => {
    expect(() => SupportedLanguageSchema.parse('fr')).toThrow(/Unsupported/);
  });
});

describe('ConsentTypeSchema', () => {
  it('should accept valid consent types', () => {
    expect(ConsentTypeSchema.parse('data_processing')).toBe('data_processing');
    expect(ConsentTypeSchema.parse('marketing_whatsapp')).toBe('marketing_whatsapp');
    expect(ConsentTypeSchema.parse('appointment_reminders')).toBe('appointment_reminders');
  });

  it('should reject invalid consent type', () => {
    expect(() => ConsentTypeSchema.parse('invalid')).toThrow(/Invalid consent type/);
  });
});

describe('ConsentStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(ConsentStatusSchema.parse('granted')).toBe('granted');
    expect(ConsentStatusSchema.parse('denied')).toBe('denied');
    expect(ConsentStatusSchema.parse('withdrawn')).toBe('withdrawn');
  });

  it('should reject invalid status', () => {
    expect(() => ConsentStatusSchema.parse('approved')).toThrow(/Invalid consent status/);
  });
});

describe('ConsentChannelSchema', () => {
  it('should accept valid channels', () => {
    expect(ConsentChannelSchema.parse('whatsapp')).toBe('whatsapp');
    expect(ConsentChannelSchema.parse('web')).toBe('web');
  });

  it('should reject invalid channel', () => {
    expect(() => ConsentChannelSchema.parse('facebook')).toThrow(/Invalid consent channel/);
  });
});

describe('ConsentMethodSchema', () => {
  it('should accept valid methods', () => {
    expect(ConsentMethodSchema.parse('explicit')).toBe('explicit');
    expect(ConsentMethodSchema.parse('double_opt_in')).toBe('double_opt_in');
  });

  it('should reject invalid method', () => {
    expect(() => ConsentMethodSchema.parse('auto')).toThrow(/Invalid consent method/);
  });
});

describe('ConsentSourceSchema', () => {
  it('should accept valid source', () => {
    const source = {
      channel: 'whatsapp',
      method: 'explicit',
      evidenceUrl: 'https://example.com/evidence',
      witnessedBy: null,
    };
    expect(ConsentSourceSchema.parse(source)).toEqual(source);
  });

  it('should reject invalid source', () => {
    expect(() => ConsentSourceSchema.parse({ channel: 'invalid' })).toThrow();
  });
});

describe('ConsentRequestSchema', () => {
  it('should accept valid request', () => {
    const request = {
      contactId: '123',
      phone: '+40712345678',
      consentType: 'data_processing',
      status: 'granted',
      source: {
        channel: 'whatsapp',
        method: 'explicit',
        evidenceUrl: null,
        witnessedBy: null,
      },
    };
    expect(ConsentRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should accept optional fields', () => {
    const request = {
      contactId: '123',
      phone: '+40712345678',
      consentType: 'marketing_email',
      status: 'granted',
      source: {
        channel: 'web',
        method: 'double_opt_in',
        evidenceUrl: 'https://example.com',
        witnessedBy: 'admin',
      },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      expiresInDays: 365,
      metadata: { campaign: 'summer2024' },
    };
    expect(ConsentRequestSchema.parse(request)).toMatchObject(request);
  });
});

describe('LeadChannelSchema', () => {
  it('should accept valid lead channels', () => {
    expect(LeadChannelSchema.parse('whatsapp')).toBe('whatsapp');
    expect(LeadChannelSchema.parse('voice')).toBe('voice');
    expect(LeadChannelSchema.parse('email')).toBe('email');
  });

  it('should reject invalid channel', () => {
    expect(() => LeadChannelSchema.parse('sms')).toThrow(/Invalid lead channel/);
  });
});

describe('MessageHistoryEntrySchema', () => {
  it('should accept valid entry', () => {
    const entry = {
      role: 'user',
      content: 'Hello, I need help',
      timestamp: '2024-01-15T10:30:00.000Z',
    };
    expect(MessageHistoryEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should reject empty content', () => {
    expect(() =>
      MessageHistoryEntrySchema.parse({
        role: 'user',
        content: '',
      })
    ).toThrow(/empty/);
  });
});

describe('UTMParametersSchema', () => {
  it('should accept valid UTM parameters', () => {
    const utm = {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'spring2024',
    };
    expect(UTMParametersSchema.parse(utm)).toEqual(utm);
  });

  it('should accept empty object', () => {
    expect(UTMParametersSchema.parse({})).toEqual({});
  });
});

describe('AIScoringContextSchema', () => {
  it('should accept valid context', () => {
    const context = {
      messageHistory: [{ role: 'user', content: 'Hello' }],
      channel: 'whatsapp',
    };
    expect(AIScoringContextSchema.parse(context)).toMatchObject(context);
  });

  it('should require at least one message', () => {
    expect(() =>
      AIScoringContextSchema.parse({
        messageHistory: [],
        channel: 'whatsapp',
      })
    ).toThrow(/At least one message/);
  });
});

describe('LeadScoreClassificationSchema', () => {
  it('should accept valid classifications', () => {
    expect(LeadScoreClassificationSchema.parse('HOT')).toBe('HOT');
    expect(LeadScoreClassificationSchema.parse('WARM')).toBe('WARM');
    expect(LeadScoreClassificationSchema.parse('COLD')).toBe('COLD');
    expect(LeadScoreClassificationSchema.parse('UNQUALIFIED')).toBe('UNQUALIFIED');
  });

  it('should reject invalid classification', () => {
    expect(() => LeadScoreClassificationSchema.parse('MEDIUM')).toThrow();
  });
});

describe('TriageInputSchema', () => {
  it('should accept valid triage input', () => {
    const input = {
      leadScore: 'HOT',
      channel: 'whatsapp',
      messageContent: 'I want to book an appointment',
      hasExistingRelationship: false,
    };
    expect(TriageInputSchema.parse(input)).toMatchObject(input);
  });

  it('should accept optional fields', () => {
    const input = {
      leadScore: 'WARM',
      channel: 'voice',
      messageContent: 'Calling about implants',
      hasExistingRelationship: true,
      procedureInterest: ['implant', 'consultation'],
      previousAppointments: 2,
      lastContactDays: 30,
    };
    expect(TriageInputSchema.parse(input)).toMatchObject(input);
  });
});

describe('TimeSlotSchema', () => {
  it('should accept valid time', () => {
    expect(TimeSlotSchema.parse('09:30')).toBe('09:30');
    expect(TimeSlotSchema.parse('14:00')).toBe('14:00');
    expect(TimeSlotSchema.parse('23:59')).toBe('23:59');
  });

  it('should reject invalid time', () => {
    expect(() => TimeSlotSchema.parse('25:00')).toThrow(/HH:MM/);
    expect(() => TimeSlotSchema.parse('9:30')).toThrow(/HH:MM/);
  });
});

describe('DateStringSchema', () => {
  it('should accept valid date', () => {
    expect(DateStringSchema.parse('2024-01-15')).toBe('2024-01-15');
  });

  it('should reject invalid format', () => {
    expect(() => DateStringSchema.parse('01/15/2024')).toThrow(/YYYY-MM-DD/);
    expect(() => DateStringSchema.parse('2024-1-15')).toThrow(/YYYY-MM-DD/);
  });
});

describe('ProcedureTypeSchema', () => {
  it('should accept valid procedures', () => {
    expect(ProcedureTypeSchema.parse('consultation')).toBe('consultation');
    expect(ProcedureTypeSchema.parse('implant')).toBe('implant');
    expect(ProcedureTypeSchema.parse('cleaning')).toBe('cleaning');
  });

  it('should reject invalid procedure', () => {
    expect(() => ProcedureTypeSchema.parse('surgery')).toThrow(/Invalid procedure type/);
  });
});

describe('AppointmentSlotSchema', () => {
  it('should accept valid slot', () => {
    const slot = {
      id: 'slot-123',
      date: '2024-01-15',
      startTime: '09:00',
      endTime: '09:30',
      duration: 30,
    };
    expect(AppointmentSlotSchema.parse(slot)).toEqual(slot);
  });

  it('should require positive duration', () => {
    expect(() =>
      AppointmentSlotSchema.parse({
        id: 'slot-123',
        date: '2024-01-15',
        startTime: '09:00',
        endTime: '09:30',
        duration: 0,
      })
    ).toThrow();
  });
});

describe('BookAppointmentRequestSchema', () => {
  it('should accept valid request', () => {
    const request = {
      contactId: '123',
      phone: '+40712345678',
      patientName: 'John Doe',
      slotId: 'slot-123',
      procedureType: 'consultation',
    };
    expect(BookAppointmentRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should accept optional fields', () => {
    const request = {
      contactId: '123',
      phone: '+40712345678',
      patientName: 'Jane Doe',
      slotId: 'slot-456',
      procedureType: 'implant',
      notes: 'First consultation',
      skipConsentCheck: true,
    };
    expect(BookAppointmentRequestSchema.parse(request)).toMatchObject(request);
  });
});

describe('AvailableSlotsRequestSchema', () => {
  it('should accept valid request', () => {
    const request = {
      procedureType: 'consultation',
      preferredDates: ['2024-01-15', '2024-01-16'],
    };
    expect(AvailableSlotsRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should accept optional time range', () => {
    const request = {
      procedureType: 'implant',
      preferredDates: ['2024-01-15'],
      preferredTimeRange: {
        start: '09:00',
        end: '17:00',
      },
      limit: 10,
    };
    expect(AvailableSlotsRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should require at least one date', () => {
    expect(() =>
      AvailableSlotsRequestSchema.parse({
        procedureType: 'consultation',
        preferredDates: [],
      })
    ).toThrow(/At least one date/);
  });
});

describe('LanguageDetectionRequestSchema', () => {
  it('should accept valid request', () => {
    const request = {
      text: 'Bună ziua, aș dori o programare',
    };
    expect(LanguageDetectionRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should accept optional fields', () => {
    const request = {
      text: 'Hello, I need an appointment',
      contactId: '123',
      setAsPreferred: true,
    };
    expect(LanguageDetectionRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should require text', () => {
    expect(() =>
      LanguageDetectionRequestSchema.parse({
        text: '',
      })
    ).toThrow(/required/);
  });
});

describe('TranslationRequestSchema', () => {
  it('should accept valid request', () => {
    const request = {
      text: 'Hello',
      fromLanguage: 'en',
      toLanguage: 'ro',
    };
    expect(TranslationRequestSchema.parse(request)).toMatchObject(request);
  });

  it('should accept optional context', () => {
    const request = {
      text: 'Appointment confirmed',
      fromLanguage: 'en',
      toLanguage: 'de',
      context: 'appointment',
    };
    expect(TranslationRequestSchema.parse(request)).toMatchObject(request);
  });
});

describe('validateWithResult', () => {
  it('should return success for valid data', () => {
    const result = validateWithResult(EmailSchema, 'test@example.com');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('test@example.com');
    }
  });

  it('should return failure for invalid data', () => {
    const result = validateWithResult(EmailSchema, 'not-an-email');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ZodError);
    }
  });

  it('should work with complex schemas', () => {
    const validRequest = {
      contactId: '123',
      phone: '+40712345678',
      consentType: 'data_processing',
      status: 'granted',
      source: {
        channel: 'whatsapp',
        method: 'explicit',
        evidenceUrl: null,
        witnessedBy: null,
      },
    };

    const result = validateWithResult(ConsentRequestSchema, validRequest);
    expect(result.success).toBe(true);
  });

  it('should provide detailed error for invalid data', () => {
    const invalidRequest = {
      contactId: '',
      phone: '123',
      consentType: 'invalid',
      status: 'approved',
    };

    const result = validateWithResult(ConsentRequestSchema, invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('withValidation', () => {
  it('should call function with validated input', () => {
    const mockFn = (input: string) => `Email: ${input}`;
    const validated = withValidation(EmailSchema, mockFn);

    const result = validated('test@example.com');
    expect(result).toBe('Email: test@example.com');
  });

  it('should throw ZodError for invalid input', () => {
    const mockFn = (input: string) => input;
    const validated = withValidation(EmailSchema, mockFn);

    expect(() => validated('not-an-email')).toThrow(ZodError);
  });

  it('should work with complex schemas', () => {
    const processMessage = (entry: { role: string; content: string }) =>
      `${entry.role}: ${entry.content}`;

    const validated = withValidation(MessageHistoryEntrySchema, processMessage);

    const result = validated({ role: 'user', content: 'Hello' });
    expect(result).toBe('user: Hello');
  });

  it('should throw for missing required fields', () => {
    const process = (input: { text: string }) => input.text;
    const validated = withValidation(LanguageDetectionRequestSchema, process);

    expect(() => validated({})).toThrow(ZodError);
  });

  it('should work with async functions', async () => {
    const asyncFn = async (email: string) => {
      return { valid: true, email };
    };

    const validated = withValidation(EmailSchema, asyncFn);
    const result = await validated('test@example.com');

    expect(result).toEqual({ valid: true, email: 'test@example.com' });
  });
});
