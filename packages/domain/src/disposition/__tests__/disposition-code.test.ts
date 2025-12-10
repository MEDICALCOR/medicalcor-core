/**
 * @fileoverview Disposition Code Tests
 *
 * Tests for M1: Call Disposition Tracking.
 * Covers disposition code creation, call disposition records,
 * and outcome mapping.
 *
 * @module domain/disposition/__tests__/disposition-code
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createCallDisposition,
  mapCallOutcomeToDisposition,
  STANDARD_DISPOSITION_CODES,
  type CreateCallDispositionInput,
  type DispositionCategory,
  type CallDirection,
  type HandlerType,
  type ObjectionHandled,
} from '../entities/DispositionCode.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createDefaultInput = (
  overrides: Partial<CreateCallDispositionInput> = {}
): CreateCallDispositionInput => ({
  callSid: 'CA001',
  clinicId: 'clinic-001',
  dispositionCodeId: 'disp-001',
  handledByType: 'ai',
  ...overrides,
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('DispositionCode', () => {
  // ===========================================================================
  // STANDARD DISPOSITION CODES
  // ===========================================================================

  describe('STANDARD_DISPOSITION_CODES', () => {
    it('should have all positive outcome codes', () => {
      expect(STANDARD_DISPOSITION_CODES.SOLD).toBe('SOLD');
      expect(STANDARD_DISPOSITION_CODES.APPT_SCHEDULED).toBe('APPT_SCHEDULED');
      expect(STANDARD_DISPOSITION_CODES.INTERESTED).toBe('INTERESTED');
      expect(STANDARD_DISPOSITION_CODES.INFO_SENT).toBe('INFO_SENT');
    });

    it('should have all neutral codes', () => {
      expect(STANDARD_DISPOSITION_CODES.CALLBACK_REQUESTED).toBe('CALLBACK_REQUESTED');
      expect(STANDARD_DISPOSITION_CODES.DECISION_PENDING).toBe('DECISION_PENDING');
      expect(STANDARD_DISPOSITION_CODES.PRICE_OBJECTION).toBe('PRICE_OBJECTION');
    });

    it('should have all negative codes', () => {
      expect(STANDARD_DISPOSITION_CODES.NOT_INTERESTED).toBe('NOT_INTERESTED');
      expect(STANDARD_DISPOSITION_CODES.COMPETITOR).toBe('COMPETITOR');
      expect(STANDARD_DISPOSITION_CODES.NOT_QUALIFIED).toBe('NOT_QUALIFIED');
      expect(STANDARD_DISPOSITION_CODES.DO_NOT_CALL).toBe('DO_NOT_CALL');
    });

    it('should have all not-connected codes', () => {
      expect(STANDARD_DISPOSITION_CODES.NO_ANSWER).toBe('NO_ANSWER');
      expect(STANDARD_DISPOSITION_CODES.BUSY).toBe('BUSY');
      expect(STANDARD_DISPOSITION_CODES.VOICEMAIL).toBe('VOICEMAIL');
      expect(STANDARD_DISPOSITION_CODES.WRONG_NUMBER).toBe('WRONG_NUMBER');
      expect(STANDARD_DISPOSITION_CODES.DISCONNECTED).toBe('DISCONNECTED');
      expect(STANDARD_DISPOSITION_CODES.INVALID_NUMBER).toBe('INVALID_NUMBER');
    });

    it('should have all technical codes', () => {
      expect(STANDARD_DISPOSITION_CODES.TRANSFERRED).toBe('TRANSFERRED');
      expect(STANDARD_DISPOSITION_CODES.CALL_FAILED).toBe('CALL_FAILED');
      expect(STANDARD_DISPOSITION_CODES.ABANDONED).toBe('ABANDONED');
    });
  });

  // ===========================================================================
  // CREATE CALL DISPOSITION
  // ===========================================================================

  describe('createCallDisposition', () => {
    it('should create disposition with required fields', () => {
      const input = createDefaultInput();
      const disposition = createCallDisposition(input);

      expect(disposition.id).toBeDefined();
      expect(disposition.callSid).toBe('CA001');
      expect(disposition.clinicId).toBe('clinic-001');
      expect(disposition.dispositionCodeId).toBe('disp-001');
      expect(disposition.handledByType).toBe('ai');
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const disposition = createCallDisposition(createDefaultInput());
        ids.add(disposition.id);
      }
      expect(ids.size).toBe(100);
    });

    it('should set timestamps', () => {
      const before = new Date();
      const disposition = createCallDisposition(createDefaultInput());
      const after = new Date();

      expect(disposition.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(disposition.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(disposition.setAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should handle optional fields with defaults', () => {
      const disposition = createCallDisposition(createDefaultInput());

      expect(disposition.leadId).toBeNull();
      expect(disposition.subDisposition).toBeNull();
      expect(disposition.reason).toBeNull();
      expect(disposition.notes).toBeNull();
      expect(disposition.callDurationSeconds).toBeNull();
      expect(disposition.callDirection).toBeNull();
      expect(disposition.callType).toBeNull();
      expect(disposition.agentId).toBeNull();
      expect(disposition.assistantId).toBeNull();
      expect(disposition.objectionsHandled).toEqual([]);
      expect(disposition.detectedIntent).toBeNull();
      expect(disposition.intentConfidence).toBeNull();
      expect(disposition.followUpScheduled).toBe(false);
      expect(disposition.followUpDate).toBeNull();
      expect(disposition.followUpNotes).toBeNull();
      expect(disposition.metadata).toEqual({});
      expect(disposition.setBy).toBeNull();
    });

    it('should create disposition with all optional fields', () => {
      const followUpDate = new Date('2024-12-15');
      const objections: ObjectionHandled[] = [
        { code: 'PRICE', resolution: 'Offered payment plan', overcome: true },
        { code: 'TIME', resolution: 'Offered flexible scheduling', overcome: false },
      ];

      const input = createDefaultInput({
        leadId: 'lead-001',
        subDisposition: 'premium_package',
        reason: 'Customer agreed to premium',
        notes: 'Follow up about financing options',
        callDurationSeconds: 300,
        callDirection: 'outbound',
        callType: 'sales',
        agentId: 'agent-001',
        assistantId: 'asst-001',
        objectionsHandled: objections,
        detectedIntent: 'purchase_intent',
        intentConfidence: 0.95,
        followUpDate,
        followUpNotes: 'Confirm financing',
        setBy: 'user-001',
        metadata: { campaignId: 'camp-001' },
      });

      const disposition = createCallDisposition(input);

      expect(disposition.leadId).toBe('lead-001');
      expect(disposition.subDisposition).toBe('premium_package');
      expect(disposition.reason).toBe('Customer agreed to premium');
      expect(disposition.notes).toBe('Follow up about financing options');
      expect(disposition.callDurationSeconds).toBe(300);
      expect(disposition.callDirection).toBe('outbound');
      expect(disposition.callType).toBe('sales');
      expect(disposition.agentId).toBe('agent-001');
      expect(disposition.assistantId).toBe('asst-001');
      expect(disposition.objectionsHandled).toEqual(objections);
      expect(disposition.detectedIntent).toBe('purchase_intent');
      expect(disposition.intentConfidence).toBe(0.95);
      expect(disposition.followUpScheduled).toBe(true);
      expect(disposition.followUpDate).toEqual(followUpDate);
      expect(disposition.followUpNotes).toBe('Confirm financing');
      expect(disposition.setBy).toBe('user-001');
      expect(disposition.metadata).toEqual({ campaignId: 'camp-001' });
    });

    it('should handle AI handler type', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          handledByType: 'ai',
          assistantId: 'asst-001',
        })
      );

      expect(disposition.handledByType).toBe('ai');
      expect(disposition.assistantId).toBe('asst-001');
    });

    it('should handle human handler type', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          handledByType: 'human',
          agentId: 'agent-001',
        })
      );

      expect(disposition.handledByType).toBe('human');
      expect(disposition.agentId).toBe('agent-001');
    });

    it('should handle hybrid handler type', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          handledByType: 'hybrid',
          agentId: 'agent-001',
          assistantId: 'asst-001',
        })
      );

      expect(disposition.handledByType).toBe('hybrid');
      expect(disposition.agentId).toBe('agent-001');
      expect(disposition.assistantId).toBe('asst-001');
    });

    it('should set followUpScheduled based on followUpDate', () => {
      const withoutFollowUp = createCallDisposition(createDefaultInput());
      expect(withoutFollowUp.followUpScheduled).toBe(false);

      const withFollowUp = createCallDisposition(
        createDefaultInput({
          followUpDate: new Date('2024-12-15'),
        })
      );
      expect(withFollowUp.followUpScheduled).toBe(true);
    });
  });

  // ===========================================================================
  // MAP CALL OUTCOME TO DISPOSITION
  // ===========================================================================

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

    it('should map all outcomes to valid disposition codes', () => {
      const outcomes = ['completed', 'transferred', 'abandoned', 'failed', 'voicemail'] as const;

      for (const outcome of outcomes) {
        const code = mapCallOutcomeToDisposition(outcome);
        expect(Object.values(STANDARD_DISPOSITION_CODES)).toContain(code);
      }
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('should always create valid disposition with required fields', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom<HandlerType>('ai', 'human', 'hybrid'),
          (callSid, clinicId, dispositionCodeId, handledByType) => {
            const disposition = createCallDisposition({
              callSid,
              clinicId,
              dispositionCodeId,
              handledByType,
            });

            return (
              disposition.id.length > 0 &&
              disposition.callSid === callSid &&
              disposition.clinicId === clinicId &&
              disposition.dispositionCodeId === dispositionCodeId &&
              disposition.handledByType === handledByType &&
              disposition.createdAt instanceof Date
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should always have valid call direction', () => {
      const validDirections: CallDirection[] = ['inbound', 'outbound'];

      fc.assert(
        fc.property(fc.constantFrom(...validDirections), (direction) => {
          const disposition = createCallDisposition(
            createDefaultInput({
              callDirection: direction,
            })
          );

          return validDirections.includes(disposition.callDirection as CallDirection);
        }),
        { numRuns: 20 }
      );
    });

    it('should preserve intent confidence between 0 and 1', () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (confidence) => {
          const disposition = createCallDisposition(
            createDefaultInput({
              intentConfidence: confidence,
            })
          );

          return (
            disposition.intentConfidence !== null &&
            disposition.intentConfidence >= 0 &&
            disposition.intentConfidence <= 1
          );
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve call duration as positive number', () => {
      fc.assert(
        fc.property(fc.nat({ max: 3600 }), (duration) => {
          const disposition = createCallDisposition(
            createDefaultInput({
              callDurationSeconds: duration,
            })
          );

          return disposition.callDurationSeconds !== null && disposition.callDurationSeconds >= 0;
        }),
        { numRuns: 50 }
      );
    });

    it('should handle any number of objections', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), (count) => {
          const objections: ObjectionHandled[] = Array.from({ length: count }, (_, i) => ({
            code: `OBJ_${i}`,
            resolution: `Resolution ${i}`,
            overcome: i % 2 === 0,
          }));

          const disposition = createCallDisposition(
            createDefaultInput({
              objectionsHandled: objections,
            })
          );

          return disposition.objectionsHandled.length === count;
        }),
        { numRuns: 20 }
      );
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty metadata', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          metadata: {},
        })
      );

      expect(disposition.metadata).toEqual({});
    });

    it('should handle complex metadata', () => {
      const metadata = {
        campaignId: 'camp-001',
        source: 'web',
        tags: ['hot', 'priority'],
        scores: { urgency: 5, value: 10 },
      };

      const disposition = createCallDisposition(
        createDefaultInput({
          metadata,
        })
      );

      expect(disposition.metadata).toEqual(metadata);
    });

    it('should handle zero call duration', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          callDurationSeconds: 0,
        })
      );

      expect(disposition.callDurationSeconds).toBe(0);
    });

    it('should handle empty objections array', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          objectionsHandled: [],
        })
      );

      expect(disposition.objectionsHandled).toEqual([]);
    });

    it('should handle objections with null resolution', () => {
      const objections: ObjectionHandled[] = [{ code: 'PRICE', resolution: null, overcome: false }];

      const disposition = createCallDisposition(
        createDefaultInput({
          objectionsHandled: objections,
        })
      );

      expect(disposition.objectionsHandled[0].resolution).toBeNull();
    });

    it('should handle very long call duration', () => {
      const disposition = createCallDisposition(
        createDefaultInput({
          callDurationSeconds: 86400, // 24 hours
        })
      );

      expect(disposition.callDurationSeconds).toBe(86400);
    });

    it('should handle intent confidence at boundaries', () => {
      const zeroConfidence = createCallDisposition(
        createDefaultInput({
          intentConfidence: 0,
        })
      );
      expect(zeroConfidence.intentConfidence).toBe(0);

      const maxConfidence = createCallDisposition(
        createDefaultInput({
          intentConfidence: 1,
        })
      );
      expect(maxConfidence.intentConfidence).toBe(1);
    });
  });
});
