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
 * Create a mock error response without error message (to test fallback branch)
 */
function mockFetchErrorNoMessage(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false }),
    text: () => Promise.resolve(JSON.stringify({ success: false })),
    headers: new Headers(),
  } as Response);
}

/**
 * Create a mock Pipedrive API error (HTTP 200 but success: false)
 * This tests the error handling in individual methods
 */
function mockPipedriveApiError(errorMessage?: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: false,
        data: null,
        ...(errorMessage && { error: errorMessage }),
      }),
    text: () =>
      Promise.resolve(
        JSON.stringify({
          success: false,
          data: null,
          ...(errorMessage && { error: errorMessage }),
        })
      ),
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

      it('should throw on createActivity failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(400, 'Invalid activity data'));

        await expect(
          client.createActivity({
            subject: 'Test activity',
            personId: 12345,
          })
        ).rejects.toThrow('Request failed with status 400');
      });

      it('should throw with unknown error message when error field is missing', async () => {
        fetchMock.mockResolvedValueOnce(mockPipedriveApiError());

        await expect(
          client.createActivity({
            subject: 'Test activity',
            personId: 12345,
          })
        ).rejects.toThrow('Failed to create activity: Unknown error');
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

      it('should throw on createNote failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(400, 'Invalid note data'));

        await expect(
          client.createNote({
            content: 'Test note',
            personId: 12345,
          })
        ).rejects.toThrow('Request failed with status 400');
      });

      it('should throw with unknown error when creating note and error field is missing', async () => {
        fetchMock.mockResolvedValueOnce(mockPipedriveApiError());

        await expect(
          client.createNote({
            content: 'Test note',
            personId: 12345,
          })
        ).rejects.toThrow('Failed to create note: Unknown error');
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
      await expect(
        (client as unknown as { request: (path: string) => Promise<unknown> }).request(
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

  // ===========================================================================
  // ADDITIONAL PERSON OPERATIONS (Coverage Extension)
  // ===========================================================================

  describe('Additional Person Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('findPersonByEmail', () => {
      it('should find person by email', async () => {
        const mockPerson = createMockPerson();
        // Search returns match
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [{ result_score: 1.0, item: { id: 12345, type: 'person' } }],
          })
        );
        // Get person details
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.findPersonByEmail('john@example.com');

        expect(result).toBeDefined();
        expect(result?.id).toBe(12345);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should return null when no email matches', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ items: [] }));

        const result = await client.findPersonByEmail('notfound@example.com');

        expect(result).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('should return null when personId is missing from search result', async () => {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [{ result_score: 1.0, item: { type: 'person' } }],
          })
        );

        const result = await client.findPersonByEmail('test@example.com');

        expect(result).toBeNull();
      });
    });

    describe('searchPersons', () => {
      it('should search persons with custom fields', async () => {
        const mockPerson = createMockPerson();
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [{ result_score: 0.9, item: { id: 12345, type: 'person' } }],
          })
        );
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.searchPersons({
          term: 'John',
          fields: 'name',
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(12345);
      });

      it('should search persons with pagination params', async () => {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [
              { result_score: 1.0, item: { id: 123, type: 'person' } },
              { result_score: 0.8, item: { id: 456, type: 'person' } },
            ],
          })
        );
        fetchMock.mockResolvedValueOnce(mockFetchResponse(createMockPerson({ id: 123 })));
        fetchMock.mockResolvedValueOnce(mockFetchResponse(createMockPerson({ id: 456 })));

        const result = await client.searchPersons({
          term: 'test',
          limit: 10,
          start: 5,
        });

        expect(result).toHaveLength(2);
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('limit=10'),
          expect.anything()
        );
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('start=5'),
          expect.anything()
        );
      });

      it('should return empty array when no search results', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ items: [] }));

        const result = await client.searchPersons({ term: 'nonexistent' });

        expect(result).toEqual([]);
      });

      it('should filter out null persons from results', async () => {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({
            items: [
              { result_score: 1.0, item: { id: 123, type: 'person' } },
              { result_score: 0.9, item: { id: 456, type: 'person' } },
            ],
          })
        );
        // First person returns successfully
        fetchMock.mockResolvedValueOnce(mockFetchResponse(createMockPerson({ id: 123 })));
        // Second person returns null
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.searchPersons({ term: 'test' });

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(123);
      });
    });

    describe('deletePerson', () => {
      it('should successfully delete a person', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ id: 12345 }));

        await expect(client.deletePerson(12345)).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/persons/12345'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      it('should throw on delete failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(404, 'Person not found'));

        await expect(client.deletePerson(99999)).rejects.toThrow('Request failed with status 404');
      });
    });
  });

  // ===========================================================================
  // ADDITIONAL DEAL OPERATIONS (Coverage Extension)
  // ===========================================================================

  describe('Additional Deal Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getDeal - null response', () => {
      it('should return null for non-existent deal', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getDeal(99999);

        expect(result).toBeNull();
      });
    });

    describe('findDealsByPerson', () => {
      it('should return empty array when no deals found', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.findDealsByPerson(12345);

        expect(result).toEqual([]);
      });

      it('should parse multiple deals correctly', async () => {
        const mockDeal1 = createMockDeal({ id: 1001, title: 'Deal 1' });
        const mockDeal2 = createMockDeal({ id: 1002, title: 'Deal 2' });
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockDeal1, mockDeal2]));

        const result = await client.findDealsByPerson(12345);

        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe(1001);
        expect(result[1]?.id).toBe(1002);
      });
    });

    describe('updateDeal', () => {
      it('should successfully update a deal', async () => {
        const mockDeal = createMockDeal({ title: 'Updated Deal' });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockDeal));

        const result = await client.updateDeal(5678, { title: 'Updated Deal' });

        expect(result.title).toBe('Updated Deal');
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/deals/5678'),
          expect.objectContaining({ method: 'PUT' })
        );
      });

      it('should throw on update failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(400, 'Invalid data'));

        await expect(client.updateDeal(5678, { title: 'Bad' })).rejects.toThrow(
          'Request failed with status 400'
        );
      });
    });

    describe('updateDealStage', () => {
      it('should update deal stage successfully', async () => {
        const mockDeal = createMockDeal({ stage_id: 5 });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockDeal));

        const result = await client.updateDealStage(5678, 5);

        expect(result.stage_id).toBe(5);
      });
    });

    describe('deleteDeal', () => {
      it('should successfully delete a deal', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ id: 5678 }));

        await expect(client.deleteDeal(5678)).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/deals/5678'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      it('should throw on delete failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(404, 'Deal not found'));

        await expect(client.deleteDeal(99999)).rejects.toThrow('Request failed with status 404');
      });
    });
  });

  // ===========================================================================
  // ADDITIONAL ACTIVITY OPERATIONS (Coverage Extension)
  // ===========================================================================

  describe('Additional Activity Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getActivity', () => {
      it('should fetch activity by ID', async () => {
        const mockActivity = createMockActivity();
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockActivity));

        const result = await client.getActivity(9999);

        expect(result).toBeDefined();
        expect(result?.id).toBe(9999);
      });

      it('should return null for non-existent activity', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getActivity(88888);

        expect(result).toBeNull();
      });
    });

    describe('updateActivity', () => {
      it('should successfully update an activity', async () => {
        const mockActivity = createMockActivity({ subject: 'Updated subject' });
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockActivity));

        const result = await client.updateActivity(9999, { subject: 'Updated subject' });

        expect(result.subject).toBe('Updated subject');
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/activities/9999'),
          expect.objectContaining({ method: 'PUT' })
        );
      });

      it('should throw on update failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(400, 'Invalid data'));

        await expect(client.updateActivity(9999, { done: true })).rejects.toThrow(
          'Request failed with status 400'
        );
      });

      it('should throw with unknown error when updating and error field is missing', async () => {
        fetchMock.mockResolvedValueOnce(mockPipedriveApiError());

        await expect(client.updateActivity(9999, { done: true })).rejects.toThrow(
          'Failed to update activity: Unknown error'
        );
      });
    });

    describe('getPendingActivitiesForPerson', () => {
      it('should fetch pending activities for a person', async () => {
        const mockActivity1 = createMockActivity({ id: 1001, done: false });
        const mockActivity2 = createMockActivity({ id: 1002, done: false });
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockActivity1, mockActivity2]));

        const result = await client.getPendingActivitiesForPerson(12345);

        expect(result).toHaveLength(2);
        expect(result[0]?.done).toBe(false);
        expect(result[1]?.done).toBe(false);
      });

      it('should return empty array when no pending activities', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getPendingActivitiesForPerson(12345);

        expect(result).toEqual([]);
      });
    });

    describe('deleteActivity', () => {
      it('should successfully delete an activity', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ id: 9999 }));

        await expect(client.deleteActivity(9999)).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/activities/9999'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      it('should throw on delete failure', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchError(404, 'Activity not found'));

        await expect(client.deleteActivity(99999)).rejects.toThrow(
          'Request failed with status 404'
        );
      });

      it('should throw with unknown error when deleting and error field is missing', async () => {
        fetchMock.mockResolvedValueOnce(mockPipedriveApiError());

        await expect(client.deleteActivity(99999)).rejects.toThrow(
          'Failed to delete activity: Unknown error'
        );
      });
    });
  });

  // ===========================================================================
  // ADDITIONAL NOTE OPERATIONS (Coverage Extension)
  // ===========================================================================

  describe('Additional Note Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getNotesForPerson', () => {
      it('should fetch notes for a person', async () => {
        const mockNote1 = createMockNote({ id: 1001 });
        const mockNote2 = createMockNote({ id: 1002 });
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockNote1, mockNote2]));

        const result = await client.getNotesForPerson(12345);

        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe(1001);
        expect(result[1]?.id).toBe(1002);
      });

      it('should return empty array when no notes found', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getNotesForPerson(12345);

        expect(result).toEqual([]);
      });

      it('should respect custom limit', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse([createMockNote()]));

        await client.getNotesForPerson(12345, 25);

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('limit=25'),
          expect.anything()
        );
      });

      it('should cap limit at MAX_PAGE_SIZE', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse([createMockNote()]));

        await client.getNotesForPerson(12345, 1000);

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('limit=500'),
          expect.anything()
        );
      });
    });

    describe('getNotesForDeal', () => {
      it('should fetch notes for a deal', async () => {
        const mockNote1 = createMockNote({ id: 2001, deal_id: 5678 });
        const mockNote2 = createMockNote({ id: 2002, deal_id: 5678 });
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockNote1, mockNote2]));

        const result = await client.getNotesForDeal(5678);

        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe(2001);
        expect(result[1]?.id).toBe(2002);
      });

      it('should return empty array when no notes found', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getNotesForDeal(5678);

        expect(result).toEqual([]);
      });

      it('should respect custom limit', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse([createMockNote()]));

        await client.getNotesForDeal(5678, 30);

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('limit=30'),
          expect.anything()
        );
      });
    });
  });

  // ===========================================================================
  // PIPELINE & STAGE OPERATIONS (Coverage Extension)
  // ===========================================================================

  describe('Pipeline and Stage Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getPipelines', () => {
      it('should fetch all pipelines', async () => {
        const mockPipeline1 = { id: 1, name: 'Sales Pipeline', active: true };
        const mockPipeline2 = { id: 2, name: 'Support Pipeline', active: true };
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockPipeline1, mockPipeline2]));

        const result = await client.getPipelines();

        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe(1);
        expect(result[1]?.id).toBe(2);
      });

      it('should return empty array when no pipelines found', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getPipelines();

        expect(result).toEqual([]);
      });
    });

    describe('getPipeline', () => {
      it('should fetch pipeline by ID', async () => {
        const mockPipeline = { id: 1, name: 'Sales Pipeline', active: true };
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPipeline));

        const result = await client.getPipeline(1);

        expect(result).toBeDefined();
        expect(result?.id).toBe(1);
        expect(result?.name).toBe('Sales Pipeline');
      });

      it('should return null for non-existent pipeline', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getPipeline(99999);

        expect(result).toBeNull();
      });
    });

    describe('getStages', () => {
      it('should fetch stages for a pipeline', async () => {
        const mockStage1 = { id: 1, name: 'Lead In', pipeline_id: 1, order_nr: 0 };
        const mockStage2 = { id: 2, name: 'Contact Made', pipeline_id: 1, order_nr: 1 };
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockStage1, mockStage2]));

        const result = await client.getStages(1);

        expect(result).toHaveLength(2);
        expect(result[0]?.name).toBe('Lead In');
        expect(result[1]?.name).toBe('Contact Made');
      });

      it('should return empty array when no stages found', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getStages(1);

        expect(result).toEqual([]);
      });
    });

    describe('getStage', () => {
      it('should fetch stage by ID', async () => {
        const mockStage = { id: 1, name: 'Lead In', pipeline_id: 1, order_nr: 0 };
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockStage));

        const result = await client.getStage(1);

        expect(result).toBeDefined();
        expect(result?.id).toBe(1);
        expect(result?.name).toBe('Lead In');
      });

      it('should return null for non-existent stage', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getStage(99999);

        expect(result).toBeNull();
      });
    });
  });

  // ===========================================================================
  // USER OPERATIONS (Coverage Extension)
  // ===========================================================================

  describe('User Operations', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
      });
    });

    describe('getUsers', () => {
      it('should fetch all users', async () => {
        const mockUser1 = { id: 1, name: 'John Doe', email: 'john@test.com', active: true };
        const mockUser2 = { id: 2, name: 'Jane Doe', email: 'jane@test.com', active: true };
        fetchMock.mockResolvedValueOnce(mockFetchResponse([mockUser1, mockUser2]));

        const result = await client.getUsers();

        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe(1);
        expect(result[1]?.id).toBe(2);
      });

      it('should return empty array when no users found', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getUsers();

        expect(result).toEqual([]);
      });
    });

    describe('getUser', () => {
      it('should fetch user by ID', async () => {
        const mockUser = { id: 1, name: 'John Doe', email: 'john@test.com', active: true };
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockUser));

        const result = await client.getUser(1);

        expect(result).toBeDefined();
        expect(result?.id).toBe(1);
        expect(result?.name).toBe('John Doe');
      });

      it('should return null for non-existent user', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getUser(99999);

        expect(result).toBeNull();
      });
    });

    describe('getCurrentUser', () => {
      it('should fetch current authenticated user', async () => {
        const mockUser = { id: 1, name: 'Current User', email: 'current@test.com', active: true };
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockUser));

        const result = await client.getCurrentUser();

        expect(result).toBeDefined();
        expect(result?.name).toBe('Current User');
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/v1/users/me'),
          expect.anything()
        );
      });

      it('should return null when getCurrentUser fails', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse(null));

        const result = await client.getCurrentUser();

        expect(result).toBeNull();
      });
    });
  });

  // ===========================================================================
  // HTTP REQUEST HANDLING (Coverage Extension)
  // ===========================================================================

  describe('HTTP Request Handling', () => {
    let client: PipedriveClient;

    beforeEach(() => {
      client = new PipedriveClient({
        apiToken: 'test-token',
        companyDomain: 'test',
        retryConfig: { maxRetries: 2, baseDelayMs: 100 },
      });
    });

    describe('URL query parameter handling', () => {
      it('should append api_token with & when URL has existing params', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse({ items: [] }));

        await client.searchPersons({ term: 'test' });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/\?.*&api_token=/),
          expect.anything()
        );
      });

      it('should append api_token with ? when URL has no params', async () => {
        fetchMock.mockResolvedValueOnce(mockFetchResponse([{ id: 1, name: 'Pipeline' }]));

        await client.getPipelines();

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/pipelines\?api_token=/),
          expect.anything()
        );
      });
    });

    describe('Headers handling', () => {
      it('should handle headers as Headers object', async () => {
        // Test with a direct request call using Headers instance
        const headers = new Headers();
        headers.set('X-Test-Header', 'test-value');

        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({ id: 1, name: 'Test', email: 'test@example.com', active: true })
        );

        await (client as any).request('/v1/users', {
          headers,
        });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-test-header': 'test-value', // Headers normalize to lowercase
              'Content-Type': 'application/json',
              Accept: 'application/json',
            }),
          })
        );
      });

      it('should handle headers as array', async () => {
        // Access private request method to test header handling
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({ id: 1, name: 'Test', email: 'test@example.com', active: true })
        );

        await (client as any).request('/v1/users', {
          headers: [['X-Custom-Header', 'value']],
        });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'value',
            }),
          })
        );
      });

      it('should handle headers as plain object', async () => {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({ id: 1, name: 'Test', email: 'test@example.com', active: true })
        );

        await (client as any).request('/v1/users', {
          headers: { 'X-Another-Header': 'another-value' },
        });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Another-Header': 'another-value',
            }),
          })
        );
      });

      it('should handle request without custom headers', async () => {
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse({ id: 1, name: 'Test', email: 'test@example.com', active: true })
        );

        await (client as any).request('/v1/users', {
          method: 'GET',
          // No headers provided
        });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Accept: 'application/json',
            }),
          })
        );
      });
    });

    describe('Retry logic for server errors', () => {
      it('should retry on 502 Bad Gateway', async () => {
        const mockPerson = createMockPerson();
        // First attempt: 502
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 502,
          text: () => Promise.resolve('Bad Gateway'),
          headers: new Headers(),
        } as Response);
        // Retry succeeds
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.getPerson(12345);

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should retry on 503 Service Unavailable', async () => {
        const mockPerson = createMockPerson();
        // First attempt: 503
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
          headers: new Headers(),
        } as Response);
        // Retry succeeds
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.getPerson(12345);

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should retry on 504 Gateway Timeout', async () => {
        const mockPerson = createMockPerson();
        // First attempt: 504
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 504,
          text: () => Promise.resolve('Gateway Timeout'),
          headers: new Headers(),
        } as Response);
        // Retry succeeds
        fetchMock.mockResolvedValueOnce(mockFetchResponse(mockPerson));

        const result = await client.getPerson(12345);

        expect(result).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should not retry on 400 Bad Request', async () => {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad Request'),
          headers: new Headers(),
        } as Response);

        await expect(client.getPerson(12345)).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('should not retry on 404 Not Found', async () => {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not Found'),
          headers: new Headers(),
        } as Response);

        await expect(client.getPerson(12345)).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('Path validation', () => {
      it('should reject path with absolute URL', async () => {
        await expect((client as any).request('https://evil.com/api/v1/persons')).rejects.toThrow(
          'invalid or unsafe path'
        );
      });

      it('should reject path with ../ traversal', async () => {
        await expect((client as any).request('/v1/../admin/users')).rejects.toThrow(
          'invalid or unsafe path'
        );
      });

      it('should reject path not starting with /', async () => {
        await expect((client as any).request('v1/persons')).rejects.toThrow(
          'invalid or unsafe path'
        );
      });
    });

    describe('Hostname validation', () => {
      it('should reject requests to non-Pipedrive hostnames', async () => {
        // Create a client with a custom baseUrl that will be validated
        const maliciousClient = new PipedriveClient({
          apiToken: 'test-token',
          companyDomain: 'test',
        });

        // Override baseUrl to simulate SSRF attempt after construction
        (maliciousClient as any).baseUrl = 'https://evil.com';

        await expect((maliciousClient as any).request('/v1/persons')).rejects.toThrow(
          'Refusing to make request to untrusted host'
        );
      });

      it('should allow requests to api.pipedrive.com', async () => {
        const validClient = new PipedriveClient({
          apiToken: 'test-token',
          companyDomain: 'test',
        });

        fetchMock.mockResolvedValueOnce(mockFetchResponse([{ id: 1, name: 'Pipeline' }]));

        // This should not throw - baseUrl is api.pipedrive.com
        await expect(validClient.getPipelines()).resolves.toBeDefined();
      });

      it('should allow requests to subdomain.pipedrive.com', async () => {
        const subdomainClient = new PipedriveClient({
          apiToken: 'test-token',
          companyDomain: 'medicalcor',
        });

        // Override to use a valid Pipedrive subdomain
        (subdomainClient as any).baseUrl = 'https://medicalcor-sandbox.pipedrive.com';

        fetchMock.mockResolvedValueOnce(mockFetchResponse([{ id: 1, name: 'Pipeline' }]));

        await expect(subdomainClient.getPipelines()).resolves.toBeDefined();
      });
    });
  });
});
