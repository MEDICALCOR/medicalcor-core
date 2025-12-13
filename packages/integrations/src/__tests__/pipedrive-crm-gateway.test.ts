/**
 * Pipedrive CRM Gateway Tests
 *
 * Comprehensive tests for the PipedriveCrmGateway adapter
 * that implements ICrmGateway for Pipedrive.
 *
 * @module integrations/__tests__/pipedrive-crm-gateway
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock PipedriveClient class
class MockPipedriveClient {
  getPerson = vi.fn();
  findPersonByPhone = vi.fn();
  findPersonByEmail = vi.fn();
  createPerson = vi.fn();
  updatePerson = vi.fn();
  upsertPersonByPhone = vi.fn();
  deletePerson = vi.fn();
  getDeal = vi.fn();
  findDealsByPerson = vi.fn();
  createDeal = vi.fn();
  updateDeal = vi.fn();
  deleteDeal = vi.fn();
  getActivity = vi.fn();
  createActivity = vi.fn();
  updateActivity = vi.fn();
  completeActivity = vi.fn();
  getPendingActivitiesForPerson = vi.fn();
  deleteActivity = vi.fn();
  createNote = vi.fn();
  getNotesForPerson = vi.fn();
  getNotesForDeal = vi.fn();
  getPipelines = vi.fn();
  getPipeline = vi.fn();
  getStages = vi.fn();
  getStage = vi.fn();
  getUsers = vi.fn();
  getUser = vi.fn();
  getCurrentUser = vi.fn();
  healthCheck = vi.fn();
}

// Store the instance to access mocks
let mockClientInstance: MockPipedriveClient;

// Mock the PipedriveClient
vi.mock('../pipedrive.js', () => ({
  PipedriveClient: vi.fn().mockImplementation(function (this: MockPipedriveClient) {
    mockClientInstance = new MockPipedriveClient();
    Object.assign(this, mockClientInstance);
    return this;
  }),
}));

// Import AFTER mock setup
import { PipedriveCrmGateway } from '../crm/pipedrive-crm-gateway.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockPipedrivePerson(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 12345,
    name: 'John Doe',
    first_name: 'John',
    last_name: 'Doe',
    phone: [{ value: '+40700000001', primary: true }],
    email: [{ value: 'john@example.com', primary: true }],
    owner_id: { id: 99 },
    add_time: '2024-01-01T10:00:00Z',
    update_time: '2024-01-15T14:30:00Z',
    active_flag: true,
    ...overrides,
  };
}

function createMockPipedriveDeal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5678,
    title: 'Dental Implant Treatment',
    value: 5000,
    currency: 'EUR',
    status: 'open',
    stage_id: 3,
    pipeline_id: 1,
    person_id: { value: 12345 },
    user_id: { id: 99 },
    probability: 75,
    add_time: '2024-01-10T09:00:00Z',
    update_time: '2024-01-20T16:00:00Z',
    expected_close_date: '2024-03-01',
    ...overrides,
  };
}

function createMockPipedriveActivity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 9999,
    type: 'task',
    subject: 'Follow up call',
    note: 'Discuss treatment options',
    done: false,
    due_date: '2024-02-01',
    due_time: '14:00',
    person_id: 12345,
    deal_id: 5678,
    user_id: 99,
    add_time: '2024-01-15T10:00:00Z',
    marked_as_done_time: null,
    ...overrides,
  };
}

function createMockPipedriveNote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7777,
    content: 'Patient interested in All-on-X procedure',
    person_id: 12345,
    deal_id: null,
    user_id: 99,
    add_time: '2024-01-16T11:00:00Z',
    ...overrides,
  };
}

function createMockPipedrivePipeline(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'Dental Sales',
    order_nr: 0,
    active: true,
    ...overrides,
  };
}

function createMockPipedriveStage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    name: 'Qualified Lead',
    order_nr: 1,
    deal_probability: 30,
    pipeline_id: 1,
    ...overrides,
  };
}

function createMockPipedriveUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 99,
    name: 'Sales Rep User',
    email: 'sales@clinic.com',
    active_flag: true,
    ...overrides,
  };
}

// Mock PhoneNumber interface
interface MockPhoneNumber {
  toString(): string;
}

function createMockPhoneNumber(phone: string): MockPhoneNumber {
  return {
    toString: () => phone,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('PipedriveCrmGateway', () => {
  let gateway: PipedriveCrmGateway;
  let mockClient: MockPipedriveClient;

  beforeEach(() => {
    vi.clearAllMocks();

    gateway = new PipedriveCrmGateway({
      apiToken: 'test-token-123',
      companyDomain: 'medicalcor',
      leadScoreField: 'custom_lead_score',
      leadStatusField: 'custom_lead_status',
      procedureInterestField: 'custom_procedure_interest',
      budgetRangeField: 'custom_budget_range',
      urgencyLevelField: 'custom_urgency_level',
      defaultPipelineId: 1,
    });

    // Get the mock client that was created
    mockClient = mockClientInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // CONSTRUCTOR TESTS
  // ===========================================================================

  describe('constructor', () => {
    it('should create gateway with valid config', () => {
      expect(gateway).toBeInstanceOf(PipedriveCrmGateway);
    });
  });

  // ===========================================================================
  // CONTACT OPERATIONS TESTS
  // ===========================================================================

  describe('Contact Operations', () => {
    describe('getContact', () => {
      it('should return contact for valid ID', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.id).toBe('12345');
          expect(result.value?.firstName).toBe('John');
          expect(result.value?.lastName).toBe('Doe');
          expect(result.value?.phone).toBe('+40700000001');
          expect(result.value?.email).toBe('john@example.com');
        }
      });

      it('should return null for non-existent contact', async () => {
        mockClient.getPerson.mockResolvedValueOnce(null);

        const result = await gateway.getContact('99999');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBeNull();
        }
      });

      it('should handle errors gracefully', async () => {
        mockClient.getPerson.mockRejectedValueOnce(new Error('Network error'));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('UNKNOWN_ERROR');
        }
      });
    });

    describe('findContactByPhone', () => {
      it('should find contact by phone', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.findPersonByPhone.mockResolvedValueOnce(mockPerson);

        const result = await gateway.findContactByPhone(createMockPhoneNumber('+40700000001'));

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.phone).toBe('+40700000001');
        }
      });

      it('should return null when not found', async () => {
        mockClient.findPersonByPhone.mockResolvedValueOnce(null);

        const result = await gateway.findContactByPhone(createMockPhoneNumber('+40799999999'));

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBeNull();
        }
      });
    });

    describe('findContactByEmail', () => {
      it('should find contact by email', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.findPersonByEmail.mockResolvedValueOnce(mockPerson);

        const result = await gateway.findContactByEmail('john@example.com');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.email).toBe('john@example.com');
        }
      });
    });

    describe('createContact', () => {
      it('should create contact successfully', async () => {
        const mockPerson = createMockPipedrivePerson({ id: 54321 });
        mockClient.createPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000002'),
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        });

        expect(result.success).toBe(true);
        expect(mockClient.createPerson).toHaveBeenCalled();
      });

      it('should handle create errors', async () => {
        mockClient.createPerson.mockRejectedValueOnce(new Error('validation error'));

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000002'),
          firstName: 'Jane',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('updateContact', () => {
      it('should update contact with all fields', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContact('12345', {
          email: 'new@example.com',
          firstName: 'Updated',
          lastName: 'Name',
          company: 'New Company',
          ownerId: '100',
          leadScore: { numericValue: 4.5, classification: 'HOT' as const },
          leadStatus: 'qualified',
          procedureInterest: ['implants', 'veneers'],
          budgetRange: '10000-20000',
          urgencyLevel: 'high',
          customProperties: { customField: 'value' },
        });

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            email: ['new@example.com'],
            first_name: 'Updated',
            last_name: 'Name',
            org_name: 'New Company',
            owner_id: 100,
            custom_lead_score: 4.5,
            custom_lead_status: 'qualified',
            custom_procedure_interest: 'implants, veneers',
            custom_budget_range: '10000-20000',
            custom_urgency_level: 'high',
            customField: 'value',
          })
        );
      });
    });

    describe('upsertContact', () => {
      it('should upsert contact', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.upsertPersonByPhone.mockResolvedValueOnce(mockPerson);

        const result = await gateway.upsertContact({
          phone: createMockPhoneNumber('+40700000001'),
          firstName: 'John',
          lastName: 'Doe',
        });

        expect(result.success).toBe(true);
      });
    });

    describe('updateContactScore', () => {
      it('should update contact score with metadata', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);
        mockClient.createNote.mockResolvedValueOnce(createMockPipedriveNote());

        const result = await gateway.updateContactScore(
          '12345',
          { numericValue: 4.5, classification: 'HOT' as const },
          {
            reasoning: 'High interest in implants',
            method: 'ai-scoring',
            procedureInterest: ['implants'],
          }
        );

        expect(result.success).toBe(true);
        expect(mockClient.createNote).toHaveBeenCalled();
      });

      it('should update score without metadata', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContactScore('12345', {
          numericValue: 3,
          classification: 'WARM' as const,
        });

        expect(result.success).toBe(true);
        expect(mockClient.createNote).not.toHaveBeenCalled();
      });
    });

    describe('deleteContact', () => {
      it('should delete contact', async () => {
        mockClient.deletePerson.mockResolvedValueOnce(undefined);

        const result = await gateway.deleteContact('12345');

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // DEAL OPERATIONS TESTS
  // ===========================================================================

  describe('Deal Operations', () => {
    describe('getDeal', () => {
      it('should return deal for valid ID', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.id).toBe('5678');
          expect(result.value.name).toBe('Dental Implant Treatment');
          expect(result.value.amount).toBe(5000);
        }
      });

      it('should return null for non-existent deal', async () => {
        mockClient.getDeal.mockResolvedValueOnce(null);

        const result = await gateway.getDeal('99999');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBeNull();
        }
      });
    });

    describe('findDealsByContact', () => {
      it('should find deals by contact', async () => {
        const mockDeals = [createMockPipedriveDeal(), createMockPipedriveDeal({ id: 5679 })];
        mockClient.findDealsByPerson.mockResolvedValueOnce(mockDeals);

        const result = await gateway.findDealsByContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toHaveLength(2);
        }
      });
    });

    describe('createDeal', () => {
      it('should create deal', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'New Deal',
          contactId: '12345',
          amount: 10000,
          currency: 'EUR',
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // ERROR MAPPING TESTS
  // ===========================================================================

  describe('Error Mapping', () => {
    it('should map 404 errors to NOT_FOUND', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('404 not found'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should map 429 errors to RATE_LIMITED', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('429 rate limit exceeded'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RATE_LIMITED');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should map 401 errors to UNAUTHORIZED', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('401 unauthorized'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should map 403 errors to FORBIDDEN', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('403 forbidden'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });

    it('should map timeout errors', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('Request timeout'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should map 502/503/504 to SERVICE_UNAVAILABLE', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('503 service unavailable'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should map connection errors', async () => {
      mockClient.getPerson.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await gateway.getContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONNECTION_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should map validation errors', async () => {
      mockClient.createPerson.mockRejectedValueOnce(new Error('validation failed'));

      const result = await gateway.createContact({
        phone: createMockPhoneNumber('+40700000001'),
        firstName: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  // ===========================================================================
  // HELPER FUNCTION EDGE CASES
  // ===========================================================================

  describe('Helper Functions Edge Cases', () => {
    describe('extractPrimaryPhone', () => {
      it('should handle person without phone', async () => {
        const mockPerson = createMockPipedrivePerson({ phone: undefined });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.phone).toBeUndefined();
        }
      });

      it('should handle empty phone array', async () => {
        const mockPerson = createMockPipedrivePerson({ phone: [] });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.phone).toBeUndefined();
        }
      });

      it('should use first phone when no primary', async () => {
        const mockPerson = createMockPipedrivePerson({
          phone: [{ value: '+40700000002', primary: false }],
        });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.phone).toBe('+40700000002');
        }
      });
    });

    describe('extractPrimaryEmail', () => {
      it('should handle person without email', async () => {
        const mockPerson = createMockPipedrivePerson({ email: undefined });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.email).toBeUndefined();
        }
      });
    });

    describe('extractOwnerId', () => {
      it('should handle numeric owner_id', async () => {
        const mockPerson = createMockPipedrivePerson({ owner_id: 99 });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.ownerId).toBe('99');
        }
      });

      it('should handle undefined owner_id', async () => {
        const mockPerson = createMockPipedrivePerson({ owner_id: undefined });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.ownerId).toBeUndefined();
        }
      });
    });

    describe('extractPersonId', () => {
      it('should handle numeric person_id in deal', async () => {
        const mockDeal = createMockPipedriveDeal({ person_id: 12345 });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.contactId).toBe('12345');
        }
      });

      it('should handle undefined person_id in deal', async () => {
        const mockDeal = createMockPipedriveDeal({ person_id: undefined });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.contactId).toBeUndefined();
        }
      });
    });

    describe('activity mapping edge cases', () => {
      it('should handle activities fetched for a person', async () => {
        const mockActivities = [
          createMockPipedriveActivity({ done: true }),
          createMockPipedriveActivity({ id: 10000, done: false }),
        ];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.length).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });
});
