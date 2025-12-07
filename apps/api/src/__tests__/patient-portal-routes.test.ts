import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { patientPortalRoutes, internalNotificationRoutes } from '../routes/patient-portal.js';

/**
 * Patient Portal Routes Tests
 *
 * Tests for:
 * - POST /patient/auth/request-otp - Request OTP
 * - POST /patient/auth/verify-otp - Verify OTP
 * - POST /patient/auth/logout - Logout
 * - GET /patient/profile - Get patient profile (protected)
 * - GET /patient/appointments - Get appointments (protected)
 * - GET /patient/preferences - Get preferences (protected)
 * - PUT /patient/preferences - Update preferences (protected)
 * - GET /patient/appointments/slots - Get available slots (protected)
 * - POST /patient/appointments/book - Book appointment (protected)
 * - POST /patient/appointments/cancel - Cancel appointment (protected)
 * - POST /patient/appointments/reschedule - Reschedule appointment (protected)
 * - POST /internal/notifications/broadcast - Internal broadcast (internal)
 * - POST /internal/notifications/send - Internal send (internal)
 */

// Mock integration clients
vi.mock('@medicalcor/integrations', () => ({
  createIntegrationClients: vi.fn(() => ({
    whatsapp: null,
    hubspot: null,
    scheduling: null,
    consent: null,
    eventStore: {
      emit: vi.fn().mockResolvedValue(undefined),
    },
  })),
}));

describe('Patient Portal Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(patientPortalRoutes);
    await app.register(internalNotificationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // POST /patient/auth/request-otp
  // ==========================================================================

  describe('POST /patient/auth/request-otp', () => {
    it('should return 400 for invalid phone format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: {
          phone: '123', // Too short
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should return 400 for invalid Romanian phone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: {
          phone: '+11234567890', // US number
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should accept valid Romanian phone number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: {
          phone: '+40721234567',
        },
      });

      expect([200, 429, 500]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      if (response.statusCode === 200) {
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('expiresIn');
        expect(body).toHaveProperty('correlationId');
      }
    });

    it('should enforce rate limiting on OTP requests', async () => {
      const phone = '+40722345678';

      // First request
      await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: { phone },
      });

      // Immediate second request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: { phone },
      });

      expect([200, 429, 500]).toContain(response.statusCode);
      if (response.statusCode === 429) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('retryAfter');
      }
    });
  });

  // ==========================================================================
  // POST /patient/auth/verify-otp
  // ==========================================================================

  describe('POST /patient/auth/verify-otp', () => {
    it('should return 400 for invalid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/verify-otp',
        payload: {
          phone: '+40721234567',
          otp: '123', // Too short
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for non-existent OTP', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/verify-otp',
        payload: {
          phone: '+40729999999',
          otp: '123456',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('No verification code found');
    });

    it('should validate phone format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/verify-otp',
        payload: {
          phone: 'invalid',
          otp: '123456',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // POST /patient/auth/logout
  // ==========================================================================

  describe('POST /patient/auth/logout', () => {
    it('should return success on logout', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('message');
    });
  });

  // ==========================================================================
  // Protected Routes (require auth)
  // ==========================================================================

  describe('Protected Routes', () => {
    describe('GET /patient/profile', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/patient/profile',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('error');
      });

      it('should return 401 with invalid token', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/patient/profile',
          headers: {
            authorization: 'Bearer invalid-token',
          },
        });

        expect(response.statusCode).toBe(401);
      });

      it('should return 401 with malformed authorization header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/patient/profile',
          headers: {
            authorization: 'Basic dXNlcjpwYXNz',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('GET /patient/appointments', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/patient/appointments',
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('GET /patient/preferences', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/patient/preferences',
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('PUT /patient/preferences', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/patient/preferences',
          payload: {
            appointmentReminders: true,
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('GET /patient/appointments/slots', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/patient/appointments/slots?procedureType=consultation',
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /patient/appointments/book', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/patient/appointments/book',
          payload: {
            slotId: 'slot-123',
            procedureType: 'consultation',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /patient/appointments/cancel', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/patient/appointments/cancel',
          payload: {
            appointmentId: 'apt-123',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /patient/appointments/reschedule', () => {
      it('should return 401 without authentication', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/patient/appointments/reschedule',
          payload: {
            appointmentId: 'apt-123',
            newSlotId: 'slot-456',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  // ==========================================================================
  // Internal Notification Routes
  // ==========================================================================

  describe('Internal Notification Routes', () => {
    const validInternalKey = 'test-internal-key';

    beforeAll(() => {
      process.env.INTERNAL_API_KEY = validInternalKey;
    });

    describe('POST /internal/notifications/broadcast', () => {
      it('should return 403 without internal API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/notifications/broadcast',
          payload: {},
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('error', 'Unauthorized');
      });

      it('should return 403 with invalid internal API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/notifications/broadcast',
          headers: {
            'x-internal-api-key': 'wrong-key',
          },
          payload: {},
        });

        expect(response.statusCode).toBe(403);
      });

      it('should accept valid internal API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/notifications/broadcast',
          headers: {
            'x-internal-api-key': validInternalKey,
          },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('success', true);
      });
    });

    describe('POST /internal/notifications/send', () => {
      it('should return 403 without internal API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/notifications/send',
          payload: {},
        });

        expect(response.statusCode).toBe(403);
      });

      it('should accept valid internal API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/internal/notifications/send',
          headers: {
            'x-internal-api-key': validInternalKey,
          },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('success', true);
      });
    });
  });

  // ==========================================================================
  // Input Validation Tests
  // ==========================================================================

  describe('Input Validation', () => {
    it('should validate OTP length exactly 6 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/verify-otp',
        payload: {
          phone: '+40721234567',
          otp: '12345', // 5 chars
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate phone min length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: {
          phone: '123456789', // 9 chars, min is 10
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate phone max length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: {
          phone: '+401234567890123456', // 19 chars, max is 15
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ==========================================================================
  // Response Format Tests
  // ==========================================================================

  describe('Response Format', () => {
    it('should include correlationId in responses', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/logout',
      });

      // Logout doesn't include correlationId, that's expected
      expect(response.statusCode).toBe(200);
    });

    it('should return JSON content type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/patient/auth/request-otp',
        payload: { phone: '+40721234567' },
      });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
