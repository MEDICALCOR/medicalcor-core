/**
 * Pipedrive CRM Gateway Tests - Light Mocking Approach
 *
 * Tests for the PipedriveCrmGateway using HTTP-level mocking
 * to ensure the gateway code is actually executed and covered.
 *
 * @module integrations/__tests__/pipedrive-crm-gateway
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipedriveCrmGateway } from '../crm/pipedrive-crm-gateway.js';

// =============================================================================
// HTTP RESPONSE HELPERS
// =============================================================================

function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    clone: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function createPipedriveSuccessResponse<T>(data: T): Response {
  return createMockResponse({ success: true, data });
}

function createPipedriveErrorResponse(error: string, status = 400): Response {
  return createMockResponse({ success: false, error }, status);
}

// =============================================================================
// TEST DATA FACTORIES
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
    subject: 'Follow-up call',
    type: 'call',
    done: false,
    due_date: '2024-02-15',
    due_time: '10:00',
    note: 'Call patient about treatment plan',
    person_id: 12345,
    deal_id: 5678,
    user_id: 99,
    add_time: '2024-01-20T09:00:00Z',
    marked_as_done_time: null,
    ...overrides,
  };
}

function createMockPipedriveNote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7777,
    content: 'Patient expressed interest in All-on-X',
    person_id: 12345,
    deal_id: 5678,
    user_id: 99,
    add_time: '2024-01-22T11:00:00Z',
    ...overrides,
  };
}

function createMockPipedrivePipeline(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'Dental Sales Pipeline',
    active: true,
    order_nr: 1,
    ...overrides,
  };
}

function createMockPipedriveStage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    name: 'Consultation Scheduled',
    pipeline_id: 1,
    order_nr: 3,
    active_flag: true,
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
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Store and mock fetch
    originalFetch = global.fetch;
    global.fetch = vi.fn();

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
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.id).toBe('12345');
          expect(result.value.firstName).toBe('John');
          expect(result.value.lastName).toBe('Doe');
          expect(result.value.phone).toBe('+40700000001');
          expect(result.value.email).toBe('john@example.com');
        }
      });

      it('should return null for non-existent contact', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(null));

        const result = await gateway.getContact('99999');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBeNull();
        }
      });

      it('should handle network errors', async () => {
        vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(false);
      });

      it('should handle person with no primary phone', async () => {
        const mockPerson = createMockPipedrivePerson({
          phone: [{ value: '+40700000002', primary: false }],
        });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          // Should fall back to first phone
          expect(result.value.phone).toBe('+40700000002');
        }
      });

      it('should handle person with no phones', async () => {
        const mockPerson = createMockPipedrivePerson({ phone: [] });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.phone).toBeUndefined();
        }
      });

      it('should handle person with no primary email', async () => {
        const mockPerson = createMockPipedrivePerson({
          email: [{ value: 'alt@example.com', primary: false }],
        });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.email).toBe('alt@example.com');
        }
      });

      it('should handle owner_id as number', async () => {
        const mockPerson = createMockPipedrivePerson({ owner_id: 99 });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.ownerId).toBe('99');
        }
      });

      it('should handle missing add_time and update_time', async () => {
        const mockPerson = createMockPipedrivePerson({
          add_time: undefined,
          update_time: undefined,
        });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.getContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.createdAt).toBeInstanceOf(Date);
          expect(result.value.updatedAt).toBeInstanceOf(Date);
        }
      });
    });

    describe('findContactByPhone', () => {
      it('should find contact by phone', async () => {
        const mockPerson = createMockPipedrivePerson();
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.findContactByPhone(createMockPhoneNumber('+40700000001'));

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.phone).toBe('+40700000001');
        }
      });

      it('should return null when not found', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(null));

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
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.findContactByEmail('john@example.com');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.email).toBe('john@example.com');
        }
      });
    });

    describe('createContact', () => {
      it('should create a new contact', async () => {
        const mockPerson = createMockPipedrivePerson({ id: 12346 });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.createContact({
          firstName: 'John',
          lastName: 'Doe',
          phone: createMockPhoneNumber('+40700000001'),
          email: 'john@example.com',
        });

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.id).toBe('12346');
        }
      });

      it('should handle API errors on create', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveErrorResponse('Validation failed', 400)
        );

        const result = await gateway.createContact({
          firstName: 'John',
          lastName: 'Doe',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('updateContact', () => {
      it('should update an existing contact', async () => {
        const mockPerson = createMockPipedrivePerson({ first_name: 'Jane' });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockPerson));

        const result = await gateway.updateContact('12345', {
          firstName: 'Jane',
        });

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.firstName).toBe('Jane');
        }
      });
    });

    describe('deleteContact', () => {
      it('should delete a contact', async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveSuccessResponse({ id: 12345 })
        );

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
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockDeal));

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.id).toBe('5678');
          expect(result.value.name).toBe('Dental Implant Treatment');
          expect(result.value.amount).toBe(5000);
        }
      });

      it('should handle deal with no title', async () => {
        const mockDeal = createMockPipedriveDeal({ title: undefined });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockDeal));

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.name).toBe('Untitled Deal');
        }
      });

      it('should handle deal with person_id as number', async () => {
        const mockDeal = createMockPipedriveDeal({ person_id: 12345 });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockDeal));

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.contactId).toBe('12345');
        }
      });

      it('should handle deal with no stage_id', async () => {
        const mockDeal = createMockPipedriveDeal({ stage_id: undefined });
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockDeal));

        const result = await gateway.getDeal('5678');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.stage).toBe('unknown');
        }
      });
    });

    describe('findDealsByContact', () => {
      it('should return deals for a contact', async () => {
        const mockDeals = [createMockPipedriveDeal(), createMockPipedriveDeal({ id: 5679 })];
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockDeals));

        const result = await gateway.findDealsByContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.length).toBe(2);
        }
      });
    });

    describe('createDeal', () => {
      it('should create a new deal', async () => {
        const mockDeal = createMockPipedriveDeal();
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockDeal));

        const result = await gateway.createDeal({
          name: 'New Treatment Plan',
          contactId: '12345',
          amount: 10000,
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // TASK (ACTIVITY) OPERATIONS TESTS
  // ===========================================================================

  describe('Task Operations', () => {
    describe('getPendingTasksForContact', () => {
      it('should return pending activities for contact', async () => {
        const mockActivities = [createMockPipedriveActivity()];
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveSuccessResponse(mockActivities)
        );

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.length).toBe(1);
          expect(result.value[0]?.status).toBe('NOT_STARTED');
        }
      });

      it('should handle completed activity', async () => {
        const mockActivities = [createMockPipedriveActivity({ done: true })];
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveSuccessResponse(mockActivities)
        );

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value && result.value[0]) {
          expect(result.value[0].status).toBe('COMPLETED');
        }
      });

      it('should handle activity with marked_as_done_time', async () => {
        const mockActivities = [
          createMockPipedriveActivity({
            done: false,
            marked_as_done_time: '2024-02-01T10:00:00Z',
          }),
        ];
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveSuccessResponse(mockActivities)
        );

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value && result.value[0]) {
          expect(result.value[0].status).toBe('COMPLETED');
        }
      });

      it('should handle activity with no subject', async () => {
        const mockActivities = [createMockPipedriveActivity({ subject: undefined })];
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveSuccessResponse(mockActivities)
        );

        const result = await gateway.getPendingTasksForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value && result.value[0]) {
          expect(result.value[0].subject).toBe('Untitled Task');
        }
      });
    });

    describe('createTask', () => {
      it('should create a new task', async () => {
        const mockActivity = createMockPipedriveActivity();
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockActivity));

        const result = await gateway.createTask({
          subject: 'Follow-up call',
          contactId: '12345',
          dueDate: new Date('2024-02-15'),
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // NOTE OPERATIONS TESTS
  // ===========================================================================

  describe('Note Operations', () => {
    describe('addNote', () => {
      it('should create a note for contact', async () => {
        const mockNote = createMockPipedriveNote();
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockNote));

        const result = await gateway.addNote({
          body: 'Patient interested in implants',
          contactId: '12345',
        });

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.body).toBe('Patient expressed interest in All-on-X');
        }
      });
    });

    describe('getNotesForContact', () => {
      it('should return notes for contact', async () => {
        const mockNotes = [createMockPipedriveNote()];
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockNotes));

        const result = await gateway.getNotesForContact('12345');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.length).toBe(1);
        }
      });
    });
  });

  // ===========================================================================
  // PIPELINE OPERATIONS TESTS
  // ===========================================================================

  describe('Pipeline Operations', () => {
    describe('getPipelines', () => {
      it('should return all pipelines', async () => {
        const mockPipelines = [createMockPipedrivePipeline()];
        vi.mocked(global.fetch).mockResolvedValueOnce(
          createPipedriveSuccessResponse(mockPipelines)
        );

        const result = await gateway.getPipelines();

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.length).toBe(1);
          expect(result.value[0]?.name).toBe('Dental Sales Pipeline');
        }
      });
    });

    describe('getPipelineStages', () => {
      it('should return stages for pipeline', async () => {
        const mockStages = [createMockPipedriveStage()];
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockStages));

        const result = await gateway.getPipelineStages('1');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.length).toBe(1);
        }
      });
    });
  });

  // ===========================================================================
  // OWNER/USER OPERATIONS TESTS
  // ===========================================================================

  describe('Owner Operations', () => {
    describe('getOwners', () => {
      it('should return all users', async () => {
        const mockUsers = [createMockPipedriveUser()];
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockUsers));

        const result = await gateway.getOwners();

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.length).toBe(1);
          // CrmOwner has firstName/lastName, not name
          expect(result.value[0]?.firstName).toBe('Sales');
          expect(result.value[0]?.lastName).toBe('Rep User');
        }
      });
    });

    describe('getOwner', () => {
      it('should return single user', async () => {
        const mockUser = createMockPipedriveUser();
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockUser));

        const result = await gateway.getOwner('99');

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.id).toBe('99');
        }
      });
    });
  });

  // ===========================================================================
  // HEALTH CHECK TESTS
  // ===========================================================================

  describe('Health Check', () => {
    describe('healthCheck', () => {
      it('should return connected when API is reachable', async () => {
        const mockUser = createMockPipedriveUser();
        vi.mocked(global.fetch).mockResolvedValueOnce(createPipedriveSuccessResponse(mockUser));

        const result = await gateway.healthCheck();

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.connected).toBe(true);
          expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
        }
      });

      it('should return disconnected when API fails', async () => {
        vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Connection failed'));

        const result = await gateway.healthCheck();

        expect(result.success).toBe(true);
        if (result.success && result.value) {
          expect(result.value.connected).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // LEAD SCORE UPDATE TESTS
  // ===========================================================================

  describe('updateContactScore', () => {
    it('should update lead score for contact', async () => {
      // First call for getting current person
      vi.mocked(global.fetch).mockResolvedValueOnce(
        createPipedriveSuccessResponse(createMockPipedrivePerson())
      );
      // Second call for updating person
      vi.mocked(global.fetch).mockResolvedValueOnce(
        createPipedriveSuccessResponse(createMockPipedrivePerson())
      );

      const result = await gateway.updateContactScore(
        '12345',
        4 as unknown as import('@medicalcor/domain').LeadScore,
        {
          classification: 'HOT',
          confidence: 0.95,
          factors: ['urgent', 'high-budget'],
        }
      );

      expect(result.success).toBe(true);
    });
  });
});
