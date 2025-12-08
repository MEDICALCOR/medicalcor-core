/**
 * RLS Performance Testing Routes
 *
 * These endpoints are used by k6 load tests to verify Row-Level Security
 * policy performance under load. Each endpoint executes queries against
 * RLS-protected tables with different isolation patterns.
 *
 * SECURITY: These endpoints should only be enabled in development/staging.
 * They require API key authentication and are rate-limited.
 *
 * RLS Patterns Tested:
 * - clinic_id: Multi-tenant isolation by clinic
 * - user_id: User-specific data isolation
 * - phone: Phone-based lookups (consent, messages)
 * - admin: Administrative bypass
 * - system: System-level access (no RLS)
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createDatabaseClient, createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'rls-test-routes' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const ENABLE_RLS_TESTS =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_RLS_PERFORMANCE_TESTS === 'true';

// Query limit for safety
const MAX_ROWS = 100;

// =============================================================================
// TYPES
// =============================================================================

interface RlsContext {
  clinicId?: string;
  userId?: string;
  phone?: string;
  correlationId?: string;
  contactId?: string;
  isAdmin: boolean;
  isSystem: boolean;
}

interface QueryResult {
  rows: unknown[];
  rowCount: number;
  queryTimeMs: number;
  rlsContext: RlsContext;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract RLS context from request headers
 */
function extractRlsContext(request: FastifyRequest): RlsContext {
  return {
    clinicId: request.headers['x-clinic-id'] as string | undefined,
    userId: request.headers['x-user-id'] as string | undefined,
    phone: request.headers['x-phone'] as string | undefined,
    correlationId: request.headers['x-correlation-id'] as string | undefined,
    contactId: request.headers['x-contact-id'] as string | undefined,
    isAdmin: request.headers['x-admin-access'] === 'true',
    isSystem: request.headers['x-system-access'] === 'true',
  };
}

/**
 * Set PostgreSQL session variables for RLS context
 */
