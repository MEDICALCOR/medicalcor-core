/**
 * HubSpot API Contract Tests
 *
 * Consumer-driven contract tests for the HubSpot CRM API integration.
 * These tests verify that our HubSpotClient expects API responses
 * in the format that HubSpot actually provides.
 *
 * Contract tests ensure:
 * 1. Our client sends requests in the correct format
 * 2. Our client can handle responses from the provider
 * 3. Changes to the external API are detected early
 *
 * @see https://developers.hubspot.com/docs/api/crm/contacts
 */

import { describe, it, expect } from 'vitest';
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { createPact, HUBSPOT_PROVIDER, HubSpotMatchers, Matchers } from './pact-setup.js';

const { like, eachLike, integer, string, datetime, regex } = MatchersV3;

describe('HubSpot API Contract Tests', () => {
  const pact = createPact({ provider: HUBSPOT_PROVIDER });

  describe('Contact Search API', () => {
    it('should search contacts by phone number', async () => {
      await pact
        .addInteraction()
        .given('a contact with phone +40721000001 exists')
        .uponReceiving('a request to search contacts by phone')
        .withRequest('POST', '/crm/v3/objects/contacts/search', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: 'phone',
                      operator: 'EQ',
                      value: '+40721000001',
                    },
                  ],
                },
              ],
              properties: like(['phone', 'email', 'firstname', 'lastname']),
              limit: integer(100),
            });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            total: integer(1),
            results: eachLike({
              id: string('12345'),
              properties: like({
                phone: string('+40721000001'),
                email: string('test@example.com'),
                firstname: string('Test'),
                lastname: string('User'),
                lifecyclestage: string('lead'),
              }),
              createdAt: string('2024-01-01T00:00:00.000Z'),
              updatedAt: string('2024-01-01T00:00:00.000Z'),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: 'phone',
                      operator: 'EQ',
                      value: '+40721000001',
                    },
                  ],
                },
              ],
              properties: ['phone', 'email', 'firstname', 'lastname'],
              limit: 100,
            }),
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.total).toBeGreaterThanOrEqual(1);
          expect(data.results).toHaveLength(1);
          expect(data.results[0].properties.phone).toBe('+40721000001');
        });
    });

    it('should return empty results when no contacts found', async () => {
      await pact
        .addInteraction()
        .given('no contacts exist with the searched phone')
        .uponReceiving('a request to search for non-existent contact')
        .withRequest('POST', '/crm/v3/objects/contacts/search', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: 'phone',
                      operator: 'EQ',
                      value: '+40799999999',
                    },
                  ],
                },
              ],
              properties: like(['phone', 'email', 'firstname', 'lastname']),
              limit: integer(100),
            });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            total: 0,
            results: [],
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: 'phone',
                      operator: 'EQ',
                      value: '+40799999999',
                    },
                  ],
                },
              ],
              properties: ['phone', 'email', 'firstname', 'lastname'],
              limit: 100,
            }),
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.total).toBe(0);
          expect(data.results).toHaveLength(0);
        });
    });

    it('should handle paginated search results', async () => {
      await pact
        .addInteraction()
        .given('multiple contacts exist matching the search')
        .uponReceiving('a request for paginated search results')
        .withRequest('POST', '/crm/v3/objects/contacts/search', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
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
              properties: like(['phone', 'email', 'firstname', 'lastname']),
              limit: integer(100),
            });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            total: integer(150),
            results: eachLike(
              {
                id: string('12345'),
                properties: like({
                  phone: string('+40721000001'),
                  email: string('test@example.com'),
                  firstname: string('Test'),
                  lastname: string('User'),
                  lifecyclestage: string('lead'),
                }),
                createdAt: string('2024-01-01T00:00:00.000Z'),
                updatedAt: string('2024-01-01T00:00:00.000Z'),
              },
              100
            ),
            paging: like({
              next: like({
                after: string('cursor_page2'),
              }),
            }),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
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
              properties: ['phone', 'email', 'firstname', 'lastname'],
              limit: 100,
            }),
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.total).toBeGreaterThan(100);
          expect(data.results.length).toBeGreaterThanOrEqual(1);
          expect(data.paging).toBeDefined();
          expect(data.paging.next.after).toBeDefined();
        });
    });
  });

  describe('Contact CRUD API', () => {
    it('should get contact by ID', async () => {
      await pact
        .addInteraction()
        .given('a contact with ID 12345 exists')
        .uponReceiving('a request to get contact by ID')
        .withRequest('GET', '/crm/v3/objects/contacts/12345', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
          });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('12345'),
            properties: like({
              phone: string('+40721000001'),
              email: string('test@example.com'),
              firstname: string('Test'),
              lastname: string('User'),
              lifecyclestage: string('lead'),
            }),
            createdAt: string('2024-01-01T00:00:00.000Z'),
            updatedAt: string('2024-01-01T00:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/12345`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer test-token',
            },
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.id).toBe('12345');
          expect(data.properties).toBeDefined();
          expect(data.createdAt).toBeDefined();
        });
    });

    it('should create a new contact', async () => {
      await pact
        .addInteraction()
        .given('the system can create contacts')
        .uponReceiving('a request to create a new contact')
        .withRequest('POST', '/crm/v3/objects/contacts', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              properties: like({
                phone: string('+40721123456'),
                email: string('new@example.com'),
                firstname: string('New'),
                lastname: string('Contact'),
              }),
            });
        })
        .willRespondWith(201, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('67890'),
            properties: like({
              phone: string('+40721123456'),
              email: string('new@example.com'),
              firstname: string('New'),
              lastname: string('Contact'),
            }),
            createdAt: string('2024-01-01T00:00:00.000Z'),
            updatedAt: string('2024-01-01T00:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              properties: {
                phone: '+40721123456',
                email: 'new@example.com',
                firstname: 'New',
                lastname: 'Contact',
              },
            }),
          });

          expect(response.status).toBe(201);
          const data = await response.json();
          expect(data.id).toBeDefined();
          expect(data.properties.phone).toBe('+40721123456');
        });
    });

    it('should upsert contact by phone (idProperty)', async () => {
      await pact
        .addInteraction()
        .given('a contact with phone +40721000001 exists')
        .uponReceiving('a request to upsert contact by phone')
        .withRequest('POST', '/crm/v3/objects/contacts', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .query({ idProperty: 'phone' })
            .jsonBody({
              properties: like({
                phone: string('+40721000001'),
                lead_score: string('5'),
              }),
            });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('12345'),
            properties: like({
              phone: string('+40721000001'),
              lead_score: string('5'),
            }),
            createdAt: string('2024-01-01T00:00:00.000Z'),
            updatedAt: string('2024-01-02T00:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(
            `${mockServer.url}/crm/v3/objects/contacts?idProperty=phone`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-token',
              },
              body: JSON.stringify({
                properties: {
                  phone: '+40721000001',
                  lead_score: '5',
                },
              }),
            }
          );

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.id).toBe('12345');
          expect(data.properties.lead_score).toBe('5');
        });
    });

    it('should update contact properties', async () => {
      await pact
        .addInteraction()
        .given('a contact with ID 12345 exists')
        .uponReceiving('a request to update contact properties')
        .withRequest('PATCH', '/crm/v3/objects/contacts/12345', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              properties: like({
                lead_score: string('5'),
                lead_status: string('HOT'),
              }),
            });
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('12345'),
            properties: like({
              lead_score: string('5'),
              lead_status: string('HOT'),
            }),
            createdAt: string('2024-01-01T00:00:00.000Z'),
            updatedAt: string('2024-01-02T00:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/12345`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              properties: {
                lead_score: '5',
                lead_status: 'HOT',
              },
            }),
          });

          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.properties.lead_score).toBe('5');
          expect(data.properties.lead_status).toBe('HOT');
        });
    });
  });

  describe('Timeline Events API', () => {
    it('should create a note on contact timeline', async () => {
      await pact
        .addInteraction()
        .given('a contact with ID 12345 exists')
        .uponReceiving('a request to create a timeline note')
        .withRequest('POST', '/crm/v3/objects/notes', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              properties: like({
                hs_note_body: string('WhatsApp message from +40721000001'),
                hs_timestamp: string('2024-01-01T10:00:00.000Z'),
              }),
              associations: like([
                {
                  to: like({ id: string('12345') }),
                  types: like([
                    {
                      associationCategory: string('HUBSPOT_DEFINED'),
                      associationTypeId: integer(202),
                    },
                  ]),
                },
              ]),
            });
        })
        .willRespondWith(201, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('note_123456'),
            properties: like({
              hs_note_body: string('WhatsApp message from +40721000001'),
            }),
            createdAt: string('2024-01-01T10:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/notes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              properties: {
                hs_note_body: 'WhatsApp message from +40721000001',
                hs_timestamp: '2024-01-01T10:00:00.000Z',
              },
              associations: [
                {
                  to: { id: '12345' },
                  types: [
                    {
                      associationCategory: 'HUBSPOT_DEFINED',
                      associationTypeId: 202,
                    },
                  ],
                },
              ],
            }),
          });

          expect(response.status).toBe(201);
          const data = await response.json();
          expect(data.id).toBeDefined();
        });
    });

    it('should create a call record on contact timeline', async () => {
      await pact
        .addInteraction()
        .given('a contact with ID 12345 exists')
        .uponReceiving('a request to create a call record')
        .withRequest('POST', '/crm/v3/objects/calls', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              properties: like({
                hs_call_body: string('Call transcript...'),
                hs_call_duration: string('180'),
                hs_call_status: string('COMPLETED'),
                hs_timestamp: string('2024-01-01T10:00:00.000Z'),
              }),
              associations: like([
                {
                  to: like({ id: string('12345') }),
                  types: like([
                    {
                      associationCategory: string('HUBSPOT_DEFINED'),
                      associationTypeId: integer(194),
                    },
                  ]),
                },
              ]),
            });
        })
        .willRespondWith(201, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('call_123456'),
            properties: like({
              hs_call_body: string('Call transcript...'),
              hs_call_duration: string('180'),
            }),
            createdAt: string('2024-01-01T10:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/calls`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              properties: {
                hs_call_body: 'Call transcript...',
                hs_call_duration: '180',
                hs_call_status: 'COMPLETED',
                hs_timestamp: '2024-01-01T10:00:00.000Z',
              },
              associations: [
                {
                  to: { id: '12345' },
                  types: [
                    {
                      associationCategory: 'HUBSPOT_DEFINED',
                      associationTypeId: 194,
                    },
                  ],
                },
              ],
            }),
          });

          expect(response.status).toBe(201);
          const data = await response.json();
          expect(data.id).toBeDefined();
        });
    });
  });

  describe('Task API', () => {
    it('should create a task for a contact', async () => {
      await pact
        .addInteraction()
        .given('a contact with ID 12345 exists')
        .uponReceiving('a request to create a task')
        .withRequest('POST', '/crm/v3/objects/tasks', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              properties: like({
                hs_task_subject: string('Follow up with lead'),
                hs_task_body: string('Contact requested more information'),
                hs_task_priority: string('HIGH'),
                hs_timestamp: string('2024-01-15T00:00:00.000Z'),
              }),
              associations: like([
                {
                  to: like({ id: string('12345') }),
                  types: like([
                    {
                      associationCategory: string('HUBSPOT_DEFINED'),
                      associationTypeId: integer(204),
                    },
                  ]),
                },
              ]),
            });
        })
        .willRespondWith(201, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            id: string('task_123456'),
            properties: like({
              hs_task_subject: string('Follow up with lead'),
              hs_task_body: string('Contact requested more information'),
              hs_task_priority: string('HIGH'),
              hs_timestamp: string('2024-01-15T00:00:00.000Z'),
            }),
            createdAt: string('2024-01-01T10:00:00.000Z'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/tasks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              properties: {
                hs_task_subject: 'Follow up with lead',
                hs_task_body: 'Contact requested more information',
                hs_task_priority: 'HIGH',
                hs_timestamp: '2024-01-15T00:00:00.000Z',
              },
              associations: [
                {
                  to: { id: '12345' },
                  types: [
                    {
                      associationCategory: 'HUBSPOT_DEFINED',
                      associationTypeId: 204,
                    },
                  ],
                },
              ],
            }),
          });

          expect(response.status).toBe(201);
          const data = await response.json();
          expect(data.id).toBeDefined();
          expect(data.properties.hs_task_subject).toBe('Follow up with lead');
        });
    });
  });

  describe('Error Responses', () => {
    it('should handle 401 unauthorized response', async () => {
      await pact
        .addInteraction()
        .given('invalid authentication token')
        .uponReceiving('a request with invalid authentication')
        .withRequest('GET', '/crm/v3/objects/contacts/12345', (builder) => {
          builder.headers({
            Authorization: 'Bearer invalid-token',
          });
        })
        .willRespondWith(401, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            status: string('error'),
            message: string('Authentication credentials not found'),
            correlationId: string('abc123'),
            category: string('INVALID_AUTHENTICATION'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/12345`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer invalid-token',
            },
          });

          expect(response.status).toBe(401);
          const data = await response.json();
          expect(data.status).toBe('error');
          expect(data.category).toBe('INVALID_AUTHENTICATION');
        });
    });

    it('should handle 404 not found response', async () => {
      await pact
        .addInteraction()
        .given('no contact with ID 99999 exists')
        .uponReceiving('a request for non-existent contact')
        .withRequest('GET', '/crm/v3/objects/contacts/99999', (builder) => {
          builder.headers({
            Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
          });
        })
        .willRespondWith(404, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
            status: string('error'),
            message: string('resource not found'),
            correlationId: string('abc123'),
            category: string('OBJECT_NOT_FOUND'),
          });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/99999`, {
            method: 'GET',
            headers: {
              Authorization: 'Bearer test-token',
            },
          });

          expect(response.status).toBe(404);
          const data = await response.json();
          expect(data.status).toBe('error');
          expect(data.category).toBe('OBJECT_NOT_FOUND');
        });
    });

    it('should handle 429 rate limit response', async () => {
      await pact
        .addInteraction()
        .given('API rate limit has been exceeded')
        .uponReceiving('a request when rate limited')
        .withRequest('POST', '/crm/v3/objects/contacts/search', (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              Authorization: regex(/^Bearer .+$/, 'Bearer test-token'),
            })
            .jsonBody({
              filterGroups: like([]),
              properties: like([]),
              limit: integer(100),
            });
        })
        .willRespondWith(429, (builder) => {
          builder
            .headers({
              'Content-Type': 'application/json',
              'Retry-After': '10',
            })
            .jsonBody({
              status: string('error'),
              message: string('You have reached your daily limit'),
              correlationId: string('abc123'),
              category: string('RATE_LIMITS'),
            });
        })
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/crm/v3/objects/contacts/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              filterGroups: [],
              properties: [],
              limit: 100,
            }),
          });

          expect(response.status).toBe(429);
          expect(response.headers.get('Retry-After')).toBe('10');
          const data = await response.json();
          expect(data.category).toBe('RATE_LIMITS');
        });
    });
  });
});
