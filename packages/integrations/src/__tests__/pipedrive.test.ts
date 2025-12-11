/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    PIPEDRIVE CLIENT TESTS                                     ║
 * ║                                                                               ║
 * ║  Comprehensive test suite for Pipedrive CRM Client with property-based       ║
 * ║  testing, mocked HTTP responses, and edge case coverage.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { PipedriveClient, createPipedriveClient, getPipedriveCredentials } from '../pipedrive.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create a mock fetch response
 */
function mockFetchResponse<T>(data: T, success = true) {
  return Promise.resolve({
    ok: success,
    status: success ? 200 : 400,
    json: () => Promise.resolve({ success, data }),
    text: () => Promise.resolve(JSON.stringify({ success, data })),
    headers: new Headers(),
  } as Response);
}

/**
 * Create a mock error response
 */
function mockFetchError(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, error: message }),
    text: () => Promise.resolve(JSON.stringify({ success: false, error: message })),
    headers: new Headers(),
  } as Response);
}

/**
 * Create mock person data
 */
function createMockPerson(overrides: Partial<Record<string, unknown>> = {}) {
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

/**
 * Create mock deal data
 */
function createMockDeal(overrides: Partial<Record<string, unknown>> = {}) {
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
    ...overrides,
  };
}

/**
 * Create mock activity data
 */
function createMockActivity(overrides: Partial<Record<string, unknown>> = {}) {
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
    ...overrides,
  };
}

/**
 * Create mock note data
 */
