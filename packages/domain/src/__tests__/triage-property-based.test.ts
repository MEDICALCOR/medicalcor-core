import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TriageService } from '../triage/triage-service.js';
import type { LeadScore, LeadChannel } from '@medicalcor/types';

/**
 * Property-Based Tests for Triage Service
 *
 * These tests verify invariant properties that should hold
 * for ALL possible inputs to the triage assessment.
 *
 * Key properties tested:
 * 1. Urgency level bounds: Always one of the defined levels
 * 2. Routing consistency: Urgency maps to appropriate routing
 * 3. Medical flags safety: Emergency keywords always flagged
 * 4. Determinism: Same input produces same output
 * 5. Monotonicity: Adding priority signals never decreases urgency
 */

const service = new TriageService();

/**
 * Custom arbitraries for generating realistic test data
 */

// Generate valid lead scores
const leadScoreArbitrary: fc.Arbitrary<LeadScore> = fc.constantFrom(
  'HOT',
  'WARM',
  'COLD',
  'UNQUALIFIED'
);

// Generate valid channels
const channelArbitrary: fc.Arbitrary<LeadChannel> = fc.constantFrom(
  'whatsapp',
  'voice',
  'web',
  'sms'
);

// Generate message content with various keywords
const priorityKeywords = [
  'durere',
  'durere puternica',
  'umflatura',
  'urgent',
  'infectie',
  'abces',
  'nu pot manca',
  'nu pot dormi',
];

const emergencyKeywords = ['accident', 'cazut', 'spart', 'urgenta medicala'];

const schedulingKeywords = [
  'cat mai repede',
  'imediat',
  'prioritar',
  'maine',
  'azi',
  'acum',
  'de urgenta',
];

const messageContentArbitrary = fc.oneof(
  // Random text
  fc.string({ minLength: 1, maxLength: 200 }),
  // Text with priority keywords
  fc
    .tuple(fc.constantFrom(...priorityKeywords), fc.string({ maxLength: 50 }))
    .map(([keyword, extra]) => `Am ${keyword} ${extra}`),
  // Text with emergency keywords
  fc
    .tuple(fc.constantFrom(...emergencyKeywords), fc.string({ maxLength: 50 }))
    .map(([keyword, extra]) => `${keyword} ${extra}`),
  // Text with scheduling keywords
  fc
    .tuple(fc.constantFrom(...schedulingKeywords), fc.string({ maxLength: 50 }))
    .map(([keyword, extra]) => `Vreau ${keyword} ${extra}`)
);

// Generate procedure interests
const procedureArbitrary = fc.array(
  fc.constantFrom('implant', 'All-on-X', 'all-on-x', 'fatete', 'albire', 'extractie'),
  { minLength: 0, maxLength: 3 }
);

// Generate complete triage input
const triageInputArbitrary = fc.record({
  leadScore: leadScoreArbitrary,
  channel: channelArbitrary,
  messageContent: messageContentArbitrary,
  procedureInterest: procedureArbitrary,
  hasExistingRelationship: fc.boolean(),
  previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
  lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
});

