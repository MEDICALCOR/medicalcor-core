/**
 * NPS Schema Tests
 * Comprehensive tests for NPS schemas and helper functions
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  NPSScoreSchema,
  NPSClassificationSchema,
  NPSSurveyStatusSchema,
  NPSTriggerTypeSchema,
  NPSSurveyChannelSchema,
  NPSSurveyRequestSchema,
  NPSResponseSchema,
  NPSSurveyRecordSchema,
  NPSCollectionPayloadSchema,
  NPSResponseProcessingPayloadSchema,
  NPSFollowUpPayloadSchema,
  NPSScoreDistributionSchema,
  NPSSummaryStatsSchema,
  NPSTrendPointSchema,
  NPSDashboardDataSchema,
  classifyNPSScore,
  calculateNPS,
  requiresImmediateFollowUp,
  getFollowUpPriority,
} from '../nps.js';

describe('NPS Schemas', () => {
  describe('NPSScoreSchema', () => {
    it('should accept valid scores 0-10', () => {
      for (let i = 0; i <= 10; i++) {
        expect(NPSScoreSchema.safeParse(i).success).toBe(true);
      }
    });

    it('should reject scores below 0', () => {
      expect(NPSScoreSchema.safeParse(-1).success).toBe(false);
      expect(NPSScoreSchema.safeParse(-100).success).toBe(false);
    });

    it('should reject scores above 10', () => {
      expect(NPSScoreSchema.safeParse(11).success).toBe(false);
      expect(NPSScoreSchema.safeParse(100).success).toBe(false);
    });

    it('should reject non-integer scores', () => {
      expect(NPSScoreSchema.safeParse(5.5).success).toBe(false);
      expect(NPSScoreSchema.safeParse(7.3).success).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(NPSScoreSchema.safeParse('5').success).toBe(false);
      expect(NPSScoreSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('NPSClassificationSchema', () => {
    it('should accept valid classifications', () => {
      expect(NPSClassificationSchema.safeParse('promoter').success).toBe(true);
      expect(NPSClassificationSchema.safeParse('passive').success).toBe(true);
      expect(NPSClassificationSchema.safeParse('detractor').success).toBe(true);
    });

    it('should reject invalid classifications', () => {
      expect(NPSClassificationSchema.safeParse('invalid').success).toBe(false);
      expect(NPSClassificationSchema.safeParse('').success).toBe(false);
    });
  });

  describe('NPSSurveyStatusSchema', () => {
    it('should accept all valid statuses', () => {
      const validStatuses = ['pending', 'sent', 'responded', 'expired', 'skipped'];
      validStatuses.forEach((status) => {
        expect(NPSSurveyStatusSchema.safeParse(status).success).toBe(true);
      });
    });
  });

  describe('NPSTriggerTypeSchema', () => {
    it('should accept all valid trigger types', () => {
      const validTypes = [
        'post_appointment',
        'post_treatment',
        'periodic',
        'post_onboarding',
        'manual',
      ];
      validTypes.forEach((type) => {
        expect(NPSTriggerTypeSchema.safeParse(type).success).toBe(true);
      });
    });
  });

  describe('NPSSurveyChannelSchema', () => {
    it('should accept all valid channels', () => {
      const validChannels = ['whatsapp', 'sms', 'email', 'web'];
      validChannels.forEach((channel) => {
        expect(NPSSurveyChannelSchema.safeParse(channel).success).toBe(true);
      });
    });
  });

  describe('NPSSurveyRequestSchema', () => {
    it('should accept valid survey request', () => {
      const validRequest = {
        phone: '+40712345678',
        triggerType: 'post_appointment',
        correlationId: 'test-correlation-id',
      };
      expect(NPSSurveyRequestSchema.safeParse(validRequest).success).toBe(true);
    });

    it('should apply defaults', () => {
      const request = {
        phone: '+40712345678',
        triggerType: 'post_appointment',
        correlationId: 'test-id',
      };
      const result = NPSSurveyRequestSchema.parse(request);
      expect(result.channel).toBe('whatsapp');
      expect(result.language).toBe('ro');
    });

    it('should reject invalid phone format', () => {
      const invalidRequest = {
        phone: '0712345678', // Missing +40 prefix
        triggerType: 'post_appointment',
        correlationId: 'test-id',
      };
      expect(NPSSurveyRequestSchema.safeParse(invalidRequest).success).toBe(false);
    });

    it('should accept optional fields', () => {
      const fullRequest = {
        phone: '+40712345678',
        hubspotContactId: 'hs-123',
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        triggerType: 'post_treatment',
        appointmentId: '550e8400-e29b-41d4-a716-446655440001',
        procedureType: 'dental_implant',
        channel: 'email',
        language: 'en',
        correlationId: 'corr-123',
      };
      expect(NPSSurveyRequestSchema.safeParse(fullRequest).success).toBe(true);
    });
  });

  describe('NPSResponseSchema', () => {
    it('should accept valid response', () => {
      const validResponse = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        score: 9,
        classification: 'promoter',
        triggerType: 'post_appointment',
        channel: 'whatsapp',
        language: 'ro',
        surveyedAt: new Date().toISOString(),
        respondedAt: new Date().toISOString(),
      };
      expect(NPSResponseSchema.safeParse(validResponse).success).toBe(true);
    });

    it('should accept feedback up to 2000 chars', () => {
      const response = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        score: 10,
        classification: 'promoter',
        feedback: 'A'.repeat(2000),
        triggerType: 'post_appointment',
        channel: 'whatsapp',
        language: 'ro',
        surveyedAt: new Date(),
        respondedAt: new Date(),
      };
      expect(NPSResponseSchema.safeParse(response).success).toBe(true);
    });

    it('should reject feedback over 2000 chars', () => {
      const response = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        score: 10,
        classification: 'promoter',
        feedback: 'A'.repeat(2001),
        triggerType: 'post_appointment',
        channel: 'whatsapp',
        language: 'ro',
        surveyedAt: new Date(),
        respondedAt: new Date(),
      };
      expect(NPSResponseSchema.safeParse(response).success).toBe(false);
    });

    it('should accept sentiment score between -1 and 1', () => {
      const response = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        score: 5,
        classification: 'detractor',
        sentimentScore: -0.8,
        triggerType: 'post_appointment',
        channel: 'whatsapp',
        language: 'ro',
        surveyedAt: new Date(),
        respondedAt: new Date(),
      };
      expect(NPSResponseSchema.safeParse(response).success).toBe(true);
    });
  });

  describe('NPSSurveyRecordSchema', () => {
    it('should accept valid survey record', () => {
      const record = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        status: 'responded',
        triggerType: 'post_appointment',
        channel: 'whatsapp',
        language: 'ro',
        scheduledFor: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(NPSSurveyRecordSchema.safeParse(record).success).toBe(true);
    });

    it('should accept all survey statuses', () => {
      const statuses = ['pending', 'sent', 'responded', 'expired', 'skipped'];
      statuses.forEach((status) => {
        const record = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          phone: '+40712345678',
          status,
          triggerType: 'manual',
          channel: 'email',
          language: 'en',
          scheduledFor: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expect(NPSSurveyRecordSchema.safeParse(record).success).toBe(true);
      });
    });
  });

  describe('NPSCollectionPayloadSchema', () => {
    it('should accept valid payload with defaults', () => {
      const payload = {
        phone: '+40712345678',
        triggerType: 'post_appointment',
        correlationId: 'corr-123',
      };
      const result = NPSCollectionPayloadSchema.parse(payload);
      expect(result.channel).toBe('whatsapp');
      expect(result.language).toBe('ro');
      expect(result.delayMinutes).toBe(60);
    });

    it('should accept custom delay minutes', () => {
      const payload = {
        phone: '+40712345678',
        triggerType: 'post_treatment',
        correlationId: 'corr-456',
        delayMinutes: 120,
      };
      const result = NPSCollectionPayloadSchema.parse(payload);
      expect(result.delayMinutes).toBe(120);
    });
  });

  describe('NPSResponseProcessingPayloadSchema', () => {
    it('should accept valid processing payload', () => {
      const payload = {
        surveyId: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        messageContent: '10',
        channel: 'whatsapp',
        receivedAt: new Date(),
        correlationId: 'corr-789',
      };
      expect(NPSResponseProcessingPayloadSchema.safeParse(payload).success).toBe(true);
    });
  });

  describe('NPSFollowUpPayloadSchema', () => {
    it('should accept valid follow-up payload', () => {
      const payload = {
        responseId: '550e8400-e29b-41d4-a716-446655440000',
        phone: '+40712345678',
        score: 3,
        classification: 'detractor',
        reason: 'Low score requires immediate attention',
        priority: 'critical',
        correlationId: 'corr-101',
      };
      expect(NPSFollowUpPayloadSchema.safeParse(payload).success).toBe(true);
    });

    it('should accept all priority levels', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      priorities.forEach((priority) => {
        const payload = {
          responseId: '550e8400-e29b-41d4-a716-446655440000',
          phone: '+40712345678',
          score: 5,
          classification: 'detractor',
          reason: 'Test',
          priority,
          correlationId: 'corr-102',
        };
        expect(NPSFollowUpPayloadSchema.safeParse(payload).success).toBe(true);
      });
    });
  });

  describe('NPSScoreDistributionSchema', () => {
    it('should accept valid distribution entry', () => {
      const entry = {
        score: 10,
        count: 150,
        percentage: 25.5,
      };
      expect(NPSScoreDistributionSchema.safeParse(entry).success).toBe(true);
    });

    it('should reject percentage over 100', () => {
      const entry = {
        score: 10,
        count: 100,
        percentage: 101,
      };
      expect(NPSScoreDistributionSchema.safeParse(entry).success).toBe(false);
    });
  });

  describe('NPSSummaryStatsSchema', () => {
    it('should accept valid summary stats', () => {
      const stats = {
        npsScore: 45,
        totalResponses: 200,
        promoterCount: 100,
        passiveCount: 50,
        detractorCount: 50,
        promoterPercentage: 50,
        passivePercentage: 25,
        detractorPercentage: 25,
        averageScore: 7.5,
        responseRate: 65.5,
        periodStart: new Date(),
        periodEnd: new Date(),
      };
      expect(NPSSummaryStatsSchema.safeParse(stats).success).toBe(true);
    });

    it('should accept NPS score range -100 to 100', () => {
      const baseStats = {
        totalResponses: 100,
        promoterCount: 0,
        passiveCount: 0,
        detractorCount: 100,
        promoterPercentage: 0,
        passivePercentage: 0,
        detractorPercentage: 100,
        averageScore: 2,
        responseRate: 50,
        periodStart: new Date(),
        periodEnd: new Date(),
      };

      expect(NPSSummaryStatsSchema.safeParse({ ...baseStats, npsScore: -100 }).success).toBe(true);
      expect(NPSSummaryStatsSchema.safeParse({ ...baseStats, npsScore: 100 }).success).toBe(true);
      expect(NPSSummaryStatsSchema.safeParse({ ...baseStats, npsScore: -101 }).success).toBe(false);
      expect(NPSSummaryStatsSchema.safeParse({ ...baseStats, npsScore: 101 }).success).toBe(false);
    });
  });

  describe('NPSTrendPointSchema', () => {
    it('should accept valid trend point', () => {
      const point = {
        date: new Date(),
        npsScore: 55,
        responseCount: 50,
        promoterCount: 30,
        passiveCount: 15,
        detractorCount: 5,
      };
      expect(NPSTrendPointSchema.safeParse(point).success).toBe(true);
    });
  });

  describe('NPSDashboardDataSchema', () => {
    it('should accept valid dashboard data', () => {
      const dashboard = {
        summary: {
          npsScore: 45,
          totalResponses: 200,
          promoterCount: 100,
          passiveCount: 50,
          detractorCount: 50,
          promoterPercentage: 50,
          passivePercentage: 25,
          detractorPercentage: 25,
          averageScore: 7.5,
          responseRate: 65.5,
          periodStart: new Date(),
          periodEnd: new Date(),
        },
        distribution: [
          { score: 10, count: 50, percentage: 25 },
          { score: 9, count: 50, percentage: 25 },
        ],
        trend: [
          {
            date: new Date(),
            npsScore: 45,
            responseCount: 50,
            promoterCount: 25,
            passiveCount: 15,
            detractorCount: 10,
          },
        ],
        recentFeedback: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            phone: '+40712345678',
            score: 3,
            classification: 'detractor',
            feedback: 'Could be better',
            respondedAt: new Date(),
            requiresFollowUp: true,
          },
        ],
        topThemes: [
          { theme: 'wait_time', count: 25, sentiment: 'negative' },
          { theme: 'staff_friendly', count: 50, sentiment: 'positive' },
        ],
      };
      expect(NPSDashboardDataSchema.safeParse(dashboard).success).toBe(true);
    });
  });
});

describe('NPS Helper Functions', () => {
  describe('classifyNPSScore', () => {
    it('should classify scores 9-10 as promoters', () => {
      expect(classifyNPSScore(9)).toBe('promoter');
      expect(classifyNPSScore(10)).toBe('promoter');
    });

    it('should classify scores 7-8 as passives', () => {
      expect(classifyNPSScore(7)).toBe('passive');
      expect(classifyNPSScore(8)).toBe('passive');
    });

    it('should classify scores 0-6 as detractors', () => {
      for (let i = 0; i <= 6; i++) {
        expect(classifyNPSScore(i)).toBe('detractor');
      }
    });

    it('should handle all valid NPS scores (property-based)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 }), (score) => {
          const classification = classifyNPSScore(score);
          return ['promoter', 'passive', 'detractor'].includes(classification);
        })
      );
    });
  });

  describe('calculateNPS', () => {
    it('should return 0 for no responses', () => {
      expect(calculateNPS(0, 0, 0)).toBe(0);
    });

    it('should return 100 for all promoters', () => {
      expect(calculateNPS(100, 0, 0)).toBe(100);
    });

    it('should return -100 for all detractors', () => {
      expect(calculateNPS(0, 0, 100)).toBe(-100);
    });

    it('should return 0 for equal promoters and detractors', () => {
      expect(calculateNPS(50, 0, 50)).toBe(0);
    });

    it('should ignore passives in calculation', () => {
      // 50 promoters, 100 passives, 50 detractors = 25% - 25% = 0
      expect(calculateNPS(50, 100, 50)).toBe(0);
    });

    it('should calculate correctly with mixed counts', () => {
      // 70 promoters, 20 passives, 10 detractors = 70% - 10% = 60
      expect(calculateNPS(70, 20, 10)).toBe(60);
    });

    it('should round to nearest integer', () => {
      // 33 promoters, 33 passives, 34 detractors = 33% - 34% = -1
      const result = calculateNPS(33, 33, 34);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should always return value between -100 and 100 (property-based)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (promoters, passives, detractors) => {
            const nps = calculateNPS(promoters, passives, detractors);
            return nps >= -100 && nps <= 100;
          }
        )
      );
    });
  });

  describe('requiresImmediateFollowUp', () => {
    it('should return true for scores 0-3', () => {
      expect(requiresImmediateFollowUp(0)).toBe(true);
      expect(requiresImmediateFollowUp(1)).toBe(true);
      expect(requiresImmediateFollowUp(2)).toBe(true);
      expect(requiresImmediateFollowUp(3)).toBe(true);
    });

    it('should return false for high scores without feedback', () => {
      expect(requiresImmediateFollowUp(7)).toBe(false);
      expect(requiresImmediateFollowUp(8)).toBe(false);
      expect(requiresImmediateFollowUp(9)).toBe(false);
      expect(requiresImmediateFollowUp(10)).toBe(false);
    });

    it('should return true for detractor with negative Romanian feedback', () => {
      expect(requiresImmediateFollowUp(5, 'Am fost foarte dezamăgit de servicii')).toBe(true);
      expect(requiresImmediateFollowUp(4, 'A fost groaznic')).toBe(true);
      expect(requiresImmediateFollowUp(6, 'Oribil, nu voi reveni')).toBe(true);
      expect(requiresImmediateFollowUp(5, 'Nu voi veni niciodată înapoi')).toBe(true);
      expect(requiresImmediateFollowUp(6, 'Vreau să fac reclamație')).toBe(true);
    });

    it('should return true for detractor with negative English feedback', () => {
      expect(requiresImmediateFollowUp(5, 'I was very disappointed')).toBe(true);
      expect(requiresImmediateFollowUp(4, 'It was terrible')).toBe(true);
      expect(requiresImmediateFollowUp(6, 'Horrible experience')).toBe(true);
      expect(requiresImmediateFollowUp(5, 'I will never come back')).toBe(true);
      expect(requiresImmediateFollowUp(6, 'I want to file a complaint')).toBe(true);
    });

    it('should return true for detractor with negative German feedback', () => {
      expect(requiresImmediateFollowUp(5, 'Ich war sehr enttäuscht')).toBe(true);
      expect(requiresImmediateFollowUp(4, 'Es war schrecklich')).toBe(true);
      expect(requiresImmediateFollowUp(5, 'Ich werde niemals zurückkommen')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(requiresImmediateFollowUp(5, 'DEZAMĂGIT')).toBe(true);
      expect(requiresImmediateFollowUp(5, 'TERRIBLE')).toBe(true);
    });

    it('should return false for detractor with neutral feedback', () => {
      expect(requiresImmediateFollowUp(5, 'It was okay')).toBe(false);
      expect(requiresImmediateFollowUp(6, 'Average experience')).toBe(false);
    });

    it('should return false for scores 7+', () => {
      expect(requiresImmediateFollowUp(7, 'disappointed')).toBe(false);
      expect(requiresImmediateFollowUp(9, 'terrible')).toBe(false);
    });
  });

  describe('getFollowUpPriority', () => {
    it('should return critical for scores 0-3', () => {
      expect(getFollowUpPriority(0)).toBe('critical');
      expect(getFollowUpPriority(1)).toBe('critical');
      expect(getFollowUpPriority(2)).toBe('critical');
      expect(getFollowUpPriority(3)).toBe('critical');
    });

    it('should return high for scores 4-5', () => {
      expect(getFollowUpPriority(4)).toBe('high');
      expect(getFollowUpPriority(5)).toBe('high');
    });

    it('should return medium for score 6', () => {
      expect(getFollowUpPriority(6)).toBe('medium');
    });

    it('should return low for scores 7-8 with substantial feedback', () => {
      const longFeedback = 'A'.repeat(51);
      expect(getFollowUpPriority(7, longFeedback)).toBe('low');
      expect(getFollowUpPriority(8, longFeedback)).toBe('low');
    });

    it('should return low for scores 7-8 without feedback', () => {
      expect(getFollowUpPriority(7)).toBe('low');
      expect(getFollowUpPriority(8)).toBe('low');
    });

    it('should return low for promoter scores', () => {
      expect(getFollowUpPriority(9)).toBe('low');
      expect(getFollowUpPriority(10)).toBe('low');
    });

    it('should always return valid priority (property-based)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.option(fc.string({ minLength: 0, maxLength: 100 })),
          (score, feedback) => {
            const priority = getFollowUpPriority(score, feedback ?? undefined);
            return ['critical', 'high', 'medium', 'low'].includes(priority);
          }
        )
      );
    });
  });
});
