/**
 * Comprehensive Scoring Service Tests
 * Tests for AI scoring, rule-based fallback, and property-based testing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ScoringService, createScoringService } from '../scoring/scoring-service.js';
import type { AIScoringContext } from '@medicalcor/types';

// Mock OpenAI client
const createMockOpenAI = (response: string) => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: response } }],
      }),
    },
  },
});

describe('ScoringService', () => {
  describe('constructor', () => {
    it('should create service with config', () => {
      const service = new ScoringService({ openaiApiKey: 'test-key' });
      expect(service).toBeInstanceOf(ScoringService);
    });

    it('should create service with fallback enabled', () => {
      const service = new ScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      expect(service).toBeInstanceOf(ScoringService);
    });

    it('should create service with custom model', () => {
      const service = new ScoringService({
        openaiApiKey: 'test-key',
        model: 'gpt-4-turbo',
      });
      expect(service).toBeInstanceOf(ScoringService);
    });
  });

  describe('ruleBasedScore', () => {
    let service: ScoringService;

    beforeEach(() => {
      service = new ScoringService({ openaiApiKey: '', fallbackEnabled: true });
    });

    describe('All-on-X detection', () => {
      it('should score 5 (HOT) for All-on-4 with budget mention', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [
            { role: 'user', content: 'Vreau informatii despre all-on-4. Cat costa?' },
          ],
        };

        const result = service.ruleBasedScore(context);

        expect(result.score).toBe(5);
        expect(result.classification).toBe('HOT');
        expect(result.budgetMentioned).toBe(true);
        expect(result.procedureInterest).toContain('All-on-X');
      });

      it('should score 4 (HOT) for All-on-X without budget', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: 'Sunt interesat de all-on-x' }],
        };

        const result = service.ruleBasedScore(context);

        expect(result.score).toBe(4);
        expect(result.classification).toBe('HOT');
        expect(result.procedureInterest).toContain('All-on-X');
      });

      const allOnXVariants = ['all-on-4', 'all-on-x', 'all on 4', 'all on x', 'all-on-6'];

      allOnXVariants.forEach((variant) => {
        it(`should detect variant: ${variant}`, () => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content: `Vreau ${variant}` }],
          };

          const result = service.ruleBasedScore(context);
          expect(result.score).toBeGreaterThanOrEqual(4);
          expect(result.procedureInterest).toContain('All-on-X');
        });
      });
    });

    describe('Budget detection', () => {
      const budgetKeywords = [
        'pret',
        'cost',
        'buget',
        'cat costa',
        'finantare',
        'rate',
        'euro',
        'lei',
      ];

      budgetKeywords.forEach((keyword) => {
        it(`should detect budget keyword: ${keyword}`, () => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content: `Vreau implant. ${keyword}?` }],
          };

          const result = service.ruleBasedScore(context);
          expect(result.budgetMentioned).toBe(true);
        });
      });
    });

    describe('Urgency detection', () => {
      const urgencyKeywords = [
        'urgent',
        'durere',
        'imediat',
        'cat mai repede',
        'maine',
        'azi',
        'acum',
        'nu mai pot',
      ];

      urgencyKeywords.forEach((keyword) => {
        it(`should boost score for urgency: ${keyword}`, () => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content: `Am ${keyword} nevoie de consultatie` }],
          };

          const result = service.ruleBasedScore(context);
          expect(result.urgencyIndicators).toContain('priority_scheduling_requested');
        });
      });
    });

    describe('Procedure interest detection', () => {
      const procedures = [
        { keyword: 'implant', expected: 'implant' },
        { keyword: 'implante', expected: 'implant' },
        { keyword: 'fatete', expected: 'veneer' },
        { keyword: 'veneer', expected: 'veneer' },
        { keyword: 'albire', expected: 'whitening' },
        { keyword: 'whitening', expected: 'whitening' },
        { keyword: 'extractie', expected: 'extraction' },
      ];

      procedures.forEach(({ keyword, expected }) => {
        it(`should detect procedure interest: ${keyword} -> ${expected}`, () => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content: `Sunt interesat de ${keyword}` }],
          };

          const result = service.ruleBasedScore(context);
          expect(result.procedureInterest).toContain(expected);
        });
      });
    });

    describe('Score classification', () => {
      it('should classify score 5 as HOT', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: 'all-on-4 pret urgent' }],
        };

        const result = service.ruleBasedScore(context);
        expect(result.classification).toBe('HOT');
      });

      it('should classify score 4 as HOT', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: 'all-on-4' }],
        };

        const result = service.ruleBasedScore(context);
        expect(result.classification).toBe('HOT');
      });

      it('should classify score 3 as WARM', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: 'implant' }],
        };

        const result = service.ruleBasedScore(context);
        expect(result.classification).toBe('WARM');
      });

      it('should classify score 1 as UNQUALIFIED for generic messages', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: 'buna ziua' }],
        };

        const result = service.ruleBasedScore(context);
        expect(result.classification).toBe('UNQUALIFIED');
      });
    });

    describe('Language support', () => {
      const languages: Array<'ro' | 'en' | 'de'> = ['ro', 'en', 'de'];

      languages.forEach((lang) => {
        it(`should return suggested action in ${lang}`, () => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            language: lang,
            messageHistory: [{ role: 'user', content: 'all-on-4 pret' }],
          };

          const result = service.ruleBasedScore(context);
          expect(result.suggestedAction).toBeTruthy();
          expect(result.suggestedAction.length).toBeGreaterThan(10);
        });
      });
    });

    describe('Confidence level', () => {
      it('should have lower confidence (0.7) for rule-based scoring', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: 'all-on-4' }],
        };

        const result = service.ruleBasedScore(context);
        expect(result.confidence).toBe(0.7);
      });
    });

    describe('Empty/edge cases', () => {
      it('should handle empty message history', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [],
        };

        const result = service.ruleBasedScore(context);
        expect(result.score).toBe(1);
        expect(result.classification).toBe('UNQUALIFIED');
      });

      it('should handle undefined message history', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
        };

        const result = service.ruleBasedScore(context);
        expect(result.score).toBe(1);
      });

      it('should handle messages with no content', () => {
        const context: AIScoringContext = {
          channel: 'whatsapp',
          messageHistory: [{ role: 'user', content: '' }],
        };

        const result = service.ruleBasedScore(context);
        expect(result.score).toBe(1);
      });
    });
  });

  describe('scoreMessage', () => {
    it('should use rule-based scoring when no OpenAI client', async () => {
      const service = new ScoringService({ openaiApiKey: '', fallbackEnabled: true });

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'all-on-4' }],
      };

      const result = await service.scoreMessage(context);

      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.confidence).toBe(0.7); // Rule-based confidence
    });

    it('should use AI scoring when OpenAI client is provided', async () => {
      const mockResponse = JSON.stringify({
        score: 5,
        classification: 'HOT',
        confidence: 0.95,
        reasoning: 'High purchase intent',
        suggestedAction: 'Contact immediately',
        detectedIntent: 'all_on_x_interest',
        urgencyIndicators: [],
        budgetMentioned: true,
        procedureInterest: ['All-on-X'],
      });

      const mockOpenAI = createMockOpenAI(mockResponse);
      const service = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'all-on-4 pret' }],
      };

      const result = await service.scoreMessage(context);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      expect(result.score).toBe(5);
      expect(result.confidence).toBe(0.95);
    });

    it('should fall back to rule-based on AI error when fallback enabled', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };

      const service = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'all-on-4' }],
      };

      const result = await service.scoreMessage(context);

      expect(result.confidence).toBe(0.7); // Rule-based fallback
    });

    it('should throw on AI error when fallback disabled', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };

      const service = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: false },
        { openai: mockOpenAI }
      );

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'test' }],
      };

      await expect(service.scoreMessage(context)).rejects.toThrow('API Error');
    });

    it('should handle empty AI response', async () => {
      const mockOpenAI = createMockOpenAI('');
      mockOpenAI.chat.completions.create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      const service = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'test' }],
      };

      const result = await service.scoreMessage(context);
      // Should fall back due to empty response
      expect(result).toBeDefined();
    });

    it('should handle malformed AI JSON response', async () => {
      const mockOpenAI = createMockOpenAI('not valid json');

      const service = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'test' }],
      };

      const result = await service.scoreMessage(context);

      // Should return safe fallback
      expect(result.score).toBe(2);
      expect(result.classification).toBe('COLD');
    });

    it('should extract JSON from markdown-wrapped response', async () => {
      const mockResponse =
        '```json\n{"score": 4, "classification": "HOT", "confidence": 0.9, "reasoning": "test", "suggestedAction": "test"}\n```';
      const mockOpenAI = createMockOpenAI(mockResponse);

      const service = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const context: AIScoringContext = {
        channel: 'whatsapp',
        messageHistory: [{ role: 'user', content: 'test' }],
      };

      const result = await service.scoreMessage(context);

      expect(result.score).toBe(4);
    });
  });

  describe('createScoringService', () => {
    it('should create a configured service', () => {
      const service = createScoringService({
        openaiApiKey: 'test-key',
        model: 'gpt-4o',
        fallbackEnabled: true,
      });

      expect(service).toBeInstanceOf(ScoringService);
    });
  });

  // Property-based tests
  describe('Property-based tests', () => {
    let service: ScoringService;

    beforeEach(() => {
      service = new ScoringService({ openaiApiKey: '', fallbackEnabled: true });
    });

    it('should always return score between 1 and 5 (property)', () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content }],
          };

          const result = service.ruleBasedScore(context);
          return result.score >= 1 && result.score <= 5;
        })
      );
    });

    it('should always return valid classification (property)', () => {
      const validClassifications = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

      fc.assert(
        fc.property(fc.string(), (content) => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content }],
          };

          const result = service.ruleBasedScore(context);
          return validClassifications.includes(result.classification);
        })
      );
    });

    it('should always return confidence between 0 and 1 (property)', () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content }],
          };

          const result = service.ruleBasedScore(context);
          return result.confidence >= 0 && result.confidence <= 1;
        })
      );
    });

    it('should always return non-empty suggestedAction (property)', () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content }],
          };

          const result = service.ruleBasedScore(context);
          return result.suggestedAction.length > 0;
        })
      );
    });

    it('should have budgetMentioned be boolean (property)', () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const context: AIScoringContext = {
            channel: 'whatsapp',
            messageHistory: [{ role: 'user', content }],
          };

          const result = service.ruleBasedScore(context);
          return typeof result.budgetMentioned === 'boolean';
        })
      );
    });
  });
});