describe('TriageService - Property-Based Tests', () => {
  describe('Urgency Level Invariants', () => {
    it('urgency level should always be one of the valid values', () => {
      const validLevels = ['high_priority', 'high', 'normal', 'low'];

      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(validLevels).toContain(result.urgencyLevel);
        }),
        { numRuns: 500 }
      );
    });

    it('urgency level should never be undefined or null', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(result.urgencyLevel).toBeDefined();
          expect(result.urgencyLevel).not.toBeNull();
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Routing Recommendation Invariants', () => {
    it('routing should always be one of the valid values', () => {
      const validRouting = [
        'next_available_slot',
        'same_day',
        'next_business_day',
        'nurture_sequence',
      ];

      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(validRouting).toContain(result.routingRecommendation);
        }),
        { numRuns: 500 }
      );
    });

    it('high_priority urgency should route to next_available_slot', () => {
      const priorityInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.constantFrom(...priorityKeywords).map((k) => `Am ${k}`),
        procedureInterest: procedureArbitrary,
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(priorityInput, (input) => {
          const result = service.assessSync(input);
          if (result.urgencyLevel === 'high_priority') {
            expect(result.routingRecommendation).toBe('next_available_slot');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('HOT leads should never route to nurture_sequence', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          // Only test with HOT leads
          if (input.leadScore !== 'HOT') return true;

          const result = service.assessSync(input);
          expect(result.routingRecommendation).not.toBe('nurture_sequence');
          return true;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Medical Flags Invariants', () => {
    it('medical flags should always be an array', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(Array.isArray(result.medicalFlags)).toBe(true);
        }),
        { numRuns: 200 }
      );
    });

    it('emergency keywords should always add emergency flag', () => {
      const emergencyInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.constantFrom(...emergencyKeywords).map((k) => `A fost un ${k}`),
        procedureInterest: procedureArbitrary,
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(emergencyInput, (input) => {
          const result = service.assessSync(input);
          expect(result.medicalFlags).toContain('potential_emergency_refer_112');
        }),
        { numRuns: 50 }
      );
    });

    it('priority symptoms should add priority_scheduling_requested flag', () => {
      const symptomsInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.constantFrom('durere', 'infectie', 'abces').map((k) => `Am ${k}`),
        procedureInterest: procedureArbitrary,
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(symptomsInput, (input) => {
          const result = service.assessSync(input);
          expect(result.medicalFlags).toContain('priority_scheduling_requested');
        }),
        { numRuns: 50 }
      );
    });

    it('existing patient flag should be added when hasExistingRelationship is true with appointments', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);

          if (
            input.hasExistingRelationship &&
            input.previousAppointments &&
            input.previousAppointments > 0
          ) {
            expect(result.medicalFlags).toContain('existing_patient');
          }

          return true;
        }),
        { numRuns: 200 }
      );
    });

    it('re-engagement flag should be added for long-inactive contacts', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);

          if (input.lastContactDays && input.lastContactDays > 180) {
            expect(result.medicalFlags).toContain('re_engagement_opportunity');
          }

          return true;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Priority Scheduling Invariants', () => {
    it('prioritySchedulingRequested should be true when priority keywords present', () => {
      const priorityInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.constantFrom(...priorityKeywords, ...schedulingKeywords).map((k) => k),
        procedureInterest: procedureArbitrary,
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(priorityInput, (input) => {
          const result = service.assessSync(input);
          expect(result.prioritySchedulingRequested).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('prioritySchedulingRequested should always be a boolean', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(typeof result.prioritySchedulingRequested).toBe('boolean');
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Determinism', () => {
    it('same input should always produce same output', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result1 = service.assessSync(input);
          const result2 = service.assessSync(input);
          const result3 = service.assessSync(input);

          expect(result1.urgencyLevel).toBe(result2.urgencyLevel);
          expect(result2.urgencyLevel).toBe(result3.urgencyLevel);
          expect(result1.routingRecommendation).toBe(result2.routingRecommendation);
          expect(result1.prioritySchedulingRequested).toBe(result2.prioritySchedulingRequested);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Monotonicity - Adding Priority Signals', () => {
    it('adding priority keyword should never decrease urgency level', () => {
      const urgencyOrder: Record<string, number> = {
        low: 1,
        normal: 2,
        high: 3,
        high_priority: 4,
      };

      fc.assert(
        fc.property(
          triageInputArbitrary,
          fc.constantFrom(...priorityKeywords),
          (input, priorityKeyword) => {
            const baseResult = service.assessSync(input);

            const enhancedInput = {
              ...input,
              messageContent: `${input.messageContent} ${priorityKeyword}`,
            };
            const enhancedResult = service.assessSync(enhancedInput);

            expect(urgencyOrder[enhancedResult.urgencyLevel]).toBeGreaterThanOrEqual(
              urgencyOrder[baseResult.urgencyLevel]
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Suggested Owner Invariants', () => {
    it('suggestedOwner should always be defined', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(result.suggestedOwner).toBeDefined();
          expect(typeof result.suggestedOwner).toBe('string');
          expect(result.suggestedOwner!.length).toBeGreaterThan(0);
        }),
        { numRuns: 200 }
      );
    });

    it('implant/All-on-X interest should route to implant team', () => {
      const implantInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.string({ minLength: 1, maxLength: 100 }),
        procedureInterest: fc.constantFrom(['implant'], ['All-on-X'], ['all-on-x', 'implant']),
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(implantInput, (input) => {
          // Only test when not high_priority (which goes to scheduling team)
          const result = service.assessSync(input);
          if (result.urgencyLevel !== 'high_priority') {
            expect(result.suggestedOwner).toBe('dr-implant-team');
          }
        }),
        { numRuns: 50 }
      );
    });

    it('high_priority should route to scheduling team', () => {
      const priorityInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.constantFrom('durere', 'infectie', 'abces').map((k) => `Am ${k}`),
        procedureInterest: procedureArbitrary,
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(priorityInput, (input) => {
          const result = service.assessSync(input);
          if (result.urgencyLevel === 'high_priority') {
            expect(result.suggestedOwner).toBe('scheduling-team');
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Notes Invariants', () => {
    it('notes should always be a non-empty string', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(typeof result.notes).toBe('string');
          expect(result.notes.length).toBeGreaterThan(0);
        }),
        { numRuns: 200 }
      );
    });

    it('notes should contain priority level', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);
          expect(result.notes.toLowerCase()).toContain('priority');
        }),
        { numRuns: 100 }
      );
    });

    it('high_priority notes should contain safety disclaimer', () => {
      const priorityInput = fc.record({
        leadScore: leadScoreArbitrary,
        channel: channelArbitrary,
        messageContent: fc.constantFrom('durere', 'abces').map((k) => `Am ${k} forte`),
        procedureInterest: procedureArbitrary,
        hasExistingRelationship: fc.boolean(),
        previousAppointments: fc.option(fc.integer({ min: 0, max: 50 }), { nil: undefined }),
        lastContactDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      });

      fc.assert(
        fc.property(priorityInput, (input) => {
          const result = service.assessSync(input);
          if (result.urgencyLevel === 'high_priority') {
            expect(result.notes.toLowerCase()).toContain('112');
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Output Structure Invariants', () => {
    it('all required output fields should always be present', () => {
      fc.assert(
        fc.property(triageInputArbitrary, (input) => {
          const result = service.assessSync(input);

          expect(result).toHaveProperty('urgencyLevel');
          expect(result).toHaveProperty('routingRecommendation');
          expect(result).toHaveProperty('medicalFlags');
          expect(result).toHaveProperty('suggestedOwner');
          expect(result).toHaveProperty('prioritySchedulingRequested');
          expect(result).toHaveProperty('notes');
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('VIP and Notification Invariants', () => {
    it('isVIP should always return boolean', () => {
      const phoneArbitrary = fc.string({ minLength: 5, maxLength: 20 });

      fc.assert(
        fc.property(phoneArbitrary, (phone) => {
          const result = service.isVIP(phone);
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });

    it('getNotificationContacts should always return array', () => {
      const urgencyLevels = ['high_priority', 'high', 'normal', 'low'] as const;

      fc.assert(
        fc.property(fc.constantFrom(...urgencyLevels), (urgency) => {
          const result = service.getNotificationContacts(urgency);
          expect(Array.isArray(result)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('high_priority should have notification contacts', () => {
      const result = service.getNotificationContacts('high_priority');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message content', () => {
      fc.assert(
        fc.property(leadScoreArbitrary, channelArbitrary, (leadScore, channel) => {
          const input = {
            leadScore,
            channel,
            messageContent: '',
            hasExistingRelationship: false,
          };

          expect(() => service.assessSync(input)).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });

    it('should handle very long message content', () => {
      fc.assert(
        fc.property(
          leadScoreArbitrary,
          channelArbitrary,
          fc.string({ minLength: 5000, maxLength: 10000 }),
          (leadScore, channel, longContent) => {
            const input = {
              leadScore,
              channel,
              messageContent: longContent,
              hasExistingRelationship: false,
            };

            expect(() => service.assessSync(input)).not.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle unicode and special characters', () => {
      const unicodeMessages = fc.constantFrom(
        'Am durere 🦷😫',
        'Întrebare despre implant',
        'Müller möchte einen Termin',
        '牙齿疼痛',
        'דאבני שיניים'
      );

      fc.assert(
        fc.property(leadScoreArbitrary, channelArbitrary, unicodeMessages, (leadScore, channel, message) => {
          const input = {
            leadScore,
            channel,
            messageContent: message,
            hasExistingRelationship: false,
          };

          expect(() => service.assessSync(input)).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });
  });
});
