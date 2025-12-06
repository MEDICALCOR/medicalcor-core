/**
 * @fileoverview Tests for PostgreSQL Scheduling Repository
 *
 * Tests appointment booking, slot retrieval, and consent verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresSchedulingRepository,
  createPostgresSchedulingRepository,
  ConsentRequiredError,
  type ConsentService,
  type BookingRequest,
  type GetAvailableSlotsOptions,
} from '../postgres-scheduling-repository.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockClient() {
  return {
    query: vi.fn(),
    release: vi.fn(),
  };
}

function createMockPool() {
  const mockClient = createMockClient();

  const mockPool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
    _mockClient: mockClient,
  };

  return mockPool;
}

function createMockConsentService(hasConsent = true): ConsentService {
  return {
    hasRequiredConsents: vi.fn().mockResolvedValue({
      valid: hasConsent,
      missing: hasConsent ? [] : ['data_processing', 'marketing'],
    }),
  };
}

function createMockSlotRow(overrides = {}) {
  const now = new Date();
  const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
  const endDate = new Date(futureDate.getTime() + 30 * 60 * 1000); // 30 min later

  return {
    id: 'slot-123',
    start_time: futureDate,
    end_time: endDate,
    practitioner_name: 'Dr. Test',
    procedure_types: ['consultation', 'cleaning'],
    is_booked: false,
    ...overrides,
  };
}

function createMockAppointmentRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'apt-123',
    start_time: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    end_time: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
    patient_name: 'Test Patient',
    patient_phone: '+40721234567',
    procedure_type: 'consultation',
    hubspot_contact_id: 'hs-contact-123',
    created_at: now,
    ...overrides,
  };
}

/**
 * Create a repository with an injected mock pool for testing
 */
