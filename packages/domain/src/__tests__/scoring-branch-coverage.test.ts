/**
 * @fileoverview Additional Branch Coverage Tests for AI Lead Scoring
 * Target: 95% coverage - focuses on uncovered branches, edge cases, and boundary conditions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScoringService, createScoringService } from '../scoring/scoring-service.js';
import type { AIScoringContext } from '@medicalcor/types';

// Mock the logger to prevent noise
vi.mock('@medicalcor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@medicalcor/core')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

describe('ScoringService - Branch Coverage', () => {
  // ===========================================================================
  // CONSTRUCTOR AND CONFIG BRANCHES
  // ===========================================================================

  describe('constructor branches', () => {
    it('should create with minimal config', () => {
      const service = createScoringService({
        openaiApiKey: 'test-key',
      });
      expect(service).toBeInstanceOf(ScoringService);
    });

    it('should create with custom model', () => {
      const service = createScoringService({
        openaiApiKey: 'test-key',
        model: 'gpt-4-turbo',
      });
      expect(service).toBeInstanceOf(ScoringService);
    });

    it('should create with fallback disabled', () => {
      const service = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: false,
      });
      expect(service).toBeInstanceOf(ScoringService);
    });

    it('should create with openai client dependency', () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });
      expect(service).toBeInstanceOf(ScoringService);
    });
  });

  // ===========================================================================
  // SCORE MESSAGE CONDITIONAL BRANCHES
  // ===========================================================================

  describe('scoreMessage conditional branches', () => {
    it('should skip AI scoring when openai client is not provided', async () => {
      const service = createScoringService({
        openaiApiKey: 'test-key',
      });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
      });

      // Should use rule-based scoring
      expect(result.confidence).toBe(0.7);
    });

    it('should skip AI scoring when openaiApiKey is empty', async () => {
      const mockOpenAI = {
        chat: { completions: { create: vi.fn() } },
      };

      const service = createScoringService({ openaiApiKey: '' }, { openai: mockOpenAI });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
      });

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
      expect(result.confidence).toBe(0.7);
    });

    it('should use AI when both openai client and apiKey are present', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      score: 4,
                      classification: 'HOT',
                      confidence: 0.9,
                      reasoning: 'Test',
                      suggestedAction: 'Act now',
                    }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'valid-key' }, { openai: mockOpenAI });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      expect(result.confidence).toBe(0.9);
    });

    it('should throw error when AI fails and fallback is disabled', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
          },
        },
      };

      const service = createScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: false },
        { openai: mockOpenAI }
      );

      await expect(
        service.scoreMessage({
          phone: '+40721234567',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  // ===========================================================================
  // RULE BASED SCORE BOUNDARY CONDITIONS
  // ===========================================================================

  describe('ruleBasedScore boundary conditions', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

    it('should return score exactly 4 for HOT threshold (All-on-X without budget)', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          { role: 'user', content: 'Ma intereseaza all-on-4', timestamp: new Date().toISOString() },
        ],
      });

      expect(result.score).toBe(4);
      expect(result.classification).toBe('HOT');
    });

    it('should return score exactly 3 for WARM threshold (implant interest only)', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          { role: 'user', content: 'Am nevoie de implanturi', timestamp: new Date().toISOString() },
        ],
      });

      expect(result.score).toBe(3);
      expect(result.classification).toBe('WARM');
    });

    it('should return score exactly 2 for COLD threshold (budget only, no procedure)', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          { role: 'user', content: 'Cat costa un tratament?', timestamp: new Date().toISOString() },
        ],
      });

      expect(result.score).toBe(2);
      expect(result.classification).toBe('COLD');
    });

    it('should return score exactly 1 for UNQUALIFIED (no indicators)', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Salut', timestamp: new Date().toISOString() }],
      });

      expect(result.score).toBe(1);
      expect(result.classification).toBe('UNQUALIFIED');
    });

    it('should handle undefined messageHistory', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
      } as AIScoringContext);

      expect(result.score).toBe(1);
      expect(result.classification).toBe('UNQUALIFIED');
    });

    it('should not duplicate procedures in array', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          { role: 'user', content: 'implant implant implant', timestamp: new Date().toISOString() },
        ],
      });

      const implantCount = result.procedureInterest?.filter((p) => p === 'implant').length ?? 0;
      expect(implantCount).toBeLessThanOrEqual(1);
    });

    it('should detect multiple procedure interests', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau implant si albire si fatete',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.procedureInterest?.length).toBeGreaterThanOrEqual(2);
    });

    it('should add budget indicator when budget mentioned without All-on-X', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Cat costa un implant? Am buget de 1000 euro',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.budgetMentioned).toBe(true);
      expect(result.reasoning).toContain('budget_mentioned');
    });
  });

  // ===========================================================================
  // SCORE TO CLASSIFICATION EDGE CASES
  // ===========================================================================

  describe('scoreToClassification', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

    // Test all boundary values via AI response parsing
    it('should classify score 5 as HOT', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 5 }), // No classification provided
                  },
                },
              ],
            }),
          },
        },
      };

      const svc = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await svc.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.classification).toBe('HOT');
    });

    it('should classify score 4 as HOT', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 4 }),
                  },
                },
              ],
            }),
          },
        },
      };

      const svc = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await svc.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.classification).toBe('HOT');
    });

    it('should classify score 3 as WARM', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 3 }),
                  },
                },
              ],
            }),
          },
        },
      };

      const svc = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await svc.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.classification).toBe('WARM');
    });

    it('should classify score 2 as COLD', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 2 }),
                  },
                },
              ],
            }),
          },
        },
      };

      const svc = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await svc.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.classification).toBe('COLD');
    });

    it('should classify score 1 as UNQUALIFIED', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 1 }),
                  },
                },
              ],
            }),
          },
        },
      };

      const svc = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await svc.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.classification).toBe('UNQUALIFIED');
    });
  });

  // ===========================================================================
  // AI RESPONSE PARSING EDGE CASES
  // ===========================================================================

  describe('parseAIResponse edge cases', () => {
    it('should handle AI response with extra text before JSON', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content:
                      'Based on my analysis:\n{"score": 4, "classification": "HOT", "confidence": 0.85}',
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.score).toBe(4);
    });

    it('should handle AI response with nested JSON structures', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      score: 3,
                      classification: 'WARM',
                      confidence: 0.75,
                      reasoning: 'Patient shows {interest} in procedures',
                      procedureInterest: ['implant', 'veneer'],
                    }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.score).toBe(3);
      expect(result.procedureInterest).toContain('implant');
    });

    it('should handle AI response missing optional fields', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      score: 2,
                      // Missing: classification, confidence, reasoning, etc.
                    }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.score).toBe(2);
      expect(result.classification).toBe('COLD');
      expect(result.confidence).toBe(0.8); // Default confidence
    });

    it('should use default arrays for urgencyIndicators and procedureInterest', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      score: 3,
                      classification: 'WARM',
                      // Missing urgencyIndicators and procedureInterest
                    }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      const result = await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      expect(result.urgencyIndicators).toEqual([]);
      expect(result.procedureInterest).toEqual([]);
    });
  });

  // ===========================================================================
  // BUILD USER PROMPT BRANCHES
  // ===========================================================================

  describe('buildUserPrompt branches', () => {
    it('should include UTM when provided with null values', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 3, classification: 'WARM' }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        utm: {
          utm_source: null as unknown as string,
          utm_campaign: null as unknown as string,
        },
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0]?.[0];
      const userPrompt = callArgs?.messages?.[1]?.content;
      expect(userPrompt).toContain('direct'); // Fallback for null utm_source
    });

    it('should include UTM when provided with undefined values', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 3, classification: 'WARM' }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        utm: {
          utm_source: undefined as unknown as string,
          utm_campaign: undefined as unknown as string,
        },
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0]?.[0];
      const userPrompt = callArgs?.messages?.[1]?.content;
      expect(userPrompt).toContain('direct');
      expect(userPrompt).toContain('none');
    });

    it('should omit UTM section when utm is not provided', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 3, classification: 'WARM' }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0]?.[0];
      const userPrompt = callArgs?.messages?.[1]?.content;
      expect(userPrompt).not.toContain('SOURCE:');
    });

    it('should include unknown language when not provided', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 3, classification: 'WARM' }),
                  },
                },
              ],
            }),
          },
        },
      };

      const service = createScoringService({ openaiApiKey: 'test-key' }, { openai: mockOpenAI });

      await service.scoreMessage({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
      });

      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0]?.[0];
      const userPrompt = callArgs?.messages?.[1]?.content;
      expect(userPrompt).toContain('unknown');
    });
  });

  // ===========================================================================
  // GET SUGGESTED ACTION LANGUAGE BRANCHES
  // ===========================================================================

  describe('getSuggestedAction language branches', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

    it('should return Romanian action for HOT classification', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau all-on-4 cat costa?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.suggestedAction).toContain('Contactați');
    });

    it('should return English action for HOT classification', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'en',
        messageHistory: [
          { role: 'user', content: 'all-on-4 how much', timestamp: new Date().toISOString() },
        ],
      });

      expect(result.suggestedAction).toContain('Contact immediately');
    });

    it('should return German action for HOT classification', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'de',
        messageHistory: [
          { role: 'user', content: 'all-on-4 wie viel', timestamp: new Date().toISOString() },
        ],
      });

      expect(result.suggestedAction).toContain('Sofort kontaktieren');
    });

    it('should return Romanian action for WARM classification', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          {
            role: 'user',
            content: 'Ma intereseaza implanturi',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.suggestedAction).toContain('informații');
    });

    it('should return English action for COLD classification', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'en',
        messageHistory: [
          { role: 'user', content: 'Just browsing', timestamp: new Date().toISOString() },
        ],
      });

      expect(result.suggestedAction).toContain('politely');
    });

    it('should return German action for UNQUALIFIED classification', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'de',
        messageHistory: [{ role: 'user', content: 'Hallo', timestamp: new Date().toISOString() }],
      });

      expect(result.suggestedAction).toContain('Höflich');
    });

    it('should fallback to Romanian when language is undefined', () => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau all-on-4 cat costa?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.suggestedAction).toContain('Contactați');
    });
  });

  // ===========================================================================
  // ALL-ON-X KEYWORD VARIATIONS
  // ===========================================================================

  describe('All-on-X keyword variations', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

    const allOnXVariations = ['all-on-4', 'all-on-x', 'all on 4', 'all on x', 'all-on-6'];

    it.each(allOnXVariations)('should detect "%s" as All-on-X interest', (keyword) => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          { role: 'user', content: `Vreau ${keyword}`, timestamp: new Date().toISOString() },
        ],
      });

      expect(result.procedureInterest).toContain('All-on-X');
      expect(result.score).toBeGreaterThanOrEqual(4);
    });
  });

  // ===========================================================================
  // URGENCY KEYWORD VARIATIONS
  // ===========================================================================

  describe('Urgency keyword variations', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

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

    it.each(urgencyKeywords)('should detect "%s" as urgency indicator', (keyword) => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          { role: 'user', content: `Am nevoie ${keyword}`, timestamp: new Date().toISOString() },
        ],
      });

      expect(result.urgencyIndicators).toContain('priority_scheduling_requested');
    });
  });

  // ===========================================================================
  // BUDGET KEYWORD VARIATIONS
  // ===========================================================================

  describe('Budget keyword variations', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

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

    it.each(budgetKeywords)('should detect "%s" as budget indicator', (keyword) => {
      const result = service.ruleBasedScore({
        phone: '+40721234567',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: `Intrebare despre ${keyword}`,
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.budgetMentioned).toBe(true);
    });
  });

  // ===========================================================================
  // PROCEDURE KEYWORD DETECTION
  // ===========================================================================

  describe('Procedure keyword detection', () => {
    const service = createScoringService({ openaiApiKey: 'test-key' });

    const procedureTests = [
      { keyword: 'implant', expected: 'implant' },
      { keyword: 'implanturi', expected: 'implant' },
      { keyword: 'implante', expected: 'implant' },
      { keyword: 'fatete', expected: 'veneer' },
      { keyword: 'veneer', expected: 'veneer' },
      { keyword: 'fateta', expected: 'veneer' },
      { keyword: 'albire', expected: 'whitening' },
      { keyword: 'whitening', expected: 'whitening' },
      { keyword: 'extractie', expected: 'extraction' },
      { keyword: 'scoatere dinte', expected: 'extraction' },
      { keyword: 'arcada completa', expected: 'allOnX' },
    ];

    it.each(procedureTests)(
      'should detect "$keyword" as $expected procedure',
      ({ keyword, expected }) => {
        const result = service.ruleBasedScore({
          phone: '+40721234567',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          messageHistory: [
            { role: 'user', content: `Vreau ${keyword}`, timestamp: new Date().toISOString() },
          ],
        });

        expect(result.procedureInterest).toContain(expected);
      }
    );
  });
});
