/**
 * Supervisor API Routes
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * REST API endpoints for supervisor dashboard, call monitoring,
 * and agent management.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type {
  MonitoredCall,
  SupervisorSession,
  SupervisorNote,
  QueueSLAStatus,
} from '@medicalcor/types';
import {
  HandoffRequestSchema,
  SupervisorRoleSchema,
  QueueSLAConfigSchema,
} from '@medicalcor/types';
import { ValidationError, toSafeErrorResponse, generateCorrelationId } from '@medicalcor/core';
import { getSupervisorAgent, getQueueSLAService } from '@medicalcor/domain';

// =============================================================================
// Request Schemas
// =============================================================================

const CreateSessionSchema = z.object({
  supervisorId: z.string().min(1),
  supervisorName: z.string().min(1),
  role: SupervisorRoleSchema,
});

const StartMonitoringBodySchema = z.object({
  callSid: z.string().min(1),
  mode: z.enum(['listen', 'whisper', 'barge']).default('listen'),
});

const ChangeMonitoringModeSchema = z.object({
  mode: z.enum(['listen', 'whisper', 'barge']),
});

const AddNoteBodySchema = z.object({
  note: z.string().max(1000),
  isPrivate: z.boolean().default(true),
});

const FlagCallBodySchema = z.object({
  flag: z.enum([
    'escalation-requested',
    'high-value-lead',
    'complaint',
    'long-hold',
    'silence-detected',
    'ai-handoff-needed',
  ]),
});

// =============================================================================
// Route Definitions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin pattern
export const supervisorRoutes: FastifyPluginAsync = async (fastify) => {
  const agent = getSupervisorAgent();

  // ==========================================================================
  // Dashboard & Stats
  // ==========================================================================

  /**
   * GET /supervisor/dashboard
   * Get real-time dashboard statistics
   */
  fastify.get('/supervisor/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();

    try {
      const stats = agent.getDashboardStats();
      const activeCalls = agent.getActiveCalls();
      const sessions = agent.getActiveSessions();

      return await reply.send({
        stats,
        activeCalls: activeCalls.map((call: MonitoredCall) => ({
          callSid: call.callSid,
          customerPhone: call.customerPhone.slice(0, -4) + '****', // Mask phone
          state: call.state,
          direction: call.direction,
          duration: call.duration,
          sentiment: call.sentiment,
          urgencyLevel: call.urgencyLevel,
          flags: call.flags,
          agentId: call.agentId,
          agentName: call.agentName,
          startedAt: call.startedAt,
        })),
        supervisors: sessions.map((session: SupervisorSession) => ({
          sessionId: session.sessionId,
          supervisorName: session.supervisorName,
          role: session.role,
          monitoringMode: session.monitoringMode,
          activeCallSid: session.activeCallSid,
          callsMonitored: session.callsMonitored,
        })),
        correlationId,
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Dashboard fetch error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  // ==========================================================================
  // Active Calls
  // ==========================================================================

  /**
   * GET /supervisor/calls
   * List all active calls
   */
  fastify.get('/supervisor/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();

    try {
      const calls = agent.getActiveCalls();

      return await reply.send({
        calls: calls.map((call: MonitoredCall) => ({
          ...call,
          customerPhone: call.customerPhone.slice(0, -4) + '****', // Mask phone
        })),
        total: calls.length,
        correlationId,
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'List calls error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * GET /supervisor/calls/:callSid
   * Get specific call details
   */
  fastify.get(
    '/supervisor/calls/:callSid',
    async (request: FastifyRequest<{ Params: { callSid: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { callSid } = request.params;
        const call = agent.getCall(callSid);

        if (!call) {
          return await reply.status(404).send({
            error: 'Call not found',
            correlationId,
          });
        }

        // Get notes for this call
        const notes = agent.getNotes(callSid);

        return await reply.send({
          call: {
            ...call,
            customerPhone: call.customerPhone.slice(0, -4) + '****',
          },
          notes: notes.filter((n: SupervisorNote) => !n.isPrivate), // Only show public notes in general view
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get call error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * GET /supervisor/calls/flagged/:flag
   * Get calls with a specific flag
   */
  fastify.get(
    '/supervisor/calls/flagged/:flag',
    async (request: FastifyRequest<{ Params: { flag: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { flag } = request.params;
        const validFlags = [
          'escalation-requested',
          'high-value-lead',
          'complaint',
          'long-hold',
          'silence-detected',
          'ai-handoff-needed',
        ] as const;

        if (!validFlags.includes(flag as (typeof validFlags)[number])) {
          return await reply.status(400).send({
            error: 'Invalid flag',
            validFlags,
            correlationId,
          });
        }

        const calls = agent.getCallsByFlag(flag as (typeof validFlags)[number]);

        return await reply.send({
          calls: calls.map((call: MonitoredCall) => ({
            ...call,
            customerPhone: call.customerPhone.slice(0, -4) + '****',
          })),
          total: calls.length,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get flagged calls error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * POST /supervisor/calls/:callSid/flag
   * Add a flag to a call
   */
  fastify.post(
    '/supervisor/calls/:callSid/flag',
    async (
      request: FastifyRequest<{ Params: { callSid: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { callSid } = request.params;
        const parseResult = FlagCallBodySchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError('Invalid flag body', parseResult.error.flatten());
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        agent.flagCall(callSid, parseResult.data.flag);

        return await reply.send({
          success: true,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Flag call error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * DELETE /supervisor/calls/:callSid/flag/:flag
   * Remove a flag from a call
   */
  fastify.delete(
    '/supervisor/calls/:callSid/flag/:flag',
    async (
      request: FastifyRequest<{ Params: { callSid: string; flag: string } }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { callSid, flag } = request.params;
        const validFlags = [
          'escalation-requested',
          'high-value-lead',
          'complaint',
          'long-hold',
          'silence-detected',
          'ai-handoff-needed',
        ] as const;

        if (!validFlags.includes(flag as (typeof validFlags)[number])) {
          return await reply.status(400).send({
            error: 'Invalid flag',
            validFlags,
            correlationId,
          });
        }

        agent.unflagCall(callSid, flag as (typeof validFlags)[number]);

        return await reply.send({
          success: true,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Unflag call error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  // ==========================================================================
  // Supervisor Sessions
  // ==========================================================================

  /**
   * POST /supervisor/sessions
   * Create a new supervisor session
   */
  fastify.post('/supervisor/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();

    try {
      const parseResult = CreateSessionSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid session body', parseResult.error.flatten());
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const { supervisorId, supervisorName, role } = parseResult.data;
      const session = agent.createSession(supervisorId, supervisorName, role);

      fastify.log.info(
        { correlationId, sessionId: session.sessionId, supervisorId },
        'Supervisor session created'
      );

      return await reply.status(201).send({
        session,
        correlationId,
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Create session error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * GET /supervisor/sessions/:sessionId
   * Get supervisor session details
   */
  fastify.get(
    '/supervisor/sessions/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { sessionId } = request.params;
        const session = agent.getSession(sessionId);

        if (!session) {
          return await reply.status(404).send({
            error: 'Session not found',
            correlationId,
          });
        }

        return await reply.send({
          session,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get session error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * DELETE /supervisor/sessions/:sessionId
   * End a supervisor session
   */
  fastify.delete(
    '/supervisor/sessions/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { sessionId } = request.params;
        agent.endSession(sessionId);

        fastify.log.info({ correlationId, sessionId }, 'Supervisor session ended');

        return await reply.send({
          success: true,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'End session error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  // ==========================================================================
  // Call Monitoring
  // ==========================================================================

  /**
   * POST /supervisor/sessions/:sessionId/monitor
   * Start monitoring a call
   */
  fastify.post(
    '/supervisor/sessions/:sessionId/monitor',
    async (
      request: FastifyRequest<{ Params: { sessionId: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { sessionId } = request.params;
        const parseResult = StartMonitoringBodySchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError(
            'Invalid monitoring request',
            parseResult.error.flatten()
          );
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const { callSid, mode } = parseResult.data;
        const result = agent.startMonitoring(sessionId, callSid, mode);

        if (!result.success) {
          return await reply.status(400).send({
            error: result.error,
            correlationId,
          });
        }

        fastify.log.info(
          { correlationId, sessionId, callSid, mode },
          'Supervisor started monitoring'
        );

        return await reply.send({
          success: true,
          mode,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Start monitoring error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * PUT /supervisor/sessions/:sessionId/monitor/mode
   * Change monitoring mode
   */
  fastify.put(
    '/supervisor/sessions/:sessionId/monitor/mode',
    async (
      request: FastifyRequest<{ Params: { sessionId: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { sessionId } = request.params;
        const parseResult = ChangeMonitoringModeSchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError('Invalid mode', parseResult.error.flatten());
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const { mode } = parseResult.data;
        const result = agent.changeMonitoringMode(sessionId, mode);

        if (!result.success) {
          return await reply.status(400).send({
            error: result.error,
            correlationId,
          });
        }

        fastify.log.info({ correlationId, sessionId, mode }, 'Monitoring mode changed');

        return await reply.send({
          success: true,
          mode,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Change mode error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * DELETE /supervisor/sessions/:sessionId/monitor
   * Stop monitoring
   */
  fastify.delete(
    '/supervisor/sessions/:sessionId/monitor',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { sessionId } = request.params;
        const result = agent.stopMonitoring(sessionId);

        if (!result.success) {
          return await reply.status(400).send({
            error: result.error,
            correlationId,
          });
        }

        fastify.log.info({ correlationId, sessionId }, 'Supervisor stopped monitoring');

        return await reply.send({
          success: true,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Stop monitoring error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  // ==========================================================================
  // AI-to-Human Handoff
  // ==========================================================================

  /**
   * POST /supervisor/handoff
   * Request AI-to-human handoff
   */
  fastify.post('/supervisor/handoff', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();

    try {
      const parseResult = HandoffRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid handoff request', parseResult.error.flatten());
        return await reply.status(400).send(toSafeErrorResponse(error));
      }

      const result = agent.requestHandoff(parseResult.data);

      if (!result.success) {
        return await reply.status(400).send({
          error: result.error,
          correlationId,
        });
      }

      fastify.log.info(
        {
          correlationId,
          callSid: parseResult.data.callSid,
          reason: parseResult.data.reason,
          handoffId: result.handoffId,
        },
        'Handoff requested'
      );

      return await reply.status(201).send({
        success: true,
        handoffId: result.handoffId,
        correlationId,
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'Handoff request error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * POST /supervisor/handoff/:callSid/complete
   * Complete a handoff
   */
  fastify.post(
    '/supervisor/handoff/:callSid/complete',
    async (
      request: FastifyRequest<{ Params: { callSid: string }; Body: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { callSid } = request.params;
        const { agentId } = request.body as { agentId: string };

        if (!agentId) {
          return await reply.status(400).send({
            error: 'agentId is required',
            correlationId,
          });
        }

        agent.completeHandoff(callSid, agentId);

        fastify.log.info({ correlationId, callSid, agentId }, 'Handoff completed');

        return await reply.send({
          success: true,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Complete handoff error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  // ==========================================================================
  // Notes
  // ==========================================================================

  /**
   * POST /supervisor/calls/:callSid/notes
   * Add a note to a call
   */
  fastify.post(
    '/supervisor/calls/:callSid/notes',
    async (
      request: FastifyRequest<{
        Params: { callSid: string };
        Body: unknown;
        Headers: { 'x-supervisor-id'?: string };
      }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { callSid } = request.params;
        const supervisorId = request.headers['x-supervisor-id'];

        if (!supervisorId) {
          return await reply.status(400).send({
            error: 'x-supervisor-id header is required',
            correlationId,
          });
        }

        const parseResult = AddNoteBodySchema.safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError('Invalid note body', parseResult.error.flatten());
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const note = agent.addNote({
          callSid,
          supervisorId,
          note: parseResult.data.note,
          isPrivate: parseResult.data.isPrivate,
        });

        return await reply.status(201).send({
          note,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Add note error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * GET /supervisor/calls/:callSid/notes
   * Get notes for a call
   */
  fastify.get(
    '/supervisor/calls/:callSid/notes',
    async (
      request: FastifyRequest<{
        Params: { callSid: string };
        Headers: { 'x-supervisor-id'?: string };
      }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { callSid } = request.params;
        const supervisorId = request.headers['x-supervisor-id'];

        const notes = agent.getNotes(callSid, supervisorId);

        return await reply.send({
          notes,
          total: notes.length,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get notes error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  // ==========================================================================
  // Queue SLA Management
  // ==========================================================================

  const queueService = getQueueSLAService();

  /**
   * GET /supervisor/queues
   * List all queues with their current SLA status
   */
  fastify.get('/supervisor/queues', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = generateCorrelationId();

    try {
      const queues = await queueService.getAllQueueStatuses();

      return await reply.send({
        queues,
        total: queues.length,
        correlationId,
      });
    } catch (error) {
      fastify.log.error({ correlationId, error }, 'List queues error');
      return await reply.status(500).send(toSafeErrorResponse(error));
    }
  });

  /**
   * GET /supervisor/queues/:queueSid
   * Get specific queue details with SLA status
   */
  fastify.get(
    '/supervisor/queues/:queueSid',
    async (request: FastifyRequest<{ Params: { queueSid: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { queueSid } = request.params;
        const status = await queueService.getQueueStatus(queueSid);

        if (!status) {
          return await reply.status(404).send({
            error: 'Queue not found',
            correlationId,
          });
        }

        const config = await queueService.getSLAConfig(queueSid);

        return await reply.send({
          status,
          config,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get queue error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * GET /supervisor/queues/:queueSid/breaches
   * Get SLA breaches for a queue
   */
  fastify.get(
    '/supervisor/queues/:queueSid/breaches',
    async (
      request: FastifyRequest<{
        Params: { queueSid: string };
        Querystring: { startTime?: string; endTime?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { queueSid } = request.params;
        const { startTime, endTime, limit } = request.query as {
          startTime?: string;
          endTime?: string;
          limit?: string;
        };

        const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
        const end = endTime ? new Date(endTime) : new Date();
        const maxResults = limit ? parseInt(limit, 10) : 100;

        const breaches = await queueService.getBreaches(queueSid, start, end, maxResults);

        return await reply.send({
          breaches,
          total: breaches.length,
          period: { start, end },
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get breaches error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * GET /supervisor/queues/:queueSid/config
   * Get SLA configuration for a queue
   */
  fastify.get(
    '/supervisor/queues/:queueSid/config',
    async (request: FastifyRequest<{ Params: { queueSid: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const { queueSid } = request.params;
        const config = await queueService.getSLAConfig(queueSid);

        if (!config) {
          return await reply.status(404).send({
            error: 'Queue configuration not found',
            correlationId,
          });
        }

        return await reply.send({
          config,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get queue config error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * PUT /supervisor/queues/:queueSid/config
   * Update SLA configuration for a queue
   */
  fastify.put(
    '/supervisor/queues/:queueSid/config',
    async (
      request: FastifyRequest<{ Params: { queueSid: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();

      try {
        const { queueSid } = request.params;
        const parseResult = QueueSLAConfigSchema.partial().safeParse(request.body);

        if (!parseResult.success) {
          const error = new ValidationError('Invalid config body', parseResult.error.flatten());
          return await reply.status(400).send(toSafeErrorResponse(error));
        }

        const updatedConfig = await queueService.updateSLAConfig(queueSid, parseResult.data);

        fastify.log.info({ correlationId, queueSid }, 'Queue SLA config updated');

        return await reply.send({
          config: updatedConfig,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Update queue config error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );

  /**
   * GET /supervisor/queues/summary
   * Get summary of all queues SLA status
   */
  fastify.get(
    '/supervisor/queues/summary',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();

      try {
        const queues = await queueService.getAllQueueStatuses();

        const summary = {
          totalQueues: queues.length,
          compliantQueues: queues.filter((q: QueueSLAStatus) => q.isCompliant).length,
          warningQueues: queues.filter((q: QueueSLAStatus) => q.severity === 'warning').length,
          criticalQueues: queues.filter((q: QueueSLAStatus) => q.severity === 'critical').length,
          totalCallsInQueue: queues.reduce(
            (sum: number, q: QueueSLAStatus) => sum + q.currentQueueSize,
            0
          ),
          totalAvailableAgents: queues.reduce(
            (sum: number, q: QueueSLAStatus) => sum + q.availableAgents,
            0
          ),
          totalBusyAgents: queues.reduce((sum: number, q: QueueSLAStatus) => sum + q.busyAgents, 0),
          averageServiceLevel:
            queues.length > 0
              ? queues.reduce((sum: number, q: QueueSLAStatus) => sum + q.serviceLevel, 0) /
                queues.length
              : 100,
          activeBreaches: queues.reduce(
            (sum: number, q: QueueSLAStatus) => sum + q.breaches.length,
            0
          ),
        };

        return await reply.send({
          summary,
          correlationId,
        });
      } catch (error) {
        fastify.log.error({ correlationId, error }, 'Get queue summary error');
        return await reply.status(500).send(toSafeErrorResponse(error));
      }
    }
  );
};
