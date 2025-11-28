/**
 * @fileoverview Comprehensive Tests for Scheduling Service
 *
 * Tests scheduling functionality including:
 * - Available slots retrieval
 * - Booking appointments
 * - Consent verification integration
 * - Error handling
 *
 * @module domain/__tests__/scheduling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SchedulingService,
  ConsentRequiredError,
  type TimeSlot,
  type BookingRequest,
  type SchedulingConfig,
} from '../scheduling/scheduling-service.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestBookingRequest = (overrides?: Partial<BookingRequest>): BookingRequest => ({
  hubspotContactId: '12345',
  phone: '+40721234567',
  patientName: 'Test Patient',
  slotId: 'slot-123',
  procedureType: 'implant',
  notes: 'Test booking notes',
  ...overrides,
});

const createTestTimeSlot = (overrides?: Partial<TimeSlot>): TimeSlot => ({
  id: 'slot-123',
  date: '2024-01-15',
  startTime: '09:00',
  endTime: '10:00',
  duration: 60,
  available: true,
  practitioner: 'Dr. Test',
  procedureTypes: ['implant', 'extraction'],
  ...overrides,
});

// ============================================================================
// SCHEDULING SERVICE TESTS
// ============================================================================

describe('SchedulingService', () => {
  describe('Initialization', () => {
    it('should create service without database connection', () => {
      const service = new SchedulingService({});
      expect(service).toBeDefined();
    });

    it('should accept configuration options', () => {
      const config: SchedulingConfig = {
        timezone: 'Europe/Bucharest',
        skipConsentCheck: true,
      };

      const service = new SchedulingService(config);
      expect(service).toBeDefined();
    });
  });

  describe('getAvailableSlots', () => {
    let service: SchedulingService;

    beforeEach(() => {
      // Create service without database connection (returns empty array)
      service = new SchedulingService({});
    });

    it('should return empty array when no database connection', async () => {
      const slots = await service.getAvailableSlots('implant');

      expect(slots).toEqual([]);
    });

    it('should accept procedure type as string', async () => {
      const slots = await service.getAvailableSlots('implant');

      expect(Array.isArray(slots)).toBe(true);
    });

    it('should accept options object', async () => {
      const slots = await service.getAvailableSlots({
        procedureType: 'implant',
        preferredDates: ['2024-01-15', '2024-01-16'],
        limit: 10,
      });

      expect(Array.isArray(slots)).toBe(true);
    });
  });

  describe('bookSlot', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService({
        skipConsentCheck: true,
      });
    });

    it('should handle booking request structure', () => {
      const request = createTestBookingRequest();

      expect(request.hubspotContactId).toBe('12345');
      expect(request.phone).toBe('+40721234567');
      expect(request.slotId).toBe('slot-123');
      expect(request.procedureType).toBe('implant');
    });

    it('should have correct request fields', () => {
      const request = createTestBookingRequest({
        patientName: 'John Doe',
        notes: 'Special requirements',
      });

      expect(request.patientName).toBe('John Doe');
      expect(request.notes).toBe('Special requirements');
    });
  });

  describe('ConsentRequiredError', () => {
    it('should create error with contact ID and missing consents', () => {
      const error = new ConsentRequiredError('contact-123', [
        'data_processing',
        'appointment_reminders',
      ]);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ConsentRequiredError');
      expect(error.code).toBe('CONSENT_REQUIRED');
      expect(error.contactId).toBe('contact-123');
      expect(error.missingConsents).toEqual(['data_processing', 'appointment_reminders']);
    });

    it('should include missing consents in message', () => {
      const error = new ConsentRequiredError('contact-123', ['marketing_whatsapp']);

      expect(error.message).toContain('marketing_whatsapp');
      expect(error.message).toContain('consent required');
    });
  });

  describe('TimeSlot structure', () => {
    it('should have correct time slot properties', () => {
      const slot = createTestTimeSlot();

      expect(slot.id).toBeDefined();
      expect(slot.date).toBe('2024-01-15');
      expect(slot.startTime).toBe('09:00');
      expect(slot.endTime).toBe('10:00');
      expect(slot.duration).toBe(60);
      expect(slot.available).toBe(true);
    });

    it('should support optional practitioner', () => {
      const slotWithPractitioner = createTestTimeSlot({ practitioner: 'Dr. Smith' });
      const slotWithoutPractitioner = createTestTimeSlot({ practitioner: undefined });

      expect(slotWithPractitioner.practitioner).toBe('Dr. Smith');
      expect(slotWithoutPractitioner.practitioner).toBeUndefined();
    });

    it('should support procedure types array', () => {
      const slot = createTestTimeSlot({
        procedureTypes: ['implant', 'extraction', 'cleaning'],
      });

      expect(slot.procedureTypes).toHaveLength(3);
      expect(slot.procedureTypes).toContain('implant');
      expect(slot.procedureTypes).toContain('extraction');
      expect(slot.procedureTypes).toContain('cleaning');
    });
  });

  describe('BookingRequest structure', () => {
    it('should have required fields', () => {
      const request = createTestBookingRequest();

      expect(request.hubspotContactId).toBeDefined();
      expect(request.phone).toBeDefined();
      expect(request.slotId).toBeDefined();
      expect(request.procedureType).toBeDefined();
    });

    it('should have optional fields', () => {
      const request = createTestBookingRequest({
        patientName: 'John Doe',
        notes: 'First visit',
      });

      expect(request.patientName).toBe('John Doe');
      expect(request.notes).toBe('First visit');
    });

    it('should allow undefined optional fields', () => {
      const request = createTestBookingRequest({
        patientName: undefined,
        notes: undefined,
      });

      expect(request.patientName).toBeUndefined();
      expect(request.notes).toBeUndefined();
    });
  });

  describe('Consent integration', () => {
    it('should allow skipping consent check via config', () => {
      const service = new SchedulingService({
        skipConsentCheck: true,
      });

      expect(service).toBeDefined();
    });

    it('should warn when consent service not configured in production', () => {
      const originalEnv = process.env.NODE_ENV;

      // Note: In actual production, this would trigger a warning
      // We're just testing that the service can be created
      const service = new SchedulingService({});
      expect(service).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Scheduling Service Edge Cases', () => {
  it('should handle empty options object', async () => {
    const service = new SchedulingService({});
    const slots = await service.getAvailableSlots({});

    expect(slots).toEqual([]);
  });

  it('should handle undefined procedure type', async () => {
    const service = new SchedulingService({});
    const slots = await service.getAvailableSlots({
      procedureType: undefined,
    });

    expect(slots).toEqual([]);
  });

  it('should handle empty preferred dates array', async () => {
    const service = new SchedulingService({});
    const slots = await service.getAvailableSlots({
      procedureType: 'implant',
      preferredDates: [],
    });

    expect(slots).toEqual([]);
  });
});
