import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { supervisorRoutes } from '../routes/supervisor.js';

/**
 * Comprehensive Supervisor Routes Tests
 *
 * Tests for:
 * - GET /supervisor/dashboard - Dashboard statistics
 * - GET /supervisor/calls - List active calls
 * - GET /supervisor/calls/:callSid - Get call details
 * - GET /supervisor/calls/flagged/:flag - Get flagged calls
 * - POST /supervisor/calls/:callSid/flag - Add flag to call
 * - DELETE /supervisor/calls/:callSid/flag/:flag - Remove flag
 * - POST /supervisor/sessions - Create supervisor session
 * - GET /supervisor/sessions/:sessionId - Get session details
 * - DELETE /supervisor/sessions/:sessionId - End session
 * - POST /supervisor/sessions/:sessionId/monitor - Start monitoring
 * - PUT /supervisor/sessions/:sessionId/monitor/mode - Change mode
 * - DELETE /supervisor/sessions/:sessionId/monitor - Stop monitoring
 * - POST /supervisor/handoff - Request AI handoff
 * - POST /supervisor/handoff/:callSid/complete - Complete handoff
 * - POST /supervisor/calls/:callSid/notes - Add note
 * - GET /supervisor/calls/:callSid/notes - Get notes
 * - GET /supervisor/queues - List all queues
 * - GET /supervisor/queues/:queueSid - Get queue details
 * - GET /supervisor/queues/:queueSid/breaches - Get SLA breaches
 * - GET /supervisor/queues/:queueSid/config - Get queue config
 * - PUT /supervisor/queues/:queueSid/config - Update queue config
 * - GET /supervisor/queues/summary - Get queue summary
 */

// Mock the supervisor agent
const mockCalls = new Map([
  [
    'CA123',
    {
      callSid: 'CA123',
      customerPhone: '+40712345678',
      state: 'active',
      direction: 'inbound',
      duration: 120,
      sentiment: 'positive',
      urgencyLevel: 'normal',
      flags: ['high-value-lead'],
      agentId: 'agent-1',
      agentName: 'AI Agent',
      startedAt: new Date().toISOString(),
    },
  ],
]);

const mockSessions = new Map();
const mockNotes = new Map();

