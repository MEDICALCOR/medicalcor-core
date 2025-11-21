import { describe, it, expect } from 'vitest';
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
        messageHistory: [{
          role: 'user',
          content: 'Vreau sa fac all-on-4, cat costa?',
          timestamp: new Date().toISOString(),
        }],
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
        messageHistory: [{
          role: 'user',
          content: 'Ma intereseaza all-on-4',
          timestamp: new Date().toISOString(),
        }],
      });

      expect(result.score).toBe(4);
      expect(result.classification).toBe('HOT');
    });

    it('should score WARM (3) for implant interest', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{
          role: 'user',
          content: 'Vreau informatii despre implanturi',
          timestamp: new Date().toISOString(),
        }],
      });

      expect(result.score).toBe(3);
      expect(result.classification).toBe('WARM');
    });

    it('should boost score for urgency indicators', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{
          role: 'user',
          content: 'Am durere, am nevoie urgent de implant',
          timestamp: new Date().toISOString(),
        }],
      });

      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.urgencyIndicators).toContain('urgency_detected');
    });

    it('should score COLD for vague messages', () => {
      const result = service.ruleBasedScore({
        phone: '+40721123456',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        messageHistory: [{
          role: 'user',
          content: 'Buna ziua',
          timestamp: new Date().toISOString(),
        }],
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
        messageHistory: [{
          role: 'user',
          content: 'Vreau all-on-4, cat costa?',
          timestamp: new Date().toISOString(),
        }],
      });

      expect(hotResult.suggestedAction).toContain('imediat');
    });
  });
});
