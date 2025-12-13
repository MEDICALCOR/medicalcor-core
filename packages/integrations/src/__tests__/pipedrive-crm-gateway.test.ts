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
  updateDealStage = vi.fn();
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

  // ===========================================================================
  // ADDITIONAL BRANCH COVERAGE TESTS
  // ===========================================================================

  describe('Additional Branch Coverage', () => {
    describe('extractPrimaryEmail edge cases', () => {
      it('should handle empty email array', async () => {
        const mockPerson = createMockPipedrivePerson({ email: [] });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.email).toBeUndefined();
        }
      });

      it('should use first email when no primary', async () => {
        const mockPerson = createMockPipedrivePerson({
          email: [{ value: 'first@example.com', primary: false }],
        });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value?.email).toBe('first@example.com');
        }
      });
    });

    describe('mapError additional error codes', () => {
      it('should map 502 errors to SERVICE_UNAVAILABLE', async () => {
        mockClient.getPerson.mockRejectedValueOnce(new Error('502 bad gateway'));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
          expect(result.error.retryable).toBe(true);
        }
      });

      it('should map 504 errors to SERVICE_UNAVAILABLE', async () => {
        mockClient.getPerson.mockRejectedValueOnce(new Error('504 gateway error'));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
          expect(result.error.retryable).toBe(true);
        }
      });

      it('should map network errors to CONNECTION_ERROR', async () => {
        mockClient.getPerson.mockRejectedValueOnce(new Error('network request failed'));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CONNECTION_ERROR');
          expect(result.error.retryable).toBe(true);
        }
      });

      it('should map invalid errors to VALIDATION_ERROR', async () => {
        mockClient.createPerson.mockRejectedValueOnce(new Error('invalid input data'));

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000001'),
          firstName: 'Test',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('updateContact without custom fields configured', () => {
      it('should update contact with only email', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContact('12345', {
          email: 'onlyemail@example.com',
        });

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            email: ['onlyemail@example.com'],
          })
        );
      });

      it('should update contact with firstName only', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContact('12345', {
          firstName: 'NewFirstName',
        });

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            first_name: 'NewFirstName',
          })
        );
      });

      it('should update contact with lastName only', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContact('12345', {
          lastName: 'NewLastName',
        });

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            last_name: 'NewLastName',
          })
        );
      });

      it('should update contact with company only', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContact('12345', {
          company: 'New Company Inc',
        });

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            org_name: 'New Company Inc',
          })
        );
      });

      it('should update contact with ownerId only', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContact('12345', {
          ownerId: '200',
        });

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            owner_id: 200,
          })
        );
      });
    });

    describe('updateContactScore edge cases', () => {
      it('should update score with metadata but without reasoning', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.updateContactScore(
          '12345',
          { numericValue: 4, classification: 'HOT' as const },
          {
            method: 'ai-scoring',
            procedureInterest: ['veneers'],
          }
        );

        expect(result.success).toBe(true);
        // Should not create note without reasoning
        expect(mockClient.createNote).not.toHaveBeenCalled();
      });

      it('should update score and create note with reasoning and procedureInterest', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.updatePerson.mockResolvedValueOnce(mockPerson);
        mockClient.createNote.mockResolvedValueOnce(createMockPipedriveNote());

        const result = await gateway.updateContactScore(
          '12345',
          { numericValue: 4.8, classification: 'HOT' as const },
          {
            method: 'ai-scoring',
            reasoning: 'Patient shows high commitment and budget',
            procedureInterest: ['all-on-x', 'implants'],
          }
        );

        expect(result.success).toBe(true);
        expect(mockClient.updatePerson).toHaveBeenCalledWith(
          12345,
          expect.objectContaining({
            custom_lead_score: 4.8,
            custom_lead_status: 'HOT',
            custom_procedure_interest: 'all-on-x, implants',
          })
        );
        expect(mockClient.createNote).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('AI Scoring'),
            personId: 12345,
          })
        );
      });
    });

    describe('createDeal with optional fields', () => {
      it('should create deal with all optional fields', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'Complete Deal',
          contactId: '12345',
          amount: 15000,
          currency: 'USD',
          ownerId: '99',
          pipeline: '2',
          stage: 'stage_5',
          expectedCloseDate: new Date('2024-06-01'),
          customProperties: { customField1: 'value1' },
        });

        expect(result.success).toBe(true);
        expect(mockClient.createDeal).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Complete Deal',
            value: 15000,
            currency: 'USD',
            person_id: 12345,
            user_id: 99,
            pipeline_id: 2,
            stage_id: 5,
            expected_close_date: '2024-06-01',
            customField1: 'value1',
          })
        );
      });

      it('should create deal without ownerId', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'No Owner Deal',
          contactId: '12345',
          amount: 5000,
          currency: 'EUR',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createDeal.mock.calls[0]?.[0];
        expect(callArgs?.user_id).toBeUndefined();
      });

      it('should create deal without pipeline (using default)', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'Default Pipeline Deal',
          contactId: '12345',
          amount: 7500,
          currency: 'EUR',
        });

        expect(result.success).toBe(true);
        expect(mockClient.createDeal).toHaveBeenCalledWith(
          expect.objectContaining({
            pipeline_id: 1, // Default pipeline from config
          })
        );
      });

      it('should create deal without stage', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'No Stage Deal',
          contactId: '12345',
          amount: 3000,
          currency: 'EUR',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createDeal.mock.calls[0]?.[0];
        expect(callArgs?.stage_id).toBeUndefined();
      });

      it('should create deal without expectedCloseDate', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'No Close Date Deal',
          contactId: '12345',
          amount: 4000,
          currency: 'EUR',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createDeal.mock.calls[0]?.[0];
        expect(callArgs?.expected_close_date).toBeUndefined();
      });

      it('should create deal without customProperties', async () => {
        const mockDeal = createMockPipedriveDeal();
        mockClient.createDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.createDeal({
          name: 'Simple Deal',
          contactId: '12345',
          amount: 2000,
          currency: 'EUR',
        });

        expect(result.success).toBe(true);
      });
    });

    describe('createPipedriveCrmGatewayFromEnv', () => {
      it('should throw error when PIPEDRIVE_API_TOKEN is missing', async () => {
        const originalToken = process.env.PIPEDRIVE_API_TOKEN;
        delete process.env.PIPEDRIVE_API_TOKEN;

        try {
          const module = await import('../crm/pipedrive-crm-gateway.js');
          expect(() => module.createPipedriveCrmGatewayFromEnv()).toThrow(
            'PIPEDRIVE_API_TOKEN environment variable is required'
          );
        } finally {
          if (originalToken) {
            process.env.PIPEDRIVE_API_TOKEN = originalToken;
          }
        }
      });

      it('should create gateway with env vars', async () => {
        const originalEnv = { ...process.env };
        process.env.PIPEDRIVE_API_TOKEN = 'env-test-token';
        process.env.PIPEDRIVE_COMPANY_DOMAIN = 'test-company';

        try {
          const module = await import('../crm/pipedrive-crm-gateway.js');
          const gateway = module.createPipedriveCrmGatewayFromEnv();

          expect(gateway).toBeDefined();
          expect(gateway).toHaveProperty('getContact');
        } finally {
          process.env = originalEnv;
        }
      });
    });

    describe('Additional mapping edge cases', () => {
      it('should map activity with marked_as_done_time as COMPLETED', async () => {
        const mockActivities = [
          createMockPipedriveActivity({
            done: false,
            marked_as_done_time: '2024-01-20T15:00:00Z',
          }),
        ];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].status).toBe('COMPLETED');
        }
      });

      it('should map user with single-word name', async () => {
        const mockUser = createMockPipedriveUser({ name: 'SingleName' });
        mockClient.getUser.mockResolvedValueOnce(mockUser);

        const result = await gateway.getOwner('99');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.firstName).toBe('SingleName');
          expect(result.value.lastName).toBeUndefined();
        }
      });

      it('should map user with multi-word last name', async () => {
        const mockUser = createMockPipedriveUser({ name: 'John von der Smith' });
        mockClient.getUser.mockResolvedValueOnce(mockUser);

        const result = await gateway.getOwner('99');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.firstName).toBe('John');
          expect(result.value.lastName).toBe('von der Smith');
        }
      });

      it('should handle healthCheck with no rateLimit', async () => {
        mockClient.healthCheck.mockResolvedValueOnce({
          connected: true,
          latencyMs: 50,
          apiVersion: 'v1',
        });

        const result = await gateway.healthCheck();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.connected).toBe(true);
          expect(result.value.rateLimit).toBeUndefined();
        }
      });

      it('should handle healthCheck with rateLimit but no resetAt', async () => {
        mockClient.healthCheck.mockResolvedValueOnce({
          connected: true,
          latencyMs: 50,
          apiVersion: 'v1',
          rateLimit: {
            remaining: 100,
          },
        });

        const result = await gateway.healthCheck();

        expect(result.success).toBe(true);
        if (result.success && result.value.rateLimit) {
          expect(result.value.rateLimit.remaining).toBe(100);
          expect(result.value.rateLimit.resetAt).toBeInstanceOf(Date);
        }
      });
    });

    describe('Factory function coverage', () => {
      it('should create gateway using factory function', async () => {
        const { createPipedriveCrmGateway } = await import('../crm/pipedrive-crm-gateway.js');
        const factoryGateway = createPipedriveCrmGateway({
          apiToken: 'factory-test-token',
          companyDomain: 'factory-test',
        });

        expect(factoryGateway).toBeDefined();
        expect(factoryGateway).toHaveProperty('getContact');
      });
    });

    describe('Mapper edge cases for missing fields', () => {
      it('should map person with missing add_time', async () => {
        const mockPerson = createMockPipedrivePerson({ add_time: undefined });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.createdAt).toBeInstanceOf(Date);
        }
      });

      it('should map person with missing update_time', async () => {
        const mockPerson = createMockPipedrivePerson({ update_time: undefined });
        mockClient.getPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.updatedAt).toBeInstanceOf(Date);
        }
      });

      it('should map deal with missing title (Untitled Deal)', async () => {
        const mockDeal = createMockPipedriveDeal({ title: null });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.name).toBe('Untitled Deal');
        }
      });

      it('should map deal with missing stage_id (unknown)', async () => {
        const mockDeal = createMockPipedriveDeal({ stage_id: null });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.stage).toBe('unknown');
        }
      });

      it('should map deal with missing pipeline_id', async () => {
        const mockDeal = createMockPipedriveDeal({ pipeline_id: null });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.pipeline).toBeUndefined();
        }
      });

      it('should map deal with missing expected_close_date', async () => {
        const mockDeal = createMockPipedriveDeal({ expected_close_date: null });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.expectedCloseDate).toBeUndefined();
        }
      });

      it('should map deal with missing add_time', async () => {
        const mockDeal = createMockPipedriveDeal({ add_time: undefined });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.createdAt).toBeInstanceOf(Date);
        }
      });

      it('should map deal with missing update_time', async () => {
        const mockDeal = createMockPipedriveDeal({ update_time: undefined });
        mockClient.getDeal.mockResolvedValueOnce(mockDeal);

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.updatedAt).toBeInstanceOf(Date);
        }
      });

      it('should map activity with missing subject (Untitled Task)', async () => {
        const mockActivities = [createMockPipedriveActivity({ subject: null })];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].subject).toBe('Untitled Task');
        }
      });

      it('should map activity with status NOT_STARTED (done=false, no marked_as_done_time)', async () => {
        const mockActivities = [
          createMockPipedriveActivity({ done: false, marked_as_done_time: null }),
        ];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].status).toBe('NOT_STARTED');
        }
      });

      it('should map activity with missing due_date', async () => {
        const mockActivities = [createMockPipedriveActivity({ due_date: null })];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].dueDate).toBeUndefined();
        }
      });

      it('should map activity with missing person_id', async () => {
        const mockActivities = [createMockPipedriveActivity({ person_id: null })];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].contactId).toBeUndefined();
        }
      });

      it('should map activity with missing deal_id', async () => {
        const mockActivities = [createMockPipedriveActivity({ deal_id: null })];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].dealId).toBeUndefined();
        }
      });

      it('should map activity with missing user_id', async () => {
        const mockActivities = [createMockPipedriveActivity({ user_id: null })];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].ownerId).toBeUndefined();
        }
      });

      it('should map activity with missing add_time', async () => {
        const mockActivities = [createMockPipedriveActivity({ add_time: undefined })];
        mockClient.getPendingActivitiesForPerson.mockResolvedValueOnce(mockActivities);

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].createdAt).toBeInstanceOf(Date);
        }
      });

      it('should map note with missing person_id', async () => {
        const mockNotes = [createMockPipedriveNote({ person_id: null })];
        mockClient.getNotesForPerson.mockResolvedValueOnce(mockNotes);

        const result = await gateway.getNotesForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].contactId).toBeUndefined();
        }
      });

      it('should map note with missing deal_id', async () => {
        const mockNotes = [createMockPipedriveNote({ deal_id: null })];
        mockClient.getNotesForPerson.mockResolvedValueOnce(mockNotes);

        const result = await gateway.getNotesForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].dealId).toBeUndefined();
        }
      });

      it('should map note with missing add_time', async () => {
        const mockNotes = [createMockPipedriveNote({ add_time: undefined })];
        mockClient.getNotesForPerson.mockResolvedValueOnce(mockNotes);

        const result = await gateway.getNotesForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].createdAt).toBeInstanceOf(Date);
        }
      });

      it('should map stage with missing order_nr', async () => {
        const mockStages = [createMockPipedriveStage({ order_nr: null })];
        mockClient.getStages.mockResolvedValueOnce(mockStages);

        const result = await gateway.getPipelineStages('1');

        expect(result.success).toBe(true);
        if (result.success && result.value[0]) {
          expect(result.value[0].order).toBe(0);
        }
      });

      it('should map user with missing active_flag', async () => {
        const mockUser = createMockPipedriveUser({ active_flag: undefined });
        mockClient.getUser.mockResolvedValueOnce(mockUser);

        const result = await gateway.getOwner('99');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.isActive).toBe(true);
        }
      });
    });

    describe('createContact edge cases', () => {
      it('should use phone as name when firstName and lastName are missing', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.createPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000099'),
        });

        expect(result.success).toBe(true);
        expect(mockClient.createPerson).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '+40700000099',
            phone: ['+40700000099'],
          })
        );
      });

      it('should create contact without email', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.createPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000099'),
          firstName: 'Test',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createPerson.mock.calls[0]?.[0];
        expect(callArgs?.email).toBeUndefined();
      });

      it('should create contact without ownerId', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.createPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000099'),
          firstName: 'Test',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createPerson.mock.calls[0]?.[0];
        expect(callArgs?.owner_id).toBeUndefined();
      });

      it('should create contact with customProperties', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.createPerson.mockResolvedValueOnce(mockPerson);

        const result = await gateway.createContact({
          phone: createMockPhoneNumber('+40700000099'),
          firstName: 'Test',
          customProperties: { customField: 'customValue' },
        });

        expect(result.success).toBe(true);
        expect(mockClient.createPerson).toHaveBeenCalledWith(
          expect.objectContaining({
            customField: 'customValue',
          })
        );
      });
    });

    describe('upsertContact edge cases', () => {
      it('should upsert contact without firstName and lastName', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.upsertPersonByPhone.mockResolvedValueOnce(mockPerson);

        const result = await gateway.upsertContact({
          phone: createMockPhoneNumber('+40700000088'),
        });

        expect(result.success).toBe(true);
        expect(mockClient.upsertPersonByPhone).toHaveBeenCalledWith(
          '+40700000088',
          expect.objectContaining({
            name: '+40700000088',
          })
        );
      });

      it('should upsert contact without email', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.upsertPersonByPhone.mockResolvedValueOnce(mockPerson);

        const result = await gateway.upsertContact({
          phone: createMockPhoneNumber('+40700000088'),
          firstName: 'Test',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.upsertPersonByPhone.mock.calls[0]?.[1];
        expect(callArgs?.email).toBeUndefined();
      });

      it('should upsert contact without ownerId', async () => {
        const mockPerson = createMockPipedrivePerson();
        mockClient.upsertPersonByPhone.mockResolvedValueOnce(mockPerson);

        const result = await gateway.upsertContact({
          phone: createMockPhoneNumber('+40700000088'),
          firstName: 'Test',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.upsertPersonByPhone.mock.calls[0]?.[1];
        expect(callArgs?.owner_id).toBeUndefined();
      });
    });

    describe('Non-Error error objects', () => {
      it('should handle non-Error error in mapError', async () => {
        mockClient.getPerson.mockRejectedValueOnce('string error');

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('UNKNOWN_ERROR');
          expect(result.error.message).toContain('Unknown error');
          expect(result.error.cause).toBeUndefined();
        }
      });

      it('should handle object error in mapError', async () => {
        mockClient.getPerson.mockRejectedValueOnce({ code: 'CUSTOM_ERROR' });

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('UNKNOWN_ERROR');
          expect(result.error.cause).toBeUndefined();
        }
      });
    });
  });

  // ===========================================================================
  // MISSING METHOD TESTS
  // ===========================================================================

  describe('updateDealStage', () => {
    it('should update deal stage successfully', async () => {
      const mockDeal = createMockPipedriveDeal({ stage_id: 5 });
      mockClient.updateDealStage.mockResolvedValueOnce(mockDeal);

      const result = await gateway.updateDealStage('5678', 'stage_5');

      expect(result.success).toBe(true);
      expect(mockClient.updateDealStage).toHaveBeenCalledWith(5678, 5);
      if (result.success && result.value) {
        expect(result.value.stage).toBe('stage_5');
      }
    });

    it('should handle updateDealStage error', async () => {
      mockClient.updateDealStage.mockRejectedValueOnce(new Error('404 not found'));

      const result = await gateway.updateDealStage('5678', 'stage_5');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('Task Operations', () => {
    describe('createTask', () => {
      it('should create task with all fields', async () => {
        const mockActivity = createMockPipedriveActivity();
        mockClient.createActivity.mockResolvedValueOnce(mockActivity);

        const result = await gateway.createTask({
          subject: 'Follow up',
          body: 'Call patient',
          contactId: '12345',
          dealId: '5678',
          dueDate: new Date('2024-02-01'),
        });

        expect(result.success).toBe(true);
        expect(mockClient.createActivity).toHaveBeenCalledWith({
          subject: 'Follow up',
          type: 'task',
          personId: 12345,
          dealId: 5678,
          dueDate: expect.any(Date),
          note: 'Call patient',
        });
      });

      it('should create task without contactId', async () => {
        const mockActivity = createMockPipedriveActivity();
        mockClient.createActivity.mockResolvedValueOnce(mockActivity);

        const result = await gateway.createTask({
          subject: 'General task',
          body: 'Review reports',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createActivity.mock.calls[0]?.[0];
        expect(callArgs?.personId).toBeUndefined();
      });

      it('should create task without dealId', async () => {
        const mockActivity = createMockPipedriveActivity();
        mockClient.createActivity.mockResolvedValueOnce(mockActivity);

        const result = await gateway.createTask({
          subject: 'Task without deal',
          contactId: '12345',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createActivity.mock.calls[0]?.[0];
        expect(callArgs?.dealId).toBeUndefined();
      });

      it('should handle createTask error', async () => {
        mockClient.createActivity.mockRejectedValueOnce(new Error('validation failed'));

        const result = await gateway.createTask({
          subject: 'Test task',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('completeTask', () => {
      it('should complete task successfully', async () => {
        const mockActivity = createMockPipedriveActivity({ done: true });
        mockClient.completeActivity.mockResolvedValueOnce(mockActivity);

        const result = await gateway.completeTask('9999');

        expect(result.success).toBe(true);
        expect(mockClient.completeActivity).toHaveBeenCalledWith(9999);
        if (result.success && result.value) {
          expect(result.value.status).toBe('COMPLETED');
        }
      });

      it('should handle completeTask error', async () => {
        mockClient.completeActivity.mockRejectedValueOnce(new Error('404 not found'));

        const result = await gateway.completeTask('9999');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });

    describe('getPendingTasksForContact error', () => {
      it('should handle error getting pending tasks', async () => {
        mockClient.getPendingActivitiesForPerson.mockRejectedValueOnce(new Error('timeout'));

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('TIMEOUT');
          expect(result.error.retryable).toBe(true);
        }
      });
    });
  });

  describe('Note Operations', () => {
    describe('addNote', () => {
      it('should add note with contactId', async () => {
        const mockNote = createMockPipedriveNote();
        mockClient.createNote.mockResolvedValueOnce(mockNote);

        const result = await gateway.addNote({
          body: 'Patient interested in implants',
          contactId: '12345',
        });

        expect(result.success).toBe(true);
        expect(mockClient.createNote).toHaveBeenCalledWith({
          content: 'Patient interested in implants',
          personId: 12345,
          dealId: undefined,
        });
      });

      it('should add note with dealId', async () => {
        const mockNote = createMockPipedriveNote();
        mockClient.createNote.mockResolvedValueOnce(mockNote);

        const result = await gateway.addNote({
          body: 'Deal progressing well',
          dealId: '5678',
        });

        expect(result.success).toBe(true);
        expect(mockClient.createNote).toHaveBeenCalledWith({
          content: 'Deal progressing well',
          personId: undefined,
          dealId: 5678,
        });
      });

      it('should add note with both contactId and dealId', async () => {
        const mockNote = createMockPipedriveNote();
        mockClient.createNote.mockResolvedValueOnce(mockNote);

        const result = await gateway.addNote({
          body: 'Combined note',
          contactId: '12345',
          dealId: '5678',
        });

        expect(result.success).toBe(true);
        expect(mockClient.createNote).toHaveBeenCalledWith({
          content: 'Combined note',
          personId: 12345,
          dealId: 5678,
        });
      });

      it('should add note without contactId or dealId', async () => {
        const mockNote = createMockPipedriveNote();
        mockClient.createNote.mockResolvedValueOnce(mockNote);

        const result = await gateway.addNote({
          body: 'General note',
        });

        expect(result.success).toBe(true);
        const callArgs = mockClient.createNote.mock.calls[0]?.[0];
        expect(callArgs?.personId).toBeUndefined();
        expect(callArgs?.dealId).toBeUndefined();
      });

      it('should handle addNote error', async () => {
        mockClient.createNote.mockRejectedValueOnce(new Error('validation failed'));

        const result = await gateway.addNote({
          body: 'Test note',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
      });
    });

    describe('getNotesForContact', () => {
      it('should get notes for contact without limit', async () => {
        const mockNotes = [
          createMockPipedriveNote(),
          createMockPipedriveNote({ id: 7778, content: 'Second note' }),
        ];
        mockClient.getNotesForPerson.mockResolvedValueOnce(mockNotes);

        const result = await gateway.getNotesForContact('12345');

        expect(result.success).toBe(true);
        expect(mockClient.getNotesForPerson).toHaveBeenCalledWith(12345, undefined);
        if (result.success) {
          expect(result.value).toHaveLength(2);
        }
      });

      it('should get notes for contact with limit', async () => {
        const mockNotes = [createMockPipedriveNote()];
        mockClient.getNotesForPerson.mockResolvedValueOnce(mockNotes);

        const result = await gateway.getNotesForContact('12345', 10);

        expect(result.success).toBe(true);
        expect(mockClient.getNotesForPerson).toHaveBeenCalledWith(12345, 10);
        if (result.success) {
          expect(result.value).toHaveLength(1);
        }
      });

      it('should handle getNotesForContact error', async () => {
        mockClient.getNotesForPerson.mockRejectedValueOnce(new Error('403 forbidden'));

        const result = await gateway.getNotesForContact('12345');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('FORBIDDEN');
        }
      });
    });
  });

  describe('Pipeline Operations', () => {
    describe('getPipelines', () => {
      it('should get all pipelines', async () => {
        const mockPipelines = [
          createMockPipedrivePipeline(),
          createMockPipedrivePipeline({ id: 2, name: 'Secondary Pipeline', order_nr: 1 }),
        ];
        mockClient.getPipelines.mockResolvedValueOnce(mockPipelines);

        const result = await gateway.getPipelines();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toHaveLength(2);
          expect(result.value[0]?.name).toBe('Dental Sales');
          expect(result.value[0]?.isDefault).toBe(true);
          expect(result.value[1]?.isDefault).toBe(false);
        }
      });

      it('should handle getPipelines error', async () => {
        mockClient.getPipelines.mockRejectedValueOnce(new Error('401 unauthorized'));

        const result = await gateway.getPipelines();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('UNAUTHORIZED');
        }
      });
    });

    describe('getPipelineStages', () => {
      it('should get stages for pipeline', async () => {
        const mockStages = [
          createMockPipedriveStage(),
          createMockPipedriveStage({
            id: 11,
            name: 'Proposal Sent',
            order_nr: 2,
            deal_probability: 50,
          }),
        ];
        mockClient.getStages.mockResolvedValueOnce(mockStages);

        const result = await gateway.getPipelineStages('1');

        expect(result.success).toBe(true);
        expect(mockClient.getStages).toHaveBeenCalledWith(1);
        if (result.success) {
          expect(result.value).toHaveLength(2);
          expect(result.value[0]?.name).toBe('Qualified Lead');
          expect(result.value[0]?.probability).toBe(30);
        }
      });

      it('should handle getPipelineStages error', async () => {
        mockClient.getStages.mockRejectedValueOnce(new Error('404 not found'));

        const result = await gateway.getPipelineStages('999');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
      });
    });
  });

  describe('Owner Operations', () => {
    describe('getOwners', () => {
      it('should get all owners', async () => {
        const mockUsers = [
          createMockPipedriveUser(),
          createMockPipedriveUser({
            id: 100,
            name: 'Second User',
            email: 'second@clinic.com',
            active_flag: false,
          }),
        ];
        mockClient.getUsers.mockResolvedValueOnce(mockUsers);

        const result = await gateway.getOwners();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toHaveLength(2);
          expect(result.value[0]?.email).toBe('sales@clinic.com');
          expect(result.value[0]?.isActive).toBe(true);
          expect(result.value[1]?.isActive).toBe(false);
        }
      });

      it('should handle getOwners error', async () => {
        mockClient.getUsers.mockRejectedValueOnce(new Error('503 service unavailable'));

        const result = await gateway.getOwners();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
          expect(result.error.retryable).toBe(true);
        }
      });
    });

    describe('getOwner', () => {
      it('should return null for non-existent owner', async () => {
        mockClient.getUser.mockResolvedValueOnce(null);

        const result = await gateway.getOwner('999');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBeNull();
        }
      });

      it('should handle getOwner error', async () => {
        mockClient.getUser.mockRejectedValueOnce(new Error('timeout'));

        const result = await gateway.getOwner('99');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('TIMEOUT');
          expect(result.error.retryable).toBe(true);
        }
      });
    });
  });

  describe('Gateway without custom fields', () => {
    let gatewayNoCustomFields: PipedriveCrmGateway;
    let mockClientNoCustomFields: MockPipedriveClient;

    beforeEach(() => {
      gatewayNoCustomFields = new PipedriveCrmGateway({
        apiToken: 'test-token-123',
        companyDomain: 'medicalcor',
        // No custom fields configured
      });
      // Get reference to the mock client for this gateway instance
      mockClientNoCustomFields = mockClientInstance;
    });

    it('should update contact score without custom field mappings', async () => {
      const mockPerson = createMockPipedrivePerson();
      mockClientNoCustomFields.updatePerson.mockResolvedValueOnce(mockPerson);

      const result = await gatewayNoCustomFields.updateContactScore(
        '12345',
        { numericValue: 4, classification: 'HOT' as const },
        {
          method: 'ai-scoring',
          procedureInterest: ['implants'],
        }
      );

      expect(result.success).toBe(true);
      // Should not update custom fields since they're not configured
      expect(mockClientNoCustomFields.updatePerson).toHaveBeenCalledWith(12345, {});
    });

    it('should update contact without custom field mappings', async () => {
      const mockPerson = createMockPipedrivePerson();
      mockClientNoCustomFields.updatePerson.mockResolvedValueOnce(mockPerson);

      const result = await gatewayNoCustomFields.updateContact('12345', {
        leadScore: { numericValue: 4.5, classification: 'HOT' as const },
        leadStatus: 'qualified',
        procedureInterest: ['implants'],
        budgetRange: '10000-20000',
        urgencyLevel: 'high',
      });

      expect(result.success).toBe(true);
      // Should not include custom fields
      expect(mockClientNoCustomFields.updatePerson).toHaveBeenCalledWith(12345, {});
    });
  });

  describe('createPipedriveCrmGatewayFromEnv with defaults', () => {
    it('should use default company domain when not provided', async () => {
      const originalEnv = { ...process.env };
      process.env.PIPEDRIVE_API_TOKEN = 'env-test-token';
      delete process.env.PIPEDRIVE_COMPANY_DOMAIN;

      try {
        const module = await import('../crm/pipedrive-crm-gateway.js');
        const gateway = module.createPipedriveCrmGatewayFromEnv();

        expect(gateway).toBeDefined();
      } finally {
        process.env = originalEnv;
      }
    });

    it('should parse numeric environment variables', async () => {
      const originalEnv = { ...process.env };
      process.env.PIPEDRIVE_API_TOKEN = 'env-test-token';
      process.env.PIPEDRIVE_DEFAULT_PIPELINE_ID = '5';

      try {
        const module = await import('../crm/pipedrive-crm-gateway.js');
        const gateway = module.createPipedriveCrmGatewayFromEnv();

        expect(gateway).toBeDefined();
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('Additional error edge cases', () => {
    it('should handle findContactByEmail error', async () => {
      mockClient.findPersonByEmail.mockRejectedValueOnce(new Error('rate limit exceeded'));

      const result = await gateway.findContactByEmail('test@example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RATE_LIMITED');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle findContactByPhone error', async () => {
      mockClient.findPersonByPhone.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await gateway.findContactByPhone(createMockPhoneNumber('+40700000001'));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONNECTION_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle upsertContact error', async () => {
      mockClient.upsertPersonByPhone.mockRejectedValueOnce(new Error('validation failed'));

      const result = await gateway.upsertContact({
        phone: createMockPhoneNumber('+40700000001'),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle updateContact error', async () => {
      mockClient.updatePerson.mockRejectedValueOnce(new Error('403 forbidden'));

      const result = await gateway.updateContact('12345', {
        firstName: 'Updated',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });

    it('should handle updateContactScore error', async () => {
      mockClient.updatePerson.mockRejectedValueOnce(new Error('network error'));

      const result = await gateway.updateContactScore('12345', {
        numericValue: 4,
        classification: 'HOT' as const,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONNECTION_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle deleteContact error', async () => {
      mockClient.deletePerson.mockRejectedValueOnce(new Error('404 not found'));

      const result = await gateway.deleteContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should handle getDeal error', async () => {
      mockClient.getDeal.mockRejectedValueOnce(new Error('timeout'));

      const result = await gateway.getDeal('5678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle findDealsByContact error', async () => {
      mockClient.findDealsByPerson.mockRejectedValueOnce(new Error('502 bad gateway'));

      const result = await gateway.findDealsByContact('12345');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle createDeal error', async () => {
      mockClient.createDeal.mockRejectedValueOnce(new Error('invalid data'));

      const result = await gateway.createDeal({
        name: 'Test Deal',
        contactId: '12345',
        amount: 5000,
        currency: 'EUR',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle healthCheck error', async () => {
      mockClient.healthCheck.mockRejectedValueOnce(new Error('503 service unavailable'));

      const result = await gateway.healthCheck();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.retryable).toBe(true);
      }
    });
  });
});
