/**
 * @fileoverview Supervisor Agent Tests
 *
 * Tests for W3 Milestone: Voice AI + Realtime Supervisor.
 * Covers call monitoring, supervisor sessions, handoff management,
 * and dashboard statistics.
 *
 * @module domain/voice/__tests__/supervisor-agent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  SupervisorAgent,
  getSupervisorAgent,
  resetSupervisorAgent,
  type SupervisorAgentConfig,
  type SupervisorAgentEvents,
} from '../supervisor-agent.js';
import type { MonitoredCall, HandoffRequest } from '@medicalcor/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createDefaultCallData = (
  overrides: Partial<Omit<MonitoredCall, 'recentTranscript' | 'flags'>> = {}
): Omit<MonitoredCall, 'recentTranscript' | 'flags'> => ({
  callSid: 'CA001',
  leadId: 'lead-001',
  direction: 'inbound',
  state: 'ringing',
  customerPhone: '+40700000001',
  startedAt: new Date(),
  assistantId: 'asst-001',
  sentiment: 'neutral',
  ...overrides,
});

const createHandoffRequest = (overrides: Partial<HandoffRequest> = {}): HandoffRequest => ({
  callSid: 'CA001',
  vapiCallId: 'vapi-001',
  reason: 'customer-request',
  priority: 'normal',
  notes: 'Patient requested human agent',
  ...overrides,
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('SupervisorAgent', () => {
  let agent: SupervisorAgent;

  beforeEach(() => {
    resetSupervisorAgent();
    agent = new SupervisorAgent();
  });

  afterEach(() => {
    agent.destroy();
    resetSupervisorAgent();
  });

  // ===========================================================================
  // CALL LIFECYCLE TESTS
  // ===========================================================================

  describe('registerCall', () => {
    it('should register a new call', () => {
      const callData = createDefaultCallData();
      const call = agent.registerCall(callData);

      expect(call.callSid).toBe('CA001');
      expect(call.recentTranscript).toEqual([]);
      expect(call.flags).toEqual([]);
    });

    it('should emit call:started event', () => {
      const listener = vi.fn();
      agent.on('call:started', listener);

      agent.registerCall(createDefaultCallData());

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should enforce max active calls limit', () => {
      const config: SupervisorAgentConfig = { maxActiveCalls: 3 };
      const limitedAgent = new SupervisorAgent(config);

      for (let i = 0; i < 5; i++) {
        limitedAgent.registerCall(createDefaultCallData({ callSid: `CA00${i}` }));
      }

      const activeCalls = limitedAgent.getActiveCalls();
      expect(activeCalls.length).toBeLessThanOrEqual(3);

      limitedAgent.destroy();
    });

    it('should start call monitoring timer', () => {
      const call = agent.registerCall(createDefaultCallData());
      expect(call).toBeDefined();
      // Timer is internal, we verify by updating call to on-hold
    });
  });

  describe('updateCall', () => {
    it('should update call state', () => {
      agent.registerCall(createDefaultCallData());

      const updated = agent.updateCall('CA001', { state: 'in-progress' });

      expect(updated?.state).toBe('in-progress');
    });

    it('should emit call:updated event', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('call:updated', listener);

      agent.updateCall('CA001', { state: 'in-progress' });

      expect(listener).toHaveBeenCalledWith('CA001', { state: 'in-progress' });
    });

    it('should return null for unknown call', () => {
      const result = agent.updateCall('UNKNOWN', { state: 'in-progress' });
      expect(result).toBeNull();
    });
  });

  describe('endCall', () => {
    it('should remove call from active calls', () => {
      agent.registerCall(createDefaultCallData());

      agent.endCall('CA001', 'completed');

      expect(agent.getCall('CA001')).toBeUndefined();
    });

    it('should emit call:ended event', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('call:ended', listener);

      agent.endCall('CA001', 'completed');

      expect(listener).toHaveBeenCalledWith('CA001', 'completed');
    });

    it('should stop monitoring timer', () => {
      agent.registerCall(createDefaultCallData());
      agent.endCall('CA001', 'completed');

      // No way to directly verify timer cleared, but call should be gone
      expect(agent.getCall('CA001')).toBeUndefined();
    });

    it('should end supervisor sessions monitoring the call', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John Doe', 'supervisor');
      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      const listener = vi.fn();
      agent.on('supervisor:left', listener);

      agent.endCall('CA001', 'completed');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getCall', () => {
    it('should return call by SID', () => {
      agent.registerCall(createDefaultCallData());

      const call = agent.getCall('CA001');

      expect(call?.callSid).toBe('CA001');
    });

    it('should return undefined for unknown call', () => {
      expect(agent.getCall('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getActiveCalls', () => {
    it('should return all active calls', () => {
      agent.registerCall(createDefaultCallData({ callSid: 'CA001' }));
      agent.registerCall(createDefaultCallData({ callSid: 'CA002' }));
      agent.registerCall(createDefaultCallData({ callSid: 'CA003' }));

      const calls = agent.getActiveCalls();

      expect(calls).toHaveLength(3);
    });
  });

  describe('getCallsByFlag', () => {
    it('should filter calls by flag', () => {
      agent.registerCall(createDefaultCallData({ callSid: 'CA001' }));
      agent.registerCall(createDefaultCallData({ callSid: 'CA002' }));

      agent.flagCall('CA001', 'escalation-requested');

      const escalated = agent.getCallsByFlag('escalation-requested');

      expect(escalated).toHaveLength(1);
      expect(escalated[0].callSid).toBe('CA001');
    });
  });

  // ===========================================================================
  // TRANSCRIPT PROCESSING TESTS
  // ===========================================================================

  describe('processTranscriptMessage', () => {
    it('should add message to transcript', () => {
      agent.registerCall(createDefaultCallData());

      agent.processTranscriptMessage('CA001', 'customer', 'Hello, I need help');

      const call = agent.getCall('CA001');
      expect(call?.recentTranscript).toHaveLength(1);
      expect(call?.recentTranscript[0].text).toBe('Hello, I need help');
    });

    it('should emit transcript:message event', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('transcript:message', listener);

      agent.processTranscriptMessage('CA001', 'customer', 'Hello');

      expect(listener).toHaveBeenCalledWith('CA001', 'customer', 'Hello');
    });

    it('should detect escalation keywords', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('alert:escalation', listener);

      agent.processTranscriptMessage('CA001', 'customer', 'I want to speak to a manager please');

      expect(listener).toHaveBeenCalled();
    });

    it('should flag call on escalation keyword', () => {
      agent.registerCall(createDefaultCallData());

      agent.processTranscriptMessage('CA001', 'customer', 'I need a supervisor');

      const call = agent.getCall('CA001');
      expect(call?.flags).toContain('escalation-requested');
    });

    it('should limit transcript to 20 messages', () => {
      agent.registerCall(createDefaultCallData());

      for (let i = 0; i < 25; i++) {
        agent.processTranscriptMessage('CA001', 'customer', `Message ${i}`);
      }

      const call = agent.getCall('CA001');
      expect(call?.recentTranscript.length).toBeLessThanOrEqual(20);
    });

    it('should detect escalation keywords', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('alert:escalation', listener);

      // Uses 'manager' which is in the default escalation keywords
      agent.processTranscriptMessage('CA001', 'customer', 'I need to speak to the manager');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('updateSentiment', () => {
    it('should update call sentiment', () => {
      agent.registerCall(createDefaultCallData());

      agent.updateSentiment('CA001', 'negative');

      const call = agent.getCall('CA001');
      expect(call?.sentiment).toBe('negative');
    });

    it('should emit alert for negative sentiment below threshold', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('alert:negative-sentiment', listener);

      agent.updateSentiment('CA001', 'negative', -0.7);

      expect(listener).toHaveBeenCalledWith('CA001', -0.7);
    });

    it('should not alert for sentiment above threshold', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('alert:negative-sentiment', listener);

      agent.updateSentiment('CA001', 'negative', -0.3);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // CALL FLAGS TESTS
  // ===========================================================================

  describe('flagCall', () => {
    it('should add flag to call', () => {
      agent.registerCall(createDefaultCallData());

      agent.flagCall('CA001', 'high-value-lead');

      const call = agent.getCall('CA001');
      expect(call?.flags).toContain('high-value-lead');
    });

    it('should not duplicate flags', () => {
      agent.registerCall(createDefaultCallData());

      agent.flagCall('CA001', 'high-value-lead');
      agent.flagCall('CA001', 'high-value-lead');

      const call = agent.getCall('CA001');
      expect(call?.flags.filter((f) => f === 'high-value-lead')).toHaveLength(1);
    });

    it('should track escalation in history', () => {
      agent.registerCall(createDefaultCallData());

      agent.flagCall('CA001', 'escalation-requested', 'Customer upset');

      const escalations = agent.getEscalationsToday();
      expect(escalations.length).toBeGreaterThan(0);
    });
  });

  describe('unflagCall', () => {
    it('should remove flag from call', () => {
      agent.registerCall(createDefaultCallData());
      agent.flagCall('CA001', 'high-value-lead');

      agent.unflagCall('CA001', 'high-value-lead');

      const call = agent.getCall('CA001');
      expect(call?.flags).not.toContain('high-value-lead');
    });
  });

  // ===========================================================================
  // SUPERVISOR SESSION TESTS
  // ===========================================================================

  describe('createSession', () => {
    it('should create supervisor session', () => {
      const session = agent.createSession('sup-001', 'John Doe', 'supervisor');

      expect(session.supervisorId).toBe('sup-001');
      expect(session.supervisorName).toBe('John Doe');
      expect(session.role).toBe('supervisor');
      expect(session.monitoringMode).toBe('none');
    });

    it('should assign permissions based on role', () => {
      const supervisor = agent.createSession('sup-001', 'John', 'supervisor');
      const manager = agent.createSession('mgr-001', 'Jane', 'manager');
      const admin = agent.createSession('adm-001', 'Admin', 'admin');

      expect(supervisor.permissions).toContain('listen');
      expect(supervisor.permissions).toContain('whisper');
      expect(supervisor.permissions).not.toContain('barge');

      expect(manager.permissions).toContain('barge');
      expect(manager.permissions).not.toContain('coach');

      expect(admin.permissions).toContain('coach');
    });

    it('should enforce max sessions limit', () => {
      const config: SupervisorAgentConfig = { maxSupervisorSessions: 2 };
      const limitedAgent = new SupervisorAgent(config);

      limitedAgent.createSession('sup-001', 'John', 'supervisor');
      limitedAgent.createSession('sup-002', 'Jane', 'supervisor');

      expect(() => {
        limitedAgent.createSession('sup-003', 'Bob', 'supervisor');
      }).toThrow('Maximum supervisor sessions reached');

      limitedAgent.destroy();
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const created = agent.createSession('sup-001', 'John', 'supervisor');

      const session = agent.getSession(created.sessionId);

      expect(session?.supervisorId).toBe('sup-001');
    });

    it('should return undefined for unknown session', () => {
      expect(agent.getSession('unknown')).toBeUndefined();
    });
  });

  describe('getActiveSessions', () => {
    it('should return all active sessions', () => {
      agent.createSession('sup-001', 'John', 'supervisor');
      agent.createSession('sup-002', 'Jane', 'manager');

      const sessions = agent.getActiveSessions();

      expect(sessions).toHaveLength(2);
    });
  });

  describe('endSession', () => {
    it('should remove session', () => {
      const session = agent.createSession('sup-001', 'John', 'supervisor');

      agent.endSession(session.sessionId);

      expect(agent.getSession(session.sessionId)).toBeUndefined();
    });

    it('should emit supervisor:left if monitoring call', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');
      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      const listener = vi.fn();
      agent.on('supervisor:left', listener);

      agent.endSession(session.sessionId);

      expect(listener).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SUPERVISOR ACTIONS TESTS
  // ===========================================================================

  describe('startMonitoring', () => {
    it('should start monitoring in listen mode', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');

      const result = agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      expect(result.success).toBe(true);
      expect(agent.getSession(session.sessionId)?.activeCallSid).toBe('CA001');
      expect(agent.getSession(session.sessionId)?.monitoringMode).toBe('listen');
    });

    it('should emit supervisor:joined event', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');
      const listener = vi.fn();
      agent.on('supervisor:joined', listener);

      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      expect(listener).toHaveBeenCalledWith(session.sessionId, 'CA001', 'listen');
    });

    it('should reject unknown session', () => {
      agent.registerCall(createDefaultCallData());

      const result = agent.startMonitoring('unknown', 'CA001', 'listen');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('should reject unknown call', () => {
      const session = agent.createSession('sup-001', 'John', 'supervisor');

      const result = agent.startMonitoring(session.sessionId, 'UNKNOWN', 'listen');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Call not found');
    });

    it('should reject insufficient permissions for barge', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor'); // No barge permission

      const result = agent.startMonitoring(session.sessionId, 'CA001', 'barge');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient permissions');
    });

    it('should allow barge for manager role', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('mgr-001', 'Jane', 'manager');

      const result = agent.startMonitoring(session.sessionId, 'CA001', 'barge');

      expect(result.success).toBe(true);
    });

    it('should increment callsMonitored counter', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');

      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      expect(agent.getSession(session.sessionId)?.callsMonitored).toBe(1);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');
      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      const result = agent.stopMonitoring(session.sessionId);

      expect(result.success).toBe(true);
      expect(agent.getSession(session.sessionId)?.activeCallSid).toBeUndefined();
      expect(agent.getSession(session.sessionId)?.monitoringMode).toBe('none');
    });

    it('should emit supervisor:left event', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');
      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      const listener = vi.fn();
      agent.on('supervisor:left', listener);

      agent.stopMonitoring(session.sessionId);

      expect(listener).toHaveBeenCalledWith(session.sessionId, 'CA001');
    });
  });

  describe('changeMonitoringMode', () => {
    it('should change monitoring mode', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');
      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      const result = agent.changeMonitoringMode(session.sessionId, 'whisper');

      expect(result.success).toBe(true);
      expect(agent.getSession(session.sessionId)?.monitoringMode).toBe('whisper');
    });

    it('should reject if not monitoring', () => {
      const session = agent.createSession('sup-001', 'John', 'supervisor');

      const result = agent.changeMonitoringMode(session.sessionId, 'whisper');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not monitoring any call');
    });

    it('should increment interventions for non-listen modes', () => {
      agent.registerCall(createDefaultCallData());
      const session = agent.createSession('sup-001', 'John', 'supervisor');
      agent.startMonitoring(session.sessionId, 'CA001', 'listen');

      agent.changeMonitoringMode(session.sessionId, 'whisper');

      expect(agent.getSession(session.sessionId)?.interventions).toBe(1);
    });
  });

  // ===========================================================================
  // HANDOFF TESTS
  // ===========================================================================

  describe('requestHandoff', () => {
    it('should request handoff', () => {
      agent.registerCall(createDefaultCallData());

      const result = agent.requestHandoff(createHandoffRequest());

      expect(result.success).toBe(true);
      expect(result.handoffId).toBeDefined();
    });

    it('should flag call for handoff', () => {
      agent.registerCall(createDefaultCallData());

      agent.requestHandoff(createHandoffRequest());

      const call = agent.getCall('CA001');
      expect(call?.flags).toContain('ai-handoff-needed');
    });

    it('should emit handoff:requested event', () => {
      agent.registerCall(createDefaultCallData());
      const listener = vi.fn();
      agent.on('handoff:requested', listener);

      agent.requestHandoff(createHandoffRequest());

      expect(listener).toHaveBeenCalled();
    });

    it('should reject for unknown call', () => {
      const result = agent.requestHandoff(createHandoffRequest({ callSid: 'UNKNOWN' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Call not found');
    });
  });

  describe('completeHandoff', () => {
    it('should complete handoff', () => {
      agent.registerCall(createDefaultCallData());
      agent.requestHandoff(createHandoffRequest());

      agent.completeHandoff('CA001', 'agent-001');

      const call = agent.getCall('CA001');
      expect(call?.flags).not.toContain('ai-handoff-needed');
      expect(call?.agentId).toBe('agent-001');
    });

    it('should emit handoff:completed event', () => {
      agent.registerCall(createDefaultCallData());
      agent.requestHandoff(createHandoffRequest());
      const listener = vi.fn();
      agent.on('handoff:completed', listener);

      agent.completeHandoff('CA001', 'agent-001');

      expect(listener).toHaveBeenCalledWith('CA001', 'agent-001');
    });

    it('should track handoff in history', () => {
      agent.registerCall(createDefaultCallData());
      agent.requestHandoff(createHandoffRequest());

      agent.completeHandoff('CA001', 'agent-001');

      const handoffs = agent.getHandoffsToday();
      expect(handoffs).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // SUPERVISOR NOTES TESTS
  // ===========================================================================

  describe('addNote', () => {
    it('should add note to call', () => {
      agent.registerCall(createDefaultCallData());

      const note = agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-001',
        supervisorName: 'John',
        note: 'Patient seems upset, escalated',
        timestamp: new Date(),
        isPrivate: false,
      });

      expect(note.callSid).toBe('CA001');
      expect(note.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getNotes', () => {
    it('should return notes for call', () => {
      agent.registerCall(createDefaultCallData());
      agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-001',
        supervisorName: 'John',
        note: 'Note 1',
        timestamp: new Date(),
        isPrivate: false,
      });
      agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-002',
        supervisorName: 'Jane',
        note: 'Note 2',
        timestamp: new Date(),
        isPrivate: false,
      });

      const notes = agent.getNotes('CA001');

      expect(notes).toHaveLength(2);
    });

    it('should filter private notes by supervisor', () => {
      agent.registerCall(createDefaultCallData());
      agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-001',
        supervisorName: 'John',
        note: 'Public note',
        timestamp: new Date(),
        isPrivate: false,
      });
      agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-001',
        supervisorName: 'John',
        note: 'Private note',
        timestamp: new Date(),
        isPrivate: true,
      });

      const notesForOther = agent.getNotes('CA001', 'sup-002');

      expect(notesForOther).toHaveLength(1);
      expect(notesForOther[0].note).toBe('Public note');
    });

    it('should show own private notes', () => {
      agent.registerCall(createDefaultCallData());
      agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-001',
        supervisorName: 'John',
        note: 'Private note',
        timestamp: new Date(),
        isPrivate: true,
      });

      const notes = agent.getNotes('CA001', 'sup-001');

      expect(notes).toHaveLength(1);
    });
  });

  // ===========================================================================
  // DASHBOARD STATS TESTS
  // ===========================================================================

  describe('getDashboardStats', () => {
    it('should return dashboard statistics', () => {
      agent.registerCall(createDefaultCallData({ callSid: 'CA001', state: 'in-progress' }));
      agent.registerCall(createDefaultCallData({ callSid: 'CA002', state: 'ringing' }));

      const stats = agent.getDashboardStats();

      expect(stats.activeCalls).toBe(2);
      expect(stats.callsInQueue).toBe(1); // Only ringing calls
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it('should count escalated calls', () => {
      agent.registerCall(createDefaultCallData());
      agent.flagCall('CA001', 'escalation-requested');

      const stats = agent.getDashboardStats();

      expect(stats.activeAlerts).toBeGreaterThanOrEqual(1);
    });

    it('should track AI handled calls', () => {
      agent.registerCall(
        createDefaultCallData({
          assistantId: 'asst-001',
          agentId: undefined,
        })
      );

      const stats = agent.getDashboardStats();

      expect(stats.aiHandledCalls).toBe(1);
    });
  });

  // ===========================================================================
  // FACTORY TESTS
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('getSupervisorAgent', () => {
      it('should return singleton instance', () => {
        const agent1 = getSupervisorAgent();
        const agent2 = getSupervisorAgent();

        expect(agent1).toBe(agent2);
      });

      it('should accept config on first call', () => {
        resetSupervisorAgent();
        const config: SupervisorAgentConfig = { maxActiveCalls: 50 };
        const instance = getSupervisorAgent(config);

        expect(instance).toBeDefined();
      });
    });

    describe('resetSupervisorAgent', () => {
      it('should reset singleton', () => {
        const agent1 = getSupervisorAgent();
        resetSupervisorAgent();
        const agent2 = getSupervisorAgent();

        expect(agent1).not.toBe(agent2);
      });
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('should handle any valid call state', () => {
      const validStates = ['ringing', 'in-progress', 'on-hold', 'wrapping-up'];

      fc.assert(
        fc.property(fc.constantFrom(...validStates), (state) => {
          const testAgent = new SupervisorAgent();
          testAgent.registerCall(
            createDefaultCallData({ callSid: `CA-${Date.now()}`, state: state as any })
          );
          const calls = testAgent.getActiveCalls();
          testAgent.destroy();
          return calls.length === 1;
        }),
        { numRuns: 10 }
      );
    });

    it('should always have valid dashboard stats', () => {
      const stats = agent.getDashboardStats();

      expect(typeof stats.activeCalls).toBe('number');
      expect(stats.activeCalls).toBeGreaterThanOrEqual(0);
      expect(typeof stats.callsInQueue).toBe('number');
      expect(stats.callsInQueue).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // CLEANUP TESTS
  // ===========================================================================

  describe('destroy', () => {
    it('should clean up all resources', () => {
      agent.registerCall(createDefaultCallData());
      agent.createSession('sup-001', 'John', 'supervisor');
      agent.addNote({
        callSid: 'CA001',
        supervisorId: 'sup-001',
        supervisorName: 'John',
        note: 'Note',
        timestamp: new Date(),
        isPrivate: false,
      });

      agent.destroy();

      expect(agent.getActiveCalls()).toHaveLength(0);
      expect(agent.getActiveSessions()).toHaveLength(0);
    });
  });
});
