import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { HubSpotClient, createHubSpotClient } from '../hubspot.js';
import {
  server,
  testFixtures,
  createRateLimitedHandler,
  createFailingHandler,
} from '../__mocks__/setup.js';
import { ExternalServiceError, RateLimitError } from '@medicalcor/core';

// Note: server lifecycle (listen, resetHandlers, close) is managed by vitest.setup.ts

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

    it('should reject custom base URL for SSRF prevention', () => {
      // SECURITY: Custom base URLs are blocked to prevent SSRF attacks
      expect(
        () =>
          new HubSpotClient({
            ...config,
            baseUrl: 'https://custom.hubapi.com',
          })
      ).toThrow('SSRF Prevention');
    });

    it('should accept official HubSpot base URL', () => {
      const client = new HubSpotClient({
        ...config,
        baseUrl: 'https://api.hubapi.com',
      });
      expect(client).toBeInstanceOf(HubSpotClient);
    });

    it('should reject invalid base URL format', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            baseUrl: 'not-a-url',
          })
      ).toThrow();
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

    it('should reject invalid retry config - maxRetries too high', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            retryConfig: {
              maxRetries: 11, // Max is 10
              baseDelayMs: 1000,
            },
          })
      ).toThrow();
    });

    it('should reject invalid retry config - negative maxRetries', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            retryConfig: {
              maxRetries: -1,
              baseDelayMs: 1000,
            },
          })
      ).toThrow();
    });

    it('should reject invalid retry config - baseDelayMs too low', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            retryConfig: {
              maxRetries: 3,
              baseDelayMs: 50, // Min is 100
            },
          })
      ).toThrow();
    });

    it('should reject invalid retry config - baseDelayMs too high', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            retryConfig: {
              maxRetries: 3,
              baseDelayMs: 40000, // Max is 30000
            },
          })
      ).toThrow();
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

    it('should validate phone number format - too short', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.syncContact({
          phone: '123', // Too short
        })
      ).rejects.toThrow();
    });

    it('should validate phone number format - too long', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.syncContact({
          phone: '123456789012345678901', // Too long (>20)
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

    it('should validate name max length', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.syncContact({
          phone: '+40721999999',
          name: 'a'.repeat(257), // Max is 256
        })
      ).rejects.toThrow();
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

  describe('searchContacts', () => {
    it('should search contacts with custom filters', async () => {
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as {
            filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
          };

          return HttpResponse.json({
            total: 1,
            results: [
              {
                id: 'hs_contact_searched',
                properties: { email: 'searched@example.com' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient(config);
      const result = await client.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: 'searched@example.com',
              },
            ],
          },
        ],
        limit: 10,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('hs_contact_searched');
    });
  });

  describe('searchAllContacts', () => {
    it('should fetch all pages with pagination', async () => {
      let pageCount = 0;

      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as { after?: string };
          pageCount++;

          if (pageCount === 1) {
            return HttpResponse.json({
              total: 2,
              results: [
                {
                  id: 'contact_1',
                  properties: { email: 'test1@example.com' },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              paging: {
                next: {
                  after: 'cursor_1',
                },
              },
            });
          }

          return HttpResponse.json({
            total: 2,
            results: [
              {
                id: 'contact_2',
                properties: { email: 'test2@example.com' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.searchAllContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'lifecyclestage',
                operator: 'EQ',
                value: 'lead',
              },
            ],
          },
        ],
        properties: ['email'],
      });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('contact_1');
      expect(results[1].id).toBe('contact_2');
    });

    it('should stop at maxResults limit', async () => {
      let pageCount = 0;

      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async () => {
          pageCount++;

          // Return pages until we exceed maxResults
          if (pageCount > 3) {
            // Stop pagination after 3 pages
            return HttpResponse.json({
              total: 1000,
              results: [],
            });
          }

          return HttpResponse.json({
            total: 1000,
            results: Array.from({ length: 100 }, (_, i) => ({
              id: `contact_${pageCount}_${i}`,
              properties: { email: `test${i}@example.com` },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })),
            paging: {
              next: {
                after: `cursor_${pageCount}`,
              },
            },
          });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.searchAllContacts(
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'lifecyclestage',
                  operator: 'EQ',
                  value: 'lead',
                },
              ],
            },
          ],
          properties: ['email'],
        },
        250 // maxResults - will stop after collecting 300 (3 pages)
      );

      // The implementation collects full pages and then checks if maxResults exceeded
      // So with pages of 100, setting maxResults to 250 will collect 3 pages (300 items)
      // then stop because 300 >= 250
      expect(results.length).toBe(300);
      expect(pageCount).toBe(3);
    });

    it('should respect page size limit', async () => {
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as { limit?: number };

          // Should not exceed MAX_PAGE_SIZE (100)
          expect(body.limit).toBeLessThanOrEqual(100);

          return HttpResponse.json({
            total: 0,
            results: [],
          });
        })
      );

      const client = new HubSpotClient(config);
      await client.searchAllContacts({
        filterGroups: [],
        properties: ['email'],
        limit: 200, // Request more than MAX_PAGE_SIZE
      });
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

    it('should support all channel types', async () => {
      const client = new HubSpotClient(config);

      const channels = ['whatsapp', 'voice', 'email', 'web'] as const;

      for (const channel of channels) {
        await expect(
          client.logMessageToTimeline({
            contactId: 'hs_contact_123',
            message: 'Test message',
            direction: 'IN',
            channel,
          })
        ).resolves.toBeUndefined();
      }
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

    it('should validate message max length', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logMessageToTimeline({
          contactId: 'hs_contact_123',
          message: 'a'.repeat(65536), // Max is 65535
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

    it('should handle missing transcript', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.logCallToTimeline({
          contactId: 'hs_contact_123',
          callSid: 'call_123456',
          duration: 180,
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

    it('should accept all priority levels', async () => {
      const client = new HubSpotClient(config);
      const priorities = ['LOW', 'MEDIUM', 'HIGH'] as const;

      for (const priority of priorities) {
        const result = await client.createTask({
          contactId: 'hs_contact_123',
          subject: 'Follow up',
          priority,
        });

        expect(result.properties.hs_task_priority).toBe(priority);
      }
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

    it('should validate subject max length', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.createTask({
          contactId: 'hs_contact_123',
          subject: 'a'.repeat(513), // Max is 512
        })
      ).rejects.toThrow();
    });

    it('should validate body max length', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.createTask({
          contactId: 'hs_contact_123',
          subject: 'Follow up',
          body: 'a'.repeat(65536), // Max is 65535
        })
      ).rejects.toThrow();
    });
  });

  describe('findContactByEmail', () => {
    it('should return contact when found', async () => {
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

      const client = new HubSpotClient(config);
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

  describe('findContactByPhone', () => {
    it('should return contact when found', async () => {
      const client = new HubSpotClient(config);

      const result = await client.findContactByPhone('+40721000001');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('hs_contact_123');
    });

    it('should return null when not found', async () => {
      const client = new HubSpotClient(config);

      const result = await client.findContactByPhone('+40799999999');

      expect(result).toBeNull();
    });
  });

  describe('upsertContactByEmail', () => {
    it('should upsert contact by email', async () => {
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

      const client = new HubSpotClient(config);
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

      const client = new HubSpotClient(config);
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

  describe('updateRetentionMetrics', () => {
    it('should update retention score', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateRetentionMetrics('hs_contact_123', {
        retentionScore: 85,
      });

      expect(result.properties.retention_score).toBe('85');
    });

    it('should update churn risk', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateRetentionMetrics('hs_contact_123', {
        churnRisk: 'RIDICAT',
      });

      expect(result.properties.churn_risk).toBe('RIDICAT');
    });

    it('should update days inactive', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateRetentionMetrics('hs_contact_123', {
        daysInactive: 45,
      });

      expect(result.properties.days_inactive).toBe('45');
    });

    it('should update follow-up priority', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateRetentionMetrics('hs_contact_123', {
        followUpPriority: 'URGENTA',
      });

      expect(result.properties.follow_up_priority).toBe('URGENTA');
    });

    it('should update multiple metrics at once', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateRetentionMetrics('hs_contact_123', {
        retentionScore: 85,
        churnRisk: 'SCAZUT',
        daysInactive: 10,
        followUpPriority: 'MEDIE',
      });

      expect(result.properties.retention_score).toBe('85');
      expect(result.properties.churn_risk).toBe('SCAZUT');
      expect(result.properties.days_inactive).toBe('10');
      expect(result.properties.follow_up_priority).toBe('MEDIE');
    });

    it('should support all churn risk levels', async () => {
      const client = new HubSpotClient(config);
      const levels = ['SCAZUT', 'MEDIU', 'RIDICAT', 'FOARTE_RIDICAT'] as const;

      for (const level of levels) {
        const result = await client.updateRetentionMetrics('hs_contact_123', {
          churnRisk: level,
        });

        expect(result.properties.churn_risk).toBe(level);
      }
    });

    it('should support all follow-up priorities', async () => {
      const client = new HubSpotClient(config);
      const priorities = ['URGENTA', 'RIDICATA', 'MEDIE', 'SCAZUTA'] as const;

      for (const priority of priorities) {
        const result = await client.updateRetentionMetrics('hs_contact_123', {
          followUpPriority: priority,
        });

        expect(result.properties.follow_up_priority).toBe(priority);
      }
    });
  });

  describe('updateNPSScore', () => {
    it('should categorize score 9-10 as PROMOTOR', async () => {
      const client = new HubSpotClient(config);

      const result1 = await client.updateNPSScore('hs_contact_123', { score: 9 });
      expect(result1.properties.nps_score).toBe('9');
      expect(result1.properties.nps_category).toBe('PROMOTOR');

      const result2 = await client.updateNPSScore('hs_contact_123', { score: 10 });
      expect(result2.properties.nps_score).toBe('10');
      expect(result2.properties.nps_category).toBe('PROMOTOR');
    });

    it('should categorize score 7-8 as PASIV', async () => {
      const client = new HubSpotClient(config);

      const result1 = await client.updateNPSScore('hs_contact_123', { score: 7 });
      expect(result1.properties.nps_score).toBe('7');
      expect(result1.properties.nps_category).toBe('PASIV');

      const result2 = await client.updateNPSScore('hs_contact_123', { score: 8 });
      expect(result2.properties.nps_score).toBe('8');
      expect(result2.properties.nps_category).toBe('PASIV');
    });

    it('should categorize score 0-6 as DETRACTOR', async () => {
      const client = new HubSpotClient(config);

      const result1 = await client.updateNPSScore('hs_contact_123', { score: 0 });
      expect(result1.properties.nps_score).toBe('0');
      expect(result1.properties.nps_category).toBe('DETRACTOR');

      const result2 = await client.updateNPSScore('hs_contact_123', { score: 6 });
      expect(result2.properties.nps_score).toBe('6');
      expect(result2.properties.nps_category).toBe('DETRACTOR');
    });

    it('should include feedback when provided', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateNPSScore('hs_contact_123', {
        score: 9,
        feedback: 'Excellent service!',
      });

      expect(result.properties.nps_feedback).toBe('Excellent service!');
    });

    it('should set last NPS survey date', async () => {
      const client = new HubSpotClient(config);
      const beforeTime = new Date().toISOString();

      const result = await client.updateNPSScore('hs_contact_123', { score: 8 });

      expect(result.properties.last_nps_survey_date).toBeDefined();
      expect(new Date(result.properties.last_nps_survey_date!).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime()
      );
    });
  });

  describe('updateLoyaltySegment', () => {
    it('should update loyalty segment', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateLoyaltySegment('hs_contact_123', {
        segment: 'Gold',
      });

      expect(result.properties.loyalty_segment).toBe('Gold');
    });

    it('should support all segment levels', async () => {
      const client = new HubSpotClient(config);
      const segments = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;

      for (const segment of segments) {
        const result = await client.updateLoyaltySegment('hs_contact_123', {
          segment,
        });

        expect(result.properties.loyalty_segment).toBe(segment);
      }
    });

    it('should update lifetime value when provided', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateLoyaltySegment('hs_contact_123', {
        segment: 'Platinum',
        lifetimeValue: 35000,
      });

      expect(result.properties.lifetime_value).toBe('35000');
    });

    it('should update active discounts when provided', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateLoyaltySegment('hs_contact_123', {
        segment: 'Gold',
        activeDiscounts: ['VIP10', 'LOYAL20'],
      });

      expect(result.properties.active_discounts).toBe('VIP10;LOYAL20');
    });

    it('should handle empty active discounts', async () => {
      const client = new HubSpotClient(config);

      const result = await client.updateLoyaltySegment('hs_contact_123', {
        segment: 'Bronze',
        activeDiscounts: [],
      });

      expect(result.properties.active_discounts).toBeUndefined();
    });
  });

  describe('getChurnRiskContacts', () => {
    it('should get contacts with RIDICAT churn risk', async () => {
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as {
            filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
          };

          return HttpResponse.json({
            total: 2,
            results: [
              {
                id: 'contact_1',
                properties: { churn_risk: 'RIDICAT' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'contact_2',
                properties: { churn_risk: 'FOARTE_RIDICAT' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.getChurnRiskContacts('RIDICAT');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should get contacts with FOARTE_RIDICAT churn risk only', async () => {
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as {
            filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
          };

          // Should have only one filter group for FOARTE_RIDICAT
          expect(body.filterGroups).toHaveLength(1);

          return HttpResponse.json({
            total: 1,
            results: [
              {
                id: 'contact_1',
                properties: { churn_risk: 'FOARTE_RIDICAT' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.getChurnRiskContacts('FOARTE_RIDICAT');

      expect(results.length).toBe(1);
    });
  });

  describe('getContactsByLoyaltySegment', () => {
    it('should get contacts for each loyalty segment', async () => {
      const client = new HubSpotClient(config);
      const segments = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;

      for (const segment of segments) {
        server.use(
          http.post(
            'https://api.hubapi.com/crm/v3/objects/contacts/search',
            async ({ request }) => {
              const body = (await request.json()) as {
                filterGroups?: { filters?: { value: string }[] }[];
              };
              const requestedSegment = body.filterGroups?.[0]?.filters?.[0]?.value;

              return HttpResponse.json({
                total: 1,
                results: [
                  {
                    id: `contact_${segment}`,
                    properties: { loyalty_segment: requestedSegment },
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ],
              });
            }
          )
        );

        const results = await client.getContactsByLoyaltySegment(segment);
        expect(results.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getNPSDetractors', () => {
    it('should get NPS detractors', async () => {
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          const body = (await request.json()) as {
            filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
          };
          const category = body.filterGroups?.[0]?.filters?.[0]?.value;

          expect(category).toBe('DETRACTOR');

          return HttpResponse.json({
            total: 1,
            results: [
              {
                id: 'detractor_1',
                properties: {
                  nps_category: 'DETRACTOR',
                  nps_score: '3',
                  nps_feedback: 'Not satisfied with service',
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.getNPSDetractors();

      expect(results.length).toBe(1);
      expect(results[0].properties.nps_category).toBe('DETRACTOR');
    });
  });

  describe('recordAppointmentCancellation', () => {
    it('should increment canceled appointments count', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                canceled_appointments: '2',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordAppointmentCancellation('hs_contact_123');

      expect(result.properties.canceled_appointments).toBe('3');
    });

    it('should handle first cancellation when field is undefined', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_new',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_new',
              properties: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordAppointmentCancellation('hs_contact_new');

      expect(result.properties.canceled_appointments).toBe('1');
    });

    it('should accept correlation ID for audit trail', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.recordAppointmentCancellation('hs_contact_123', 'correlation-id-123')
      ).resolves.toBeDefined();
    });
  });

  describe('recordTreatmentCompletion', () => {
    it('should increment treatment count and LTV', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '3000',
                total_treatments: '2',
                loyalty_segment: 'Bronze',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_123', 2500);

      expect(result.properties.lifetime_value).toBe('5500');
      expect(result.properties.total_treatments).toBe('3');
      expect(result.properties.loyalty_segment).toBe('Silver');
      expect(result.properties.days_inactive).toBe('0');
    });

    it('should promote to Silver segment at 5000 LTV', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '4000',
                total_treatments: '3',
                loyalty_segment: 'Bronze',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_123', 1500);

      expect(result.properties.lifetime_value).toBe('5500');
      expect(result.properties.loyalty_segment).toBe('Silver');
    });

    it('should promote to Gold segment at 15000 LTV', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '12000',
                total_treatments: '5',
                loyalty_segment: 'Silver',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_123', 4000);

      expect(result.properties.lifetime_value).toBe('16000');
      expect(result.properties.loyalty_segment).toBe('Gold');
    });

    it('should promote to Platinum segment at 30000 LTV', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '25000',
                total_treatments: '10',
                loyalty_segment: 'Gold',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_123', 6000);

      expect(result.properties.lifetime_value).toBe('31000');
      expect(result.properties.loyalty_segment).toBe('Platinum');
    });

    it('should keep Bronze segment below 5000 LTV', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '1000',
                total_treatments: '1',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_123', 1000);

      expect(result.properties.lifetime_value).toBe('2000');
      expect(result.properties.loyalty_segment).toBe('Bronze');
    });

    it('should handle first treatment when fields are undefined', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_new',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_new',
              properties: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_new', 2000);

      expect(result.properties.lifetime_value).toBe('2000');
      expect(result.properties.total_treatments).toBe('1');
      expect(result.properties.loyalty_segment).toBe('Bronze');
    });

    it('should reset days_inactive to 0', async () => {
      server.use(
        http.get(
          'https://api.hubapi.com/crm/v3/objects/contacts/hs_contact_123',
          async ({ request }) => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '5000',
                total_treatments: '3',
                days_inactive: '45',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const client = new HubSpotClient(config);
      const result = await client.recordTreatmentCompletion('hs_contact_123', 1000);

      expect(result.properties.days_inactive).toBe('0');
    });

    it('should accept correlation ID for audit trail', async () => {
      const client = new HubSpotClient(config);

      await expect(
        client.recordTreatmentCompletion('hs_contact_123', 1000, 'correlation-id-456')
      ).resolves.toBeDefined();
    });
  });

  describe('request method security', () => {
    it('should reject paths not starting with /', async () => {
      const client = new HubSpotClient(config);

      await expect(
        // @ts-expect-error - testing private method
        client.request('invalid-path')
      ).rejects.toThrow('invalid or unsafe path');
    });

    it('should reject paths containing ://', async () => {
      const client = new HubSpotClient(config);

      await expect(
        // @ts-expect-error - testing private method
        client.request('/path://malicious')
      ).rejects.toThrow('invalid or unsafe path');
    });

    it('should reject paths containing ..', async () => {
      const client = new HubSpotClient(config);

      await expect(
        // @ts-expect-error - testing private method
        client.request('/../../etc/passwd')
      ).rejects.toThrow('invalid or unsafe path');
    });

    it('should validate hostname is api.hubapi.com', async () => {
      const client = new HubSpotClient(config);

      // The request method validates the hostname internally
      // A valid path to the HubSpot API should work
      await expect(
        // @ts-expect-error - testing private method
        client.request('/crm/v3/objects/contacts/test')
      ).resolves.toBeDefined();
    });

    it('should reject requests if baseUrl is maliciously modified', async () => {
      const client = new HubSpotClient(config);

      // Simulate a scenario where baseUrl is maliciously modified
      // (This shouldn't be possible in normal usage but tests defensive programming)
      // @ts-expect-error - accessing private property for security test
      client.baseUrl = 'https://evil.com';

      await expect(
        // @ts-expect-error - testing private method
        client.request('/crm/v3/objects/contacts')
      ).rejects.toThrow('untrusted host');
    });
  });

  describe('request method headers handling', () => {
    it('should handle Headers object', async () => {
      const client = new HubSpotClient(config);

      const headers = new Headers();
      headers.set('X-Custom-Header', 'test-value');

      await expect(
        // @ts-expect-error - testing private method
        client.request('/crm/v3/objects/contacts/test', {
          method: 'GET',
          headers,
        })
      ).resolves.toBeDefined();
    });

    it('should handle headers as array', async () => {
      const client = new HubSpotClient(config);

      const headers: [string, string][] = [['X-Custom-Header', 'test-value']];

      await expect(
        // @ts-expect-error - testing private method
        client.request('/crm/v3/objects/contacts/test', {
          method: 'GET',
          headers,
        })
      ).resolves.toBeDefined();
    });

    it('should handle headers as plain object', async () => {
      const client = new HubSpotClient(config);

      const headers = {
        'X-Custom-Header': 'test-value',
      };

      await expect(
        // @ts-expect-error - testing private method
        client.request('/crm/v3/objects/contacts/test', {
          method: 'GET',
          headers,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('request method timeout handling', () => {
    it('should have timeout configuration', () => {
      const client = new HubSpotClient(config);

      // Verify client is properly configured with timeouts
      // The actual timeout behavior is tested via integration tests with real delays
      expect(client).toBeInstanceOf(HubSpotClient);
    });
  });

  describe('error handling', () => {
    it('should handle 429 rate limit errors', async () => {
      let callCount = 0;

      // Custom handler that fails twice with 429, then succeeds with valid response
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          callCount++;
          if (callCount <= 2) {
            return new HttpResponse(null, {
              status: 429,
              headers: { 'Retry-After': '1' },
            });
          }
          return HttpResponse.json({
            total: 1,
            results: [
              {
                id: 'hs_contact_ratelimit',
                properties: { phone: '+40721000001' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      // Should eventually succeed after retry (handler fails twice, so needs 3 attempts)
      const results = await client.searchContactsByPhone('+40721000001');
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle 502 errors with retry', async () => {
      let callCount = 0;

      // Custom handler that fails twice with 502, then succeeds
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          callCount++;
          if (callCount <= 2) {
            return new HttpResponse(null, { status: 502 });
          }
          return HttpResponse.json({
            total: 1,
            results: [
              {
                id: 'hs_contact_retry',
                properties: { phone: '+40721000001' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      // Should eventually succeed after retries
      const results = await client.searchContactsByPhone('+40721000001');
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle 503 errors with retry', async () => {
      let callCount = 0;

      // Custom handler that fails twice with 503, then succeeds with valid response
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          callCount++;
          if (callCount <= 2) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json({
            total: 1,
            results: [
              {
                id: 'hs_contact_retry',
                properties: { phone: '+40721000001' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const client = new HubSpotClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      // Should eventually succeed after retries
      const results = await client.searchContactsByPhone('+40721000001');
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should throw ExternalServiceError for API errors', async () => {
      // Override handler for this test
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          return HttpResponse.json({ message: 'Forbidden' }, { status: 403 });
        })
      );

      const client = new HubSpotClient(config);

      await expect(client.searchContactsByPhone('+40721000001')).rejects.toThrow(
        'Request failed with status 403'
      );
    });

    it('should handle 404 errors', async () => {
      server.use(
        http.get('https://api.hubapi.com/crm/v3/objects/contacts/nonexistent', () => {
          return HttpResponse.json({ message: 'Not Found' }, { status: 404 });
        })
      );

      const client = new HubSpotClient(config);

      await expect(client.getContact('nonexistent')).rejects.toThrow(
        'Request failed with status 404'
      );
    });

    it('should handle 500 errors', async () => {
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 });
        })
      );

      const client = new HubSpotClient(config);

      await expect(client.searchContactsByPhone('+40721000001')).rejects.toThrow(
        'Request failed with status 500'
      );
    });

    it('should not retry 4xx errors except 429', async () => {
      let callCount = 0;

      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', () => {
          callCount++;
          return HttpResponse.json({ message: 'Bad Request' }, { status: 400 });
        })
      );

      const client = new HubSpotClient({
        ...config,
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      await expect(client.searchContactsByPhone('+40721000001')).rejects.toThrow(
        'Request failed with status 400'
      );

      // Should only be called once (no retries for 400)
      expect(callCount).toBe(1);
    });
  });

  describe('createHubSpotClient factory', () => {
    it('should create a HubSpot client instance', () => {
      const client = createHubSpotClient(config);
      expect(client).toBeInstanceOf(HubSpotClient);
    });

    it('should pass config to constructor', () => {
      const customConfig = {
        accessToken: 'custom-token',
        portalId: 'custom-portal',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      };

      const client = createHubSpotClient(customConfig);
      expect(client).toBeInstanceOf(HubSpotClient);
    });
  });
});
