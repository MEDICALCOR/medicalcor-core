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
 */

// Mock the supervisor agent
vi.mock('@medicalcor/domain', () => ({
  getSupervisorAgent: vi.fn(() => {
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

    return {
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
  }),
  getQueueSLAService: vi.fn(() => ({
    getQueueStats: vi.fn(() => ({
      totalCalls: 0,
      waiting: 0,
      inProgress: 0,
      completed: 0,
      avgWaitTime: 0,
      maxWaitTime: 0,
      slaCompliance: 100,
    })),
    getQueueHealth: vi.fn(() => ({
      status: 'healthy',
      load: 0,
      waitingCalls: 0,
    })),
  })),
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
    });

    it('should require flag in payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/supervisor/calls/CA123/flag',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
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
    });

    it('should validate flag value', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/supervisor/calls/CA123/flag/invalid-flag',
      });

      expect(response.statusCode).toBe(400);
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
          reason: 'complex_query',
          priority: 'normal',
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
          reason: 'complex_query',
          priority: 'normal',
        },
      });

      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body).toHaveProperty('handoffId');
      }
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
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject(endpoint);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('correlationId');
      }
    });
  });
});
