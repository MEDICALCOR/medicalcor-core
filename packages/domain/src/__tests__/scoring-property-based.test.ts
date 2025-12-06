import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ScoringService } from '../scoring/scoring-service.js';

/**
 * Property-Based Tests for Lead Scoring Service
 *
 * These tests use fast-check to verify invariant properties that should hold
 * for ALL possible inputs, not just specific test cases.
 *
 * Key properties tested:
 * 1. Score bounds: Always between 1-5
 * 2. Classification consistency: Score maps to correct classification
 * 3. Determinism: Same input always produces same output
 * 4. Monotonicity: Adding positive signals never decreases score
 * 5. Input robustness: Handles any valid input without crashing
 */

const service = new ScoringService({
  openaiApiKey: 'test-key',
  fallbackEnabled: true,
});

/**
 * Custom arbitraries for generating realistic test data
 */

// Generate realistic phone numbers
const phoneArbitrary = fc
  .tuple(
    fc.constantFrom('+40', '+1', '+44', '+49', '+33'),
    fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 9,
      maxLength: 10,
    })
  )
  .map(([prefix, digits]) => `${prefix}${digits.join('')}`);

// Generate channel types
const channelArbitrary = fc.constantFrom('whatsapp', 'voice', 'web', 'sms');

// Generate language codes
const languageArbitrary = fc.constantFrom('ro', 'en', 'de');

// Generate timestamps using integer milliseconds to avoid Invalid Date issues
const timestampArbitrary = fc
  .integer({
    min: new Date('2020-01-01').getTime(),
    max: new Date('2030-12-31').getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

// Generate message content with various dental keywords
const dentalKeywords = [
  'implant',
  'all-on-4',
  'all-on-6',
  'all on 4',
  'implanturi',
  'fatete',
  'veneer',
  'albire',
  'whitening',
  'extractie',
];

const budgetKeywords = ['pret', 'cost', 'cat costa', 'buget', 'euro', 'lei', 'finantare', 'rate'];

const urgencyKeywords = ['urgent', 'durere', 'imediat', 'cat mai repede', 'maine', 'azi', 'acum'];

const messageContentArbitrary = fc.oneof(
  // Random text
  fc.string({ minLength: 1, maxLength: 200 }),
  // Text with dental keywords
  fc
    .tuple(fc.constantFrom(...dentalKeywords), fc.string({ maxLength: 50 }))
    .map(([keyword, extra]) => `${keyword} ${extra}`),
  // Text with budget mention
  fc
    .tuple(fc.constantFrom(...budgetKeywords), fc.string({ maxLength: 50 }))
    .map(([keyword, extra]) => `${keyword} ${extra}`),
  // Text with urgency
  fc
    .tuple(fc.constantFrom(...urgencyKeywords), fc.string({ maxLength: 50 }))
    .map(([keyword, extra]) => `${keyword} ${extra}`),
  // Combined keywords
  fc
    .tuple(fc.constantFrom(...dentalKeywords), fc.constantFrom(...budgetKeywords))
    .map(([dental, budget]) => `${dental}, ${budget}`)
);

// Generate message history
const messageArbitrary = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  content: messageContentArbitrary,
  timestamp: timestampArbitrary,
});

const messageHistoryArbitrary = fc.array(messageArbitrary, { minLength: 0, maxLength: 10 });

// Generate complete scoring context
const scoringContextArbitrary = fc.record({
  phone: phoneArbitrary,
  channel: channelArbitrary,
  firstTouchTimestamp: timestampArbitrary,
  language: fc.option(languageArbitrary, { nil: undefined }),
  messageHistory: messageHistoryArbitrary,
  utm: fc.option(
    fc.record({
      utm_source: fc.option(fc.constantFrom('google', 'facebook', 'instagram', 'direct'), {
        nil: undefined,
      }),
      utm_campaign: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    }),
    { nil: undefined }
  ),
});

