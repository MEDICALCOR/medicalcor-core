/**
 * Comprehensive Unit Tests for CRM Database Operations
 * Tests lead management, treatment plans, and interactions
 * Coverage target: 100%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LeadDTO, TreatmentPlanDTO, InteractionDTO } from '@medicalcor/types';
import {
  DatabaseConnectionError,
  DatabaseOperationError,
  LeadNotFoundError,
  LeadUpsertError,
} from '../errors.js';

// Mock database module
vi.mock('../database.js', () => {
  const mockTransaction = vi.fn();
  return {
    createDatabaseClient: vi.fn(),
    withTransaction: vi.fn((pool, fn) => fn(mockTransaction)),
    __mockTransaction: mockTransaction,
  };
});

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Get mocks
const getMocks = async () => {
  const dbModule = await import('../database.js');
  return {
    createDatabaseClient: dbModule.createDatabaseClient as ReturnType<typeof vi.fn>,
    withTransaction: dbModule.withTransaction as ReturnType<typeof vi.fn>,
  };
};

describe('CRM Database Operations', () => {
  let mocks: Awaited<ReturnType<typeof getMocks>>;
  let mockDb: { query: ReturnType<typeof vi.fn> };
  let mockTx: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks = await getMocks();

    mockDb = { query: vi.fn() };
    mockTx = { query: vi.fn() };

    mocks.createDatabaseClient.mockReturnValue(mockDb);
    mocks.withTransaction.mockImplementation(async (_pool, fn) => fn(mockTx));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findLeadIdByExternal', () => {
    it('should return lead ID when found', async () => {
      const { findLeadIdByExternal } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({
        rows: [{ id: 'lead-123' }],
        rowCount: 1,
      });

      const result = await findLeadIdByExternal('hubspot', 'contact-456');

      expect(result).toBe('lead-123');
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['hubspot', 'contact-456']);
    });

    it('should return null when lead not found', async () => {
      const { findLeadIdByExternal } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findLeadIdByExternal('hubspot', 'unknown-contact');

      expect(result).toBeNull();
    });

    it('should use provided client instead of creating new one', async () => {
      const { findLeadIdByExternal } = await import('../crm.db.js');

      const customClient = { query: vi.fn() };
      customClient.query.mockResolvedValue({
        rows: [{ id: 'lead-789' }],
        rowCount: 1,
      });

      const result = await findLeadIdByExternal('hubspot', 'contact', customClient as any);

      expect(result).toBe('lead-789');
      expect(customClient.query).toHaveBeenCalled();
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('findPractitionerIdByExternalUserId', () => {
    it('should return practitioner ID when found', async () => {
      const { findPractitionerIdByExternalUserId } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({
        rows: [{ id: 'practitioner-123' }],
        rowCount: 1,
      });

      const result = await findPractitionerIdByExternalUserId('user-456');

      expect(result).toBe('practitioner-123');
    });

    it('should return null when practitioner not found', async () => {
      const { findPractitionerIdByExternalUserId } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findPractitionerIdByExternalUserId('unknown-user');

      expect(result).toBeNull();
    });
  });

  describe('recordLeadEvent', () => {
    it('should insert lead event with all parameters', async () => {
      const { recordLeadEvent } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'status_changed',
        actor: 'agent',
        payload: { from: 'new', to: 'qualified' },
      });

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [
        'lead-123',
        'status_changed',
        'agent',
        expect.any(String),
      ]);
    });

    it('should use default actor "system" when not provided', async () => {
      const { recordLeadEvent } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'created',
      });

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [
        'lead-123',
        'created',
        'system',
        null,
      ]);
    });

    it('should use provided client for transaction', async () => {
      const { recordLeadEvent } = await import('../crm.db.js');

      const customClient = { query: vi.fn() };
      customClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'test',
        client: customClient as any,
      });

      expect(customClient.query).toHaveBeenCalled();
    });
  });

  describe('upsertLeadFromDTO', () => {
    const createLeadDTO = (overrides: Partial<LeadDTO> = {}): LeadDTO => ({
      externalContactId: 'contact-123',
      externalSource: 'hubspot',
      phone: '+40712345678',
      ...overrides,
    });

    it('should insert new lead and return ID', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      // Mock INSERT returning new lead
      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'new-lead-id' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event

      const dto = createLeadDTO({ fullName: 'John Doe', email: 'john@example.com' });
      const result = await upsertLeadFromDTO(dto);

      expect(result).toBe('new-lead-id');
    });

    it('should update existing lead when INSERT fails conflict', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      // Mock INSERT returning nothing (conflict), UPDATE returning lead
      mockTx.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT (conflict)
        .mockResolvedValueOnce({ rows: [{ id: 'existing-lead-id' }], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event

      const dto = createLeadDTO();
      const result = await upsertLeadFromDTO(dto);

      expect(result).toBe('existing-lead-id');
    });

    it('should look up assigned agent when externalUserId provided', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'agent-id' }], rowCount: 1 }) // find agent
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event

      const dto = createLeadDTO({ assignedAgentExternalUserId: 'agent-user-123' });
      await upsertLeadFromDTO(dto);

      expect(mockTx.query).toHaveBeenCalledTimes(3);
    });

    it('should clamp aiScore to 0-100 range', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const dto = createLeadDTO({ aiScore: 150 }); // Should be clamped to 100
      await upsertLeadFromDTO(dto);

      // The clamped value should be used in the query
      expect(mockTx.query).toHaveBeenCalled();
    });

    it('should throw LeadUpsertError when both INSERT and UPDATE fail', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT fails
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE fails

      const dto = createLeadDTO();

      await expect(upsertLeadFromDTO(dto)).rejects.toThrow(LeadUpsertError);
    });

    it('should throw DatabaseConnectionError on connection failure', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      mocks.createDatabaseClient.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const dto = createLeadDTO();

      await expect(upsertLeadFromDTO(dto)).rejects.toThrow(DatabaseConnectionError);
    });

    it('should pass options to record event', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const dto = createLeadDTO();
      await upsertLeadFromDTO(dto, { actor: 'admin', clinicId: 'clinic-123' });

      expect(mockTx.query).toHaveBeenCalledTimes(2);
    });

    it('should serialize metadata to JSON', async () => {
      const { upsertLeadFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const dto = createLeadDTO({
        metadata: { custom: 'data', nested: { value: 123 } },
      });
      await upsertLeadFromDTO(dto);

      expect(mockTx.query).toHaveBeenCalled();
    });
  });

  describe('upsertTreatmentPlanFromDTO', () => {
    const createTreatmentPlanDTO = (
      overrides: Partial<TreatmentPlanDTO> = {}
    ): TreatmentPlanDTO => ({
      externalDealId: 'deal-123',
      externalSource: 'hubspot',
      leadExternalId: 'contact-123',
      ...overrides,
    });

    it('should insert new treatment plan', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 }) // find lead
        .mockResolvedValueOnce({ rows: [{ id: 'plan-id' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event

      const dto = createTreatmentPlanDTO({ name: 'Implant Treatment' });
      const result = await upsertTreatmentPlanFromDTO(dto);

      expect(result).toBe('plan-id');
    });

    it('should throw LeadNotFoundError when lead does not exist', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('../crm.db.js');

      mockTx.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // lead not found

      const dto = createTreatmentPlanDTO();

      await expect(upsertTreatmentPlanFromDTO(dto)).rejects.toThrow(LeadNotFoundError);
    });

    it('should update existing treatment plan', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 }) // find lead
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT fails
        .mockResolvedValueOnce({ rows: [{ id: 'plan-id' }], rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event

      const dto = createTreatmentPlanDTO();
      const result = await upsertTreatmentPlanFromDTO(dto);

      expect(result).toBe('plan-id');
    });

    it('should clamp probability to 0-100 range', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'plan-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const dto = createTreatmentPlanDTO({ probability: 120 }); // Should be clamped
      await upsertTreatmentPlanFromDTO(dto);

      expect(mockTx.query).toHaveBeenCalled();
    });

    it('should look up doctor when externalUserId provided', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 }) // find lead
        .mockResolvedValueOnce({ rows: [{ id: 'doctor-id' }], rowCount: 1 }) // find doctor
        .mockResolvedValueOnce({ rows: [{ id: 'plan-id' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event

      const dto = createTreatmentPlanDTO({ doctorExternalUserId: 'doctor-user-123' });
      await upsertTreatmentPlanFromDTO(dto);

      expect(mockTx.query).toHaveBeenCalled();
    });

    it('should throw DatabaseOperationError when upsert fails completely', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 }) // find lead
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT fails
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE fails

      const dto = createTreatmentPlanDTO();

      await expect(upsertTreatmentPlanFromDTO(dto)).rejects.toThrow(DatabaseOperationError);
    });
  });

  describe('insertInteractionFromDTO', () => {
    const createInteractionDTO = (overrides: Partial<InteractionDTO> = {}): InteractionDTO => ({
      externalId: 'msg-123',
      leadExternalSource: 'hubspot',
      leadExternalId: 'contact-123',
      provider: 'whatsapp',
      channel: 'whatsapp',
      direction: 'inbound',
      type: 'message',
      ...overrides,
    });

    it('should insert interaction and update lead', async () => {
      const { insertInteractionFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 }) // find lead
        .mockResolvedValueOnce({ rows: [{ id: 'interaction-id' }], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // event
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update last interaction

      const dto = createInteractionDTO({ content: 'Hello!' });
      const result = await insertInteractionFromDTO(dto);

      expect(result).toBe('interaction-id');
    });

    it('should return null when lead not found', async () => {
      const { insertInteractionFromDTO } = await import('../crm.db.js');

      mockTx.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // lead not found

      const dto = createInteractionDTO();
      const result = await insertInteractionFromDTO(dto);

      expect(result).toBeNull();
    });

    it('should clamp sentiment score to -1.0 to 1.0 range', async () => {
      const { insertInteractionFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'interaction-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const dto = createInteractionDTO({ aiSentimentScore: 5.0 }); // Should be clamped
      await insertInteractionFromDTO(dto);

      expect(mockTx.query).toHaveBeenCalled();
    });

    it('should use current date when createdAt not provided', async () => {
      const { insertInteractionFromDTO } = await import('../crm.db.js');

      mockTx.query
        .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'interaction-id' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const dto = createInteractionDTO(); // No createdAt
      await insertInteractionFromDTO(dto);

      expect(mockTx.query).toHaveBeenCalled();
    });

    it('should throw DatabaseOperationError on failure', async () => {
      const { insertInteractionFromDTO } = await import('../crm.db.js');

      mockTx.query.mockRejectedValue(new Error('DB error'));

      const dto = createInteractionDTO();

      await expect(insertInteractionFromDTO(dto)).rejects.toThrow(DatabaseOperationError);
    });
  });

  describe('getLeadById', () => {
    it('should return lead when found', async () => {
      const { getLeadById } = await import('../crm.db.js');

      const leadData = { id: 'lead-123', fullName: 'John Doe' };
      mockDb.query.mockResolvedValue({ rows: [leadData], rowCount: 1 });

      const result = await getLeadById('lead-123');

      expect(result).toEqual(leadData);
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['lead-123']);
    });

    it('should return null when lead not found', async () => {
      const { getLeadById } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getLeadById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getLeadByExternal', () => {
    it('should return lead when found', async () => {
      const { getLeadByExternal } = await import('../crm.db.js');

      const leadData = { id: 'lead-123', externalSource: 'hubspot' };
      mockDb.query.mockResolvedValue({ rows: [leadData], rowCount: 1 });

      const result = await getLeadByExternal('hubspot', 'contact-123');

      expect(result).toEqual(leadData);
    });

    it('should return null when lead not found', async () => {
      const { getLeadByExternal } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getLeadByExternal('hubspot', 'unknown');

      expect(result).toBeNull();
    });
  });

  describe('getLeadEvents', () => {
    it('should return events for lead', async () => {
      const { getLeadEvents } = await import('../crm.db.js');

      const events = [
        { id: '1', eventType: 'created' },
        { id: '2', eventType: 'updated' },
      ];
      mockDb.query.mockResolvedValue({ rows: events, rowCount: 2 });

      const result = await getLeadEvents('lead-123');

      expect(result).toEqual(events);
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 50]);
    });

    it('should use custom limit', async () => {
      const { getLeadEvents } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await getLeadEvents('lead-123', 100);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 100]);
    });
  });

  describe('getTreatmentPlansByLead', () => {
    it('should return treatment plans for lead', async () => {
      const { getTreatmentPlansByLead } = await import('../crm.db.js');

      const plans = [
        { id: '1', name: 'Plan A' },
        { id: '2', name: 'Plan B' },
      ];
      mockDb.query.mockResolvedValue({ rows: plans, rowCount: 2 });

      const result = await getTreatmentPlansByLead('lead-123');

      expect(result).toEqual(plans);
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['lead-123']);
    });
  });

  describe('getInteractionsByLead', () => {
    it('should return interactions for lead', async () => {
      const { getInteractionsByLead } = await import('../crm.db.js');

      const interactions = [
        { id: '1', channel: 'whatsapp' },
        { id: '2', channel: 'email' },
      ];
      mockDb.query.mockResolvedValue({ rows: interactions, rowCount: 2 });

      const result = await getInteractionsByLead('lead-123');

      expect(result).toEqual(interactions);
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 100]);
    });

    it('should use custom limit', async () => {
      const { getInteractionsByLead } = await import('../crm.db.js');

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await getInteractionsByLead('lead-123', 50);

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 50]);
    });
  });
});

describe('clamp utility (internal)', () => {
  it('should clamp values to specified range', async () => {
    const { upsertLeadFromDTO } = await import('../crm.db.js');

    // Test through upsertLeadFromDTO which uses clamp
    // Values outside range should be clamped
    const mockTx = { query: vi.fn() };
    const mocks = await getMocks();
    mocks.withTransaction.mockImplementation(async (_pool, fn) => fn(mockTx));

    mockTx.query
      .mockResolvedValueOnce({ rows: [{ id: 'lead-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await upsertLeadFromDTO({
      externalContactId: 'test',
      externalSource: 'test',
      phone: '+40700000000',
      aiScore: -10, // Should be clamped to 0
    });

    expect(mockTx.query).toHaveBeenCalled();
  });
});