async function setRlsContext(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  context: RlsContext
): Promise<void> {
  const settings: string[] = [];

  if (context.clinicId) {
    settings.push(`SET LOCAL app.current_clinic_id = '${context.clinicId}'`);
  }

  if (context.userId) {
    settings.push(`SET LOCAL app.current_user_id = '${context.userId}'`);
  }

  if (context.phone) {
    // Escape single quotes in phone number
    const escapedPhone = context.phone.replace(/'/g, "''");
    settings.push(`SET LOCAL app.current_phone = '${escapedPhone}'`);
  }

  if (context.correlationId) {
    settings.push(`SET LOCAL app.current_correlation_id = '${context.correlationId}'`);
  }

  if (context.contactId) {
    settings.push(`SET LOCAL app.current_contact_id = '${context.contactId}'`);
  }

  if (context.isAdmin) {
    settings.push(`SET LOCAL app.is_admin = 'true'`);
    settings.push(`SET LOCAL app.current_user_role = 'admin'`);
  }

  if (context.isSystem) {
    settings.push(`SET LOCAL app.is_system = 'true'`);
    settings.push(`SET LOCAL app.admin_access = 'true'`);
  }

  // Execute all settings in a single statement
  if (settings.length > 0) {
    await client.query(settings.join('; '));
  }
}

/**
 * Execute a query with RLS context and timing
 */
async function executeRlsQuery(
  sql: string,
  params: unknown[],
  context: RlsContext
): Promise<QueryResult> {
  const db = createDatabaseClient();
  const client = await db.connect();

  try {
    const startTime = Date.now();

    // Begin transaction to ensure RLS context is applied
    await client.query('BEGIN');

    // Set RLS context
    await setRlsContext(client, context);

    // Execute the query
    const result = await client.query(sql, params);

    // Commit transaction
    await client.query('COMMIT');

    const queryTimeMs = Date.now() - startTime;

    return {
      rows: result.rows.slice(0, MAX_ROWS),
      rowCount: result.rowCount ?? 0,
      queryTimeMs,
      rlsContext: context,
    };
  } catch (error) {
    // Rollback on error
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Register disabled routes when RLS tests are not enabled
 */
function registerDisabledRoutes(fastify: Parameters<FastifyPluginAsync>[0]): void {
  logger.warn('RLS performance test routes are disabled in production');

  fastify.get('/rls-test/*', async (_request, reply) => {
    return await reply.status(403).send({
      error: 'RLS performance testing is disabled in production',
      message: 'Set ENABLE_RLS_PERFORMANCE_TESTS=true to enable',
    });
  });
}

/**
 * Register RLS test routes
 */
// eslint-disable-next-line max-lines-per-function
function registerRlsTestRoutes(fastify: Parameters<FastifyPluginAsync>[0]): void {
  logger.info('RLS performance test routes enabled');

  // Health check
  fastify.get('/rls-test/health', async (_request, reply) => {
    return await reply.send({
      status: 'ok',
      message: 'RLS performance test endpoints are available',
      environment: process.env.NODE_ENV,
    });
  });

  // Users table - clinic_id + user_id isolation
  fastify.get('/rls-test/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);

    try {
      const result = await executeRlsQuery(
        `SELECT id, email, clinic_id, created_at FROM users LIMIT $1`,
        [MAX_ROWS],
        context
      );
      return await reply.send(result);
    } catch (error) {
      logger.error({ error, context }, 'RLS test query failed: users');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Sessions table - user_id isolation
  fastify.get('/rls-test/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);

    try {
      const result = await executeRlsQuery(
        `SELECT id, user_id, created_at, expires_at FROM sessions LIMIT $1`,
        [MAX_ROWS],
        context
      );
      return await reply.send(result);
    } catch (error) {
      logger.error({ error, context }, 'RLS test query failed: sessions');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Consent records - phone-based isolation
  fastify.get(
    '/rls-test/consent-records',
    async (request: FastifyRequest<{ Querystring: { phone?: string } }>, reply: FastifyReply) => {
      const context = extractRlsContext(request);
      const { phone } = request.query;

      if (phone) {
        context.phone = phone;
      }

      try {
        const result = await executeRlsQuery(
          `SELECT id, phone, consent_type, granted, created_at FROM consent_records LIMIT $1`,
          [MAX_ROWS],
          context
        );
        return await reply.send(result);
      } catch (error) {
        logger.error({ error, context }, 'RLS test query failed: consent_records');
        return await reply.status(500).send({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Message log - phone + correlation_id isolation
  fastify.get(
    '/rls-test/messages',
    async (request: FastifyRequest<{ Querystring: { phone?: string } }>, reply: FastifyReply) => {
      const context = extractRlsContext(request);
      const { phone } = request.query;

      if (phone) {
        context.phone = phone;
      }

      try {
        const result = await executeRlsQuery(
          `SELECT id, phone, direction, channel, status, created_at FROM message_log LIMIT $1`,
          [MAX_ROWS],
          context
        );
        return await reply.send(result);
      } catch (error) {
        logger.error({ error, context }, 'RLS test query failed: message_log');
        return await reply.status(500).send({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Lead scoring - phone-based isolation
  fastify.get(
    '/rls-test/lead-scoring',
    async (request: FastifyRequest<{ Querystring: { phone?: string } }>, reply: FastifyReply) => {
      const context = extractRlsContext(request);
      const { phone } = request.query;

      if (phone) {
        context.phone = phone;
      }

      try {
        const result = await executeRlsQuery(
          `SELECT id, phone, score, classification, confidence, created_at FROM lead_scoring_history LIMIT $1`,
          [MAX_ROWS],
          context
        );
        return await reply.send(result);
      } catch (error) {
        logger.error({ error, context }, 'RLS test query failed: lead_scoring_history');
        return await reply.status(500).send({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // MFA secrets - user_id isolation
  fastify.get('/rls-test/mfa-secrets', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);

    try {
      const result = await executeRlsQuery(
        `SELECT id, user_id, is_verified, created_at FROM mfa_secrets LIMIT $1`,
        [MAX_ROWS],
        context
      );
      return await reply.send(result);
    } catch (error) {
      logger.error({ error, context }, 'RLS test query failed: mfa_secrets');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Encrypted data - entity_type + entity_id isolation
  fastify.get('/rls-test/encrypted-data', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);

    try {
      const result = await executeRlsQuery(
        `SELECT id, entity_type, entity_id, created_at FROM encrypted_data LIMIT $1`,
        [MAX_ROWS],
        context
      );
      return await reply.send(result);
    } catch (error) {
      logger.error({ error, context }, 'RLS test query failed: encrypted_data');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Sensitive logs - admin-only
  fastify.get('/rls-test/sensitive-logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);

    try {
      const result = await executeRlsQuery(
        `SELECT id, user_id, data_type, access_type, accessed_at FROM sensitive_data_access_log LIMIT $1`,
        [MAX_ROWS],
        context
      );
      return await reply.send(result);
    } catch (error) {
      logger.error({ error, context }, 'RLS test query failed: sensitive_data_access_log');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ==========================================================================
  // COGNITIVE MEMORY TABLES (ADR-004)
  // ==========================================================================

  // Episodic events - clinic_id + subject isolation
  fastify.get('/rls-test/episodic-events', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);

    try {
      const result = await executeRlsQuery(
        `SELECT id, subject_type, subject_id, event_type, event_category, source_channel,
                summary, sentiment, occurred_at, clinic_id
         FROM episodic_events WHERE deleted_at IS NULL LIMIT $1`,
        [MAX_ROWS],
        context
      );
      return await reply.send(result);
    } catch (error) {
      logger.error({ error, context }, 'RLS test query failed: episodic_events');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Episodic events by subject - subject_type + subject_id isolation
  fastify.get(
    '/rls-test/episodic-events/by-subject',
    async (
      request: FastifyRequest<{ Querystring: { subjectType?: string; subjectId?: string } }>,
      reply: FastifyReply
    ) => {
      const context = extractRlsContext(request);
      const { subjectType, subjectId } = request.query;

      try {
        let sql = `SELECT id, subject_type, subject_id, event_type, summary, occurred_at, clinic_id
                   FROM episodic_events WHERE deleted_at IS NULL`;
        const params: unknown[] = [];

        if (subjectType && subjectId) {
          sql += ` AND subject_type = $1 AND subject_id = $2`;
          params.push(subjectType, subjectId);
        }

        sql += ` ORDER BY occurred_at DESC LIMIT ${MAX_ROWS}`;

        const result = await executeRlsQuery(sql, params, context);
        return await reply.send(result);
      } catch (error) {
        logger.error({ error, context }, 'RLS test query failed: episodic_events/by-subject');
        return await reply.status(500).send({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Behavioral patterns - clinic_id + subject isolation
  fastify.get(
    '/rls-test/behavioral-patterns',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = extractRlsContext(request);

      try {
        const result = await executeRlsQuery(
          `SELECT id, subject_type, subject_id, pattern_type, pattern_description,
                  confidence, first_observed_at, last_observed_at, clinic_id
           FROM behavioral_patterns LIMIT $1`,
          [MAX_ROWS],
          context
        );
        return await reply.send(result);
      } catch (error) {
        logger.error({ error, context }, 'RLS test query failed: behavioral_patterns');
        return await reply.status(500).send({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Cross-clinic isolation test for cognitive memory
  fastify.get(
    '/rls-test/cognitive-memory/isolation-check',
    async (
      request: FastifyRequest<{ Querystring: { targetClinicId?: string } }>,
      reply: FastifyReply
    ) => {
      const context = extractRlsContext(request);
      const { targetClinicId } = request.query;

      try {
        // This query should return 0 rows if RLS is working correctly
        // when clinicId in context doesn't match targetClinicId
        const result = await executeRlsQuery(
          `SELECT COUNT(*) as count FROM episodic_events
           WHERE clinic_id = $1 AND deleted_at IS NULL`,
          [targetClinicId ?? '00000000-0000-0000-0000-000000000000'],
          context
        );

        const isolated = context.clinicId !== targetClinicId || context.isSystem || context.isAdmin;

        const firstRow = result.rows[0] as { count?: number } | undefined;
        return await reply.send({
          ...result,
          isolationCheck: {
            requestedClinicId: context.clinicId,
            targetClinicId,
            expectedIsolation: isolated,
            rowsFound: firstRow?.count ?? 0,
          },
        });
      } catch (error) {
        logger.error({ error, context }, 'RLS test query failed: cognitive-memory isolation check');
        return await reply.status(500).send({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Baseline - no RLS overhead comparison
  fastify.get('/rls-test/baseline', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);
    context.isSystem = true;

    try {
      const db = createDatabaseClient();
      const client = await db.connect();

      try {
        const startTime = Date.now();
        const result = await client.query(
          `SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public'`
        );
        const queryTimeMs = Date.now() - startTime;

        return await reply.send({
          rows: result.rows,
          rowCount: result.rowCount ?? 0,
          queryTimeMs,
          rlsContext: context,
          note: 'Baseline query for RLS overhead comparison',
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error({ error, context }, 'RLS baseline query failed');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Aggregate - run all queries and return timing
  fastify.get('/rls-test/aggregate', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = extractRlsContext(request);
    const results: Record<string, number> = {};

    const queries = [
      { name: 'users', sql: 'SELECT id FROM users LIMIT 10' },
      { name: 'sessions', sql: 'SELECT id FROM sessions LIMIT 10' },
      { name: 'consent_records', sql: 'SELECT id FROM consent_records LIMIT 10' },
      { name: 'message_log', sql: 'SELECT id FROM message_log LIMIT 10' },
      { name: 'lead_scoring', sql: 'SELECT id FROM lead_scoring_history LIMIT 10' },
    ];

    try {
      for (const query of queries) {
        const result = await executeRlsQuery(query.sql, [], context);
        results[query.name] = result.queryTimeMs;
      }

      const totalTime = Object.values(results).reduce((sum, time) => sum + time, 0);
      const avgTime = totalTime / Object.keys(results).length;

      return await reply.send({
        results,
        summary: {
          totalTimeMs: totalTime,
          avgTimeMs: Math.round(avgTime * 100) / 100,
          queryCount: queries.length,
        },
        rlsContext: context,
      });
    } catch (error) {
      logger.error({ error, context }, 'RLS aggregate query failed');
      return await reply.status(500).send({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

// =============================================================================
// PLUGIN EXPORT
// =============================================================================

 
export const rlsTestRoutes: FastifyPluginAsync = async (fastify) => {
  if (!ENABLE_RLS_TESTS) {
    registerDisabledRoutes(fastify);
  } else {
    registerRlsTestRoutes(fastify);
  }
};