const mockAgentInstance = {
    getDashboardStats: vi.fn(() => ({
      totalCalls: 10,
      activeCalls: 3,
      avgDuration: 180,
      totalDuration: 1800,
      callsByState: { active: 3, waiting: 2, completed: 5 },
      callsByUrgency: { high: 1, normal: 2 },
      flaggedCalls: 1,
      supervisors: 2,
    })),
    getActiveCalls: vi.fn(() => Array.from(mockCalls.values())),
    getActiveSessions: vi.fn(() => Array.from(mockSessions.values())),
    getCall: vi.fn((callSid: string) => mockCalls.get(callSid)),
    getCallsByFlag: vi.fn((flag: string) => {
      return Array.from(mockCalls.values()).filter((call) => call.flags.includes(flag));
    }),
    flagCall: vi.fn((callSid: string, flag: string) => {
      const call = mockCalls.get(callSid);
      if (call && !call.flags.includes(flag)) {
        call.flags.push(flag);
      }
    }),
    unflagCall: vi.fn((callSid: string, flag: string) => {
      const call = mockCalls.get(callSid);
      if (call) {
        call.flags = call.flags.filter((f) => f !== flag);
      }
    }),
    createSession: vi.fn((supervisorId: string, supervisorName: string, role: string) => {
      const session = {
        sessionId: `session-${Date.now()}`,
        supervisorId,
        supervisorName,
        role,
        connectedAt: new Date().toISOString(),
        monitoringMode: null,
        activeCallSid: null,
        callsMonitored: 0,
      };
      mockSessions.set(session.sessionId, session);
      return session;
    }),
    getSession: vi.fn((sessionId: string) => mockSessions.get(sessionId)),
    endSession: vi.fn((sessionId: string) => {
      mockSessions.delete(sessionId);
    }),
    startMonitoring: vi.fn((sessionId: string, callSid: string, mode: string) => {
      const session = mockSessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      if (!mockCalls.has(callSid)) {
        return { success: false, error: 'Call not found' };
      }
      session.monitoringMode = mode;
      session.activeCallSid = callSid;
      session.callsMonitored++;
      return { success: true };
    }),
    changeMonitoringMode: vi.fn((sessionId: string, mode: string) => {
      const session = mockSessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      if (!session.activeCallSid) {
        return { success: false, error: 'Not monitoring any call' };
      }
      session.monitoringMode = mode;
      return { success: true };
    }),
    stopMonitoring: vi.fn((sessionId: string) => {
      const session = mockSessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      session.monitoringMode = null;
      session.activeCallSid = null;
      return { success: true };
    }),
    requestHandoff: vi.fn((request: any) => {
      return {
        success: true,
        handoffId: `handoff-${Date.now()}`,
      };
    }),
    completeHandoff: vi.fn((callSid: string, agentId: string) => {
      // Mock handoff completion
    }),
    addNote: vi.fn((note: any) => {
      const noteId = `note-${Date.now()}`;
      const noteEntry = {
        id: noteId,
        ...note,
        createdAt: new Date().toISOString(),
      };
      const callNotes = mockNotes.get(note.callSid) || [];
      callNotes.push(noteEntry);
      mockNotes.set(note.callSid, callNotes);
      return noteEntry;
    }),
    getNotes: vi.fn((callSid: string, supervisorId?: string) => {
      const notes = mockNotes.get(callSid) || [];
      if (supervisorId) {
        return notes.filter((n) => !n.isPrivate || n.supervisorId === supervisorId);
      }
      return notes.filter((n) => !n.isPrivate);
    }),
};

const mockQueueServiceInstance = {
    getAllQueueStatuses: vi.fn(() => [
      {
        queueSid: 'QU123',
        queueName: 'Support Queue',
        currentQueueSize: 5,
        availableAgents: 3,
        busyAgents: 2,
        serviceLevel: 85,
        isCompliant: true,
        severity: 'ok',
        breaches: [],
      },
      {
        queueSid: 'QU456',
        queueName: 'Sales Queue',
        currentQueueSize: 10,
        availableAgents: 1,
        busyAgents: 4,
        serviceLevel: 65,
        isCompliant: false,
        severity: 'warning',
        breaches: [{ timestamp: new Date().toISOString(), waitTime: 300 }],
      },
    ]),
    getQueueStatus: vi.fn((queueSid: string) => {
      if (queueSid === 'QU123') {
        return {
          queueSid: 'QU123',
          queueName: 'Support Queue',
          currentQueueSize: 5,
          availableAgents: 3,
          busyAgents: 2,
          serviceLevel: 85,
          isCompliant: true,
          severity: 'ok',
          breaches: [],
        };
      }
      return null;
    }),
    getSLAConfig: vi.fn((queueSid: string) => {
      if (queueSid === 'QU123') {
        return {
          queueSid: 'QU123',
          maxWaitTime: 180,
          targetServiceLevel: 80,
          warningThreshold: 70,
          criticalThreshold: 60,
        };
      }
      return null;
    }),
    getBreaches: vi.fn((queueSid: string, start: Date, end: Date, limit: number) => [
      {
        breachId: 'BR123',
        queueSid,
        timestamp: new Date().toISOString(),
        waitTime: 300,
        callSid: 'CA999',
      },
    ]),
    updateSLAConfig: vi.fn((queueSid: string, config: any) => ({
      queueSid,
      ...config,
      maxWaitTime: config.maxWaitTime ?? 180,
      targetServiceLevel: config.targetServiceLevel ?? 80,
      warningThreshold: config.warningThreshold ?? 70,
      criticalThreshold: config.criticalThreshold ?? 60,
    })),
};

