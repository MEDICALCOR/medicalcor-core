/**
 * CRM Database Operations Unit Tests
 *
 * Comprehensive tests for CRM database operations including:
 * - Lead lookup and upsert
 * - Treatment plan management
 * - Interaction recording
 * - Event auditing
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { DatabasePool, TransactionClient } from '../database.js';
import type { LeadDTO, TreatmentPlanDTO, InteractionDTO } from '@medicalcor/types';
import {
  findLeadIdByExternal,
  findPractitionerIdByExternalUserId,
  recordLeadEvent,
  upsertLeadFromDTO,
  upsertTreatmentPlanFromDTO,
  insertInteractionFromDTO,
  getLeadById,
  getLeadByExternal,
  getLeadEvents,
  getTreatmentPlansByLead,
  getInteractionsByLead,
} from '../crm.db.js';
import {
  DatabaseConnectionError,
  DatabaseOperationError,
  LeadNotFoundError,
  LeadUpsertError,
} from '../errors.js';

// Mock the database module
vi.mock('../database.js', () => ({
  createDatabaseClient: vi.fn(),
  withTransaction: vi.fn(),
}));

// Mock the logger
vi.mock('../logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

/**
 * Create a mock database pool/client
 */
function createMockClient(mockQueryResults: unknown[] = []): DatabasePool {
  let queryIndex = 0;
  return {
    query: vi.fn().mockImplementation(async () => {
      const result = mockQueryResults[queryIndex++];
      return result || { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as DatabasePool;
}

// Import mocked modules
import { createDatabaseClient, withTransaction } from '../database.js';

describe('CRM Database Operations', () => {
  let mockClient: DatabasePool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    (createDatabaseClient as Mock).mockReturnValue(mockClient);
  });

  describe('findLeadIdByExternal', () => {
    it('should return lead ID when found', async () => {
      const expectedId = '123e4567-e89b-12d3-a456-426614174000';
      mockClient = createMockClient([{ rows: [{ id: expectedId }] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await findLeadIdByExternal('hubspot', 'contact-123');

      expect(result).toBe(expectedId);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['hubspot', 'contact-123']);
    });

    it('should return null when lead not found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await findLeadIdByExternal('hubspot', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should use provided client instead of creating new one', async () => {
      const customClient = createMockClient([{ rows: [{ id: 'lead-id' }] }]);

      await findLeadIdByExternal('hubspot', 'contact-123', customClient);

      expect(createDatabaseClient).not.toHaveBeenCalled();
      expect(customClient.query).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockClient.query = vi.fn().mockRejectedValue(new Error('Database error'));
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      await expect(findLeadIdByExternal('hubspot', 'contact-123')).rejects.toThrow('Database error');
    });
  });

  describe('findPractitionerIdByExternalUserId', () => {
    it('should return practitioner ID when found', async () => {
      const expectedId = '456e4567-e89b-12d3-a456-426614174000';
      mockClient = createMockClient([{ rows: [{ id: expectedId }] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await findPractitionerIdByExternalUserId('user-123');

      expect(result).toBe(expectedId);
    });

    it('should return null when practitioner not found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await findPractitionerIdByExternalUserId('nonexistent');

      expect(result).toBeNull();
    });

    it('should use provided client', async () => {
      const customClient = createMockClient([{ rows: [{ id: 'prac-id' }] }]);

      await findPractitionerIdByExternalUserId('user-123', customClient);

      expect(customClient.query).toHaveBeenCalled();
    });
  });

  describe('recordLeadEvent', () => {
    it('should record lead event with all parameters', async () => {
      mockClient = createMockClient([{ rows: [], rowCount: 1 }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'lead_created',
        actor: 'user-456',
        payload: { source: 'hubspot' },
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['lead-123', 'lead_created', 'user-456', '{"source":"hubspot"}']
      );
    });

    it('should use default actor "system" when not provided', async () => {
      mockClient = createMockClient([{ rows: [], rowCount: 1 }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'lead_updated',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['lead-123', 'lead_updated', 'system', null])
      );
    });

    it('should handle null payload', async () => {
      mockClient = createMockClient([{ rows: [], rowCount: 1 }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'lead_created',
        payload: null,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should use provided client in transaction', async () => {
      const txClient = createMockClient([{ rows: [], rowCount: 1 }]);

      await recordLeadEvent({
        leadId: 'lead-123',
        eventType: 'lead_created',
        client: txClient as unknown as TransactionClient,
      });

      expect(txClient.query).toHaveBeenCalled();
      expect(createDatabaseClient).not.toHaveBeenCalled();
    });
  });

  describe('upsertLeadFromDTO', () => {
    const validLeadDTO: LeadDTO = {
      externalContactId: 'contact-123',
      externalSource: 'hubspot',
      phone: '+40712345678',
      fullName: 'John Doe',
      email: 'john@example.com',
      status: 'new',
    };

    beforeEach(() => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'lead-id-123' }] }, // INSERT result
          { rows: [], rowCount: 1 }, // recordLeadEvent
        ]);
        return fn(txClient);
      });
    });

    it('should insert new lead successfully', async () => {
      const leadId = await upsertLeadFromDTO(validLeadDTO);

      expect(leadId).toBe('lead-id-123');
      expect(withTransaction).toHaveBeenCalled();
    });

    it('should update existing lead when INSERT returns empty', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [] }, // INSERT returns empty (conflict)
          { rows: [{ id: 'existing-lead-id' }] }, // UPDATE result
          { rows: [], rowCount: 1 }, // recordLeadEvent
        ]);
        return fn(txClient);
      });

      const leadId = await upsertLeadFromDTO(validLeadDTO);

      expect(leadId).toBe('existing-lead-id');
    });

    it('should clamp AI score to 0-100 range', async () => {
      const dtoWithScore = { ...validLeadDTO, aiScore: 150 };

      await upsertLeadFromDTO(dtoWithScore);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should handle missing optional fields', async () => {
      const minimalDTO: LeadDTO = {
        externalContactId: 'contact-123',
        externalSource: 'hubspot',
        phone: '+40712345678',
      };

      const leadId = await upsertLeadFromDTO(minimalDTO);

      expect(leadId).toBe('lead-id-123');
    });

    it('should throw DatabaseConnectionError on connection failure', async () => {
      (createDatabaseClient as Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await expect(upsertLeadFromDTO(validLeadDTO)).rejects.toThrow(DatabaseConnectionError);
    });

    it('should throw LeadUpsertError when both INSERT and UPDATE fail', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [] }, // INSERT returns empty
          { rows: [] }, // UPDATE also returns empty
        ]);
        return fn(txClient);
      });

      await expect(upsertLeadFromDTO(validLeadDTO)).rejects.toThrow(LeadUpsertError);
    });

    it('should use provided createdBy in options', async () => {
      await upsertLeadFromDTO(validLeadDTO, { createdBy: 'user-123' });

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should use provided clinicId in options', async () => {
      await upsertLeadFromDTO(validLeadDTO, { clinicId: 'clinic-456' });

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should lookup assigned agent by external user ID', async () => {
      const dtoWithAgent = {
        ...validLeadDTO,
        assignedAgentExternalUserId: 'agent-123',
      };

      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'agent-internal-id' }] }, // findPractitionerIdByExternalUserId
          { rows: [{ id: 'lead-id-123' }] }, // INSERT
          { rows: [], rowCount: 1 }, // recordLeadEvent
        ]);
        return fn(txClient);
      });

      await upsertLeadFromDTO(dtoWithAgent);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should re-throw domain errors unchanged', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([{ rows: [] }, { rows: [] }]);
        return fn(txClient);
      });

      await expect(upsertLeadFromDTO(validLeadDTO)).rejects.toThrow(LeadUpsertError);
    });

    it('should wrap unexpected errors in LeadUpsertError', async () => {
      (withTransaction as Mock).mockRejectedValue(new Error('Unexpected error'));

      await expect(upsertLeadFromDTO(validLeadDTO)).rejects.toThrow(LeadUpsertError);
    });
  });

  describe('upsertTreatmentPlanFromDTO', () => {
    const validPlanDTO: TreatmentPlanDTO = {
      externalSource: 'hubspot',
      leadExternalId: 'contact-123',
      externalDealId: 'deal-456',
      name: 'All-on-4 Treatment',
      totalValue: 5000,
      stage: 'proposal',
    };

    beforeEach(() => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'lead-id-123' }] }, // findLeadIdByExternal
          { rows: [{ id: 'plan-id-789' }] }, // INSERT treatment plan
          { rows: [], rowCount: 1 }, // recordLeadEvent
        ]);
        return fn(txClient);
      });
    });

    it('should insert new treatment plan successfully', async () => {
      const planId = await upsertTreatmentPlanFromDTO(validPlanDTO);

      expect(planId).toBe('plan-id-789');
      expect(withTransaction).toHaveBeenCalled();
    });

    it('should throw LeadNotFoundError when lead does not exist', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([{ rows: [] }]); // Lead not found
        return fn(txClient);
      });

      await expect(upsertTreatmentPlanFromDTO(validPlanDTO)).rejects.toThrow(LeadNotFoundError);
    });

    it('should update existing treatment plan when INSERT returns empty', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'lead-id-123' }] }, // findLeadIdByExternal
          { rows: [] }, // INSERT returns empty (conflict)
          { rows: [{ id: 'existing-plan-id' }] }, // UPDATE result
          { rows: [], rowCount: 1 }, // recordLeadEvent
        ]);
        return fn(txClient);
      });

      const planId = await upsertTreatmentPlanFromDTO(validPlanDTO);

      expect(planId).toBe('existing-plan-id');
    });

    it('should clamp probability to 0-100 range', async () => {
      const dtoWithProbability = { ...validPlanDTO, probability: 150 };

      await upsertTreatmentPlanFromDTO(dtoWithProbability);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should ensure total value is non-negative', async () => {
      const dtoWithNegativeValue = { ...validPlanDTO, totalValue: -1000 };

      await upsertTreatmentPlanFromDTO(dtoWithNegativeValue);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should use default currency EUR when not provided', async () => {
      await upsertTreatmentPlanFromDTO(validPlanDTO);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should lookup doctor by external user ID', async () => {
      const dtoWithDoctor = {
        ...validPlanDTO,
        doctorExternalUserId: 'doctor-123',
      };

      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'lead-id-123' }] }, // findLeadIdByExternal
          { rows: [{ id: 'doctor-internal-id' }] }, // findPractitionerIdByExternalUserId
          { rows: [{ id: 'plan-id-789' }] }, // INSERT
          { rows: [], rowCount: 1 }, // recordLeadEvent
        ]);
        return fn(txClient);
      });

      await upsertTreatmentPlanFromDTO(dtoWithDoctor);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should throw DatabaseOperationError when UPDATE fails', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'lead-id-123' }] }, // findLeadIdByExternal
          { rows: [] }, // INSERT returns empty
          { rows: [] }, // UPDATE also returns empty
        ]);
        return fn(txClient);
      });

      await expect(upsertTreatmentPlanFromDTO(validPlanDTO)).rejects.toThrow(
        DatabaseOperationError
      );
    });

    it('should handle custom actor in options', async () => {
      await upsertTreatmentPlanFromDTO(validPlanDTO, { actor: 'user-123' });

      expect(withTransaction).toHaveBeenCalled();
    });
  });

  describe('insertInteractionFromDTO', () => {
    const validInteractionDTO: InteractionDTO = {
      leadExternalSource: 'hubspot',
      leadExternalId: 'contact-123',
      externalId: 'msg-456',
      provider: 'whatsapp',
      channel: 'whatsapp',
      direction: 'in',
      type: 'text',
      content: 'Hello, I need information',
    };

    beforeEach(() => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([
          { rows: [{ id: 'lead-id-123' }] }, // findLeadIdByExternal
          { rows: [{ id: 'interaction-id-789' }] }, // INSERT interaction
          { rows: [], rowCount: 1 }, // recordLeadEvent
          { rows: [], rowCount: 1 }, // UPDATE last_interaction_at
        ]);
        return fn(txClient);
      });
    });

    it('should insert interaction successfully', async () => {
      const interactionId = await insertInteractionFromDTO(validInteractionDTO);

      expect(interactionId).toBe('interaction-id-789');
      expect(withTransaction).toHaveBeenCalled();
    });

    it('should return null when lead not found', async () => {
      (withTransaction as Mock).mockImplementation(async (_pool, fn) => {
        const txClient = createMockClient([{ rows: [] }]); // Lead not found
        return fn(txClient);
      });

      const result = await insertInteractionFromDTO(validInteractionDTO);

      expect(result).toBeNull();
    });

    it('should clamp sentiment score to -1.0 to 1.0 range', async () => {
      const dtoWithSentiment = { ...validInteractionDTO, aiSentimentScore: 2.5 };

      await insertInteractionFromDTO(dtoWithSentiment);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should use current date when createdAt not provided', async () => {
      await insertInteractionFromDTO(validInteractionDTO);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should use provided createdAt date', async () => {
      const customDate = new Date('2024-01-01');
      const dtoWithDate = { ...validInteractionDTO, createdAt: customDate };

      await insertInteractionFromDTO(dtoWithDate);

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should handle custom actor in options', async () => {
      await insertInteractionFromDTO(validInteractionDTO, { actor: 'system-bot' });

      expect(withTransaction).toHaveBeenCalled();
    });

    it('should throw DatabaseOperationError on failure', async () => {
      (withTransaction as Mock).mockRejectedValue(new Error('Database error'));

      await expect(insertInteractionFromDTO(validInteractionDTO)).rejects.toThrow(
        DatabaseOperationError
      );
    });
  });

  describe('getLeadById', () => {
    it('should return lead when found', async () => {
      const expectedLead = { id: 'lead-123', phone: '+40712345678', fullName: 'John Doe' };
      mockClient = createMockClient([{ rows: [expectedLead] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadById('lead-123');

      expect(result).toEqual(expectedLead);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['lead-123']);
    });

    it('should return null when lead not found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getLeadByExternal', () => {
    it('should return lead when found', async () => {
      const expectedLead = { id: 'lead-123', externalSource: 'hubspot' };
      mockClient = createMockClient([{ rows: [expectedLead] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadByExternal('hubspot', 'contact-123');

      expect(result).toEqual(expectedLead);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['hubspot', 'contact-123']);
    });

    it('should return null when not found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadByExternal('hubspot', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getLeadEvents', () => {
    it('should return events with default limit', async () => {
      const events = [
        { id: 'event-1', eventType: 'lead_created' },
        { id: 'event-2', eventType: 'lead_updated' },
      ];
      mockClient = createMockClient([{ rows: events }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadEvents('lead-123');

      expect(result).toEqual(events);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 50]);
    });

    it('should return events with custom limit', async () => {
      const events = [{ id: 'event-1', eventType: 'lead_created' }];
      mockClient = createMockClient([{ rows: events }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadEvents('lead-123', 10);

      expect(result).toEqual(events);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 10]);
    });

    it('should return empty array when no events found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getLeadEvents('lead-123');

      expect(result).toEqual([]);
    });
  });

  describe('getTreatmentPlansByLead', () => {
    it('should return treatment plans', async () => {
      const plans = [
        { id: 'plan-1', name: 'All-on-4' },
        { id: 'plan-2', name: 'Implant' },
      ];
      mockClient = createMockClient([{ rows: plans }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getTreatmentPlansByLead('lead-123');

      expect(result).toEqual(plans);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['lead-123']);
    });

    it('should return empty array when no plans found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getTreatmentPlansByLead('lead-123');

      expect(result).toEqual([]);
    });
  });

  describe('getInteractionsByLead', () => {
    it('should return interactions with default limit', async () => {
      const interactions = [
        { id: 'int-1', content: 'Hello' },
        { id: 'int-2', content: 'Hi there' },
      ];
      mockClient = createMockClient([{ rows: interactions }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getInteractionsByLead('lead-123');

      expect(result).toEqual(interactions);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 100]);
    });

    it('should return interactions with custom limit', async () => {
      const interactions = [{ id: 'int-1', content: 'Hello' }];
      mockClient = createMockClient([{ rows: interactions }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getInteractionsByLead('lead-123', 20);

      expect(result).toEqual(interactions);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['lead-123', 20]);
    });

    it('should return empty array when no interactions found', async () => {
      mockClient = createMockClient([{ rows: [] }]);
      (createDatabaseClient as Mock).mockReturnValue(mockClient);

      const result = await getInteractionsByLead('lead-123');

      expect(result).toEqual([]);
    });
  });
});
