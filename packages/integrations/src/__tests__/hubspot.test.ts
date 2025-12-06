import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { HubSpotClient, createHubSpotClient } from '../hubspot.js';
import {
  server,
  testFixtures,
  createRateLimitedHandler,
  createFailingHandler,
} from '../__mocks__/setup.js';

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
        retryConfig: { maxRetries: 2, baseDelayMs: 100 },
      });

      // Should eventually succeed after retry (handler fails twice, so needs 3 attempts)
      const results = await client.searchContactsByPhone('+40721000001');
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle 502/503 errors with retry', async () => {
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
  });

  describe('createHubSpotClient factory', () => {
    it('should create a HubSpot client instance', () => {
      const client = createHubSpotClient(config);
      expect(client).toBeInstanceOf(HubSpotClient);
    });
  });

  describe('findContactByPhone', () => {
    it('should return contact when found', async () => {
      const client = new HubSpotClient(config);

      const result = await client.findContactByPhone('+40721000001');

      expect(result).not.toBeNull();
      expect(result?.properties.phone).toBe('+40721000001');
    });

    it('should return null when not found', async () => {
      const client = new HubSpotClient(config);

      const result = await client.findContactByPhone('+40799999999');

      expect(result).toBeNull();
    });
  });

  describe('searchAllContacts', () => {
    it('should paginate through all results', async () => {
      let pageCount = 0;

      // Handler that returns paginated results
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
          pageCount++;
          const body = (await request.json()) as { after?: string };

          if (!body.after) {
            // First page
            return HttpResponse.json({
              total: 150,
              results: Array(100)
                .fill(null)
                .map((_, i) => ({
                  id: `hs_contact_page1_${i}`,
                  properties: { phone: `+4072100000${i}` },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                })),
              paging: { next: { after: 'cursor_page2' } },
            });
          } else if (body.after === 'cursor_page2') {
            // Second page - last page
            return HttpResponse.json({
              total: 150,
              results: Array(50)
                .fill(null)
                .map((_, i) => ({
                  id: `hs_contact_page2_${i}`,
                  properties: { phone: `+4072200000${i}` },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                })),
              // No paging.next means last page
            });
          }
          return HttpResponse.json({ total: 0, results: [] });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.searchAllContacts({
        filterGroups: [
          { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }] },
        ],
      });

      expect(results.length).toBe(150);
      expect(pageCount).toBe(2);
    });

    it('should respect maxResults limit', async () => {
      // Handler that returns paginated results indefinitely
      server.use(
        http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async () => {
          return HttpResponse.json({
            total: 10000,
            results: Array(100)
              .fill(null)
              .map((_, i) => ({
                id: `hs_contact_${i}`,
                properties: { phone: `+407210000${i}` },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })),
            paging: { next: { after: 'cursor_next' } },
          });
        })
      );

      const client = new HubSpotClient(config);
      const results = await client.searchAllContacts(
        {
          filterGroups: [
            { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' }] },
          ],
        },
        250 // maxResults
      );

      // Should stop at or after maxResults
      expect(results.length).toBeGreaterThanOrEqual(250);
      expect(results.length).toBeLessThanOrEqual(300); // 3 pages max
    });
  });

  describe('CRM Retention Methods', () => {
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
          daysInactive: 30,
        });

        expect(result.properties.days_inactive).toBe('30');
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
          retentionScore: 45,
          churnRisk: 'FOARTE_RIDICAT',
          daysInactive: 90,
          followUpPriority: 'URGENTA',
        });

        expect(result.properties.retention_score).toBe('45');
        expect(result.properties.churn_risk).toBe('FOARTE_RIDICAT');
      });
    });

    describe('updateNPSScore', () => {
      it('should classify score 9-10 as PROMOTOR', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateNPSScore('hs_contact_123', {
          score: 9,
        });

        expect(result.properties.nps_score).toBe('9');
        expect(result.properties.nps_category).toBe('PROMOTOR');
      });

      it('should classify score 7-8 as PASIV', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateNPSScore('hs_contact_123', {
          score: 7,
        });

        expect(result.properties.nps_score).toBe('7');
        expect(result.properties.nps_category).toBe('PASIV');
      });

      it('should classify score 0-6 as DETRACTOR', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateNPSScore('hs_contact_123', {
          score: 5,
        });

        expect(result.properties.nps_score).toBe('5');
        expect(result.properties.nps_category).toBe('DETRACTOR');
      });

      it('should store NPS feedback when provided', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateNPSScore('hs_contact_123', {
          score: 10,
          feedback: 'Excellent service!',
        });

        expect(result.properties.nps_feedback).toBe('Excellent service!');
      });

      it('should set last_nps_survey_date', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateNPSScore('hs_contact_123', {
          score: 8,
        });

        expect(result.properties.last_nps_survey_date).toBeDefined();
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

      it('should update lifetime value', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateLoyaltySegment('hs_contact_123', {
          segment: 'Platinum',
          lifetimeValue: 50000,
        });

        expect(result.properties.lifetime_value).toBe('50000');
      });

      it('should update active discounts', async () => {
        const client = new HubSpotClient(config);

        const result = await client.updateLoyaltySegment('hs_contact_123', {
          segment: 'Silver',
          activeDiscounts: ['LOYALTY10', 'BIRTHDAY15'],
        });

        expect(result.properties.active_discounts).toBe('LOYALTY10;BIRTHDAY15');
      });
    });

    describe('getChurnRiskContacts', () => {
      it('should search for high churn risk contacts', async () => {
        server.use(
          http.post(
            'https://api.hubapi.com/crm/v3/objects/contacts/search',
            async ({ request }) => {
              const body = (await request.json()) as {
                filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
              };
              const hasChurnRiskFilter = body.filterGroups?.some((group) =>
                group.filters?.some(
                  (f) =>
                    f.propertyName === 'churn_risk' &&
                    ['RIDICAT', 'FOARTE_RIDICAT'].includes(f.value)
                )
              );

              if (hasChurnRiskFilter) {
                return HttpResponse.json({
                  total: 2,
                  results: [
                    {
                      id: 'hs_contact_churn_1',
                      properties: { churn_risk: 'RIDICAT', retention_score: '30' },
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    {
                      id: 'hs_contact_churn_2',
                      properties: { churn_risk: 'FOARTE_RIDICAT', retention_score: '15' },
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  ],
                });
              }
              return HttpResponse.json({ total: 0, results: [] });
            }
          )
        );

        const client = new HubSpotClient(config);
        const results = await client.getChurnRiskContacts('RIDICAT');

        expect(results.length).toBe(2);
      });
    });

    describe('getContactsByLoyaltySegment', () => {
      it('should search contacts by loyalty segment', async () => {
        server.use(
          http.post(
            'https://api.hubapi.com/crm/v3/objects/contacts/search',
            async ({ request }) => {
              const body = (await request.json()) as {
                filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
              };
              const segment = body.filterGroups?.[0]?.filters?.[0]?.value;

              if (segment === 'Platinum') {
                return HttpResponse.json({
                  total: 1,
                  results: [
                    {
                      id: 'hs_contact_platinum',
                      properties: { loyalty_segment: 'Platinum', lifetime_value: '50000' },
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  ],
                });
              }
              return HttpResponse.json({ total: 0, results: [] });
            }
          )
        );

        const client = new HubSpotClient(config);
        const results = await client.getContactsByLoyaltySegment('Platinum');

        expect(results.length).toBe(1);
        expect(results[0].properties.loyalty_segment).toBe('Platinum');
      });
    });

    describe('getNPSDetractors', () => {
      it('should search for NPS detractors', async () => {
        server.use(
          http.post(
            'https://api.hubapi.com/crm/v3/objects/contacts/search',
            async ({ request }) => {
              const body = (await request.json()) as {
                filterGroups?: { filters?: { propertyName: string; value: string }[] }[];
              };
              const isDetractorSearch = body.filterGroups?.[0]?.filters?.some(
                (f) => f.propertyName === 'nps_category' && f.value === 'DETRACTOR'
              );

              if (isDetractorSearch) {
                return HttpResponse.json({
                  total: 2,
                  results: [
                    {
                      id: 'hs_detractor_1',
                      properties: {
                        nps_score: '3',
                        nps_category: 'DETRACTOR',
                        nps_feedback: 'Poor service',
                      },
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    {
                      id: 'hs_detractor_2',
                      properties: { nps_score: '5', nps_category: 'DETRACTOR' },
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  ],
                });
              }
              return HttpResponse.json({ total: 0, results: [] });
            }
          )
        );

        const client = new HubSpotClient(config);
        const results = await client.getNPSDetractors();

        expect(results.length).toBe(2);
        expect(results[0].properties.nps_category).toBe('DETRACTOR');
      });
    });

    describe('recordAppointmentCancellation', () => {
      it('should increment cancellation count', async () => {
        // Override getContact to return current count
        server.use(
          http.get('https://api.hubapi.com/crm/v3/objects/contacts/:id', () => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: { canceled_appointments: '2' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }),
          http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:id', async ({ request }) => {
            const body = (await request.json()) as { properties: Record<string, string> };
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: body.properties,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
        );

        const client = new HubSpotClient(config);
        const result = await client.recordAppointmentCancellation('hs_contact_123', 'corr-123');

        expect(result.properties.canceled_appointments).toBe('3');
      });

      it('should handle contacts with no previous cancellations', async () => {
        server.use(
          http.get('https://api.hubapi.com/crm/v3/objects/contacts/:id', () => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {}, // No canceled_appointments property
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }),
          http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:id', async ({ request }) => {
            const body = (await request.json()) as { properties: Record<string, string> };
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: body.properties,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
        );

        const client = new HubSpotClient(config);
        const result = await client.recordAppointmentCancellation('hs_contact_123');

        expect(result.properties.canceled_appointments).toBe('1');
      });
    });

    describe('recordTreatmentCompletion', () => {
      it('should update LTV and treatment count', async () => {
        server.use(
          http.get('https://api.hubapi.com/crm/v3/objects/contacts/:id', () => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '5000',
                total_treatments: '3',
                loyalty_segment: 'Silver',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }),
          http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:id', async ({ request }) => {
            const body = (await request.json()) as { properties: Record<string, string> };
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: body.properties,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
        );

        const client = new HubSpotClient(config);
        const result = await client.recordTreatmentCompletion('hs_contact_123', 10000, 'corr-456');

        expect(result.properties.lifetime_value).toBe('15000'); // 5000 + 10000
        expect(result.properties.total_treatments).toBe('4');
        expect(result.properties.loyalty_segment).toBe('Gold'); // LTV >= 15000
        expect(result.properties.days_inactive).toBe('0');
      });

      it('should upgrade to Platinum for high LTV', async () => {
        server.use(
          http.get('https://api.hubapi.com/crm/v3/objects/contacts/:id', () => {
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: {
                lifetime_value: '25000',
                total_treatments: '5',
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }),
          http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:id', async ({ request }) => {
            const body = (await request.json()) as { properties: Record<string, string> };
            return HttpResponse.json({
              id: 'hs_contact_123',
              properties: body.properties,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
        );

        const client = new HubSpotClient(config);
        const result = await client.recordTreatmentCompletion('hs_contact_123', 10000);

        expect(result.properties.lifetime_value).toBe('35000');
        expect(result.properties.loyalty_segment).toBe('Platinum'); // LTV >= 30000
      });

      it('should start from zero for new contacts', async () => {
        server.use(
          http.get('https://api.hubapi.com/crm/v3/objects/contacts/:id', () => {
            return HttpResponse.json({
              id: 'hs_contact_new',
              properties: {}, // No LTV or treatments
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }),
          http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:id', async ({ request }) => {
            const body = (await request.json()) as { properties: Record<string, string> };
            return HttpResponse.json({
              id: 'hs_contact_new',
              properties: body.properties,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
        );

        const client = new HubSpotClient(config);
        const result = await client.recordTreatmentCompletion('hs_contact_new', 3000);

        expect(result.properties.lifetime_value).toBe('3000');
        expect(result.properties.total_treatments).toBe('1');
        expect(result.properties.loyalty_segment).toBe('Bronze'); // LTV < 5000
      });
    });
  });

  describe('SSRF Prevention', () => {
    it('should reject path traversal attempts', async () => {
      const client = new HubSpotClient(config);

      // Access private request method via prototype (for testing security)
      // This would be triggered if someone tried to inject a malicious path
      await expect(client.getContact('../../../etc/passwd')).rejects.toThrow();
    });

    it('should accept the official HubSpot base URL', () => {
      // Should not throw
      const client = new HubSpotClient({
        ...config,
        baseUrl: 'https://api.hubapi.com',
      });
      expect(client).toBeInstanceOf(HubSpotClient);
    });

    it('should reject localhost URLs', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            baseUrl: 'http://localhost:3000',
          })
      ).toThrow('SSRF Prevention');
    });

    it('should reject internal IP URLs', () => {
      expect(
        () =>
          new HubSpotClient({
            ...config,
            baseUrl: 'http://192.168.1.1',
          })
      ).toThrow('SSRF Prevention');
    });
  });
});