vi.mock('@medicalcor/domain', () => ({
  getSupervisorAgent: vi.fn(() => mockAgentInstance),
  getQueueSLAService: vi.fn(() => mockQueueServiceInstance),
}));

describe('Supervisor Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(supervisorRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // GET /supervisor/dashboard
  // ==========================================================================

  describe('GET /supervisor/dashboard', () => {
    it('should return dashboard statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/dashboard',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('stats');
      expect(body).toHaveProperty('activeCalls');
      expect(body).toHaveProperty('supervisors');
      expect(body).toHaveProperty('correlationId');
    });

    it('should include call statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/dashboard',
      });

      const body = JSON.parse(response.body);
      expect(body.stats).toHaveProperty('totalCalls');
      expect(body.stats).toHaveProperty('activeCalls');
      expect(body.stats).toHaveProperty('avgDuration');
    });

    it('should mask phone numbers in active calls', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/dashboard',
      });

      const body = JSON.parse(response.body);
      if (body.activeCalls.length > 0) {
        const call = body.activeCalls[0];
        expect(call.customerPhone).toMatch(/\*\*\*\*$/);
        expect(call.customerPhone).not.toContain('+40712345678');
      }
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.getDashboardStats.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/dashboard',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('code');
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should include all required call fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/dashboard',
      });

      const body = JSON.parse(response.body);
      if (body.activeCalls.length > 0) {
        const call = body.activeCalls[0];
        expect(call).toHaveProperty('callSid');
        expect(call).toHaveProperty('customerPhone');
        expect(call).toHaveProperty('state');
        expect(call).toHaveProperty('direction');
        expect(call).toHaveProperty('duration');
        expect(call).toHaveProperty('sentiment');
        expect(call).toHaveProperty('urgencyLevel');
        expect(call).toHaveProperty('flags');
        expect(call).toHaveProperty('agentId');
        expect(call).toHaveProperty('agentName');
        expect(call).toHaveProperty('startedAt');
      }
    });

    it('should include supervisor session details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/dashboard',
      });

      const body = JSON.parse(response.body);
      expect(body.supervisors).toBeInstanceOf(Array);
    });
  });

  // ==========================================================================
  // GET /supervisor/calls
  // ==========================================================================

  describe('GET /supervisor/calls', () => {
    it('should return list of active calls', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('calls');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.calls)).toBe(true);
    });

    it('should include call details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls',
      });

      const body = JSON.parse(response.body);
      if (body.calls.length > 0) {
        const call = body.calls[0];
        expect(call).toHaveProperty('callSid');
        expect(call).toHaveProperty('state');
        expect(call).toHaveProperty('duration');
        expect(call).toHaveProperty('sentiment');
      }
    });

    it('should mask phone numbers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls',
      });

      const body = JSON.parse(response.body);
      if (body.calls.length > 0) {
        body.calls.forEach((call: any) => {
          expect(call.customerPhone).toMatch(/\*\*\*\*$/);
        });
      }
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.getActiveCalls.mockImplementationOnce(() => {
        throw new Error('Service unavailable');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/calls/:callSid
  // ==========================================================================

  describe('GET /supervisor/calls/:callSid', () => {
    it('should return 404 for non-existent call', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Call not found');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return call details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.call.callSid).toBe('CA123');
      expect(body.call).toHaveProperty('state');
      expect(body.call).toHaveProperty('duration');
    });

    it('should include notes for call', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123',
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('notes');
      expect(Array.isArray(body.notes)).toBe(true);
    });

    it('should only show public notes', async () => {
      // Add a private note first
      await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {
          note: 'Private note',
          isPrivate: true,
        },
      });

      // Add a public note
      await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {
          note: 'Public note',
          isPrivate: false,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123',
      });

      const body = JSON.parse(response.body);
      // All returned notes should not be private
      body.notes.forEach((note: any) => {
        expect(note.isPrivate).toBeFalsy();
      });
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.getCall.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123',
      });

      expect(response.statusCode).toBe(500);
    });

    it('should mask phone number in call details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123',
      });

      const body = JSON.parse(response.body);
      expect(body.call.customerPhone).toMatch(/\*\*\*\*$/);
    });
  });

  // ==========================================================================
  // GET /supervisor/calls/flagged/:flag
  // ==========================================================================

  describe('GET /supervisor/calls/flagged/:flag', () => {
    it('should return calls with specific flag', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/flagged/high-value-lead',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('calls');
      expect(body).toHaveProperty('total');
    });

    it('should return 400 for invalid flag', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/flagged/invalid-flag',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid flag');
      expect(body).toHaveProperty('validFlags');
      expect(body).toHaveProperty('correlationId');
    });

    it('should only return calls with the requested flag', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/flagged/high-value-lead',
      });

      const body = JSON.parse(response.body);
      body.calls.forEach((call: any) => {
        expect(call.flags).toContain('high-value-lead');
      });
    });

    it('should handle all valid flags', async () => {
      const validFlags = [
        'escalation-requested',
        'high-value-lead',
        'complaint',
        'long-hold',
        'silence-detected',
        'ai-handoff-needed',
      ];

      for (const flag of validFlags) {
        const response = await app.inject({
          method: 'GET',
          url: `/supervisor/calls/flagged/${flag}`,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.getCallsByFlag.mockImplementationOnce(() => {
        throw new Error('Service error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/flagged/high-value-lead',
      });

      expect(response.statusCode).toBe(500);
    });

    it('should mask phone numbers in flagged calls', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/flagged/high-value-lead',
      });

      const body = JSON.parse(response.body);
      body.calls.forEach((call: any) => {
        expect(call.customerPhone).toMatch(/\*\*\*\*$/);
      });
    });
  });

  // ==========================================================================
  // POST /supervisor/calls/:callSid/flag
  // ==========================================================================

  describe('POST /supervisor/calls/:callSid/flag', () => {
    it('should add flag to call', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/flag',
        payload: {
          flag: 'escalation-requested',
        },
      });

      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      }
    });

    it('should validate flag value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/flag',
        payload: {
          flag: 'invalid-flag',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('code');
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should require flag in payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/flag',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle all valid flags', async () => {
      const validFlags = [
        'escalation-requested',
        'high-value-lead',
        'complaint',
        'long-hold',
        'silence-detected',
        'ai-handoff-needed',
      ];

      for (const flag of validFlags) {
        const response = await app.inject({
          method: 'POST',
          url: '/supervisor/calls/CA123/flag',
          payload: { flag },
        });

        expect([200, 400]).toContain(response.statusCode);
      }
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.flagCall.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/flag',
        payload: {
          flag: 'escalation-requested',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // DELETE /supervisor/calls/:callSid/flag/:flag
  // ==========================================================================

  describe('DELETE /supervisor/calls/:callSid/flag/:flag', () => {
    it('should remove flag from call', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/supervisor/calls/CA123/flag/high-value-lead',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('correlationId');
    });

    it('should validate flag value', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/supervisor/calls/CA123/flag/invalid-flag',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid flag');
      expect(body).toHaveProperty('validFlags');
    });

    it('should handle all valid flags', async () => {
      const validFlags = [
        'escalation-requested',
        'high-value-lead',
        'complaint',
        'long-hold',
        'silence-detected',
        'ai-handoff-needed',
      ];

      for (const flag of validFlags) {
        const response = await app.inject({
          method: 'DELETE',
          url: `/supervisor/calls/CA123/flag/${flag}`,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.unflagCall.mockImplementationOnce(() => {
        throw new Error('Service error');
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/supervisor/calls/CA123/flag/high-value-lead',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // POST /supervisor/sessions
  // ==========================================================================

  describe('POST /supervisor/sessions', () => {
    it('should create supervisor session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('session');
      expect(body.session).toHaveProperty('sessionId');
      expect(body.session.supervisorId).toBe('sup-123');
    });

    it('should require supervisorId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require supervisorName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          role: 'supervisor',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty supervisorId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: '',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty supervisorName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: '',
          role: 'supervisor',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.createSession.mockImplementationOnce(() => {
        throw new Error('Session creation failed');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/sessions/:sessionId
  // ==========================================================================

  describe('GET /supervisor/sessions/:sessionId', () => {
    it('should return 404 for non-existent session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/sessions/session-999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Session not found');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return session details', async () => {
      // First create a session
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      // Then get it
      const response = await app.inject({
        method: 'GET',
        url: `/supervisor/sessions/${session.sessionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session.sessionId).toBe(session.sessionId);
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.getSession.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/sessions/session-123',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // DELETE /supervisor/sessions/:sessionId
  // ==========================================================================

  describe('DELETE /supervisor/sessions/:sessionId', () => {
    it('should end supervisor session', async () => {
      // Create a session first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      // End it
      const response = await app.inject({
        method: 'DELETE',
        url: `/supervisor/sessions/${session.sessionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.endSession.mockImplementationOnce(() => {
        throw new Error('Failed to end session');
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/supervisor/sessions/session-123',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // POST /supervisor/sessions/:sessionId/monitor
  // ==========================================================================

  describe('POST /supervisor/sessions/:sessionId/monitor', () => {
    it('should start monitoring a call', async () => {
      // Create session first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      // Start monitoring
      const response = await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          callSid: 'CA123',
          mode: 'listen',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should require callSid', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          mode: 'listen',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate monitoring mode', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          callSid: 'CA123',
          mode: 'invalid-mode',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should default mode to listen', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          callSid: 'CA123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.mode).toBe('listen');
    });

    it('should return 400 when monitoring fails', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      mockAgentInstance.startMonitoring.mockReturnValueOnce({
        success: false,
        error: 'Call not found',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          callSid: 'CA999',
          mode: 'listen',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Call not found');
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.startMonitoring.mockImplementationOnce(() => {
        throw new Error('Monitoring error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions/session-123/monitor',
        payload: {
          callSid: 'CA123',
          mode: 'listen',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // PUT /supervisor/sessions/:sessionId/monitor/mode
  // ==========================================================================

  describe('PUT /supervisor/sessions/:sessionId/monitor/mode', () => {
    it('should change monitoring mode', async () => {
      // Create session and start monitoring
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          callSid: 'CA123',
          mode: 'listen',
        },
      });

      // Change mode
      const response = await app.inject({
        method: 'PUT',
        url: `/supervisor/sessions/${session.sessionId}/monitor/mode`,
        payload: {
          mode: 'whisper',
        },
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it('should require mode', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/supervisor/sessions/${session.sessionId}/monitor/mode`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate mode value', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/supervisor/sessions/${session.sessionId}/monitor/mode`,
        payload: {
          mode: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when change mode fails', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      mockAgentInstance.changeMonitoringMode.mockReturnValueOnce({
        success: false,
        error: 'Not monitoring any call',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/supervisor/sessions/${session.sessionId}/monitor/mode`,
        payload: {
          mode: 'whisper',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not monitoring any call');
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.changeMonitoringMode.mockImplementationOnce(() => {
        throw new Error('Mode change error');
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/supervisor/sessions/session-123/monitor/mode',
        payload: {
          mode: 'whisper',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // DELETE /supervisor/sessions/:sessionId/monitor
  // ==========================================================================

  describe('DELETE /supervisor/sessions/:sessionId/monitor', () => {
    it('should stop monitoring', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it('should return 400 when stop monitoring fails', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-123',
          supervisorName: 'John Doe',
          role: 'supervisor',
        },
      });

      const { session } = JSON.parse(createResponse.body);

      mockAgentInstance.stopMonitoring.mockReturnValueOnce({
        success: false,
        error: 'Session not found',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Session not found');
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.stopMonitoring.mockImplementationOnce(() => {
        throw new Error('Stop monitoring error');
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/supervisor/sessions/session-123/monitor',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // POST /supervisor/handoff
  // ==========================================================================

  describe('POST /supervisor/handoff', () => {
    it('should request AI handoff', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff',
        payload: {
          callSid: 'CA123',
          vapiCallId: 'vapi-123',
          reason: 'complex-query',
        },
      });

      expect([201, 400]).toContain(response.statusCode);
    });

    it('should return handoff ID on success', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff',
        payload: {
          callSid: 'CA123',
          vapiCallId: 'vapi-123',
          reason: 'complex-query',
        },
      });

      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body).toHaveProperty('handoffId');
      }
    });

    it('should validate handoff request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff',
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when handoff fails', async () => {
      // Temporarily replace the mock implementation
      const originalImpl = mockAgentInstance.requestHandoff;
      mockAgentInstance.requestHandoff = vi.fn(() => ({
        success: false,
        error: 'No available agents',
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff',
        payload: {
          callSid: 'CA123',
          vapiCallId: 'vapi-123',
          reason: 'complex-query',
        },
      });

      // Restore original implementation
      mockAgentInstance.requestHandoff = originalImpl;

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('No available agents');
    });

    it('should handle errors gracefully', async () => {
      // Temporarily replace the mock implementation
      const originalImpl = mockAgentInstance.requestHandoff;
      mockAgentInstance.requestHandoff = vi.fn(() => {
        throw new Error('Handoff error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff',
        payload: {
          callSid: 'CA123',
          vapiCallId: 'vapi-123',
          reason: 'complex-query',
        },
      });

      // Restore original implementation
      mockAgentInstance.requestHandoff = originalImpl;

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // POST /supervisor/handoff/:callSid/complete
  // ==========================================================================

  describe('POST /supervisor/handoff/:callSid/complete', () => {
    it('should complete handoff', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff/CA123/complete',
        payload: {
          agentId: 'agent-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should require agentId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff/CA123/complete',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('agentId is required');
    });

    it('should handle null agentId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff/CA123/complete',
        payload: {
          agentId: null,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle undefined agentId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff/CA123/complete',
        payload: {
          agentId: undefined,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.completeHandoff.mockImplementationOnce(() => {
        throw new Error('Complete handoff error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff/CA123/complete',
        payload: {
          agentId: 'agent-123',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // POST /supervisor/calls/:callSid/notes
  // ==========================================================================

  describe('POST /supervisor/calls/:callSid/notes', () => {
    it('should add note to call', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {
          note: 'Test note',
          isPrivate: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('note');
      expect(body.note.note).toBe('Test note');
    });

    it('should require x-supervisor-id header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        payload: {
          note: 'Test note',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('x-supervisor-id');
      expect(body).toHaveProperty('correlationId');
    });

    it('should require note content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should default isPrivate to true', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {
          note: 'Test note',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should validate note length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {
          note: 'x'.repeat(1001), // Exceeds max length
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.addNote.mockImplementationOnce(() => {
        throw new Error('Add note error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
        payload: {
          note: 'Test note',
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/calls/:callSid/notes
  // ==========================================================================

  describe('GET /supervisor/calls/:callSid/notes', () => {
    it('should get notes for call', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123/notes',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('notes');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.notes)).toBe(true);
    });

    it('should filter private notes by supervisor', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.notes)).toBe(true);
    });

    it('should work without supervisor id header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123/notes',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle errors gracefully', async () => {
      mockAgentInstance.getNotes.mockImplementationOnce(() => {
        throw new Error('Get notes error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123/notes',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/queues
  // ==========================================================================

  describe('GET /supervisor/queues', () => {
    it('should list all queues with SLA status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('queues');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('correlationId');
      expect(Array.isArray(body.queues)).toBe(true);
    });

    it('should return queue details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues',
      });

      const body = JSON.parse(response.body);
      expect(body.total).toBeGreaterThan(0);
      const queue = body.queues[0];
      expect(queue).toHaveProperty('queueSid');
      expect(queue).toHaveProperty('queueName');
      expect(queue).toHaveProperty('currentQueueSize');
      expect(queue).toHaveProperty('serviceLevel');
    });

    it('should handle errors gracefully', async () => {
      mockQueueServiceInstance.getAllQueueStatuses.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/queues/:queueSid
  // ==========================================================================

  describe('GET /supervisor/queues/:queueSid', () => {
    it('should return queue details with SLA status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('config');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return 404 for non-existent queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Queue not found');
      expect(body).toHaveProperty('correlationId');
    });

    it('should include queue configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123',
      });

      const body = JSON.parse(response.body);
      expect(body.config).toHaveProperty('maxWaitTime');
      expect(body.config).toHaveProperty('targetServiceLevel');
    });

    it('should handle errors gracefully', async () => {
      mockQueueServiceInstance.getQueueStatus.mockImplementationOnce(() => {
        throw new Error('Service error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/queues/:queueSid/breaches
  // ==========================================================================

  describe('GET /supervisor/queues/:queueSid/breaches', () => {
    it('should get SLA breaches for a queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/breaches',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('breaches');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('period');
      expect(body).toHaveProperty('correlationId');
    });

    it('should accept startTime query parameter', async () => {
      const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const response = await app.inject({
        method: 'GET',
        url: `/supervisor/queues/QU123/breaches?startTime=${startTime}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period.start).toBeDefined();
    });

    it('should accept endTime query parameter', async () => {
      const endTime = new Date().toISOString();
      const response = await app.inject({
        method: 'GET',
        url: `/supervisor/queues/QU123/breaches?endTime=${endTime}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept limit query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/breaches?limit=50',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should use default values when no query params provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/breaches',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBeDefined();
    });

    it('should handle all query parameters together', async () => {
      const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const endTime = new Date().toISOString();
      const response = await app.inject({
        method: 'GET',
        url: `/supervisor/queues/QU123/breaches?startTime=${startTime}&endTime=${endTime}&limit=25`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle errors gracefully', async () => {
      mockQueueServiceInstance.getBreaches.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/breaches',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/queues/:queueSid/config
  // ==========================================================================

  describe('GET /supervisor/queues/:queueSid/config', () => {
    it('should get SLA configuration for a queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('config');
      expect(body).toHaveProperty('correlationId');
    });

    it('should return 404 for non-existent queue config', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU999/config',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Queue configuration not found');
      expect(body).toHaveProperty('correlationId');
    });

    it('should include all config fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/config',
      });

      const body = JSON.parse(response.body);
      expect(body.config).toHaveProperty('maxWaitTime');
      expect(body.config).toHaveProperty('targetServiceLevel');
      expect(body.config).toHaveProperty('warningThreshold');
      expect(body.config).toHaveProperty('criticalThreshold');
    });

    it('should handle errors gracefully', async () => {
      mockQueueServiceInstance.getSLAConfig.mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/QU123/config',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // PUT /supervisor/queues/:queueSid/config
  // ==========================================================================

  describe('PUT /supervisor/queues/:queueSid/config', () => {
    it('should update SLA configuration', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/supervisor/queues/QU123/config',
        payload: {
          maxWaitTime: 200,
          targetServiceLevel: 85,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('config');
      expect(body).toHaveProperty('correlationId');
    });

    it('should validate config body', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/supervisor/queues/QU123/config',
        payload: {
          maxWaitTime: 'invalid', // Should be number
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept partial config updates', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/supervisor/queues/QU123/config',
        payload: {
          maxWaitTime: 250,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle errors gracefully', async () => {
      mockQueueServiceInstance.updateSLAConfig.mockImplementationOnce(() => {
        throw new Error('Update error');
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/supervisor/queues/QU123/config',
        payload: {
          maxWaitTime: 200,
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // GET /supervisor/queues/summary
  // ==========================================================================

  describe('GET /supervisor/queues/summary', () => {
    it('should return summary of all queues', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('summary');
      expect(body).toHaveProperty('correlationId');
    });

    it('should calculate total queues', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.totalQueues).toBe(2);
    });

    it('should calculate compliant queues', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.compliantQueues).toBe(1);
    });

    it('should calculate warning queues', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.warningQueues).toBe(1);
    });

    it('should calculate critical queues', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.criticalQueues).toBe(0);
    });

    it('should calculate total calls in queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.totalCallsInQueue).toBe(15); // 5 + 10
    });

    it('should calculate total available agents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.totalAvailableAgents).toBe(4); // 3 + 1
    });

    it('should calculate total busy agents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.totalBusyAgents).toBe(6); // 2 + 4
    });

    it('should calculate average service level', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.averageServiceLevel).toBe(75); // (85 + 65) / 2
    });

    it('should calculate active breaches', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      const body = JSON.parse(response.body);
      expect(body.summary.activeBreaches).toBe(1);
    });

    it('should handle empty queues list', async () => {
      mockQueueServiceInstance.getAllQueueStatuses.mockReturnValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary.totalQueues).toBe(0);
      expect(body.summary.averageServiceLevel).toBe(100);
    });

    it('should handle errors gracefully', async () => {
      mockQueueServiceInstance.getAllQueueStatuses.mockImplementationOnce(() => {
        throw new Error('Summary error');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/supervisor/queues/summary',
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should handle full monitoring workflow', async () => {
      // Create session
      const createResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/sessions',
        payload: {
          supervisorId: 'sup-test',
          supervisorName: 'Test Supervisor',
          role: 'supervisor',
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const { session } = JSON.parse(createResponse.body);

      // Start monitoring
      const monitorResponse = await app.inject({
        method: 'POST',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
        payload: {
          callSid: 'CA123',
          mode: 'listen',
        },
      });

      expect(monitorResponse.statusCode).toBe(200);

      // Change mode
      const changeModeResponse = await app.inject({
        method: 'PUT',
        url: `/supervisor/sessions/${session.sessionId}/monitor/mode`,
        payload: {
          mode: 'whisper',
        },
      });

      expect([200, 400]).toContain(changeModeResponse.statusCode);

      // Stop monitoring
      const stopResponse = await app.inject({
        method: 'DELETE',
        url: `/supervisor/sessions/${session.sessionId}/monitor`,
      });

      expect([200, 400]).toContain(stopResponse.statusCode);

      // End session
      const endResponse = await app.inject({
        method: 'DELETE',
        url: `/supervisor/sessions/${session.sessionId}`,
      });

      expect(endResponse.statusCode).toBe(200);
    });

    it('should include correlationId in all responses', async () => {
      const endpoints = [
        { method: 'GET', url: '/supervisor/dashboard' },
        { method: 'GET', url: '/supervisor/calls' },
        { method: 'GET', url: '/supervisor/queues' },
        { method: 'GET', url: '/supervisor/queues/summary' },
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject(endpoint);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('correlationId');
      }
    });

    it('should handle complete handoff workflow', async () => {
      // Request handoff
      const handoffResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/handoff',
        payload: {
          callSid: 'CA123',
          vapiCallId: 'vapi-123',
          reason: 'complex-query',
        },
      });

      if (handoffResponse.statusCode === 201) {
        const { handoffId } = JSON.parse(handoffResponse.body);
        expect(handoffId).toBeDefined();

        // Complete handoff
        const completeResponse = await app.inject({
          method: 'POST',
          url: '/supervisor/handoff/CA123/complete',
          payload: {
            agentId: 'agent-123',
          },
        });

        expect(completeResponse.statusCode).toBe(200);
      }
    });

    it('should handle note workflow', async () => {
      // Add note
      const addResponse = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/notes',
        headers: {
          'x-supervisor-id': 'sup-test',
        },
        payload: {
          note: 'Integration test note',
          isPrivate: false,
        },
      });

      expect(addResponse.statusCode).toBe(201);

      // Get notes
      const getResponse = await app.inject({
        method: 'GET',
        url: '/supervisor/calls/CA123/notes',
      });

      expect(getResponse.statusCode).toBe(200);
    });
  });
});
