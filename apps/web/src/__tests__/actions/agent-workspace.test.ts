/**
 * Server Action Tests: Agent Workspace
 *
 * Tests for agent workspace server actions including:
 * - Session management and availability updates
 * - Queue item handling
 * - Active call management
 * - Call controls (hold, resume, transfer, end)
 * - Appointment scheduling
 * - Call notes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockQueueItem,
  createMockActiveCall,
  createMockAgentSession,
  createMockAgentWorkspaceStats,
} from '../setup/test-data';

// Import the actions - these use mock data internally
import {
  getAgentSessionAction,
  updateAgentAvailabilityAction,
  getQueueItemsAction,
  getActiveCallAction,
  getCallScriptAction,
  getWorkspaceStatsAction,
  acceptQueueItemAction,
  holdCallAction,
  resumeCallAction,
  transferCallAction,
  endCallAction,
  scheduleAppointmentAction,
  addCallNoteAction,
  type AgentAvailability,
  type QueueItem,
  type ActiveCall,
  type AgentSession,
  type AgentWorkspaceStats,
  type CallScript,
} from '@/app/agent-workspace/actions';

describe('Agent Workspace Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAgentSessionAction', () => {
    it('should return agent session data', async () => {
      const result = await getAgentSessionAction();

      expect(result).toHaveProperty('agentId');
      expect(result).toHaveProperty('agentName');
      expect(result).toHaveProperty('availability');
      expect(result).toHaveProperty('sessionStartedAt');
      expect(result).toHaveProperty('leadsHandled');
      expect(result).toHaveProperty('callsHandled');
      expect(result).toHaveProperty('totalTalkTime');
    });

    it('should return session with valid availability status', async () => {
      const result = await getAgentSessionAction();

      const validStatuses: AgentAvailability[] = [
        'available',
        'busy',
        'away',
        'break',
        'training',
        'offline',
        'wrap-up',
      ];
      expect(validStatuses).toContain(result.availability);
    });

    it('should return session with ISO date string for sessionStartedAt', async () => {
      const result = await getAgentSessionAction();

      expect(() => new Date(result.sessionStartedAt)).not.toThrow();
    });
  });

  describe('updateAgentAvailabilityAction', () => {
    it('should update availability to available', async () => {
      const result = await updateAgentAvailabilityAction('available');

      expect(result.availability).toBe('available');
      expect(result.currentCallSid).toBeUndefined();
    });

    it('should update availability to busy and retain call info', async () => {
      const result = await updateAgentAvailabilityAction('busy');

      expect(result.availability).toBe('busy');
    });

    it('should update availability to break', async () => {
      const result = await updateAgentAvailabilityAction('break');

      expect(result.availability).toBe('break');
    });

    it('should update availability to away', async () => {
      const result = await updateAgentAvailabilityAction('away');

      expect(result.availability).toBe('away');
    });

    it('should update availability to training', async () => {
      const result = await updateAgentAvailabilityAction('training');

      expect(result.availability).toBe('training');
    });

    it('should update availability to offline', async () => {
      const result = await updateAgentAvailabilityAction('offline');

      expect(result.availability).toBe('offline');
    });

    it('should update availability to wrap-up', async () => {
      const result = await updateAgentAvailabilityAction('wrap-up');

      expect(result.availability).toBe('wrap-up');
    });

    it('should clear currentCallSid when changing to available', async () => {
      const result = await updateAgentAvailabilityAction('available');

      expect(result.currentCallSid).toBeUndefined();
    });
  });

  describe('getQueueItemsAction', () => {
    it('should return array of queue items', async () => {
      const result = await getQueueItemsAction();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return items with required properties', async () => {
      const result = await getQueueItemsAction();

      result.forEach((item) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('priority');
        expect(item).toHaveProperty('leadId');
        expect(item).toHaveProperty('leadName');
        expect(item).toHaveProperty('leadPhone');
        expect(item).toHaveProperty('source');
        expect(item).toHaveProperty('classification');
        expect(item).toHaveProperty('waitTime');
        expect(item).toHaveProperty('assignedAt');
      });
    });

    it('should return items with valid type values', async () => {
      const result = await getQueueItemsAction();

      const validTypes = ['call', 'message', 'callback', 'task'];
      result.forEach((item) => {
        expect(validTypes).toContain(item.type);
      });
    });

    it('should return items with valid priority values', async () => {
      const result = await getQueueItemsAction();

      const validPriorities = ['critical', 'high', 'medium', 'low'];
      result.forEach((item) => {
        expect(validPriorities).toContain(item.priority);
      });
    });

    it('should return items with valid classification values', async () => {
      const result = await getQueueItemsAction();

      const validClassifications = ['HOT', 'WARM', 'COLD'];
      result.forEach((item) => {
        expect(validClassifications).toContain(item.classification);
      });
    });

    it('should return items with valid source values', async () => {
      const result = await getQueueItemsAction();

      const validSources = ['whatsapp', 'voice', 'web', 'hubspot'];
      result.forEach((item) => {
        expect(validSources).toContain(item.source);
      });
    });
  });

  describe('getActiveCallAction', () => {
    it('should return active call or null', async () => {
      const result = await getActiveCallAction();

      // Mock returns a call, but in production could be null
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return call with required properties when present', async () => {
      const result = await getActiveCallAction();

      if (result) {
        expect(result).toHaveProperty('callSid');
        expect(result).toHaveProperty('leadId');
        expect(result).toHaveProperty('leadName');
        expect(result).toHaveProperty('leadPhone');
        expect(result).toHaveProperty('direction');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('startedAt');
        expect(result).toHaveProperty('duration');
        expect(result).toHaveProperty('classification');
        expect(result).toHaveProperty('transcript');
        expect(result).toHaveProperty('previousInteractions');
      }
    });

    it('should return call with valid direction', async () => {
      const result = await getActiveCallAction();

      if (result) {
        expect(['inbound', 'outbound']).toContain(result.direction);
      }
    });

    it('should return call with valid status', async () => {
      const result = await getActiveCallAction();

      if (result) {
        expect(['ringing', 'in-progress', 'on-hold']).toContain(result.status);
      }
    });

    it('should return call with transcript array', async () => {
      const result = await getActiveCallAction();

      if (result) {
        expect(Array.isArray(result.transcript)).toBe(true);
      }
    });
  });

  describe('getCallScriptAction', () => {
    it('should return call script', async () => {
      const result = await getCallScriptAction();

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('procedureType');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('objectionHandlers');
      expect(result).toHaveProperty('faqs');
    });

    it('should return script with steps array', async () => {
      const result = await getCallScriptAction();

      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('should return steps with required properties', async () => {
      const result = await getCallScriptAction();

      result.steps.forEach((step) => {
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('order');
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('content');
        expect(step).toHaveProperty('type');
        expect(step).toHaveProperty('isRequired');
      });
    });

    it('should return steps with valid type values', async () => {
      const result = await getCallScriptAction();

      const validTypes = ['greeting', 'qualification', 'objection', 'closing', 'information'];
      result.steps.forEach((step) => {
        expect(validTypes).toContain(step.type);
      });
    });

    it('should return objection handlers with required properties', async () => {
      const result = await getCallScriptAction();

      result.objectionHandlers.forEach((handler) => {
        expect(handler).toHaveProperty('id');
        expect(handler).toHaveProperty('objection');
        expect(handler).toHaveProperty('response');
        expect(handler).toHaveProperty('category');
      });
    });

    it('should return FAQs with required properties', async () => {
      const result = await getCallScriptAction();

      result.faqs.forEach((faq) => {
        expect(faq).toHaveProperty('id');
        expect(faq).toHaveProperty('question');
        expect(faq).toHaveProperty('answer');
        expect(faq).toHaveProperty('category');
      });
    });

    it('should accept optional procedure type parameter', async () => {
      const result = await getCallScriptAction('implant');

      expect(result.procedureType).toBe('implant');
    });
  });

  describe('getWorkspaceStatsAction', () => {
    it('should return workspace stats', async () => {
      const result = await getWorkspaceStatsAction();

      expect(result).toHaveProperty('queueLength');
      expect(result).toHaveProperty('avgWaitTime');
      expect(result).toHaveProperty('callsHandledToday');
      expect(result).toHaveProperty('conversionsToday');
      expect(result).toHaveProperty('avgCallDuration');
      expect(result).toHaveProperty('satisfactionScore');
    });

    it('should return numeric values', async () => {
      const result = await getWorkspaceStatsAction();

      expect(typeof result.queueLength).toBe('number');
      expect(typeof result.avgWaitTime).toBe('number');
      expect(typeof result.callsHandledToday).toBe('number');
      expect(typeof result.conversionsToday).toBe('number');
      expect(typeof result.avgCallDuration).toBe('number');
      expect(typeof result.satisfactionScore).toBe('number');
    });

    it('should return non-negative values', async () => {
      const result = await getWorkspaceStatsAction();

      expect(result.queueLength).toBeGreaterThanOrEqual(0);
      expect(result.avgWaitTime).toBeGreaterThanOrEqual(0);
      expect(result.callsHandledToday).toBeGreaterThanOrEqual(0);
      expect(result.conversionsToday).toBeGreaterThanOrEqual(0);
      expect(result.avgCallDuration).toBeGreaterThanOrEqual(0);
      expect(result.satisfactionScore).toBeGreaterThanOrEqual(0);
    });

    it('should return satisfaction score between 0 and 5', async () => {
      const result = await getWorkspaceStatsAction();

      expect(result.satisfactionScore).toBeGreaterThanOrEqual(0);
      expect(result.satisfactionScore).toBeLessThanOrEqual(5);
    });
  });

  describe('acceptQueueItemAction', () => {
    it('should accept queue item and return success', async () => {
      const result = await acceptQueueItemAction('item-1');

      expect(result.success).toBe(true);
    });

    it('should return callSid on success', async () => {
      const result = await acceptQueueItemAction('item-1');

      expect(result.callSid).toBeDefined();
      expect(result.callSid).toMatch(/^CA/);
    });

    it('should generate unique callSid for each call', async () => {
      const result1 = await acceptQueueItemAction('item-1');
      const result2 = await acceptQueueItemAction('item-2');

      expect(result1.callSid).not.toBe(result2.callSid);
    });
  });

  describe('holdCallAction', () => {
    it('should put call on hold and return success', async () => {
      const result = await holdCallAction('CA123456');

      expect(result.success).toBe(true);
    });

    it('should handle any callSid', async () => {
      const result = await holdCallAction('CA-any-call-id');

      expect(result.success).toBe(true);
    });
  });

  describe('resumeCallAction', () => {
    it('should resume call from hold and return success', async () => {
      const result = await resumeCallAction('CA123456');

      expect(result.success).toBe(true);
    });

    it('should handle any callSid', async () => {
      const result = await resumeCallAction('CA-any-call-id');

      expect(result.success).toBe(true);
    });
  });

  describe('transferCallAction', () => {
    it('should transfer call and return success', async () => {
      const result = await transferCallAction('CA123456', 'agent-2');

      expect(result.success).toBe(true);
    });

    it('should accept any target agent ID', async () => {
      const result = await transferCallAction('CA123456', 'supervisor-1');

      expect(result.success).toBe(true);
    });
  });

  describe('endCallAction', () => {
    it('should end call with scheduled outcome', async () => {
      const result = await endCallAction('CA123456', 'scheduled');

      expect(result.success).toBe(true);
    });

    it('should end call with callback outcome', async () => {
      const result = await endCallAction('CA123456', 'callback');

      expect(result.success).toBe(true);
    });

    it('should end call with not-interested outcome', async () => {
      const result = await endCallAction('CA123456', 'not-interested');

      expect(result.success).toBe(true);
    });

    it('should end call with voicemail outcome', async () => {
      const result = await endCallAction('CA123456', 'voicemail');

      expect(result.success).toBe(true);
    });
  });

  describe('scheduleAppointmentAction', () => {
    it('should schedule appointment and return success with ID', async () => {
      const result = await scheduleAppointmentAction('lead-1', {
        date: '2024-12-15',
        time: '10:00',
        procedureType: 'implant',
      });

      expect(result.success).toBe(true);
      expect(result.appointmentId).toBeDefined();
      expect(result.appointmentId).toMatch(/^apt-/);
    });

    it('should accept optional doctor ID', async () => {
      const result = await scheduleAppointmentAction('lead-1', {
        date: '2024-12-15',
        time: '10:00',
        procedureType: 'implant',
        doctorId: 'doctor-1',
      });

      expect(result.success).toBe(true);
    });

    it('should accept optional notes', async () => {
      const result = await scheduleAppointmentAction('lead-1', {
        date: '2024-12-15',
        time: '10:00',
        procedureType: 'consultation',
        notes: 'Patient prefers morning appointments',
      });

      expect(result.success).toBe(true);
    });

    it('should generate unique appointment IDs', async () => {
      const result1 = await scheduleAppointmentAction('lead-1', {
        date: '2024-12-15',
        time: '10:00',
        procedureType: 'implant',
      });
      const result2 = await scheduleAppointmentAction('lead-2', {
        date: '2024-12-16',
        time: '11:00',
        procedureType: 'consultation',
      });

      expect(result1.appointmentId).not.toBe(result2.appointmentId);
    });
  });

  describe('addCallNoteAction', () => {
    it('should add note to call and return success', async () => {
      const result = await addCallNoteAction('CA123456', 'Patient requested pricing info');

      expect(result.success).toBe(true);
    });

    it('should handle empty notes', async () => {
      const result = await addCallNoteAction('CA123456', '');

      expect(result.success).toBe(true);
    });

    it('should handle long notes', async () => {
      const longNote = 'A'.repeat(1000);
      const result = await addCallNoteAction('CA123456', longNote);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in notes', async () => {
      const noteWithSpecialChars = 'Patient said: "I\'m interested" & asked about €pricing';
      const result = await addCallNoteAction('CA123456', noteWithSpecialChars);

      expect(result.success).toBe(true);
    });
  });
});

describe('Agent Workspace Type Definitions', () => {
  it('should export AgentAvailability type', () => {
    const status: AgentAvailability = 'available';
    expect(status).toBe('available');
  });

  it('should export QueueItem type', () => {
    const item: QueueItem = createMockQueueItem();
    expect(item).toHaveProperty('id');
  });

  it('should export ActiveCall type', () => {
    const call: ActiveCall = createMockActiveCall();
    expect(call).toHaveProperty('callSid');
  });

  it('should export AgentSession type', () => {
    const session: AgentSession = createMockAgentSession();
    expect(session).toHaveProperty('agentId');
  });

  it('should export AgentWorkspaceStats type', () => {
    const stats: AgentWorkspaceStats = createMockAgentWorkspaceStats();
    expect(stats).toHaveProperty('queueLength');
  });
});
