import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { HubSpotClient, createHubSpotClient } from '../hubspot.js';
import {
  handlers,
  testFixtures,
  createRateLimitedHandler,
  createFailingHandler,
} from '../__mocks__/handlers.js';

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('HubSpotClient', () => {
  const config = {
    accessToken: 'test-access-token',
    portalId: 'test-portal',
  };

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new HubSpotClient(config);
      expect(client).toBeInstanceOf(HubSpotClient);
    });

    it('should throw error for missing access token', () => {
      expect(() => new HubSpotClient({ accessToken: '' })).toThrow();
    });

    it('should use default base URL when not provided', () => {
      const client = new HubSpotClient(config);
      expect(client).toBeInstanceOf(HubSpotClient);
    });

    it('should accept custom base URL', () => {
      const client = new HubSpotClient({
        ...config,
        baseUrl: 'https://custom.hubapi.com',
      });
      expect(client).toBeInstanceOf(HubSpotClient);
    });

    it('should accept custom retry config', () => {
      const client = new HubSpotClient({
        ...config,
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(client).toBeInstanceOf(HubSpotClient);
    });
  });

  describe('syncContact', () => {
    it('should find and update existing contact by phone', async () => {
      const client = new HubSpotClient(config);

      const result = await client.syncContact({
        phone: '+40721000001', // This phone returns existing contact in mock
        name: 'Updated Name',
      });

      expect(result.id).toBe('hs_contact_123');
    });

    it('should create new contact when not found', async () => {
      const client = new HubSpotClient(config);

      const result = await client.syncContact({
        phone: '+40721999999', // New phone, not in mock
        name: 'New User',
        email: 'new@example.com',
      });

      expect(result.id).toContain('hs_contact_new');
      expect(result.properties.phone).toBe('+40721999999');
    });

    it('should validate phone number format', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.syncContact({
          phone: '123', // Too short
        })
      ).rejects.toThrow();
    });

    it('should validate email format when provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.syncContact({
          phone: '+40721999999',
          email: 'invalid-email',
        })
      ).rejects.toThrow();
    });

    it('should pass custom properties to new contact', async () => {
      const client = new HubSpotClient(config);

      const result = await client.syncContact({
        phone: '+40721999999',
        properties: {
          lead_source: 'whatsapp',
          procedure_interest: 'implant',
        },
      });

      expect(result.properties.lead_source).toBe('whatsapp');
      expect(result.properties.procedure_interest).toBe('implant');
    });
  });

  describe('searchContactsByPhone', () => {
    it('should return contacts matching phone', async () => {
      const client = new HubSpotClient(config);

      const results = await client.searchContactsByPhone('+40721000001');

      expect(results).toHaveLength(1);
      expect(results[0].properties.phone).toBe('+40721000001');
    });

    it('should return empty array when no contacts found', async () => {
      const client = new HubSpotClient(config);

      const results = await client.searchContactsByPhone('+40799999999');

      expect(results).toHaveLength(0);
    });
  });

  describe('getContact', () => {
    it('should get contact by ID', async () => {
      const client = new HubSpotClient(config);

      const result = await client.getContact('hs_contact_123');

      expect(result.id).toBe('hs_contact_123');
      expect(result.properties).toBeDefined();
    });
  });

  describe('createContact', () => {
    it('should create contact with properties', async () => {
      const client = new HubSpotClient(config);

      const result = await client.createContact({
        properties: {
          phone: '+40721123456',
          firstname: 'Test',
          lastname: 'User',
          email: 'test@example.com',
        },
      });

      expect(result.id).toContain('hs_contact_new');
      expect(result.properties.phone).toBe('+40721123456');
    });
  });

  describe('updateContact', () => {
    it('should update contact properties', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateContact('hs_contact_123', {
        lead_score: '5',
        lead_status: 'HOT',
      });

      expect(result.properties.lead_score).toBe('5');
      expect(result.properties.lead_status).toBe('HOT');
    });

    it('should filter out undefined values', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateContact('hs_contact_123', {
        lead_score: '5',
        lead_status: undefined,
      });

      expect(result.properties.lead_score).toBe('5');
      expect(result.properties.lead_status).toBeUndefined();
    });
  });

  describe('logMessageToTimeline', () => {
    it('should log message to contact timeline', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logMessageToTimeline({
          contactId: 'hs_contact_123',
          message: 'Test message',
          direction: 'IN',
          channel: 'whatsapp',
        })
      ).resolves.toBeUndefined();
    });

    it('should include message ID when provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logMessageToTimeline({
          contactId: 'hs_contact_123',
          message: 'Test message',
          direction: 'OUT',
          channel: 'whatsapp',
          messageId: 'wamid.123456',
        })
      ).resolves.toBeUndefined();
    });

    it('should include sentiment metadata when provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logMessageToTimeline({
          contactId: 'hs_contact_123',
          message: 'Test message',
          direction: 'IN',
          channel: 'voice',
          metadata: { sentiment: 'positive' },
        })
      ).resolves.toBeUndefined();
    });

    it('should validate contactId is provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logMessageToTimeline({
          contactId: '',
          message: 'Test message',
          direction: 'IN',
          channel: 'whatsapp',
        })
      ).rejects.toThrow();
    });

    it('should validate message is provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logMessageToTimeline({
          contactId: 'hs_contact_123',
          message: '',
          direction: 'IN',
          channel: 'whatsapp',
        })
      ).rejects.toThrow();
    });
  });

  describe('logCallToTimeline', () => {
    it('should log call to contact timeline', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logCallToTimeline({
          contactId: 'hs_contact_123',
          callSid: 'call_123456',
          duration: 180,
          transcript: 'Hello, I want to schedule an appointment',
        })
      ).resolves.toBeUndefined();
    });

    it('should update sentiment when provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logCallToTimeline({
          contactId: 'hs_contact_123',
          callSid: 'call_123456',
          duration: 180,
          sentiment: 'positive',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('createTask', () => {
    it('should create task for contact', async () => {
      const client = new HubSpotClient(config);

      const result = await client.createTask({
        contactId: 'hs_contact_123',
        subject: 'Follow up with lead',
        body: 'Contact requested more information about All-on-4',
        priority: 'HIGH',
      });

      expect(result.id).toContain('task_');
      expect(result.properties.hs_task_subject).toBe('Follow up with lead');
    });

    it('should set default priority to MEDIUM', async () => {
      const client = new HubSpotClient(config);

      const result = await client.createTask({
        contactId: 'hs_contact_123',
        subject: 'Follow up',
      });

      expect(result.properties.hs_task_priority).toBe('MEDIUM');
    });

    it('should accept due date', async () => {
      const client = new HubSpotClient(config);
      const dueDate = new Date('2025-01-15');

      const result = await client.createTask({
        contactId: 'hs_contact_123',
        subject: 'Follow up',
        dueDate,
      });

      expect(result.properties.hs_timestamp).toBe(dueDate.toISOString());
    });

    it('should accept owner ID', async () => {
      const client = new HubSpotClient(config);

      const result = await client.createTask({
        contactId: 'hs_contact_123',
        subject: 'Follow up',
        ownerId: 'user_123',
      });

      expect(result.properties.hubspot_owner_id).toBe('user_123');
    });

    it('should validate subject is provided', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.createTask({
          contactId: 'hs_contact_123',
          subject: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('findContactByEmail', () => {
    it('should return contact when found', async () => {
      const client = new HubSpotClient(config);

      // Override handler for this test
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as {
            filterGroups?: { filters?: { value: string }[] }[];
          };
          const email = body.filterGroups?.[0]?.filters?.[0]?.value;

          if (email === 'found@example.com') {
            return HttpResponse.json({
              total: 1,
              results: [
                {
                  id: 'hs_contact_email',
                  properties: { email: 'found@example.com' },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            });
          }
          return HttpResponse.json({ total: 0, results: [] });
        })
      );

      const result = await client.findContactByEmail('found@example.com');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('hs_contact_email');
    });

    it('should return null when not found', async () => {
      const client = new HubSpotClient(config);

      const result = await client.findContactByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('upsertContactByEmail', () => {
    it('should upsert contact by email', async () => {
      const client = new HubSpotClient(config);

      // Override handler for upsert
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts', async ({ request }) => {
          const url = new URL(request.url);
          const idProperty = url.searchParams.get('idProperty');
          const body = (await request.json()) as { properties: Record<string, string> };

          expect(idProperty).toBe('email');

          return HttpResponse.json({
            id: 'hs_contact_upserted',
            properties: body.properties,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      const result = await client.upsertContactByEmail('test@example.com', {
        firstname: 'Test',
        lead_source: 'web',
      });

      expect(result.id).toBe('hs_contact_upserted');
      expect(result.properties.email).toBe('test@example.com');
    });
  });

  describe('upsertContactByPhone', () => {
    it('should upsert contact by phone', async () => {
      const client = new HubSpotClient(config);

      // Override handler for upsert
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts', async ({ request }) => {
          const url = new URL(request.url);
          const idProperty = url.searchParams.get('idProperty');
          const body = (await request.json()) as { properties: Record<string, string> };

          expect(idProperty).toBe('phone');

          return HttpResponse.json({
            id: 'hs_contact_upserted_phone',
            properties: body.properties,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      const result = await client.upsertContactByPhone('+40721123456', {
        firstname: 'Test',
        lead_source: 'whatsapp',
      });

      expect(result.id).toBe('hs_contact_upserted_phone');
      expect(result.properties.phone).toBe('+40721123456');
    });
  });

  describe('logPaymentToTimeline', () => {
    it('should log payment to timeline', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logPaymentToTimeline({
          contactId: 'hs_contact_123',
          paymentId: 'pi_test123',
          amount: 50000, // 500.00 EUR in cents
          currency: 'eur',
          status: 'succeeded',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle 429 rate limit errors', async () => {
      const client = new HubSpotClient({
        ...config,
        retryConfig: { maxRetries: 1, baseDelayMs: 10 },
      });

      server.use(
        createRateLimitedHandler('https://api.hubapi.com/crm/v3/objects/contacts/search', 'post', 1)
      );

      // Should eventually succeed after retry
      const results = await client.searchContactsByPhone('+40721000001');
      expect(results).toBeDefined();
    });

    it('should handle 502/503 errors with retry', async () => {
      const client = new HubSpotClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 10 },
      });

      server.use(
        createFailingHandler(
          'https://api.hubapi.com/crm/v3/objects/contacts/search',
          'post',
          2,
          503
        )
      );

      // Should eventually succeed after retries
      const results = await client.searchContactsByPhone('+40721000001');
      expect(results).toBeDefined();
    });

    it('should throw ExternalServiceError for API errors', async () => {
      const client = new HubSpotClient(config);

      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          return HttpResponse.json({ message: 'Forbidden' }, { status: 403 });
        })
      );

      await expect(client.searchContactsByPhone('+40721000001')).rejects.toThrow(
        'Request failed with status 403'
      );
    });
  });

  describe('createHubSpotClient factory', () => {
    it('should create a HubSpot client instance', () => {
      const client = createHubSpotClient(config);
      expect(client).toBeInstanceOf(HubSpotClient);
    });
  });
});
