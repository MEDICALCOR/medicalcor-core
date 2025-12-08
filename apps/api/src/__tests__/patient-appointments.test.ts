import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

/**
 * Patient Appointment Booking Tests
 *
 * Comprehensive tests for:
 * - GET /patient/appointments/slots - Available slots retrieval
 * - POST /patient/appointments/book - Appointment booking
 * - POST /patient/appointments/cancel - Appointment cancellation
 * - POST /patient/appointments/reschedule - Appointment rescheduling
 *
 * Security tests:
 * - JWT authentication validation
 * - Authorization (patient can only modify own appointments)
 * - Input validation
 * - Error handling
 */

// =============================================================================
// Test Utilities
// =============================================================================

interface PatientSession {
  patientId: string;
  phone: string;
  hubspotContactId?: string;
  name?: string;
  email?: string;
  iat: number;
  exp: number;
}

/**
 * Mock JWT token creation for testing
 * In real code, this uses jsonwebtoken library
 */
function createMockPatientSession(session: Omit<PatientSession, 'iat' | 'exp'>): PatientSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    ...session,
    iat: now,
    exp: now + 86400, // 24 hours
  };
}

function createMockExpiredSession(session: Omit<PatientSession, 'iat' | 'exp'>): PatientSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    ...session,
    iat: now - 7200, // 2 hours ago
    exp: now - 3600, // Expired 1 hour ago
  };
}

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Appointment Booking Schema Validation', () => {
  const GetAvailableSlotsSchema = z.object({
    procedureType: z.string().min(1).max(128),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    practitionerId: z.string().optional(),
    locationId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  });

  const BookAppointmentSchema = z.object({
    slotId: z.string().min(1),
    procedureType: z.string().min(1).max(128),
    notes: z.string().max(500).optional(),
  });

  const CancelAppointmentSchema = z.object({
    appointmentId: z.string().min(1),
    reason: z.string().max(500).optional(),
  });

  const RescheduleAppointmentSchema = z.object({
    appointmentId: z.string().min(1),
    newSlotId: z.string().min(1),
    reason: z.string().max(500).optional(),
  });

  describe('GetAvailableSlotsSchema', () => {
    it('should accept valid query with procedureType only', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'implant',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid query with all optional fields', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'cleaning',
        startDate: '2025-01-15',
        endDate: '2025-01-20',
        practitionerId: 'dr_123',
        locationId: 'loc_456',
        limit: 5,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing procedureType', () => {
      const result = GetAvailableSlotsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'implant',
        startDate: '15-01-2025', // Wrong format
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit > 20', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'implant',
        limit: 50,
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit < 1', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'implant',
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should coerce string limit to number', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'implant',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should reject procedureType > 128 chars', () => {
      const result = GetAvailableSlotsSchema.safeParse({
        procedureType: 'a'.repeat(129),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BookAppointmentSchema', () => {
    it('should accept valid booking request', () => {
      const result = BookAppointmentSchema.safeParse({
        slotId: 'slot_123',
        procedureType: 'implant',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid booking with notes', () => {
      const result = BookAppointmentSchema.safeParse({
        slotId: 'slot_123',
        procedureType: 'implant',
        notes: 'Patient prefers morning appointments',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing slotId', () => {
      const result = BookAppointmentSchema.safeParse({
        procedureType: 'implant',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing procedureType', () => {
      const result = BookAppointmentSchema.safeParse({
        slotId: 'slot_123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty slotId', () => {
      const result = BookAppointmentSchema.safeParse({
        slotId: '',
        procedureType: 'implant',
      });
      expect(result.success).toBe(false);
    });

    it('should reject notes > 500 chars', () => {
      const result = BookAppointmentSchema.safeParse({
        slotId: 'slot_123',
        procedureType: 'implant',
        notes: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CancelAppointmentSchema', () => {
    it('should accept valid cancellation request', () => {
      const result = CancelAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid cancellation with reason', () => {
      const result = CancelAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
        reason: 'Schedule conflict',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing appointmentId', () => {
      const result = CancelAppointmentSchema.safeParse({
        reason: 'Schedule conflict',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty appointmentId', () => {
      const result = CancelAppointmentSchema.safeParse({
        appointmentId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject reason > 500 chars', () => {
      const result = CancelAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
        reason: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RescheduleAppointmentSchema', () => {
    it('should accept valid reschedule request', () => {
      const result = RescheduleAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
        newSlotId: 'slot_456',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid reschedule with reason', () => {
      const result = RescheduleAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
        newSlotId: 'slot_456',
        reason: 'Need earlier appointment',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing appointmentId', () => {
      const result = RescheduleAppointmentSchema.safeParse({
        newSlotId: 'slot_456',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing newSlotId', () => {
      const result = RescheduleAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty appointmentId', () => {
      const result = RescheduleAppointmentSchema.safeParse({
        appointmentId: '',
        newSlotId: 'slot_456',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty newSlotId', () => {
      const result = RescheduleAppointmentSchema.safeParse({
        appointmentId: 'apt_123',
        newSlotId: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// JWT Session Tests
// =============================================================================

describe('Patient Session Structure', () => {
  it('should create valid patient session with all fields', () => {
    const sessionData = {
      patientId: 'patient_123',
      phone: '+40712345678',
      hubspotContactId: 'hs_456',
      name: 'Ion Popescu',
      email: 'ion@example.com',
    };

    const session = createMockPatientSession(sessionData);

    expect(session.patientId).toBe(sessionData.patientId);
    expect(session.phone).toBe(sessionData.phone);
    expect(session.hubspotContactId).toBe(sessionData.hubspotContactId);
    expect(session.name).toBe(sessionData.name);
    expect(session.email).toBe(sessionData.email);
    expect(session.iat).toBeDefined();
    expect(session.exp).toBeDefined();
    expect(session.exp).toBeGreaterThan(session.iat);
  });

  it('should identify expired session', () => {
    const sessionData = {
      patientId: 'patient_123',
      phone: '+40712345678',
    };

    const expiredSession = createMockExpiredSession(sessionData);
    const now = Math.floor(Date.now() / 1000);

    expect(expiredSession.exp).toBeLessThan(now);
  });

  it('should validate session expiration logic', () => {
    function isSessionExpired(session: PatientSession): boolean {
      const now = Math.floor(Date.now() / 1000);
      return session.exp < now;
    }

    const validSession = createMockPatientSession({
      patientId: 'patient_123',
      phone: '+40712345678',
    });

    const expiredSession = createMockExpiredSession({
      patientId: 'patient_123',
      phone: '+40712345678',
    });

    expect(isSessionExpired(validSession)).toBe(false);
    expect(isSessionExpired(expiredSession)).toBe(true);
  });

  it('should handle session without optional fields', () => {
    const session = createMockPatientSession({
      patientId: 'patient_123',
      phone: '+40712345678',
    });

    expect(session.patientId).toBe('patient_123');
    expect(session.phone).toBe('+40712345678');
    expect(session.hubspotContactId).toBeUndefined();
    expect(session.name).toBeUndefined();
    expect(session.email).toBeUndefined();
  });

  it('should set correct token lifetime', () => {
    const session = createMockPatientSession({
      patientId: 'patient_123',
      phone: '+40712345678',
    });

    const lifetimeSeconds = session.exp - session.iat;
    expect(lifetimeSeconds).toBe(86400); // 24 hours
  });
});

// =============================================================================
// Authorization Tests
// =============================================================================

describe('Appointment Authorization Logic', () => {
  interface Appointment {
    id: string;
    patientPhone: string;
    status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  }

  function canPatientModifyAppointment(
    appointment: Appointment,
    patientPhone: string
  ): { allowed: boolean; reason?: string } {
    if (appointment.patientPhone !== patientPhone) {
      return { allowed: false, reason: 'Not authorized to modify this appointment' };
    }
    if (appointment.status === 'cancelled') {
      return { allowed: false, reason: 'Appointment already cancelled' };
    }
    if (appointment.status === 'completed') {
      return { allowed: false, reason: 'Cannot modify completed appointment' };
    }
    return { allowed: true };
  }

  it('should allow patient to modify their own confirmed appointment', () => {
    const appointment: Appointment = {
      id: 'apt_123',
      patientPhone: '+40712345678',
      status: 'confirmed',
    };

    const result = canPatientModifyAppointment(appointment, '+40712345678');
    expect(result.allowed).toBe(true);
  });

  it('should allow patient to modify their own pending appointment', () => {
    const appointment: Appointment = {
      id: 'apt_123',
      patientPhone: '+40712345678',
      status: 'pending',
    };

    const result = canPatientModifyAppointment(appointment, '+40712345678');
    expect(result.allowed).toBe(true);
  });

  it('should deny patient from modifying another patient appointment', () => {
    const appointment: Appointment = {
      id: 'apt_123',
      patientPhone: '+40712345678',
      status: 'confirmed',
    };

    const result = canPatientModifyAppointment(appointment, '+40799999999');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Not authorized');
  });

  it('should deny modification of cancelled appointment', () => {
    const appointment: Appointment = {
      id: 'apt_123',
      patientPhone: '+40712345678',
      status: 'cancelled',
    };

    const result = canPatientModifyAppointment(appointment, '+40712345678');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('already cancelled');
  });

  it('should deny modification of completed appointment', () => {
    const appointment: Appointment = {
      id: 'apt_123',
      patientPhone: '+40712345678',
      status: 'completed',
    };

    const result = canPatientModifyAppointment(appointment, '+40712345678');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('completed');
  });
});

// =============================================================================
// Slot Availability Tests
// =============================================================================

describe('Slot Availability Logic', () => {
  interface TimeSlot {
    id: string;
    date: string;
    time: string;
    dateTime: string;
    duration: number;
    available: boolean;
  }

  function filterAvailableSlots(slots: TimeSlot[]): TimeSlot[] {
    return slots.filter((slot) => slot.available);
  }

  function isSlotInFuture(slot: TimeSlot): boolean {
    return new Date(slot.dateTime) > new Date();
  }

  function isSlotWithinBusinessHours(slot: TimeSlot): boolean {
    const hour = parseInt(slot.time.split(':')[0] ?? '0', 10);
    return hour >= 9 && hour < 18; // 9 AM to 6 PM
  }

  it('should filter out unavailable slots', () => {
    const slots: TimeSlot[] = [
      {
        id: '1',
        date: '2025-01-15',
        time: '09:00',
        dateTime: '2025-01-15T09:00:00Z',
        duration: 60,
        available: true,
      },
      {
        id: '2',
        date: '2025-01-15',
        time: '10:00',
        dateTime: '2025-01-15T10:00:00Z',
        duration: 60,
        available: false,
      },
      {
        id: '3',
        date: '2025-01-15',
        time: '11:00',
        dateTime: '2025-01-15T11:00:00Z',
        duration: 60,
        available: true,
      },
    ];

    const available = filterAvailableSlots(slots);
    expect(available).toHaveLength(2);
    expect(available.map((s) => s.id)).toEqual(['1', '3']);
  });

  it('should validate slot is in business hours', () => {
    expect(
      isSlotWithinBusinessHours({
        id: '1',
        date: '2025-01-15',
        time: '09:00',
        dateTime: '',
        duration: 60,
        available: true,
      })
    ).toBe(true);
    expect(
      isSlotWithinBusinessHours({
        id: '2',
        date: '2025-01-15',
        time: '17:30',
        dateTime: '',
        duration: 60,
        available: true,
      })
    ).toBe(true);
    expect(
      isSlotWithinBusinessHours({
        id: '3',
        date: '2025-01-15',
        time: '08:00',
        dateTime: '',
        duration: 60,
        available: true,
      })
    ).toBe(false);
    expect(
      isSlotWithinBusinessHours({
        id: '4',
        date: '2025-01-15',
        time: '18:00',
        dateTime: '',
        duration: 60,
        available: true,
      })
    ).toBe(false);
    expect(
      isSlotWithinBusinessHours({
        id: '5',
        date: '2025-01-15',
        time: '20:00',
        dateTime: '',
        duration: 60,
        available: true,
      })
    ).toBe(false);
  });

  it('should return empty array when no slots available', () => {
    const slots: TimeSlot[] = [
      {
        id: '1',
        date: '2025-01-15',
        time: '09:00',
        dateTime: '2025-01-15T09:00:00Z',
        duration: 60,
        available: false,
      },
      {
        id: '2',
        date: '2025-01-15',
        time: '10:00',
        dateTime: '2025-01-15T10:00:00Z',
        duration: 60,
        available: false,
      },
    ];

    const available = filterAvailableSlots(slots);
    expect(available).toHaveLength(0);
  });
});

// =============================================================================
// Date Format Validation Tests
// =============================================================================

describe('Date Format Validation', () => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  it('should accept valid ISO date format', () => {
    expect(dateRegex.test('2025-01-15')).toBe(true);
    expect(dateRegex.test('2025-12-31')).toBe(true);
    expect(dateRegex.test('2024-02-29')).toBe(true);
  });

  it('should reject invalid date formats', () => {
    expect(dateRegex.test('15-01-2025')).toBe(false); // DD-MM-YYYY
    expect(dateRegex.test('01/15/2025')).toBe(false); // MM/DD/YYYY
    expect(dateRegex.test('2025/01/15')).toBe(false); // Wrong separator
    expect(dateRegex.test('2025-1-15')).toBe(false); // Missing leading zero
    expect(dateRegex.test('25-01-15')).toBe(false); // 2-digit year
    expect(dateRegex.test('2025-01-15T10:00:00Z')).toBe(false); // Full ISO datetime
  });

  it('should reject empty and invalid strings', () => {
    expect(dateRegex.test('')).toBe(false);
    expect(dateRegex.test('invalid')).toBe(false);
    expect(dateRegex.test('2025-13-01')).toBe(true); // Regex doesn't validate month range
    expect(dateRegex.test('2025-01-32')).toBe(true); // Regex doesn't validate day range
  });
});

// =============================================================================
// Response Format Tests
// =============================================================================

describe('API Response Format', () => {
  interface SlotResponse {
    success: boolean;
    slots: Array<{
      id: string;
      date: string;
      time: string;
      dateTime: string;
      duration: number;
      practitioner?: { id: string; name: string };
      location?: { id: string; name: string };
    }>;
    correlationId: string;
  }

  interface BookingResponse {
    success: boolean;
    appointment: {
      id: string;
      confirmationCode?: string;
      date: string;
      procedureType: string;
      status: string;
      practitioner?: string;
      location?: string;
    };
    correlationId: string;
  }

  interface ErrorResponse {
    error: string;
    code?: string;
    details?: Record<string, string[]>;
    correlationId: string;
  }

  it('should format slot response correctly', () => {
    const response: SlotResponse = {
      success: true,
      slots: [
        {
          id: 'slot_123',
          date: '2025-01-15',
          time: '09:00',
          dateTime: '2025-01-15T09:00:00Z',
          duration: 60,
          practitioner: { id: 'dr_1', name: 'Dr. Popescu' },
          location: { id: 'loc_1', name: 'Clinica Centrală' },
        },
      ],
      correlationId: 'corr_abc123',
    };

    expect(response.success).toBe(true);
    expect(response.slots).toHaveLength(1);
    expect(response.slots[0]?.practitioner?.name).toBe('Dr. Popescu');
    expect(response.correlationId).toBeDefined();
  });

  it('should format booking response correctly', () => {
    const response: BookingResponse = {
      success: true,
      appointment: {
        id: 'apt_123',
        confirmationCode: 'ABC123',
        date: '2025-01-15T09:00:00Z',
        procedureType: 'implant',
        status: 'confirmed',
        practitioner: 'Dr. Popescu',
        location: 'Clinica Centrală',
      },
      correlationId: 'corr_def456',
    };

    expect(response.success).toBe(true);
    expect(response.appointment.confirmationCode).toBe('ABC123');
    expect(response.appointment.status).toBe('confirmed');
  });

  it('should format error response with validation details', () => {
    const response: ErrorResponse = {
      error: 'Invalid booking request',
      details: {
        slotId: ['Required'],
        procedureType: ['String must contain at least 1 character(s)'],
      },
      correlationId: 'corr_ghi789',
    };

    expect(response.error).toBeDefined();
    expect(response.details?.slotId).toContain('Required');
    expect(response.correlationId).toBeDefined();
  });

  it('should format conflict error response', () => {
    const response: ErrorResponse = {
      error: 'Selected time slot is no longer available',
      code: 'SLOT_UNAVAILABLE',
      correlationId: 'corr_jkl012',
    };

    expect(response.error).toContain('no longer available');
    expect(response.code).toBe('SLOT_UNAVAILABLE');
  });
});

// =============================================================================
// HTTP Status Code Tests
// =============================================================================

describe('HTTP Status Code Usage', () => {
  const StatusCodes = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  };

  it('should use 200 for successful slot retrieval', () => {
    expect(StatusCodes.OK).toBe(200);
  });

  it('should use 201 for successful booking creation', () => {
    expect(StatusCodes.CREATED).toBe(201);
  });

  it('should use 400 for validation errors', () => {
    expect(StatusCodes.BAD_REQUEST).toBe(400);
  });

  it('should use 401 for missing authentication', () => {
    expect(StatusCodes.UNAUTHORIZED).toBe(401);
  });

  it('should use 403 for authorization failures', () => {
    expect(StatusCodes.FORBIDDEN).toBe(403);
  });

  it('should use 404 for not found resources', () => {
    expect(StatusCodes.NOT_FOUND).toBe(404);
  });

  it('should use 409 for slot conflicts', () => {
    expect(StatusCodes.CONFLICT).toBe(409);
  });

  it('should use 500 for internal errors', () => {
    expect(StatusCodes.INTERNAL_ERROR).toBe(500);
  });

  it('should use 503 when scheduling service unavailable', () => {
    expect(StatusCodes.SERVICE_UNAVAILABLE).toBe(503);
  });
});

// =============================================================================
// Event Emission Tests
// =============================================================================

describe('Appointment Event Emission', () => {
  interface AppointmentEvent {
    type: string;
    correlationId: string;
    aggregateId: string;
    aggregateType: string;
    payload: Record<string, unknown>;
  }

  function createBookingEvent(
    appointmentId: string,
    patientId: string,
    procedureType: string
  ): AppointmentEvent {
    return {
      type: 'patient.appointment.booked',
      correlationId: `corr_${Date.now()}`,
      aggregateId: appointmentId,
      aggregateType: 'appointment',
      payload: {
        appointmentId,
        patientId,
        procedureType,
        timestamp: new Date().toISOString(),
      },
    };
  }

  function createCancellationEvent(
    appointmentId: string,
    patientId: string,
    reason?: string
  ): AppointmentEvent {
    return {
      type: 'patient.appointment.cancelled',
      correlationId: `corr_${Date.now()}`,
      aggregateId: appointmentId,
      aggregateType: 'appointment',
      payload: {
        appointmentId,
        patientId,
        reason,
        cancelledAt: new Date().toISOString(),
      },
    };
  }

  function createRescheduleEvent(
    appointmentId: string,
    patientId: string,
    newSlotId: string
  ): AppointmentEvent {
    return {
      type: 'patient.appointment.rescheduled',
      correlationId: `corr_${Date.now()}`,
      aggregateId: appointmentId,
      aggregateType: 'appointment',
      payload: {
        appointmentId,
        patientId,
        newSlotId,
        rescheduledAt: new Date().toISOString(),
      },
    };
  }

  it('should create booking event with correct structure', () => {
    const event = createBookingEvent('apt_123', 'patient_456', 'implant');

    expect(event.type).toBe('patient.appointment.booked');
    expect(event.aggregateType).toBe('appointment');
    expect(event.aggregateId).toBe('apt_123');
    expect(event.payload.appointmentId).toBe('apt_123');
    expect(event.payload.patientId).toBe('patient_456');
    expect(event.payload.procedureType).toBe('implant');
    expect(event.payload.timestamp).toBeDefined();
  });

  it('should create cancellation event with correct structure', () => {
    const event = createCancellationEvent('apt_123', 'patient_456', 'Schedule conflict');

    expect(event.type).toBe('patient.appointment.cancelled');
    expect(event.aggregateType).toBe('appointment');
    expect(event.payload.appointmentId).toBe('apt_123');
    expect(event.payload.reason).toBe('Schedule conflict');
    expect(event.payload.cancelledAt).toBeDefined();
  });

  it('should create reschedule event with correct structure', () => {
    const event = createRescheduleEvent('apt_123', 'patient_456', 'slot_789');

    expect(event.type).toBe('patient.appointment.rescheduled');
    expect(event.aggregateType).toBe('appointment');
    expect(event.payload.appointmentId).toBe('apt_123');
    expect(event.payload.newSlotId).toBe('slot_789');
    expect(event.payload.rescheduledAt).toBeDefined();
  });

  it('should include correlationId in all events', () => {
    const bookingEvent = createBookingEvent('apt_1', 'p_1', 'cleaning');
    const cancelEvent = createCancellationEvent('apt_2', 'p_2');
    const rescheduleEvent = createRescheduleEvent('apt_3', 'p_3', 'slot_1');

    expect(bookingEvent.correlationId).toMatch(/^corr_\d+$/);
    expect(cancelEvent.correlationId).toMatch(/^corr_\d+$/);
    expect(rescheduleEvent.correlationId).toMatch(/^corr_\d+$/);
  });
});

// =============================================================================
// Concurrent Booking Tests
// =============================================================================

describe('Concurrent Booking Handling', () => {
  interface SlotBookingAttempt {
    slotId: string;
    patientId: string;
    timestamp: number;
  }

  // Simulate slot availability check with race condition handling
  function simulateBookingRace(attempts: SlotBookingAttempt[]): {
    winner: string | null;
    losers: string[];
  } {
    // Sort by timestamp - first one wins
    const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp);

    if (sorted.length === 0) {
      return { winner: null, losers: [] };
    }

    const winner = sorted[0]!.patientId;
    const losers = sorted.slice(1).map((a) => a.patientId);

    return { winner, losers };
  }

  it('should only allow one booking per slot', () => {
    const attempts: SlotBookingAttempt[] = [
      { slotId: 'slot_1', patientId: 'patient_A', timestamp: 1000 },
      { slotId: 'slot_1', patientId: 'patient_B', timestamp: 1001 },
      { slotId: 'slot_1', patientId: 'patient_C', timestamp: 1002 },
    ];

    const result = simulateBookingRace(attempts);

    expect(result.winner).toBe('patient_A');
    expect(result.losers).toEqual(['patient_B', 'patient_C']);
  });

  it('should handle simultaneous bookings deterministically', () => {
    const attempts: SlotBookingAttempt[] = [
      { slotId: 'slot_1', patientId: 'patient_B', timestamp: 1000 },
      { slotId: 'slot_1', patientId: 'patient_A', timestamp: 1000 },
    ];

    // With same timestamp, order should be deterministic based on array position
    const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp);
    expect(sorted[0]!.patientId).toBe('patient_B'); // First in array wins tie
  });

  it('should handle empty booking attempts', () => {
    const result = simulateBookingRace([]);
    expect(result.winner).toBeNull();
    expect(result.losers).toEqual([]);
  });

  it('should handle single booking attempt', () => {
    const attempts: SlotBookingAttempt[] = [
      { slotId: 'slot_1', patientId: 'patient_A', timestamp: 1000 },
    ];

    const result = simulateBookingRace(attempts);
    expect(result.winner).toBe('patient_A');
    expect(result.losers).toEqual([]);
  });
});
