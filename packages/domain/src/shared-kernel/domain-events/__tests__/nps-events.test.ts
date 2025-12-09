/**
 * @fileoverview NPS Domain Events Tests
 *
 * Tests for NPS domain events factory functions and type guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventMetadata } from '../lead-events.js';
import {
  createNPSSurveyScheduledEvent,
  createNPSSurveySentEvent,
  createNPSResponseReceivedEvent,
  createNPSSurveyExpiredEvent,
  createNPSSurveySkippedEvent,
  createNPSFollowUpRequiredEvent,
  createNPSFollowUpCompletedEvent,
  createNPSFeedbackAnalyzedEvent,
  createNPSScoreSyncedEvent,
  isNPSSurveyScheduledEvent,
  isNPSSurveySentEvent,
  isNPSResponseReceivedEvent,
  isNPSSurveyExpiredEvent,
  isNPSSurveySkippedEvent,
  isNPSFollowUpRequiredEvent,
  isNPSFollowUpCompletedEvent,
  isNPSFeedbackAnalyzedEvent,
  isNPSScoreSyncedEvent,
  type NPSSurveyScheduledPayload,
  type NPSSurveySentPayload,
  type NPSResponseReceivedPayload,
  type NPSSurveyExpiredPayload,
  type NPSSurveySkippedPayload,
  type NPSFollowUpRequiredPayload,
  type NPSFollowUpCompletedPayload,
  type NPSFeedbackAnalyzedPayload,
  type NPSScoreSyncedPayload,
  type NPSDomainEvent,
} from '../nps-events.js';

describe('NPS Domain Events', () => {
  const mockMetadata: EventMetadata = {
    eventId: '123e4567-e89b-12d3-a456-426614174000',
    timestamp: new Date().toISOString(),
    correlationId: 'corr-123',
    idempotencyKey: 'idem-123',
    version: 1,
    source: 'test-service',
  };

  const aggregateId = 'patient-123';

  describe('createNPSSurveyScheduledEvent', () => {
    it('should create a survey scheduled event', () => {
      const payload: NPSSurveyScheduledPayload = {
        surveyId: 'survey-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        patientId: 'patient-123',
        triggerType: 'post_appointment',
        appointmentId: 'appt-789',
        procedureType: 'implant',
        channel: 'whatsapp',
        language: 'ro',
        scheduledFor: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      const event = createNPSSurveyScheduledEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.survey_scheduled');
      expect(event.aggregateId).toBe(aggregateId);
      expect(event.aggregateType).toBe('Patient');
      expect(event.metadata).toBe(mockMetadata);
      expect(event.payload).toBe(payload);
    });
  });

  describe('createNPSSurveySentEvent', () => {
    it('should create a survey sent event', () => {
      const payload: NPSSurveySentPayload = {
        surveyId: 'survey-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        channel: 'sms',
        templateName: 'nps_survey_ro',
        messageId: 'msg-123',
        sentAt: new Date().toISOString(),
      };

      const event = createNPSSurveySentEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.survey_sent');
      expect(event.aggregateId).toBe(aggregateId);
      expect(event.aggregateType).toBe('Patient');
      expect(event.payload.channel).toBe('sms');
    });
  });

  describe('createNPSResponseReceivedEvent', () => {
    it('should create a response received event for promoter', () => {
      const payload: NPSResponseReceivedPayload = {
        surveyId: 'survey-123',
        responseId: 'resp-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        score: 9,
        classification: 'promoter',
        feedback: 'Excellent service!',
        channel: 'whatsapp',
        responseLatencyMinutes: 30,
        respondedAt: new Date().toISOString(),
        triggerType: 'post_treatment',
        appointmentId: 'appt-789',
        procedureType: 'dental_implant',
      };

      const event = createNPSResponseReceivedEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.response_received');
      expect(event.payload.score).toBe(9);
      expect(event.payload.classification).toBe('promoter');
    });

    it('should create a response received event for detractor', () => {
      const payload: NPSResponseReceivedPayload = {
        surveyId: 'survey-456',
        responseId: 'resp-456',
        phone: '+40787654321',
        score: 3,
        classification: 'detractor',
        feedback: 'Long wait times',
        channel: 'email',
        responseLatencyMinutes: 120,
        respondedAt: new Date().toISOString(),
        triggerType: 'periodic',
      };

      const event = createNPSResponseReceivedEvent(aggregateId, payload, mockMetadata);

      expect(event.payload.classification).toBe('detractor');
      expect(event.payload.score).toBe(3);
    });

    it('should create a response received event for passive', () => {
      const payload: NPSResponseReceivedPayload = {
        surveyId: 'survey-789',
        responseId: 'resp-789',
        phone: '+40799887766',
        score: 7,
        classification: 'passive',
        channel: 'web',
        responseLatencyMinutes: 60,
        respondedAt: new Date().toISOString(),
        triggerType: 'post_onboarding',
      };

      const event = createNPSResponseReceivedEvent(aggregateId, payload, mockMetadata);

      expect(event.payload.classification).toBe('passive');
    });
  });

  describe('createNPSSurveyExpiredEvent', () => {
    it('should create a survey expired event with timeout reason', () => {
      const payload: NPSSurveyExpiredPayload = {
        surveyId: 'survey-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        triggerType: 'post_appointment',
        channel: 'whatsapp',
        sentAt: new Date(Date.now() - 172800000).toISOString(),
        expiredAt: new Date().toISOString(),
        reason: 'timeout',
      };

      const event = createNPSSurveyExpiredEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.survey_expired');
      expect(event.payload.reason).toBe('timeout');
    });

    it('should create a survey expired event with undelivered reason', () => {
      const payload: NPSSurveyExpiredPayload = {
        surveyId: 'survey-456',
        phone: '+40787654321',
        triggerType: 'manual',
        channel: 'sms',
        sentAt: new Date().toISOString(),
        expiredAt: new Date().toISOString(),
        reason: 'undelivered',
      };

      const event = createNPSSurveyExpiredEvent(aggregateId, payload, mockMetadata);

      expect(event.payload.reason).toBe('undelivered');
    });

    it('should create a survey expired event with blocked reason', () => {
      const payload: NPSSurveyExpiredPayload = {
        surveyId: 'survey-789',
        phone: '+40799887766',
        triggerType: 'periodic',
        channel: 'email',
        sentAt: new Date().toISOString(),
        expiredAt: new Date().toISOString(),
        reason: 'blocked',
      };

      const event = createNPSSurveyExpiredEvent(aggregateId, payload, mockMetadata);

      expect(event.payload.reason).toBe('blocked');
    });
  });

  describe('createNPSSurveySkippedEvent', () => {
    it('should create a survey skipped event', () => {
      const payload: NPSSurveySkippedPayload = {
        surveyId: 'survey-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        triggerType: 'post_treatment',
        reason: 'recent_survey',
        skipDetails: 'Survey sent 3 days ago',
        skippedAt: new Date().toISOString(),
      };

      const event = createNPSSurveySkippedEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.survey_skipped');
      expect(event.payload.reason).toBe('recent_survey');
    });
  });

  describe('createNPSFollowUpRequiredEvent', () => {
    it('should create a follow-up required event', () => {
      const payload: NPSFollowUpRequiredPayload = {
        surveyId: 'survey-123',
        responseId: 'resp-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        score: 4,
        classification: 'detractor',
        feedback: 'Poor communication',
        priority: 'high',
        assignedTo: 'manager-123',
        followUpReason: 'low_score',
        dueBy: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const event = createNPSFollowUpRequiredEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.follow_up_required');
      expect(event.payload.priority).toBe('high');
      expect(event.payload.classification).toBe('detractor');
    });
  });

  describe('createNPSFollowUpCompletedEvent', () => {
    it('should create a follow-up completed event', () => {
      const payload: NPSFollowUpCompletedPayload = {
        surveyId: 'survey-123',
        responseId: 'resp-123',
        followUpId: 'follow-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        completedBy: 'agent-456',
        outcome: 'resolved',
        resolution: 'Apologized and offered discount',
        durationMinutes: 15,
        completedAt: new Date().toISOString(),
      };

      const event = createNPSFollowUpCompletedEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.follow_up_completed');
      expect(event.payload.outcome).toBe('resolved');
    });
  });

  describe('createNPSFeedbackAnalyzedEvent', () => {
    it('should create a feedback analyzed event', () => {
      const payload: NPSFeedbackAnalyzedPayload = {
        surveyId: 'survey-123',
        responseId: 'resp-123',
        phone: '+40712345678',
        sentiment: 'positive',
        sentimentScore: 0.85,
        topics: ['service_quality', 'staff_friendly'],
        keywords: ['excellent', 'professional', 'recommend'],
        urgency: 'low',
        actionRequired: false,
        analyzedAt: new Date().toISOString(),
      };

      const event = createNPSFeedbackAnalyzedEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.feedback_analyzed');
      expect(event.payload.sentiment).toBe('positive');
      expect(event.payload.topics).toContain('service_quality');
    });

    it('should handle negative sentiment analysis', () => {
      const payload: NPSFeedbackAnalyzedPayload = {
        surveyId: 'survey-456',
        responseId: 'resp-456',
        phone: '+40787654321',
        sentiment: 'negative',
        sentimentScore: -0.7,
        topics: ['wait_time', 'communication'],
        keywords: ['long', 'wait', 'poor'],
        urgency: 'high',
        actionRequired: true,
        analyzedAt: new Date().toISOString(),
      };

      const event = createNPSFeedbackAnalyzedEvent(aggregateId, payload, mockMetadata);

      expect(event.payload.sentiment).toBe('negative');
      expect(event.payload.actionRequired).toBe(true);
    });
  });

  describe('createNPSScoreSyncedEvent', () => {
    it('should create a score synced event', () => {
      const payload: NPSScoreSyncedPayload = {
        surveyId: 'survey-123',
        responseId: 'resp-123',
        phone: '+40712345678',
        hubspotContactId: 'contact-456',
        score: 9,
        classification: 'promoter',
        syncedTo: 'hubspot',
        syncedFields: ['nps_score', 'nps_classification', 'last_nps_date'],
        syncedAt: new Date().toISOString(),
      };

      const event = createNPSScoreSyncedEvent(aggregateId, payload, mockMetadata);

      expect(event.type).toBe('nps.score_synced');
      expect(event.payload.syncedTo).toBe('hubspot');
    });
  });

  describe('Type Guards', () => {
    const baseEvent = {
      aggregateId: 'patient-123',
      aggregateType: 'Patient' as const,
      metadata: mockMetadata,
    };

    describe('isNPSSurveyScheduledEvent', () => {
      it('should return true for survey scheduled event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_scheduled',
          payload: {} as NPSSurveyScheduledPayload,
        };

        expect(isNPSSurveyScheduledEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_sent',
          payload: {} as NPSSurveySentPayload,
        };

        expect(isNPSSurveyScheduledEvent(event)).toBe(false);
      });
    });

    describe('isNPSSurveySentEvent', () => {
      it('should return true for survey sent event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_sent',
          payload: {} as NPSSurveySentPayload,
        };

        expect(isNPSSurveySentEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.response_received',
          payload: {} as NPSResponseReceivedPayload,
        };

        expect(isNPSSurveySentEvent(event)).toBe(false);
      });
    });

    describe('isNPSResponseReceivedEvent', () => {
      it('should return true for response received event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.response_received',
          payload: {} as NPSResponseReceivedPayload,
        };

        expect(isNPSResponseReceivedEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_expired',
          payload: {} as NPSSurveyExpiredPayload,
        };

        expect(isNPSResponseReceivedEvent(event)).toBe(false);
      });
    });

    describe('isNPSSurveyExpiredEvent', () => {
      it('should return true for survey expired event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_expired',
          payload: {} as NPSSurveyExpiredPayload,
        };

        expect(isNPSSurveyExpiredEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_skipped',
          payload: {} as NPSSurveySkippedPayload,
        };

        expect(isNPSSurveyExpiredEvent(event)).toBe(false);
      });
    });

    describe('isNPSSurveySkippedEvent', () => {
      it('should return true for survey skipped event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_skipped',
          payload: {} as NPSSurveySkippedPayload,
        };

        expect(isNPSSurveySkippedEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.follow_up_required',
          payload: {} as NPSFollowUpRequiredPayload,
        };

        expect(isNPSSurveySkippedEvent(event)).toBe(false);
      });
    });

    describe('isNPSFollowUpRequiredEvent', () => {
      it('should return true for follow-up required event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.follow_up_required',
          payload: {} as NPSFollowUpRequiredPayload,
        };

        expect(isNPSFollowUpRequiredEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.follow_up_completed',
          payload: {} as NPSFollowUpCompletedPayload,
        };

        expect(isNPSFollowUpRequiredEvent(event)).toBe(false);
      });
    });

    describe('isNPSFollowUpCompletedEvent', () => {
      it('should return true for follow-up completed event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.follow_up_completed',
          payload: {} as NPSFollowUpCompletedPayload,
        };

        expect(isNPSFollowUpCompletedEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.feedback_analyzed',
          payload: {} as NPSFeedbackAnalyzedPayload,
        };

        expect(isNPSFollowUpCompletedEvent(event)).toBe(false);
      });
    });

    describe('isNPSFeedbackAnalyzedEvent', () => {
      it('should return true for feedback analyzed event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.feedback_analyzed',
          payload: {} as NPSFeedbackAnalyzedPayload,
        };

        expect(isNPSFeedbackAnalyzedEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.score_synced',
          payload: {} as NPSScoreSyncedPayload,
        };

        expect(isNPSFeedbackAnalyzedEvent(event)).toBe(false);
      });
    });

    describe('isNPSScoreSyncedEvent', () => {
      it('should return true for score synced event', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.score_synced',
          payload: {} as NPSScoreSyncedPayload,
        };

        expect(isNPSScoreSyncedEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const event: NPSDomainEvent = {
          ...baseEvent,
          type: 'nps.survey_scheduled',
          payload: {} as NPSSurveyScheduledPayload,
        };

        expect(isNPSScoreSyncedEvent(event)).toBe(false);
      });
    });
  });
});
