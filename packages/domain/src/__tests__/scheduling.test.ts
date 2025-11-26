import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SchedulingService,
  ConsentRequiredError,
  SlotUnavailableError,
  type SchedulingConfig,
  type BookingRequest,
} from '../scheduling/scheduling-service.js';

// Mock pg Pool
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  query: vi.fn(),
};

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => mockPool),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-1234'),
}));

describe('SchedulingService', () => {
  let service: SchedulingService;
  let mockConsentService: {
    hasValidConsent: ReturnType<typeof vi.fn>;
    getConsent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConsentService = {
      hasValidConsent: vi.fn(),
      getConsent: vi.fn(),
    };

    service = new SchedulingService({
      connectionString: 'postgres://test',
      consentService: mockConsentService as any,
      requireConsent: true,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GDPR Consent Verification', () => {
    it('should throw ConsentRequiredError when no consent service configured', async () => {
      const serviceNoConsent = new SchedulingService({
        connectionString: 'postgres://test',
        requireConsent: true, // Consent required but no service
      });

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      await expect(serviceNoConsent.bookAppointment(bookingRequest)).rejects.toThrow(
        ConsentRequiredError
      );
    });

    it('should throw ConsentRequiredError when consent is not valid', async () => {
      mockConsentService.hasValidConsent.mockResolvedValue(false);

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      await expect(service.bookAppointment(bookingRequest)).rejects.toThrow(ConsentRequiredError);
      expect(mockConsentService.hasValidConsent).toHaveBeenCalledWith(
        'contact-123',
        'appointment_reminders'
      );
    });

    it('should proceed with booking when appointment_reminders consent exists', async () => {
      mockConsentService.hasValidConsent.mockResolvedValue(true);

      // Mock successful booking flow
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot check
        .mockResolvedValueOnce({}) // Insert appointment
        .mockResolvedValueOnce({}) // Update slot
        .mockResolvedValueOnce({}); // COMMIT

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      const result = await service.bookAppointment(bookingRequest);

      expect(result.id).toBe('mock-uuid-1234');
      expect(result.status).toBe('confirmed');
      expect(mockConsentService.hasValidConsent).toHaveBeenCalledWith(
        'contact-123',
        'appointment_reminders'
      );
    });

    it('should accept data_processing consent as fallback', async () => {
      // First check fails, second check succeeds
      mockConsentService.hasValidConsent
        .mockResolvedValueOnce(false) // appointment_reminders
        .mockResolvedValueOnce(true); // data_processing

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot check
        .mockResolvedValueOnce({}) // Insert appointment
        .mockResolvedValueOnce({}) // Update slot
        .mockResolvedValueOnce({}); // COMMIT

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      const result = await service.bookAppointment(bookingRequest);

      expect(result.status).toBe('confirmed');
      expect(mockConsentService.hasValidConsent).toHaveBeenCalledTimes(2);
    });

    it('should skip consent check when requireConsent is false', async () => {
      const serviceNoConsentRequired = new SchedulingService({
        connectionString: 'postgres://test',
        requireConsent: false,
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot check
        .mockResolvedValueOnce({}) // Insert appointment
        .mockResolvedValueOnce({}) // Update slot
        .mockResolvedValueOnce({}); // COMMIT

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      const result = await serviceNoConsentRequired.bookAppointment(bookingRequest);

      expect(result.status).toBe('confirmed');
      expect(mockConsentService.hasValidConsent).not.toHaveBeenCalled();
    });
  });

  describe('Slot Reservation (Double-Booking Prevention)', () => {
    it('should throw SlotUnavailableError when slot is not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Advisory lock
        .mockResolvedValueOnce({ rows: [] }); // Empty result - slot not found

      await expect(service.reserveSlot('non-existent-slot', 'contact-123')).rejects.toThrow(
        SlotUnavailableError
      );
    });

    it('should throw SlotUnavailableError when slot is already booked', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Advisory lock
        .mockResolvedValueOnce({ rows: [{ is_booked: true }] }); // Slot is booked

      await expect(service.reserveSlot('booked-slot', 'contact-123')).rejects.toThrow(
        SlotUnavailableError
      );
    });

    it('should throw SlotUnavailableError when slot is reserved by another user', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Advisory lock
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot available
        .mockResolvedValueOnce({
          rows: [{ id: 'existing-reservation', hubspot_contact_id: 'other-contact' }],
        }); // Reserved by other

      await expect(service.reserveSlot('reserved-slot', 'contact-123')).rejects.toThrow(
        SlotUnavailableError
      );
    });

    it('should extend reservation when same contact reserves again', async () => {
      const originalExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Advisory lock
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot available
        .mockResolvedValueOnce({
          rows: [{ id: 'existing-reservation', hubspot_contact_id: 'contact-123' }],
        }) // Same contact
        .mockResolvedValueOnce({}) // UPDATE expiry
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.reserveSlot('slot-123', 'contact-123', 10);

      expect(result.id).toBe('existing-reservation');
      expect(result.status).toBe('active');
    });

    it('should create new reservation for available slot', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Advisory lock
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot available
        .mockResolvedValueOnce({ rows: [] }) // No existing reservation
        .mockResolvedValueOnce({}) // INSERT reservation
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.reserveSlot('slot-123', 'contact-123', 10);

      expect(result.id).toBe('mock-uuid-1234');
      expect(result.slotId).toBe('slot-123');
      expect(result.hubspotContactId).toBe('contact-123');
      expect(result.status).toBe('active');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should use advisory lock to prevent race conditions', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // Advisory lock
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await service.reserveSlot('slot-123', 'contact-123');

      // Verify advisory lock was called
      expect(mockClient.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
        expect.any(Number),
      ]);
    });
  });

  describe('Slot Booking with Transaction Safety', () => {
    it('should rollback on slot already booked error', async () => {
      mockConsentService.hasValidConsent.mockResolvedValue(true);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: true }] }); // Already booked

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      await expect(service.bookAppointment(bookingRequest)).rejects.toThrow('Slot already booked');

      // Verify ROLLBACK was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback on any database error', async () => {
      mockConsentService.hasValidConsent.mockResolvedValue(true);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] }) // Slot check
        .mockRejectedValueOnce(new Error('DB connection lost')); // Insert fails

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      await expect(service.bookAppointment(bookingRequest)).rejects.toThrow('DB connection lost');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should always release client after booking attempt', async () => {
      mockConsentService.hasValidConsent.mockResolvedValue(true);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const bookingRequest: BookingRequest = {
        hubspotContactId: 'contact-123',
        phone: '+40721123456',
        slotId: 'slot-123',
        procedureType: 'implant',
      };

      await service.bookAppointment(bookingRequest);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Reservation Cleanup', () => {
    it('should cancel reservation by ID', async () => {
      await service.cancelReservation('reservation-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        `UPDATE slot_reservations SET status = 'cancelled' WHERE id = $1`,
        ['reservation-123']
      );
    });

    it('should expire stale reservations and return count', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });

      const expiredCount = await service.cleanupExpiredReservations();

      expect(expiredCount).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'expired'"),
        expect.anything()
      );
    });
  });

  describe('Get Available Slots', () => {
    it('should return empty array when no database configured', async () => {
      const serviceNoDb = new SchedulingService({});

      const slots = await serviceNoDb.getAvailableSlots('implant');

      expect(slots).toEqual([]);
    });

    it('should filter out booked and reserved slots', async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min later

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'slot-1',
            start_time: startTime,
            end_time: endTime,
            practitioner_name: 'Dr. Smith',
            procedure_types: ['implant'],
            is_booked: false,
          },
        ],
      });

      const slots = await service.getAvailableSlots({ procedureType: 'implant', limit: 10 });

      expect(slots).toHaveLength(1);
      expect(slots[0].id).toBe('slot-1');
      expect(slots[0].available).toBe(true);
      expect(slots[0].practitioner).toBe('Dr. Smith');
    });
  });

  describe('ConsentRequiredError', () => {
    it('should contain contact ID and consent type', () => {
      const error = new ConsentRequiredError(
        'Consent required',
        'contact-123',
        'data_processing'
      );

      expect(error.name).toBe('ConsentRequiredError');
      expect(error.message).toBe('Consent required');
      expect(error.contactId).toBe('contact-123');
      expect(error.consentType).toBe('data_processing');
    });
  });

  describe('SlotUnavailableError', () => {
    it('should contain slot ID and reason', () => {
      const error = new SlotUnavailableError('Slot is booked', 'slot-123', 'already_booked');

      expect(error.name).toBe('SlotUnavailableError');
      expect(error.message).toBe('Slot is booked');
      expect(error.slotId).toBe('slot-123');
      expect(error.reason).toBe('already_booked');
    });
  });
});