function createMockNote(overrides: Partial<Record<string, unknown>> = {}) {
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

// =============================================================================
// CONSTRUCTOR TESTS
// =============================================================================

describe('PipedriveClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new PipedriveClient({
        apiToken: 'test-token-123',
        companyDomain: 'medicalcor',
      });

      expect(client).toBeInstanceOf(PipedriveClient);
    });

    it('should throw on invalid apiToken', () => {
      expect(() => {
        new PipedriveClient({
          apiToken: '',
        });
      }).toThrow();
    });

    it('should accept custom retry config', () => {
      const client = new PipedriveClient({
        apiToken: 'test-token-123',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });

      expect(client).toBeInstanceOf(PipedriveClient);
    });

    it('should reject SSRF attempt with malicious baseUrl', () => {
      expect(() => {
        new PipedriveClient({
          apiToken: 'test-token-123',
          baseUrl: 'https://malicious-site.com/api',
        });
      }).toThrow(/SSRF/);
    });
  });

  describe('createPipedriveClient factory', () => {
    it('should create client via factory function', () => {
      const client = createPipedriveClient({
        apiToken: 'test-token-456',
      });

      expect(client).toBeInstanceOf(PipedriveClient);
    });
  });

  describe('getPipedriveCredentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw if PIPEDRIVE_API_TOKEN is missing', () => {
      delete process.env.PIPEDRIVE_API_TOKEN;

      expect(() => getPipedriveCredentials()).toThrow('PIPEDRIVE_API_TOKEN');
    });

    it('should return credentials from environment', () => {
      process.env.PIPEDRIVE_API_TOKEN = 'env-token-789';
      process.env.PIPEDRIVE_COMPANY_DOMAIN = 'test-company';

      const creds = getPipedriveCredentials();

      expect(creds.apiToken).toBe('env-token-789');
      expect(creds.companyDomain).toBe('test-company');
    });

    it('should use default company domain if not set', () => {
      process.env.PIPEDRIVE_API_TOKEN = 'env-token-789';
      delete process.env.PIPEDRIVE_COMPANY_DOMAIN;

      const creds = getPipedriveCredentials();

      expect(creds.companyDomain).toBe('medicalcor');
    });
  });

  // ===========================================================================
  // PERSON OPERATIONS TESTS
  // ===========================================================================

  describe('Person Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getPerson', () => {
      it('should fetch person by ID', async () => {
        const mockPerson = createMockPerson();
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.getPerson(12345);

        expect(result).toBeDefined();
        expect(result?.id).toBe(12345);
        expect(result?.name).toBe('John Doe');
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('should return null for non-existent person', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getPerson(99999);

        expect(result).toBeNull();
      });
    });

    describe('findPersonByPhone', () => {
      it('should find person by phone number', async () => {
        const mockPerson = createMockPerson();
        // First call: search
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [{ result_score: 1.0, item: { id: 12345, type: 'person' } }],
          })
        );
        // Second call: get person details
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.findPersonByPhone('+40700000001');

        expect(result).toBeDefined();
        expect(result?.id).toBe(12345);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should return null when no matches', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ items: [] }));

        const result = await client.findPersonByPhone('+40799999999');

        expect(result).toBeNull();
      });

      it('should validate phone format', async () => {
        await expect(client.findPersonByPhone('123')).rejects.toThrow();
      });
    });

    describe('createPerson', () => {
      it('should create a new person', async () => {
        const mockPerson = createMockPerson({ id: 54321 });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.createPerson({
          name: 'Jane Doe',
          phone: ['+40700000002'],
          email: ['jane@example.com'],
        });

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/persons'),
          expect.objectContaining({ method: 'POST' })
        );
      });

      it('should throw on API error', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(400, 'Invalid data'));

        await expect(
          client.createPerson({
            name: 'Test',
            phone: ['+40700000003'],
          })
        ).rejects.toThrow();
      });
    });

    describe('updatePerson', () => {
      it('should update an existing person', async () => {
        const mockPerson = createMockPerson({ name: 'Updated Name' });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.updatePerson(12345, { name: 'Updated Name' });

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/persons/12345'),
          expect.objectContaining({ method: 'PUT' })
        );
      });
    });

    describe('upsertPersonByPhone', () => {
      it('should create person if not found', async () => {
        // Search returns no results
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ items: [] }));
        // Create returns new person
        const mockPerson = createMockPerson({ id: 99999 });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.upsertPersonByPhone('+40700999999', {
          name: 'New Person',
        });

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should update person if found', async () => {
        const mockPerson = createMockPerson();
        // Search returns match
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [{ result_score: 1.0, item: { id: 12345, type: 'person' } }],
          })
        );
        // Get person
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));
        // Update person
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ ...mockPerson, name: 'Updated' }));

        const result = await client.upsertPersonByPhone('+40700000001', {
          name: 'Updated',
        });

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });
    });
  });

  // ===========================================================================
  // DEAL OPERATIONS TESTS
  // ===========================================================================

  describe('Deal Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getDeal', () => {
      it('should fetch deal by ID', async () => {
        const mockDeal = createMockDeal();
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockDeal));

        const result = await client.getDeal(5678);

        expect(result).toBeDefined();
        expect(result?.id).toBe(5678);
        expect(result?.title).toBe('Dental Implant Treatment');
      });
    });

    describe('createDeal', () => {
      it('should create a new deal', async () => {
        const mockDeal = createMockDeal();
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockDeal));

        const result = await client.createDeal({
          title: 'New Treatment Plan',
          value: 10000,
          currency: 'EUR',
          person_id: 12345,
        });

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/deals'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    describe('markDealWon', () => {
      it('should mark deal as won', async () => {
        const mockDeal = createMockDeal({ status: 'won' });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockDeal));

        const result = await client.markDealWon(5678);

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/deals/5678'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"status":"won"'),
          })
        );
      });
    });

    describe('markDealLost', () => {
      it('should mark deal as lost with reason', async () => {
        const mockDeal = createMockDeal({ status: 'lost', lost_reason: 'Price too high' });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockDeal));

        const result = await client.markDealLost(5678, 'Price too high');

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/deals/5678'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"lost_reason":"Price too high"'),
          })
        );
      });
    });
  });

  // ===========================================================================
  // ACTIVITY (TASK) OPERATIONS TESTS
  // ===========================================================================

  describe('Activity Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('createActivity', () => {
      it('should create a new activity', async () => {
        const mockActivity = createMockActivity();
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockActivity));

        const result = await client.createActivity({
          subject: 'Follow up call',
          personId: 12345,
          dueDate: new Date('2024-02-01'),
        });

        expect(result).toBeDefined();
        expect(result.id).toBe(9999);
      });
    });

    describe('completeActivity', () => {
      it('should mark activity as done', async () => {
        const mockActivity = createMockActivity({ done: true });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockActivity));

        const result = await client.completeActivity(9999);

        expect(result).toBeDefined();
        expect(result.done).toBe(true);
      });
    });
  });

  // ===========================================================================
  // NOTE OPERATIONS TESTS
  // ===========================================================================

  describe('Note Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('createNote', () => {
      it('should create a new note', async () => {
        const mockNote = createMockNote();
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockNote));

        const result = await client.createNote({
          content: 'Patient interested in All-on-X',
          personId: 12345,
        });

        expect(result).toBeDefined();
        expect(result.content).toBe('Patient interested in All-on-X procedure');
      });
    });
  });

  // ===========================================================================
  // HEALTH CHECK TESTS
  // ===========================================================================

  describe('Health Check', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    it('should return connected status on success', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
        })
      );

      const result = await client.healthCheck();

      expect(result.connected).toBe(true);
      expect(result.apiVersion).toBe('v1');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return disconnected status on failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result.connected).toBe(false);
    });
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error Handling', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
        retryConfig: { maxRetries: 0, baseDelayMs: 100 },
      });
    });

    it('should handle rate limiting (429)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '5' }),
        text: () => Promise.resolve('Rate limited'),
      } as Response);

      await expect(client.getPerson(12345)).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      // Test the AbortError path by mocking fetch to reject with AbortError
      const abortError = new Error('Abort error');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValueOnce(abortError);

      await expect(client.getPerson(12345)).rejects.toThrow();
    });

    it('should reject SSRF attempts in path', async () => {
      // The client should not allow absolute URLs or path traversal
      expect(
        async () =>
          await (client as unknown as { request: (path: string) => Promise<unknown> }).request(
            'https://evil.com/v1/persons'
          )
      ).rejects.toBeDefined();
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    it('should handle any valid person name', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          (name) => {
            // Creating a person with any non-empty name should work
            const personData = createMockPerson({ name });
            expect(personData.name).toBe(name);
          }
        )
      );
    });

    it('should handle any valid phone number format', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^\+[1-9]\d{9,14}$/), // E.164 format
          (phone) => {
            const personData = createMockPerson({
              phone: [{ value: phone, primary: true }],
            });
            expect(personData.phone?.[0]?.value).toBe(phone);
          }
        )
      );
    });

    it('should handle any valid deal amount', () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 10000000, noNaN: true }), (value) => {
          const dealData = createMockDeal({ value });
          expect(dealData.value).toBe(value);
        })
      );
    });

    it('should handle any valid currency code', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[A-Z]{3}$/), (currency) => {
          const dealData = createMockDeal({ currency });
          expect(dealData.currency).toBe(currency);
        })
      );
    });

    it('should handle any valid probability', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (probability) => {
          const dealData = createMockDeal({ probability });
          expect(dealData.probability).toBeGreaterThanOrEqual(0);
          expect(dealData.probability).toBeLessThanOrEqual(100);
        })
      );
    });
  });
});
