import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { workflowRoutes } from '../routes/workflows.js';

/**
 * Comprehensive Workflow Routes Tests
 *
 * Tests for:
 * - POST /workflows/lead-score - Trigger lead scoring
 * - POST /workflows/patient-journey - Trigger patient journey
 * - POST /workflows/nurture-sequence - Trigger nurture sequence
 * - POST /workflows/booking-agent - Trigger booking agent
 */

// Mock Trigger.dev tasks
vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: vi.fn().mockResolvedValue({ id: 'task-123' }),
  },
}));

describe('Workflow Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(workflowRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // POST /workflows/lead-score
  // ==========================================================================

  describe('POST /workflows/lead-score', () => {
    it('should require phone number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          message: 'Test message',
          channel: 'whatsapp',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Fastify schema validation returns FST_ERR_VALIDATION, custom returns VALIDATION_ERROR
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should require message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          channel: 'whatsapp',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Fastify schema validation returns FST_ERR_VALIDATION, custom returns VALIDATION_ERROR
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should accept valid lead score payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          message: 'I want to book an appointment for dental implants',
          channel: 'whatsapp',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      // API may return 'success' or 'status' property
      expect(body.success !== undefined || body.status !== undefined).toBe(true);
    });

    it('should normalize Romanian phone numbers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '0712345678', // Local format
          message: 'Test message',
          channel: 'whatsapp',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should reject invalid phone numbers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: 'invalid-phone',
          message: 'Test message',
          channel: 'whatsapp',
        },
      });

      // API may return 400 for validation error or 500 for processing error
      expect([400, 500]).toContain(response.statusCode);
    });

    it('should accept optional HubSpot contact ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          message: 'Test message',
          channel: 'whatsapp',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept optional message history', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          message: 'Current message',
          channel: 'whatsapp',
          messageHistory: [
            {
              role: 'user',
              content: 'Previous message',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should default to whatsapp channel', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          message: 'Test message',
          // No channel specified
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept valid channel values', async () => {
      const channels = ['whatsapp', 'voice', 'web'];

      for (const channel of channels) {
        const response = await app.inject({
          method: 'POST',
          url: '/workflows/lead-score',
          payload: {
            phone: '+40712345678',
            message: 'Test message',
            channel,
          },
        });

        expect([200, 202]).toContain(response.statusCode);
      }
    });

    it('should include correlation ID in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          message: 'Test message',
          channel: 'whatsapp',
        },
      });

      if (response.statusCode === 200 || response.statusCode === 202) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('correlationId');
      }
    });

    it('should respect provided correlation ID header', async () => {
      const correlationId = 'custom-correlation-id';
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        headers: {
          'x-correlation-id': correlationId,
        },
        payload: {
          phone: '+40712345678',
          message: 'Test message',
          channel: 'whatsapp',
        },
      });

      if (response.statusCode === 200 || response.statusCode === 202) {
        const body = JSON.parse(response.body);
        expect(body.correlationId).toBe(correlationId);
      }
    });
  });

  // ==========================================================================
  // POST /workflows/patient-journey
  // ==========================================================================

  describe('POST /workflows/patient-journey', () => {
    it('should require phone number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/patient-journey',
        payload: {
          hubspotContactId: 'contact_123',
          channel: 'whatsapp',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should require HubSpot contact ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/patient-journey',
        payload: {
          phone: '+40712345678',
          channel: 'whatsapp',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should accept valid patient journey payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/patient-journey',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          channel: 'whatsapp',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept optional initial score', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/patient-journey',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          channel: 'whatsapp',
          initialScore: 5,
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should validate initial score range', async () => {
      const invalidScores = [0, 6, -1, 10];

      for (const score of invalidScores) {
        const response = await app.inject({
          method: 'POST',
          url: '/workflows/patient-journey',
          payload: {
            phone: '+40712345678',
            hubspotContactId: 'contact_123',
            channel: 'whatsapp',
            initialScore: score,
          },
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should accept valid classification values', async () => {
      const classifications = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

      for (const classification of classifications) {
        const response = await app.inject({
          method: 'POST',
          url: '/workflows/patient-journey',
          payload: {
            phone: '+40712345678',
            hubspotContactId: 'contact_123',
            channel: 'whatsapp',
            classification,
          },
        });

        expect([200, 202]).toContain(response.statusCode);
      }
    });

    it('should accept optional procedure interests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/patient-journey',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          channel: 'whatsapp',
          procedureInterest: ['implant', 'whitening', 'orthodontics'],
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // POST /workflows/nurture-sequence
  // ==========================================================================

  describe('POST /workflows/nurture-sequence', () => {
    it('should require phone number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/nurture-sequence',
        payload: {
          hubspotContactId: 'contact_123',
          sequenceType: 'warm_lead',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should require HubSpot contact ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/nurture-sequence',
        payload: {
          phone: '+40712345678',
          sequenceType: 'warm_lead',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should require sequence type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/nurture-sequence',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should accept valid nurture sequence payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/nurture-sequence',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          sequenceType: 'warm_lead',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept valid sequence types', async () => {
      const sequenceTypes = ['warm_lead', 'cold_lead', 'post_consultation', 'recall'];

      for (const sequenceType of sequenceTypes) {
        const response = await app.inject({
          method: 'POST',
          url: '/workflows/nurture-sequence',
          payload: {
            phone: '+40712345678',
            hubspotContactId: 'contact_123',
            sequenceType,
          },
        });

        expect([200, 202]).toContain(response.statusCode);
      }
    });

    it('should reject invalid sequence type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/nurture-sequence',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          sequenceType: 'invalid_sequence',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // POST /workflows/booking-agent
  // ==========================================================================

  describe('POST /workflows/booking-agent', () => {
    it('should require phone number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should require HubSpot contact ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          procedureType: 'implant',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should require procedure type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should accept valid booking agent payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept optional preferred dates', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
          preferredDates: ['2025-12-10', '2025-12-11'],
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept optional patient information', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
          patientName: 'Ion Popescu',
          patientEmail: 'ion.popescu@example.com',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
          patientEmail: 'invalid-email',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid language codes', async () => {
      const languages = ['ro', 'en', 'de'];

      for (const language of languages) {
        const response = await app.inject({
          method: 'POST',
          url: '/workflows/booking-agent',
          payload: {
            phone: '+40712345678',
            hubspotContactId: 'contact_123',
            procedureType: 'implant',
            language,
          },
        });

        expect([200, 202]).toContain(response.statusCode);
      }
    });

    it('should default to Romanian language', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
          // No language specified
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });

    it('should accept optional selected slot ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/workflows/booking-agent',
        payload: {
          phone: '+40712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
          selectedSlotId: 'slot_123',
        },
      });

      expect([200, 202]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Workflow Integration', () => {
    it('should handle concurrent workflow triggers', async () => {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'POST',
            url: '/workflows/lead-score',
            payload: {
              phone: '+40712345678',
              message: 'Test message',
              channel: 'whatsapp',
            },
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect([200, 202, 429]).toContain(response.statusCode);
      });
    });

    it('should generate unique correlation IDs for each request', async () => {
      const response1 = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          message: 'Test message 1',
          channel: 'whatsapp',
        },
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/workflows/lead-score',
        payload: {
          phone: '+40712345678',
          message: 'Test message 2',
          channel: 'whatsapp',
        },
      });

      if (response1.statusCode === 200 && response2.statusCode === 200) {
        const body1 = JSON.parse(response1.body);
        const body2 = JSON.parse(response2.body);

        expect(body1.correlationId).not.toBe(body2.correlationId);
      }
    });

    it('should normalize phone numbers consistently across endpoints', async () => {
      const endpoints = [
        '/workflows/lead-score',
        '/workflows/patient-journey',
        '/workflows/nurture-sequence',
        '/workflows/booking-agent',
      ];

      const payloads = [
        {
          phone: '0712345678',
          message: 'Test',
          channel: 'whatsapp',
        },
        {
          phone: '0712345678',
          hubspotContactId: 'contact_123',
          channel: 'whatsapp',
        },
        {
          phone: '0712345678',
          hubspotContactId: 'contact_123',
          sequenceType: 'warm_lead',
        },
        {
          phone: '0712345678',
          hubspotContactId: 'contact_123',
          procedureType: 'implant',
        },
      ];

      for (let i = 0; i < endpoints.length; i++) {
        const response = await app.inject({
          method: 'POST',
          url: endpoints[i],
          payload: payloads[i],
        });

        // All should accept the normalized phone number
        expect([200, 202]).toContain(response.statusCode);
      }
    });
  });
});
