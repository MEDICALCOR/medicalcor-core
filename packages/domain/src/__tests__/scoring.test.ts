import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoringService } from '../scoring/scoring-service.js';

describe('ScoringService', () => {
  const service = new ScoringService({
    openaiApiKey: 'test-key',
    fallbackEnabled: true,
  });

  describe('ruleBasedScore', () => {
    it('should score HOT (5) for All-on-X with budget mention', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau sa fac all-on-4, cat costa?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
      expect(result.budgetMentioned).toBe(true);
      expect(result.procedureInterest).toContain('All-on-X');
    });

    it('should score HOT (4) for All-on-X without budget', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Ma intereseaza all-on-4',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(4);
      expect(result.classification).toBe('HOT');
    });

    it('should score WARM (3) for implant interest', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau informatii despre implanturi',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(3);
      expect(result.classification).toBe('WARM');
    });

    it('should boost score for urgency indicators (priority scheduling)', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Am durere, am nevoie urgent de implant',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      // Pain/urgency indicates high purchase intent and need for priority scheduling
      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.urgencyIndicators).toContain('priority_scheduling_requested');
    });

    it('should score COLD for vague messages', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Buna ziua',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBeLessThanOrEqual(2);
      expect(['COLD', 'UNQUALIFIED']).toContain(result.classification);
    });

    it('should provide suggested action based on classification', () => {
      const hotResult = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau all-on-4, cat costa?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(hotResult.suggestedAction).toContain('imediat');
    });

    // =====================================================================
    // NEW TESTS: Extended coverage for scoring edge cases
    // =====================================================================

    it('should score HOT (5) for All-on-6 variant with budget', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Caut informatii despre all-on-6, vreau sa stiu pretul',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
      expect(result.budgetMentioned).toBe(true);
    });

    it('should detect veneer interest and score WARM', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau sa pun fatete dentare',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(3);
      expect(result.classification).toBe('WARM');
      expect(result.procedureInterest).toContain('veneer');
    });

    it('should detect whitening interest and score WARM', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Cat costa o albire dentara?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(4); // WARM (3) + budget mention (+1)
      expect(result.classification).toBe('HOT');
      expect(result.procedureInterest).toContain('whitening');
    });

    it('should detect extraction interest', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Am nevoie de o extractie dentara',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.procedureInterest).toContain('extraction');
    });

    it('should boost score for "cat mai repede" urgency', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau implant cat mai repede posibil',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.urgencyIndicators).toContain('priority_scheduling_requested');
    });

    it('should boost score for "maine" urgency', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Am durere mare, pot veni maine?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.urgencyIndicators).toContain('priority_scheduling_requested');
    });

    it('should handle multiple message history', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Buna ziua',
            timestamp: new Date(Date.now() - 60000).toISOString(),
          },
          {
            role: 'assistant',
            content: 'Buna ziua! Cu ce va putem ajuta?',
            timestamp: new Date(Date.now() - 50000).toISOString(),
          },
          {
            role: 'user',
            content: 'Ma intereseaza all-on-4, cat costa?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
    });

    it('should handle empty message history gracefully', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [],
      });

      expect(result.score).toBe(1);
      expect(result.classification).toBe('UNQUALIFIED');
    });

    it('should provide English suggested action when language is en', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'en',
        messageHistory: [
          {
            role: 'user',
            content: 'I want all-on-4, how much does it cost?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.suggestedAction).toContain('immediately');
    });

    it('should provide German suggested action when language is de', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'de',
        messageHistory: [
          {
            role: 'user',
            content: 'Ich möchte all-on-4, was kostet das?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.suggestedAction).toContain('kontaktieren');
    });

    it('should detect financing interest as budget mention', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Oferiti finantare sau plata in rate pentru implanturi?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.budgetMentioned).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(4);
    });

    it('should cap score at maximum 5', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content:
              'Urgent, vreau all-on-4, cat costa? Am durere si am nevoie imediat! Buget 10000 euro.',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
    });

    it('should return confidence of 0.7 for rule-based scoring', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Informatii despre implanturi',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.confidence).toBe(0.7);
    });
  });

  describe('scoreMessage', () => {
    it('should use rule-based scoring when no OpenAI client is provided', async () => {
      const result = await service.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau all-on-4, cat costa?',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
      expect(result.confidence).toBe(0.7); // Rule-based confidence
    });

    it('should fallback to rule-based when AI fails and fallback is enabled', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const result = await serviceWithAI.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Ma intereseaza implanturi',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.confidence).toBe(0.7); // Rule-based fallback
    });

    it('should throw when AI fails and fallback is disabled', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: false },
        { openai: mockOpenAI }
      );

      await expect(
        serviceWithAI.scoreMessage({
          phone: '+40721123456',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          messageHistory: [
            {
              role: 'user',
              content: 'Ma intereseaza implanturi',
              timestamp: new Date().toISOString(),
            },
          ],
        })
      ).rejects.toThrow('API Error');
    });

    it('should use AI scoring when OpenAI client is available', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      score: 5,
                      classification: 'HOT',
                      confidence: 0.95,
                      reasoning: 'AI detected high intent',
                      suggestedAction: 'Contact immediately',
                      urgencyIndicators: ['budget_mentioned'],
                      budgetMentioned: true,
                      procedureInterest: ['All-on-X'],
                    }),
                  },
                },
              ],
            }),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const result = await serviceWithAI.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Vreau all-on-4',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(5);
      expect(result.confidence).toBe(0.95); // AI confidence
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledOnce();
    });

    it('should handle AI response with markdown wrapper', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content:
                      '```json\n{"score": 4, "classification": "HOT", "confidence": 0.85}\n```',
                  },
                },
              ],
            }),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      const result = await serviceWithAI.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Test message',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(result.score).toBe(4);
    });

    it('should handle empty AI response gracefully', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: '',
                  },
                },
              ],
            }),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: false },
        { openai: mockOpenAI }
      );

      await expect(
        serviceWithAI.scoreMessage({
          phone: '+40721123456',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          messageHistory: [
            {
              role: 'user',
              content: 'Test',
              timestamp: new Date().toISOString(),
            },
          ],
        })
      ).rejects.toThrow('Empty response from AI');
    });

    it('should handle invalid JSON from AI with safe fallback', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: 'This is not valid JSON',
                  },
                },
              ],
            }),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: false },
        { openai: mockOpenAI }
      );

      const result = await serviceWithAI.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Test',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      // Should return safe fallback
      expect(result.score).toBe(2);
      expect(result.classification).toBe('COLD');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle invalid score in AI response', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 10, classification: 'HOT' }), // Invalid score > 5
                  },
                },
              ],
            }),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: false },
        { openai: mockOpenAI }
      );

      const result = await serviceWithAI.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [
          {
            role: 'user',
            content: 'Test',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      // Should return safe fallback due to invalid score
      expect(result.score).toBe(2);
      expect(result.classification).toBe('COLD');
    });

    it('should include UTM data in AI prompt when available', async () => {
      const mockOpenAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ score: 3, classification: 'WARM', confidence: 0.8 }),
                  },
                },
              ],
            }),
          },
        },
      };

      const serviceWithAI = new ScoringService(
        { openaiApiKey: 'test-key', fallbackEnabled: true },
        { openai: mockOpenAI }
      );

      await serviceWithAI.scoreMessage({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        utm: {
          utm_source: 'google',
          utm_campaign: 'implants_2024',
        },
        messageHistory: [
          {
            role: 'user',
            content: 'Test',
            timestamp: new Date().toISOString(),
          },
        ],
      });

      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userPrompt = callArgs.messages[1].content;
      expect(userPrompt).toContain('google');
      expect(userPrompt).toContain('implants_2024');
    });
  });

  describe('createScoringService factory', () => {
    it('should create a scoring service instance', async () => {
      const { createScoringService } = await import('../scoring/scoring-service.js');
      const newService = createScoringService({ openaiApiKey: 'test-key' });
      expect(newService).toBeInstanceOf(ScoringService);
    });
  });
});
