/**
 * Supervisor Agent Tests
 * W3 Milestone: Voice AI + Realtime Supervisor
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SupervisorAgent,
  getSupervisorAgent,
  resetSupervisorAgent,
} from '../voice/supervisor-agent.js';
import type { MonitoredCall } from '@medicalcor/types';

describe('SupervisorAgent', () => {
  let agent: SupervisorAgent;

  beforeEach(() => {
    resetSupervisorAgent();
    agent = new SupervisorAgent({
      maxActiveCalls: 10,
      maxSupervisorSessions: 5,
      alertThresholds: {
        longHoldSeconds: 60,
        silenceSeconds: 20,
        negativeSentimentThreshold: -0.5,
      },
      autoEscalation: {
        enabled: true,
        negativeMessageThreshold: 3,
        escalationKeywords: ['manager', 'supervisor', 'complaint'],
      },
    });
  });

  afterEach(() => {
    agent.destroy();
  });

  describe('Call Lifecycle', () => {
    it('should register a new call', () => {
      const callData = {
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'ringing' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      };

      const call = agent.registerCall(callData);

      expect(call.callSid).toBe('CA123');
      expect(call.recentTranscript).toEqual([]);
      expect(call.flags).toEqual([]);
    });

    it('should emit call:started event when registering call', () => {
      const startedHandler = vi.fn();
      agent.on('call:started', startedHandler);

      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'ringing' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      expect(startedHandler).toHaveBeenCalledTimes(1);
      expect(startedHandler).toHaveBeenCalledWith(expect.objectContaining({ callSid: 'CA123' }));
    });

    it('should update a call', () => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'ringing' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      const updatedCall = agent.updateCall('CA123', {
        state: 'in-progress',
        duration: 30,
      });

      expect(updatedCall?.state).toBe('in-progress');
      expect(updatedCall?.duration).toBe(30);
    });

    it('should emit call:updated event', () => {
      const updatedHandler = vi.fn();
      agent.on('call:updated', updatedHandler);

      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'ringing' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      agent.updateCall('CA123', { state: 'in-progress' });

      expect(updatedHandler).toHaveBeenCalledWith('CA123', { state: 'in-progress' });
    });

    it('should end a call', () => {
      const endedHandler = vi.fn();
      agent.on('call:ended', endedHandler);

      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'ringing' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      agent.endCall('CA123', 'completed');

      expect(endedHandler).toHaveBeenCalledWith('CA123', 'completed');
      expect(agent.getCall('CA123')).toBeUndefined();
    });

    it('should get active calls', () => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      agent.registerCall({
        callSid: 'CA456',
        customerPhone: '+40987654321',
        state: 'in-progress' as const,
        direction: 'outbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      const calls = agent.getActiveCalls();
      expect(calls).toHaveLength(2);
    });
  });

  describe('Transcript Processing', () => {
    beforeEach(() => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });
    });

    it('should add transcript message', () => {
      const transcriptHandler = vi.fn();
      agent.on('transcript:message', transcriptHandler);

      agent.processTranscriptMessage('CA123', 'customer', 'Hello, I need help');

      expect(transcriptHandler).toHaveBeenCalledWith('CA123', 'customer', 'Hello, I need help');

      const call = agent.getCall('CA123');
      expect(call?.recentTranscript).toHaveLength(1);
      expect(call?.recentTranscript[0].text).toBe('Hello, I need help');
    });

    it('should detect escalation keywords', () => {
      const escalationHandler = vi.fn();
      agent.on('alert:escalation', escalationHandler);

      agent.processTranscriptMessage('CA123', 'customer', 'I want to speak to a manager!');

      expect(escalationHandler).toHaveBeenCalled();

      const call = agent.getCall('CA123');
      expect(call?.flags).toContain('escalation-requested');
    });

    it('should keep only last 20 transcript messages', () => {
      for (let i = 0; i < 25; i++) {
        agent.processTranscriptMessage('CA123', 'customer', `Message ${i}`);
      }

      const call = agent.getCall('CA123');
      expect(call?.recentTranscript).toHaveLength(20);
      expect(call?.recentTranscript[0].text).toBe('Message 5');
    });
  });

  describe('Call Flags', () => {
    beforeEach(() => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });
    });

    it('should flag a call', () => {
      agent.flagCall('CA123', 'high-value-lead');

      const call = agent.getCall('CA123');
      expect(call?.flags).toContain('high-value-lead');
    });

    it('should not duplicate flags', () => {
      agent.flagCall('CA123', 'high-value-lead');
      agent.flagCall('CA123', 'high-value-lead');

      const call = agent.getCall('CA123');
      expect(call?.flags.filter((f) => f === 'high-value-lead')).toHaveLength(1);
    });

    it('should unflag a call', () => {
      agent.flagCall('CA123', 'high-value-lead');
      agent.unflagCall('CA123', 'high-value-lead');

      const call = agent.getCall('CA123');
      expect(call?.flags).not.toContain('high-value-lead');
    });

    it('should get calls by flag', () => {
      agent.registerCall({
        callSid: 'CA456',
        customerPhone: '+40987654321',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      agent.flagCall('CA123', 'escalation-requested');
      agent.flagCall('CA456', 'high-value-lead');

      const escalationCalls = agent.getCallsByFlag('escalation-requested');
      expect(escalationCalls).toHaveLength(1);
      expect(escalationCalls[0].callSid).toBe('CA123');
    });
  });

  describe('Supervisor Sessions', () => {
    it('should create a supervisor session', () => {
      const session = agent.createSession('sup123', 'John Smith', 'supervisor');

      expect(session.supervisorId).toBe('sup123');
      expect(session.supervisorName).toBe('John Smith');
      expect(session.role).toBe('supervisor');
      expect(session.permissions).toContain('listen');
      expect(session.permissions).toContain('whisper');
      expect(session.permissions).not.toContain('barge');
    });

    it('should create manager session with barge permission', () => {
      const session = agent.createSession('mgr123', 'Jane Doe', 'manager');

      expect(session.permissions).toContain('barge');
    });

    it('should create admin session with all permissions', () => {
      const session = agent.createSession('admin123', 'Admin User', 'admin');

      expect(session.permissions).toContain('listen');
      expect(session.permissions).toContain('whisper');
      expect(session.permissions).toContain('barge');
      expect(session.permissions).toContain('coach');
    });

    it('should get session', () => {
      const created = agent.createSession('sup123', 'John Smith', 'supervisor');
      const retrieved = agent.getSession(created.sessionId);

      expect(retrieved).toEqual(created);
    });

    it('should end session', () => {
      const session = agent.createSession('sup123', 'John Smith', 'supervisor');
      agent.endSession(session.sessionId);

      expect(agent.getSession(session.sessionId)).toBeUndefined();
    });

    it('should throw when max sessions reached', () => {
      // Create max sessions
      for (let i = 0; i < 5; i++) {
        agent.createSession(`sup${i}`, `Supervisor ${i}`, 'supervisor');
      }

      expect(() => {
        agent.createSession('sup_extra', 'Extra Supervisor', 'supervisor');
      }).toThrow('Maximum supervisor sessions reached');
    });
  });

  describe('Call Monitoring', () => {
    let session: ReturnType<typeof agent.createSession>;

    beforeEach(() => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      session = agent.createSession('sup123', 'John Smith', 'supervisor');
    });

    it('should start monitoring in listen mode', () => {
      const joinedHandler = vi.fn();
      agent.on('supervisor:joined', joinedHandler);

      const result = agent.startMonitoring(session.sessionId, 'CA123', 'listen');

      expect(result.success).toBe(true);
      expect(joinedHandler).toHaveBeenCalledWith(session.sessionId, 'CA123', 'listen');

      const updatedSession = agent.getSession(session.sessionId);
      expect(updatedSession?.activeCallSid).toBe('CA123');
      expect(updatedSession?.monitoringMode).toBe('listen');
    });

    it('should reject barge for supervisor role', () => {
      const result = agent.startMonitoring(session.sessionId, 'CA123', 'barge');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient permissions');
    });

    it('should allow barge for manager role', () => {
      const managerSession = agent.createSession('mgr123', 'Manager', 'manager');
      const result = agent.startMonitoring(managerSession.sessionId, 'CA123', 'barge');

      expect(result.success).toBe(true);
    });

    it('should stop monitoring', () => {
      const leftHandler = vi.fn();
      agent.on('supervisor:left', leftHandler);

      agent.startMonitoring(session.sessionId, 'CA123', 'listen');
      const result = agent.stopMonitoring(session.sessionId);

      expect(result.success).toBe(true);
      expect(leftHandler).toHaveBeenCalledWith(session.sessionId, 'CA123');

      const updatedSession = agent.getSession(session.sessionId);
      expect(updatedSession?.activeCallSid).toBeUndefined();
      expect(updatedSession?.monitoringMode).toBe('none');
    });

    it('should change monitoring mode', () => {
      agent.startMonitoring(session.sessionId, 'CA123', 'listen');
      const result = agent.changeMonitoringMode(session.sessionId, 'whisper');

      expect(result.success).toBe(true);

      const updatedSession = agent.getSession(session.sessionId);
      expect(updatedSession?.monitoringMode).toBe('whisper');
      expect(updatedSession?.interventions).toBe(1);
    });

    it('should return error when call not found', () => {
      const result = agent.startMonitoring(session.sessionId, 'CA_NONEXISTENT', 'listen');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Call not found');
    });
  });

  describe('AI-to-Human Handoff', () => {
    beforeEach(() => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        vapiCallId: 'vapi_123',
        assistantId: 'asst_123',
      });
    });

    it('should request handoff', () => {
      const handoffHandler = vi.fn();
      agent.on('handoff:requested', handoffHandler);

      const result = agent.requestHandoff({
        callSid: 'CA123',
        vapiCallId: 'vapi_123',
        reason: 'customer-request',
        notes: 'Customer wants to speak to a human',
      });

      expect(result.success).toBe(true);
      expect(result.handoffId).toBeDefined();
      expect(handoffHandler).toHaveBeenCalled();

      const call = agent.getCall('CA123');
      expect(call?.flags).toContain('ai-handoff-needed');
    });

    it('should complete handoff', () => {
      const completedHandler = vi.fn();
      agent.on('handoff:completed', completedHandler);

      agent.requestHandoff({
        callSid: 'CA123',
        vapiCallId: 'vapi_123',
        reason: 'customer-request',
      });

      agent.completeHandoff('CA123', 'agent_456');

      expect(completedHandler).toHaveBeenCalledWith('CA123', 'agent_456');

      const call = agent.getCall('CA123');
      expect(call?.flags).not.toContain('ai-handoff-needed');
      expect(call?.agentId).toBe('agent_456');
    });

    it('should return error for non-existent call', () => {
      const result = agent.requestHandoff({
        callSid: 'CA_NONEXISTENT',
        vapiCallId: 'vapi_123',
        reason: 'customer-request',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Call not found');
    });
  });

  describe('Supervisor Notes', () => {
    beforeEach(() => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });
    });

    it('should add a note', () => {
      const note = agent.addNote({
        callSid: 'CA123',
        supervisorId: 'sup123',
        note: 'Customer seems frustrated',
        isPrivate: false,
      });

      expect(note.note).toBe('Customer seems frustrated');
      expect(note.timestamp).toBeDefined();
    });

    it('should get notes for a call', () => {
      agent.addNote({
        callSid: 'CA123',
        supervisorId: 'sup123',
        note: 'Note 1',
        isPrivate: false,
      });

      agent.addNote({
        callSid: 'CA123',
        supervisorId: 'sup456',
        note: 'Private note',
        isPrivate: true,
      });

      const notes = agent.getNotes('CA123');
      expect(notes).toHaveLength(2);
    });

    it('should filter private notes', () => {
      agent.addNote({
        callSid: 'CA123',
        supervisorId: 'sup123',
        note: 'Public note',
        isPrivate: false,
      });

      agent.addNote({
        callSid: 'CA123',
        supervisorId: 'sup456',
        note: 'Private note by sup456',
        isPrivate: true,
      });

      // sup123 should see their own notes and public notes
      const notesForSup123 = agent.getNotes('CA123', 'sup123');
      expect(notesForSup123).toHaveLength(1);
      expect(notesForSup123[0].note).toBe('Public note');

      // sup456 should see their own private note
      const notesForSup456 = agent.getNotes('CA123', 'sup456');
      expect(notesForSup456).toHaveLength(2);
    });
  });

  describe('Dashboard Stats', () => {
    it('should calculate dashboard stats', () => {
      // Add some calls
      agent.registerCall({
        callSid: 'CA1',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        assistantId: 'asst_1',
      });

      agent.registerCall({
        callSid: 'CA2',
        customerPhone: '+40987654321',
        state: 'ringing' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      agent.flagCall('CA1', 'escalation-requested');

      const stats = agent.getDashboardStats();

      expect(stats.activeCalls).toBe(2);
      expect(stats.callsInQueue).toBe(1); // ringing calls
      expect(stats.aiHandledCalls).toBe(1); // has assistantId but no agentId
      expect(stats.activeAlerts).toBeGreaterThan(0);
    });
  });

  describe('Singleton Pattern', () => {
    afterEach(() => {
      resetSupervisorAgent();
    });

    it('should return same instance', () => {
      const agent1 = getSupervisorAgent();
      const agent2 = getSupervisorAgent();

      expect(agent1).toBe(agent2);
    });

    it('should reset instance', () => {
      const agent1 = getSupervisorAgent();
      agent1.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });

      resetSupervisorAgent();

      const agent2 = getSupervisorAgent();
      expect(agent2.getActiveCalls()).toHaveLength(0);
    });
  });

  describe('Sentiment Updates', () => {
    beforeEach(() => {
      agent.registerCall({
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
      });
    });

    it('should update sentiment', () => {
      agent.updateSentiment('CA123', 'negative', -0.8);

      const call = agent.getCall('CA123');
      expect(call?.sentiment).toBe('negative');
    });

    it('should emit alert for very negative sentiment', () => {
      const alertHandler = vi.fn();
      agent.on('alert:negative-sentiment', alertHandler);

      agent.updateSentiment('CA123', 'negative', -0.8);

      expect(alertHandler).toHaveBeenCalledWith('CA123', -0.8);
    });
  });
});