function createTestRepository(
  mockPool: ReturnType<typeof createMockPool> | null,
  consentService: ConsentService
) {
  // Create with empty connection string so constructor doesn't try to create a Pool
  const repo = new PostgresSchedulingRepository({
    connectionString: '',
    consentService,
  });

  // Manually inject the mock pool
  (repo as any).pool = mockPool;

  return repo;
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresSchedulingRepository', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let mockConsentService: ConsentService;
  let repository: PostgresSchedulingRepository;

  beforeEach(() => {
    mockPool = createMockPool();
    mockConsentService = createMockConsentService(true);
    repository = createTestRepository(mockPool, mockConsentService);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create repository without connection string (pool is null)', () => {
      const repo = new PostgresSchedulingRepository({
        connectionString: '',
        consentService: mockConsentService,
      });

      expect(repo).toBeDefined();
    });
  });

  describe('getAvailableSlots', () => {
    it('should return empty array when no pool configured', async () => {
      const repo = createTestRepository(null, mockConsentService);

      const slots = await repo.getAvailableSlots('consultation');

      expect(slots).toEqual([]);
    });

    it('should fetch available slots with string procedure type', async () => {
      const mockRows = [createMockSlotRow({ id: 'slot-1' }), createMockSlotRow({ id: 'slot-2' })];
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const slots = await repository.getAvailableSlots('consultation');

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockPool._mockClient.query).toHaveBeenCalled();
      expect(mockPool._mockClient.release).toHaveBeenCalled();
      expect(slots).toHaveLength(2);
      expect(slots[0]?.id).toBe('slot-1');
    });

    it('should fetch available slots with options object', async () => {
      const mockRows = [createMockSlotRow()];
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const options: GetAvailableSlotsOptions = {
        procedureType: 'cleaning',
        limit: 10,
      };

      const slots = await repository.getAvailableSlots(options);

      expect(slots).toHaveLength(1);
      expect(mockPool._mockClient.query).toHaveBeenCalledWith(expect.any(String), [10]);
    });

    it('should use default limit when not specified', async () => {
      const mockRows = [createMockSlotRow()];
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      await repository.getAvailableSlots({});

      expect(mockPool._mockClient.query).toHaveBeenCalledWith(expect.any(String), [20]);
    });

    it('should map slot rows correctly', async () => {
      const startTime = new Date('2024-12-15T10:00:00Z');
      const endTime = new Date('2024-12-15T10:30:00Z');

      const mockRow = createMockSlotRow({
        id: 'slot-mapped',
        start_time: startTime,
        end_time: endTime,
        practitioner_name: 'Dr. Smith',
        procedure_types: ['implant', 'surgery'],
      });
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });

      const slots = await repository.getAvailableSlots('implant');

      expect(slots[0]).toMatchObject({
        id: 'slot-mapped',
        date: '2024-12-15',
        startTime: '10:00',
        endTime: '10:30',
        duration: 30,
        available: true,
        practitioner: 'Dr. Smith',
        procedureTypes: ['implant', 'surgery'],
      });
    });

    it('should handle null procedure_types', async () => {
      const mockRow = createMockSlotRow({
        procedure_types: null,
      });
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });

      const slots = await repository.getAvailableSlots('consultation');

      expect(slots[0]?.procedureTypes).toEqual([]);
    });
  });

  describe('bookAppointment', () => {
    const validBookingRequest: BookingRequest = {
      hubspotContactId: 'hs-123',
      phone: '+40721234567',
      patientName: 'John Doe',
      slotId: 'slot-456',
      procedureType: 'consultation',
      notes: 'First visit',
    };

    it('should throw ConsentRequiredError when consent is missing', async () => {
      const noConsentService = createMockConsentService(false);
      const repoNoConsent = createTestRepository(mockPool, noConsentService);

      await expect(repoNoConsent.bookAppointment(validBookingRequest)).rejects.toThrow(
        ConsentRequiredError
      );
    });

    it('should include missing consents in ConsentRequiredError', async () => {
      const noConsentService = createMockConsentService(false);
      const repoNoConsent = createTestRepository(mockPool, noConsentService);

      try {
        await repoNoConsent.bookAppointment(validBookingRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(ConsentRequiredError);
        expect((error as ConsentRequiredError).missingConsents).toContain('data_processing');
        expect((error as ConsentRequiredError).contactId).toBe('hs-123');
      }
    });

    it('should throw error when pool not configured', async () => {
      const repoNoPool = createTestRepository(null, mockConsentService);

      await expect(repoNoPool.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Database connection not configured'
      );
    });

    it('should successfully book an appointment', async () => {
      // Setup mock queries
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false, version: 1 }] }) // Slot check
        .mockResolvedValueOnce({ rows: [] }) // No existing appointment
        .mockResolvedValueOnce(undefined) // INSERT appointment
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE slot
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await repository.bookAppointment(validBookingRequest);

      expect(result.id).toBeDefined();
      expect(result.status).toBe('confirmed');
      expect(mockConsentService.hasRequiredConsents).toHaveBeenCalledWith('hs-123');
    });

    it('should throw error when slot not found', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No slot found
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(repository.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Slot not found'
      );
    });

    it('should throw error when slot already booked', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: true, version: 1 }] }) // Slot is booked
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(repository.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Slot already booked'
      );
    });

    it('should throw error when slot has existing active appointment', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false, version: 1 }] }) // Slot check
        .mockResolvedValueOnce({ rows: [{ id: 'existing-apt' }] }) // Existing appointment
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(repository.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Slot already has an active appointment'
      );
    });

    it('should throw error on concurrent modification (optimistic lock failure)', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false, version: 1 }] }) // Slot check
        .mockResolvedValueOnce({ rows: [] }) // No existing appointment
        .mockResolvedValueOnce(undefined) // INSERT appointment
        .mockResolvedValueOnce({ rowCount: 0 }) // UPDATE failed (optimistic lock)
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(repository.bookAppointment(validBookingRequest)).rejects.toThrow(
        'concurrent modification detected'
      );
    });

    it('should rollback transaction on error', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // Slot check fails

      await expect(repository.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Database error'
      );

      // Verify ROLLBACK was called
      expect(mockPool._mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle booking without optional fields', async () => {
      const minimalRequest: BookingRequest = {
        hubspotContactId: 'hs-456',
        phone: '+40721234567',
        slotId: 'slot-789',
        procedureType: 'cleaning',
      };

      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_booked: false, version: 1 }] }) // Slot check
        .mockResolvedValueOnce({ rows: [] }) // No existing appointment
        .mockResolvedValueOnce(undefined) // INSERT appointment
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE slot
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await repository.bookAppointment(minimalRequest);

      expect(result.status).toBe('confirmed');
    });
  });

  describe('getUpcomingAppointments', () => {
    const startDate = new Date('2024-12-01');
    const endDate = new Date('2024-12-31');

    it('should return empty array when no pool configured', async () => {
      const repo = createTestRepository(null, mockConsentService);

      const appointments = await repo.getUpcomingAppointments(startDate, endDate);

      expect(appointments).toEqual([]);
    });

    it('should fetch upcoming appointments within date range', async () => {
      const mockRows = [
        createMockAppointmentRow({ id: 'apt-1' }),
        createMockAppointmentRow({ id: 'apt-2' }),
      ];
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(appointments).toHaveLength(2);
      expect(appointments[0]?.id).toBe('apt-1');
    });

    it('should map appointment rows correctly', async () => {
      const startTime = new Date('2024-12-15T10:00:00Z');
      const endTime = new Date('2024-12-15T10:45:00Z');
      const createdAt = new Date('2024-12-10T08:00:00Z');

      const mockRow = createMockAppointmentRow({
        id: 'apt-mapped',
        start_time: startTime,
        end_time: endTime,
        patient_name: 'Jane Doe',
        patient_phone: '+40722333444',
        procedure_type: 'whitening',
        hubspot_contact_id: 'hs-mapped',
        created_at: createdAt,
      });
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(appointments[0]).toMatchObject({
        id: 'apt-mapped',
        slot: {
          date: '2024-12-15',
          startTime: '10:00',
          duration: 45,
        },
        patientName: 'Jane Doe',
        procedureType: 'whitening',
        hubspotContactId: 'hs-mapped',
        phone: '+40722333444',
      });
    });

    it('should handle appointments without patient name', async () => {
      const mockRow = createMockAppointmentRow({
        patient_name: undefined,
      });
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(appointments[0]?.patientName).toBeUndefined();
    });

    it('should always release client after query', async () => {
      mockPool._mockClient.query.mockResolvedValueOnce({ rows: [] });

      await repository.getUpcomingAppointments(startDate, endDate);

      expect(mockPool._mockClient.release).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close the pool', async () => {
      await repository.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle close when pool is null', async () => {
      const repo = createTestRepository(null, mockConsentService);

      // Should not throw
      await repo.close();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createPostgresSchedulingRepository', () => {
  it('should create a repository instance with empty connection string', () => {
    const mockConsentService = createMockConsentService(true);

    const repo = createPostgresSchedulingRepository({
      connectionString: '', // Empty to avoid Pool instantiation
      consentService: mockConsentService,
    });

    expect(repo).toBeInstanceOf(PostgresSchedulingRepository);
  });
});

// ============================================================================
// ERROR CLASS TESTS
// ============================================================================

describe('ConsentRequiredError', () => {
  it('should create error with correct properties', () => {
    const error = new ConsentRequiredError('contact-123', ['data_processing', 'marketing']);

    expect(error.name).toBe('ConsentRequiredError');
    expect(error.code).toBe('CONSENT_REQUIRED');
    expect(error.contactId).toBe('contact-123');
    expect(error.missingConsents).toEqual(['data_processing', 'marketing']);
    expect(error.message).toContain('data_processing');
    expect(error.message).toContain('marketing');
  });
});
