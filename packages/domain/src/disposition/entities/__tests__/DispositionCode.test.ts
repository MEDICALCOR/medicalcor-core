/**
 * @fileoverview Tests for Disposition Code Entities
 *
 * Tests for call disposition creation, outcome mapping, and standard codes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCallDisposition,
  mapCallOutcomeToDisposition,
  STANDARD_DISPOSITION_CODES,
  type DispositionCode,
  type CallDisposition,
  type CreateCallDispositionInput,
  type DispositionCategory,
  type CallDirection,
  type HandlerType,
  type StandardDispositionCode,
} from '../DispositionCode.js';

describe('DispositionCode', () => {
  const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
  const mockTimestamp = new Date('2024-01-15T10:30:00.000Z');

  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue(mockUUID) });
    vi.useFakeTimers();
    vi.setSystemTime(mockTimestamp);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('STANDARD_DISPOSITION_CODES', () => {
    describe('Connected - Positive outcomes', () => {
      it('should have SOLD code', () => {
        expect(STANDARD_DISPOSITION_CODES.SOLD).toBe('SOLD');
      });

      it('should have APPT_SCHEDULED code', () => {
        expect(STANDARD_DISPOSITION_CODES.APPT_SCHEDULED).toBe('APPT_SCHEDULED');
      });

      it('should have INTERESTED code', () => {
        expect(STANDARD_DISPOSITION_CODES.INTERESTED).toBe('INTERESTED');
      });

      it('should have INFO_SENT code', () => {
        expect(STANDARD_DISPOSITION_CODES.INFO_SENT).toBe('INFO_SENT');
      });
    });

    describe('Connected - Neutral outcomes', () => {
      it('should have CALLBACK_REQUESTED code', () => {
        expect(STANDARD_DISPOSITION_CODES.CALLBACK_REQUESTED).toBe('CALLBACK_REQUESTED');
      });

      it('should have DECISION_PENDING code', () => {
        expect(STANDARD_DISPOSITION_CODES.DECISION_PENDING).toBe('DECISION_PENDING');
      });

      it('should have PRICE_OBJECTION code', () => {
        expect(STANDARD_DISPOSITION_CODES.PRICE_OBJECTION).toBe('PRICE_OBJECTION');
      });
    });

    describe('Connected - Negative outcomes', () => {
      it('should have NOT_INTERESTED code', () => {
        expect(STANDARD_DISPOSITION_CODES.NOT_INTERESTED).toBe('NOT_INTERESTED');
      });

      it('should have COMPETITOR code', () => {
        expect(STANDARD_DISPOSITION_CODES.COMPETITOR).toBe('COMPETITOR');
      });

      it('should have NOT_QUALIFIED code', () => {
        expect(STANDARD_DISPOSITION_CODES.NOT_QUALIFIED).toBe('NOT_QUALIFIED');
      });

      it('should have DO_NOT_CALL code', () => {
        expect(STANDARD_DISPOSITION_CODES.DO_NOT_CALL).toBe('DO_NOT_CALL');
      });
    });

    describe('Not Connected outcomes', () => {
      it('should have NO_ANSWER code', () => {
        expect(STANDARD_DISPOSITION_CODES.NO_ANSWER).toBe('NO_ANSWER');
      });

      it('should have BUSY code', () => {
        expect(STANDARD_DISPOSITION_CODES.BUSY).toBe('BUSY');
      });

      it('should have VOICEMAIL code', () => {
        expect(STANDARD_DISPOSITION_CODES.VOICEMAIL).toBe('VOICEMAIL');
      });

      it('should have WRONG_NUMBER code', () => {
        expect(STANDARD_DISPOSITION_CODES.WRONG_NUMBER).toBe('WRONG_NUMBER');
      });

      it('should have DISCONNECTED code', () => {
        expect(STANDARD_DISPOSITION_CODES.DISCONNECTED).toBe('DISCONNECTED');
      });

      it('should have INVALID_NUMBER code', () => {
        expect(STANDARD_DISPOSITION_CODES.INVALID_NUMBER).toBe('INVALID_NUMBER');
      });
    });

    describe('Technical/Other outcomes', () => {
      it('should have TRANSFERRED code', () => {
        expect(STANDARD_DISPOSITION_CODES.TRANSFERRED).toBe('TRANSFERRED');
      });

      it('should have CALL_FAILED code', () => {
        expect(STANDARD_DISPOSITION_CODES.CALL_FAILED).toBe('CALL_FAILED');
      });

      it('should have ABANDONED code', () => {
        expect(STANDARD_DISPOSITION_CODES.ABANDONED).toBe('ABANDONED');
      });
    });
  });

  describe('createCallDisposition', () => {
    const baseInput: CreateCallDispositionInput = {
      callSid: 'CA123456',
      clinicId: 'clinic-001',
      dispositionCodeId: 'disp-001',
      handledByType: 'human',
    };

    it('should create a call disposition with required fields', () => {
      const disposition = createCallDisposition(baseInput);

      expect(disposition.id).toBe(mockUUID);
      expect(disposition.callSid).toBe('CA123456');
      expect(disposition.clinicId).toBe('clinic-001');
      expect(disposition.dispositionCodeId).toBe('disp-001');
      expect(disposition.handledByType).toBe('human');
      expect(disposition.createdAt).toEqual(mockTimestamp);
      expect(disposition.setAt).toEqual(mockTimestamp);
    });

    it('should set null for optional fields when not provided', () => {
      const disposition = createCallDisposition(baseInput);

      expect(disposition.leadId).toBeNull();
      expect(disposition.subDisposition).toBeNull();
      expect(disposition.reason).toBeNull();
      expect(disposition.notes).toBeNull();
      expect(disposition.callDurationSeconds).toBeNull();
      expect(disposition.callDirection).toBeNull();
      expect(disposition.callType).toBeNull();
      expect(disposition.agentId).toBeNull();
      expect(disposition.assistantId).toBeNull();
      expect(disposition.detectedIntent).toBeNull();
      expect(disposition.intentConfidence).toBeNull();
      expect(disposition.followUpDate).toBeNull();
      expect(disposition.followUpNotes).toBeNull();
      expect(disposition.setBy).toBeNull();
    });

    it('should default objectionsHandled to empty array', () => {
      const disposition = createCallDisposition(baseInput);

      expect(disposition.objectionsHandled).toEqual([]);
    });

    it('should default metadata to empty object', () => {
      const disposition = createCallDisposition(baseInput);

      expect(disposition.metadata).toEqual({});
    });

    it('should set followUpScheduled to false when no followUpDate', () => {
      const disposition = createCallDisposition(baseInput);

      expect(disposition.followUpScheduled).toBe(false);
    });

    it('should set followUpScheduled to true when followUpDate provided', () => {
      const followUpDate = new Date('2024-01-20T10:00:00.000Z');
      const disposition = createCallDisposition({
        ...baseInput,
        followUpDate,
      });

      expect(disposition.followUpScheduled).toBe(true);
      expect(disposition.followUpDate).toEqual(followUpDate);
    });

    it('should accept all optional fields', () => {
      const fullInput: CreateCallDispositionInput = {
        ...baseInput,
        leadId: 'lead-001',
        subDisposition: 'sub-001',
        reason: 'Customer interested in premium package',
        notes: 'Follow up next week',
        callDurationSeconds: 180,
        callDirection: 'outbound',
        callType: 'sales',
        agentId: 'agent-001',
        assistantId: 'assistant-001',
        objectionsHandled: [{ code: 'PRICE', resolution: 'Offered discount', overcome: true }],
        detectedIntent: 'purchase',
        intentConfidence: 0.85,
        followUpDate: new Date('2024-01-20T10:00:00.000Z'),
        followUpNotes: 'Call about premium package',
        setBy: 'user-001',
        metadata: { source: 'crm', campaign: 'winter2024' },
      };

      const disposition = createCallDisposition(fullInput);

      expect(disposition.leadId).toBe('lead-001');
      expect(disposition.subDisposition).toBe('sub-001');
      expect(disposition.reason).toBe('Customer interested in premium package');
      expect(disposition.notes).toBe('Follow up next week');
      expect(disposition.callDurationSeconds).toBe(180);
      expect(disposition.callDirection).toBe('outbound');
      expect(disposition.callType).toBe('sales');
      expect(disposition.agentId).toBe('agent-001');
      expect(disposition.assistantId).toBe('assistant-001');
      expect(disposition.objectionsHandled).toHaveLength(1);
      expect(disposition.objectionsHandled[0].code).toBe('PRICE');
      expect(disposition.detectedIntent).toBe('purchase');
      expect(disposition.intentConfidence).toBe(0.85);
      expect(disposition.followUpScheduled).toBe(true);
      expect(disposition.followUpNotes).toBe('Call about premium package');
      expect(disposition.setBy).toBe('user-001');
      expect(disposition.metadata).toEqual({ source: 'crm', campaign: 'winter2024' });
    });

    describe('handler types', () => {
      it('should accept ai handler type', () => {
        const disposition = createCallDisposition({
          ...baseInput,
          handledByType: 'ai',
          assistantId: 'ai-001',
        });

        expect(disposition.handledByType).toBe('ai');
        expect(disposition.assistantId).toBe('ai-001');
      });

      it('should accept human handler type', () => {
        const disposition = createCallDisposition({
          ...baseInput,
          handledByType: 'human',
          agentId: 'agent-001',
        });

        expect(disposition.handledByType).toBe('human');
        expect(disposition.agentId).toBe('agent-001');
      });

      it('should accept hybrid handler type', () => {
        const disposition = createCallDisposition({
          ...baseInput,
          handledByType: 'hybrid',
          agentId: 'agent-001',
          assistantId: 'ai-001',
        });

        expect(disposition.handledByType).toBe('hybrid');
        expect(disposition.agentId).toBe('agent-001');
        expect(disposition.assistantId).toBe('ai-001');
      });
    });

    describe('call direction', () => {
      it('should accept inbound direction', () => {
        const disposition = createCallDisposition({
          ...baseInput,
          callDirection: 'inbound',
        });

        expect(disposition.callDirection).toBe('inbound');
      });

      it('should accept outbound direction', () => {
        const disposition = createCallDisposition({
          ...baseInput,
          callDirection: 'outbound',
        });

        expect(disposition.callDirection).toBe('outbound');
      });
    });

    describe('objections handled', () => {
      it('should accept multiple objections', () => {
        const objections = [
          { code: 'PRICE', resolution: 'Offered payment plan', overcome: true },
          { code: 'TIMING', resolution: 'Suggested later date', overcome: false },
          { code: 'TRUST', resolution: 'Provided testimonials', overcome: true },
        ];

        const disposition = createCallDisposition({
          ...baseInput,
          objectionsHandled: objections,
        });

        expect(disposition.objectionsHandled).toHaveLength(3);
        expect(disposition.objectionsHandled[0].overcome).toBe(true);
        expect(disposition.objectionsHandled[1].overcome).toBe(false);
        expect(disposition.objectionsHandled[2].code).toBe('TRUST');
      });

      it('should accept objection with null resolution', () => {
        const disposition = createCallDisposition({
          ...baseInput,
          objectionsHandled: [{ code: 'UNKNOWN', resolution: null, overcome: false }],
        });

        expect(disposition.objectionsHandled[0].resolution).toBeNull();
      });
    });
  });

  describe('mapCallOutcomeToDisposition', () => {
    it('should map completed to SOLD', () => {
      expect(mapCallOutcomeToDisposition('completed')).toBe('SOLD');
    });

    it('should map transferred to TRANSFERRED', () => {
      expect(mapCallOutcomeToDisposition('transferred')).toBe('TRANSFERRED');
    });

    it('should map abandoned to ABANDONED', () => {
      expect(mapCallOutcomeToDisposition('abandoned')).toBe('ABANDONED');
    });

    it('should map failed to CALL_FAILED', () => {
      expect(mapCallOutcomeToDisposition('failed')).toBe('CALL_FAILED');
    });

    it('should map voicemail to VOICEMAIL', () => {
      expect(mapCallOutcomeToDisposition('voicemail')).toBe('VOICEMAIL');
    });

    it('should handle all outcomes exhaustively', () => {
      const outcomes = ['completed', 'transferred', 'abandoned', 'failed', 'voicemail'] as const;

      outcomes.forEach((outcome) => {
        const result = mapCallOutcomeToDisposition(outcome);
        expect(typeof result).toBe('string');
        expect(Object.values(STANDARD_DISPOSITION_CODES)).toContain(result);
      });
    });
  });

  describe('Type definitions', () => {
    describe('DispositionCategory', () => {
      it('should support all category types', () => {
        const categories: DispositionCategory[] = [
          'connected',
          'not_connected',
          'follow_up',
          'completed',
          'disqualified',
        ];

        expect(categories).toHaveLength(5);
      });
    });

    describe('CallDirection', () => {
      it('should support inbound and outbound', () => {
        const directions: CallDirection[] = ['inbound', 'outbound'];
        expect(directions).toHaveLength(2);
      });
    });

    describe('HandlerType', () => {
      it('should support ai, human, and hybrid', () => {
        const handlers: HandlerType[] = ['ai', 'human', 'hybrid'];
        expect(handlers).toHaveLength(3);
      });
    });

    describe('StandardDispositionCode', () => {
      it('should include all standard codes', () => {
        const codes: StandardDispositionCode[] = [
          'SOLD',
          'APPT_SCHEDULED',
          'INTERESTED',
          'INFO_SENT',
          'CALLBACK_REQUESTED',
          'DECISION_PENDING',
          'PRICE_OBJECTION',
          'NOT_INTERESTED',
          'COMPETITOR',
          'NOT_QUALIFIED',
          'DO_NOT_CALL',
          'NO_ANSWER',
          'BUSY',
          'VOICEMAIL',
          'WRONG_NUMBER',
          'DISCONNECTED',
          'INVALID_NUMBER',
          'TRANSFERRED',
          'CALL_FAILED',
          'ABANDONED',
        ];

        expect(codes).toHaveLength(20);
      });
    });
  });

  describe('DispositionCode interface', () => {
    it('should be constructable with all required properties', () => {
      const code: DispositionCode = {
        id: 'disp-001',
        clinicId: 'clinic-001',
        code: 'SOLD',
        name: 'Sold',
        description: 'Sale completed',
        category: 'completed',
        isPositiveOutcome: true,
        requiresFollowUp: false,
        followUpDays: null,
        isActive: true,
        displayOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(code.code).toBe('SOLD');
      expect(code.isPositiveOutcome).toBe(true);
    });

    it('should support null clinicId for system-wide codes', () => {
      const code: DispositionCode = {
        id: 'disp-system',
        clinicId: null, // System-wide code
        code: 'NO_ANSWER',
        name: 'No Answer',
        description: null,
        category: 'not_connected',
        isPositiveOutcome: false,
        requiresFollowUp: true,
        followUpDays: 1,
        isActive: true,
        displayOrder: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(code.clinicId).toBeNull();
      expect(code.requiresFollowUp).toBe(true);
      expect(code.followUpDays).toBe(1);
    });
  });
});