describe('ScoringService - Property-Based Tests', () => {
  describe('Score Bounds Invariant', () => {
    it('score should always be between 1 and 5 (inclusive)', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(result.score).toBeGreaterThanOrEqual(1);
          expect(result.score).toBeLessThanOrEqual(5);
          expect(Number.isInteger(result.score)).toBe(true);
        }),
        { numRuns: 500 }
      );
    });

    it('score should never be NaN or Infinity', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(Number.isFinite(result.score)).toBe(true);
          expect(Number.isNaN(result.score)).toBe(false);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Classification Consistency', () => {
    it('classification should be consistent with score', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          if (result.score >= 4) {
            expect(result.classification).toBe('HOT');
          } else if (result.score === 3) {
            expect(result.classification).toBe('WARM');
          } else if (result.score === 2) {
            expect(result.classification).toBe('COLD');
          } else {
            expect(result.classification).toBe('UNQUALIFIED');
          }
        }),
        { numRuns: 300 }
      );
    });

    it('classification should always be a valid enum value', () => {
      const validClassifications = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(validClassifications).toContain(result.classification);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Confidence Bounds', () => {
    it('confidence should always be between 0 and 1', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }),
        { numRuns: 200 }
      );
    });

    it('rule-based scoring should always have 0.7 confidence', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(result.confidence).toBe(0.7);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('Determinism', () => {
    it('same input should always produce same output', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result1 = service.ruleBasedScore(context);
          const result2 = service.ruleBasedScore(context);
          const result3 = service.ruleBasedScore(context);

          expect(result1.score).toBe(result2.score);
          expect(result2.score).toBe(result3.score);
          expect(result1.classification).toBe(result2.classification);
          expect(result1.confidence).toBe(result2.confidence);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Monotonicity - Adding Positive Signals', () => {
    it('adding "all-on-4" keyword should never decrease score', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          // Score without All-on-4
          const baseResult = service.ruleBasedScore(context);

          // Add All-on-4 to message history
          const enhancedContext = {
            ...context,
            messageHistory: [
              ...(context.messageHistory ?? []),
              {
                role: 'user' as const,
                content: 'Ma intereseaza all-on-4',
                timestamp: new Date().toISOString(),
              },
            ],
          };
          const enhancedResult = service.ruleBasedScore(enhancedContext);

          // Score should not decrease
          expect(enhancedResult.score).toBeGreaterThanOrEqual(baseResult.score);
        }),
        { numRuns: 100 }
      );
    });

    it('adding budget mention should never decrease score', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const baseResult = service.ruleBasedScore(context);

          const enhancedContext = {
            ...context,
            messageHistory: [
              ...(context.messageHistory ?? []),
              {
                role: 'user' as const,
                content: 'Cat costa?',
                timestamp: new Date().toISOString(),
              },
            ],
          };
          const enhancedResult = service.ruleBasedScore(enhancedContext);

          expect(enhancedResult.score).toBeGreaterThanOrEqual(baseResult.score);
        }),
        { numRuns: 100 }
      );
    });

    it('adding urgency indicator should never decrease score', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const baseResult = service.ruleBasedScore(context);

          const enhancedContext = {
            ...context,
            messageHistory: [
              ...(context.messageHistory ?? []),
              {
                role: 'user' as const,
                content: 'Am nevoie urgent!',
                timestamp: new Date().toISOString(),
              },
            ],
          };
          const enhancedResult = service.ruleBasedScore(enhancedContext);

          expect(enhancedResult.score).toBeGreaterThanOrEqual(baseResult.score);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Keyword Detection Invariants', () => {
    it('All-on-X interest should always include All-on-X in procedureInterest', () => {
      const allOnXMessages = fc.constantFrom(
        'all-on-4',
        'all-on-6',
        'all on 4',
        'ALL-ON-4',
        'All-On-X'
      );

      fc.assert(
        fc.property(allOnXMessages, phoneArbitrary, timestampArbitrary, (keyword, phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            messageHistory: [{ role: 'user' as const, content: `Vreau ${keyword}`, timestamp: ts }],
          };

          const result = service.ruleBasedScore(context);

          expect(result.procedureInterest).toContain('All-on-X');
          expect(result.score).toBeGreaterThanOrEqual(4);
        }),
        { numRuns: 50 }
      );
    });

    it('budget mention should always set budgetMentioned to true', () => {
      const budgetPhrases = fc.constantFrom(
        'cat costa',
        'pret',
        'buget',
        'finantare',
        'euro',
        'lei',
        'rate'
      );

      fc.assert(
        fc.property(budgetPhrases, phoneArbitrary, timestampArbitrary, (phrase, phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            messageHistory: [
              { role: 'user' as const, content: `Vreau sa stiu ${phrase}`, timestamp: ts },
            ],
          };

          const result = service.ruleBasedScore(context);

          expect(result.budgetMentioned).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Output Structure Invariants', () => {
    it('all required output fields should always be present', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          // Required fields
          expect(result).toHaveProperty('score');
          expect(result).toHaveProperty('classification');
          expect(result).toHaveProperty('confidence');
          expect(result).toHaveProperty('reasoning');
          expect(result).toHaveProperty('suggestedAction');

          // Optional arrays should be defined (possibly empty)
          expect(result.urgencyIndicators).toBeDefined();
          expect(result.procedureInterest).toBeDefined();
        }),
        { numRuns: 200 }
      );
    });

    it('reasoning should be a non-empty string', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(typeof result.reasoning).toBe('string');
          expect(result.reasoning.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('suggestedAction should be a non-empty string', () => {
      fc.assert(
        fc.property(scoringContextArbitrary, (context) => {
          const result = service.ruleBasedScore(context);

          expect(typeof result.suggestedAction).toBe('string');
          expect(result.suggestedAction.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Empty Input Handling', () => {
    it('should handle empty message history gracefully', () => {
      fc.assert(
        fc.property(phoneArbitrary, timestampArbitrary, (phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            messageHistory: [],
          };

          const result = service.ruleBasedScore(context);

          // Should return UNQUALIFIED for empty input
          expect(result.score).toBe(1);
          expect(result.classification).toBe('UNQUALIFIED');
        }),
        { numRuns: 50 }
      );
    });

    it('should handle undefined message history gracefully', () => {
      fc.assert(
        fc.property(phoneArbitrary, timestampArbitrary, (phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            messageHistory: undefined as any, // Intentionally undefined
          };

          // Should not throw
          expect(() => service.ruleBasedScore(context)).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Maximum Score Scenarios', () => {
    it('All-on-X with budget should always score 5 (HOT)', () => {
      const allOnXKeyword = fc.constantFrom('all-on-4', 'all-on-6', 'all on 4');
      const budgetKeyword = fc.constantFrom('cat costa', 'pret', 'buget');

      fc.assert(
        fc.property(
          allOnXKeyword,
          budgetKeyword,
          phoneArbitrary,
          timestampArbitrary,
          (allOnX, budget, phone, ts) => {
            const context = {
              phone,
              channel: 'whatsapp' as const,
              firstTouchTimestamp: ts,
              messageHistory: [
                { role: 'user' as const, content: `${allOnX} ${budget}`, timestamp: ts },
              ],
            };

            const result = service.ruleBasedScore(context);

            expect(result.score).toBe(5);
            expect(result.classification).toBe('HOT');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('score should be capped at 5 even with multiple positive signals', () => {
      fc.assert(
        fc.property(phoneArbitrary, timestampArbitrary, (phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            messageHistory: [
              {
                role: 'user' as const,
                content: 'Urgent! Vreau all-on-4, cat costa? Am nevoie imediat! Buget 10000 euro.',
                timestamp: ts,
              },
            ],
          };

          const result = service.ruleBasedScore(context);

          // Even with all positive signals, score should not exceed 5
          expect(result.score).toBe(5);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Language-Specific Suggested Actions', () => {
    it('Romanian language should produce Romanian suggested action', () => {
      fc.assert(
        fc.property(phoneArbitrary, timestampArbitrary, (phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            language: 'ro' as const,
            messageHistory: [{ role: 'user' as const, content: 'Vreau all-on-4', timestamp: ts }],
          };

          const result = service.ruleBasedScore(context);

          // Romanian action should contain Romanian words
          expect(result.suggestedAction).toMatch(/imediat|Contactați|informatii/i);
        }),
        { numRuns: 30 }
      );
    });

    it('English language should produce English suggested action', () => {
      fc.assert(
        fc.property(phoneArbitrary, timestampArbitrary, (phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            language: 'en' as const,
            messageHistory: [{ role: 'user' as const, content: 'I want all-on-4', timestamp: ts }],
          };

          const result = service.ruleBasedScore(context);

          // English action should contain English words
          expect(result.suggestedAction).toMatch(/immediately|Contact|information/i);
        }),
        { numRuns: 30 }
      );
    });

    it('German language should produce German suggested action', () => {
      fc.assert(
        fc.property(phoneArbitrary, timestampArbitrary, (phone, ts) => {
          const context = {
            phone,
            channel: 'whatsapp' as const,
            firstTouchTimestamp: ts,
            language: 'de' as const,
            messageHistory: [
              { role: 'user' as const, content: 'Ich möchte all-on-4', timestamp: ts },
            ],
          };

          const result = service.ruleBasedScore(context);

          // German action should contain German words
          expect(result.suggestedAction).toMatch(/kontaktieren|Sofort|anbieten/i);
        }),
        { numRuns: 30 }
      );
    });
  });
});

describe('Scoring Edge Cases via Property-Based Testing', () => {
  describe('Unicode and Special Character Handling', () => {
    it('should handle messages with emojis', () => {
      const emojiArbitrary = fc.constantFrom('😊', '🦷', '💰', '🏥', '👍', '❤️');

      fc.assert(
        fc.property(
          fc.array(emojiArbitrary, { minLength: 1, maxLength: 5 }),
          phoneArbitrary,
          timestampArbitrary,
          (emojis, phone, ts) => {
            const context = {
              phone,
              channel: 'whatsapp' as const,
              firstTouchTimestamp: ts,
              messageHistory: [
                { role: 'user' as const, content: `Hello ${emojis.join('')}`, timestamp: ts },
              ],
            };

            expect(() => service.ruleBasedScore(context)).not.toThrow();
            const result = service.ruleBasedScore(context);
            expect(result.score).toBeGreaterThanOrEqual(1);
            expect(result.score).toBeLessThanOrEqual(5);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle messages with diacritics (Romanian, German)', () => {
      const diacriticArbitrary = fc.constantFrom(
        'Întrebări despre implanturi',
        'Müller möchte einen Termin',
        'Açıklama istiyorum',
        'Ça coûte combien?'
      );

      fc.assert(
        fc.property(
          diacriticArbitrary,
          phoneArbitrary,
          timestampArbitrary,
          (message, phone, ts) => {
            const context = {
              phone,
              channel: 'whatsapp' as const,
              firstTouchTimestamp: ts,
              messageHistory: [{ role: 'user' as const, content: message, timestamp: ts }],
            };

            expect(() => service.ruleBasedScore(context)).not.toThrow();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Very Long Messages', () => {
    it('should handle very long message content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 10000 }),
          phoneArbitrary,
          timestampArbitrary,
          (longContent, phone, ts) => {
            const context = {
              phone,
              channel: 'whatsapp' as const,
              firstTouchTimestamp: ts,
              messageHistory: [{ role: 'user' as const, content: longContent, timestamp: ts }],
            };

            expect(() => service.ruleBasedScore(context)).not.toThrow();
            const result = service.ruleBasedScore(context);
            expect(result.score).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Message History Length', () => {
    it('should handle large message histories', () => {
      fc.assert(
        fc.property(
          fc.array(messageArbitrary, { minLength: 50, maxLength: 100 }),
          phoneArbitrary,
          timestampArbitrary,
          (messages, phone, ts) => {
            const context = {
              phone,
              channel: 'whatsapp' as const,
              firstTouchTimestamp: ts,
              messageHistory: messages,
            };

            expect(() => service.ruleBasedScore(context)).not.toThrow();
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
