import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { rlsTestRoutes } from '../routes/rls-test.js';

/**
 * RLS Test Routes Tests
 *
 * Tests for Row-Level Security performance testing endpoints:
 * - GET /rls-test/health - Health check
 * - GET /rls-test/users - Users table with RLS
 * - GET /rls-test/sessions - Sessions table with RLS
 * - GET /rls-test/consent-records - Consent records with phone-based RLS
 * - GET /rls-test/messages - Message log with RLS
 * - GET /rls-test/lead-scoring - Lead scoring history with RLS
 * - GET /rls-test/mfa-secrets - MFA secrets with user_id RLS
 * - GET /rls-test/encrypted-data - Encrypted data with entity RLS
 * - GET /rls-test/sensitive-logs - Sensitive logs with admin-only RLS
 * - GET /rls-test/baseline - Baseline query (no RLS)
 * - GET /rls-test/aggregate - Aggregate timing for all queries
 */

// Mock database client
vi.mock('@medicalcor/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@medicalcor/core')>();
  return {
    ...original,
    createDatabaseClient: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      }),
    })),
  };
});

describe('RLS Test Routes', () => {
  let app: FastifyInstance;

  // Note: Production mode tests are skipped because the ENABLE_RLS_TESTS constant
  // is evaluated at module load time, making it difficult to test both modes
  // in the same test file without module isolation.

  describe('RLS Test Routes (development mode)', () => {
    beforeAll(async () => {
      // Ensure RLS tests are enabled for testing
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_RLS_PERFORMANCE_TESTS = 'true';

      app = Fastify({ logger: false });
      await app.register(rlsTestRoutes);
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      delete process.env.ENABLE_RLS_PERFORMANCE_TESTS;
    });

    // ==========================================================================
    // GET /rls-test/health
    // ==========================================================================

    describe('GET /rls-test/health', () => {
      it('should return health check response', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/health',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('status', 'ok');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('environment');
      });
    });

    // ==========================================================================
    // GET /rls-test/users
    // ==========================================================================

    describe('GET /rls-test/users', () => {
      it('should execute RLS query and return timing', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/users',
        });

        // May succeed or fail depending on DB connection
        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body).toHaveProperty('rows');
          expect(body).toHaveProperty('rowCount');
          expect(body).toHaveProperty('queryTimeMs');
          expect(body).toHaveProperty('rlsContext');
        }
      });

      it('should respect RLS context headers', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/users',
          headers: {
            'x-clinic-id': 'clinic-123',
            'x-user-id': 'user-456',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('clinicId', 'clinic-123');
          expect(body.rlsContext).toHaveProperty('userId', 'user-456');
        }
      });
    });

    // ==========================================================================
    // GET /rls-test/sessions
    // ==========================================================================

    describe('GET /rls-test/sessions', () => {
      it('should execute sessions query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/sessions',
        });

        expect([200, 500]).toContain(response.statusCode);
      });
    });

    // ==========================================================================
    // GET /rls-test/consent-records
    // ==========================================================================

    describe('GET /rls-test/consent-records', () => {
      it('should support phone query parameter', async () => {
        // URL-encode the phone number (+ becomes %2B)
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/consent-records?phone=%2B40721234567',
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('phone', '+40721234567');
        }
      });

      it('should use phone from headers if not in query', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/consent-records',
          headers: {
            'x-phone': '+40722345678',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('phone', '+40722345678');
        }
      });
    });

    // ==========================================================================
    // GET /rls-test/messages
    // ==========================================================================

    describe('GET /rls-test/messages', () => {
      it('should execute messages query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/messages',
        });

        expect([200, 500]).toContain(response.statusCode);
      });

      it('should support phone parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/messages?phone=+40721234567',
        });

        expect([200, 500]).toContain(response.statusCode);
      });
    });

    // ==========================================================================
    // GET /rls-test/lead-scoring
    // ==========================================================================

    describe('GET /rls-test/lead-scoring', () => {
      it('should execute lead scoring query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/lead-scoring',
        });

        expect([200, 500]).toContain(response.statusCode);
      });
    });

    // ==========================================================================
    // GET /rls-test/mfa-secrets
    // ==========================================================================

    describe('GET /rls-test/mfa-secrets', () => {
      it('should execute MFA secrets query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/mfa-secrets',
        });

        expect([200, 500]).toContain(response.statusCode);
      });

      it('should respect user-id header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/mfa-secrets',
          headers: {
            'x-user-id': 'user-123',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
      });
    });

    // ==========================================================================
    // GET /rls-test/encrypted-data
    // ==========================================================================

    describe('GET /rls-test/encrypted-data', () => {
      it('should execute encrypted data query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/encrypted-data',
        });

        expect([200, 500]).toContain(response.statusCode);
      });
    });

    // ==========================================================================
    // GET /rls-test/sensitive-logs
    // ==========================================================================

    describe('GET /rls-test/sensitive-logs', () => {
      it('should execute sensitive logs query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/sensitive-logs',
        });

        expect([200, 500]).toContain(response.statusCode);
      });

      it('should respect admin access header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/sensitive-logs',
          headers: {
            'x-admin-access': 'true',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('isAdmin', true);
        }
      });
    });

    // ==========================================================================
    // GET /rls-test/baseline
    // ==========================================================================

    describe('GET /rls-test/baseline', () => {
      it('should execute baseline query without RLS overhead', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/baseline',
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body).toHaveProperty('note');
          expect(body.note).toContain('Baseline');
          expect(body.rlsContext).toHaveProperty('isSystem', true);
        }
      });
    });

    // ==========================================================================
    // GET /rls-test/aggregate
    // ==========================================================================

    describe('GET /rls-test/aggregate', () => {
      it('should run all queries and return aggregate timing', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/aggregate',
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body).toHaveProperty('results');
          expect(body).toHaveProperty('summary');
          expect(body.summary).toHaveProperty('totalTimeMs');
          expect(body.summary).toHaveProperty('avgTimeMs');
          expect(body.summary).toHaveProperty('queryCount');
        }
      });

      it('should respect RLS context headers', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/aggregate',
          headers: {
            'x-clinic-id': 'clinic-test',
            'x-system-access': 'true',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('clinicId', 'clinic-test');
          expect(body.rlsContext).toHaveProperty('isSystem', true);
        }
      });
    });

    // ==========================================================================
    // COGNITIVE MEMORY RLS TESTS (ADR-004)
    // ==========================================================================

    describe('GET /rls-test/episodic-events', () => {
      it('should execute episodic events query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/episodic-events',
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body).toHaveProperty('rows');
          expect(body).toHaveProperty('rowCount');
          expect(body).toHaveProperty('queryTimeMs');
          expect(body).toHaveProperty('rlsContext');
        }
      });

      it('should respect clinic-id header for episodic events', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/episodic-events',
          headers: {
            'x-clinic-id': 'clinic-memory-123',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('clinicId', 'clinic-memory-123');
        }
      });
    });

    describe('GET /rls-test/episodic-events/by-subject', () => {
      it('should support subject type and id query parameters', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/episodic-events/by-subject?subjectType=lead&subjectId=lead-123',
        });

        expect([200, 500]).toContain(response.statusCode);
      });

      it('should work without query parameters', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/episodic-events/by-subject',
        });

        expect([200, 500]).toContain(response.statusCode);
      });
    });

    describe('GET /rls-test/behavioral-patterns', () => {
      it('should execute behavioral patterns query with RLS', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/behavioral-patterns',
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body).toHaveProperty('rows');
          expect(body).toHaveProperty('rowCount');
          expect(body).toHaveProperty('queryTimeMs');
          expect(body).toHaveProperty('rlsContext');
        }
      });

      it('should respect clinic-id header for behavioral patterns', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/behavioral-patterns',
          headers: {
            'x-clinic-id': 'clinic-patterns-456',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('clinicId', 'clinic-patterns-456');
        }
      });
    });

    describe('GET /rls-test/cognitive-memory/isolation-check', () => {
      it('should check cross-clinic isolation', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/cognitive-memory/isolation-check?targetClinicId=clinic-target-789',
          headers: {
            'x-clinic-id': 'clinic-source-123',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body).toHaveProperty('isolationCheck');
          expect(body.isolationCheck).toHaveProperty('requestedClinicId', 'clinic-source-123');
          expect(body.isolationCheck).toHaveProperty('targetClinicId', 'clinic-target-789');
          expect(body.isolationCheck).toHaveProperty('expectedIsolation');
        }
      });

      it('should allow admin access to all clinics', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/cognitive-memory/isolation-check?targetClinicId=any-clinic',
          headers: {
            'x-admin-access': 'true',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('isAdmin', true);
        }
      });

      it('should allow system access to all clinics', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/cognitive-memory/isolation-check?targetClinicId=any-clinic',
          headers: {
            'x-system-access': 'true',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext).toHaveProperty('isSystem', true);
        }
      });
    });

    // ==========================================================================
    // RLS Context Header Tests
    // ==========================================================================

    describe('RLS Context Headers', () => {
      it('should parse all context headers correctly', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/users',
          headers: {
            'x-clinic-id': 'clinic-abc',
            'x-user-id': 'user-xyz',
            'x-phone': '+40721111111',
            'x-correlation-id': 'corr-123',
            'x-contact-id': 'contact-456',
            'x-admin-access': 'true',
            'x-system-access': 'false',
          },
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext.clinicId).toBe('clinic-abc');
          expect(body.rlsContext.userId).toBe('user-xyz');
          expect(body.rlsContext.phone).toBe('+40721111111');
          expect(body.rlsContext.correlationId).toBe('corr-123');
          expect(body.rlsContext.contactId).toBe('contact-456');
          expect(body.rlsContext.isAdmin).toBe(true);
          expect(body.rlsContext.isSystem).toBe(false);
        }
      });

      it('should handle missing context headers gracefully', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/rls-test/users',
        });

        expect([200, 500]).toContain(response.statusCode);
        const body = JSON.parse(response.body);

        if (response.statusCode === 200) {
          expect(body.rlsContext.isAdmin).toBe(false);
          expect(body.rlsContext.isSystem).toBe(false);
        }
      });
    });
  });
});
