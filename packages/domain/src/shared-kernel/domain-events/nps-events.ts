/**
 * @fileoverview NPS Domain Events
 *
 * Banking/Medical Grade Domain Events for NPS (Net Promoter Score) Collection.
 * Strictly typed events following Event Sourcing patterns.
 *
 * @module domain/shared-kernel/domain-events/nps-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. VERSIONING - Schema version for evolution
 * 4. IDEMPOTENCY - Events have unique IDs for deduplication
 */

import type { EventMetadata, DomainEvent } from './lead-events.js';
import { createEventMetadata } from './lead-events.js';

// ============================================================================
// NPS EVENT TYPES
// ============================================================================

/**
 * NPS Classification based on score
 */
export type NPSClassification = 'promoter' | 'passive' | 'detractor';

/**
 * NPS Survey Status
 */
export type NPSSurveyStatus = 'pending' | 'sent' | 'responded' | 'expired' | 'skipped';

/**
 * NPS Trigger Type
 */
export type NPSTriggerType =
  | 'post_appointment'
  | 'post_treatment'
  | 'periodic'
  | 'post_onboarding'
  | 'manual';

/**
 * NPS Survey Channel
 */
export type NPSSurveyChannel = 'whatsapp' | 'sms' | 'email' | 'web';

// ============================================================================
// NPS SURVEY LIFECYCLE EVENTS
// ============================================================================

/**
 * NPSSurveyScheduled - Emitted when an NPS survey is scheduled
 */
export interface NPSSurveyScheduledPayload {
  readonly surveyId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly patientId?: string;
  readonly triggerType: NPSTriggerType;
  readonly appointmentId?: string;
  readonly procedureType?: string;
  readonly channel: NPSSurveyChannel;
  readonly language: 'ro' | 'en' | 'de';
  readonly scheduledFor: string; // ISO 8601
  readonly expiresAt: string; // ISO 8601
}

export type NPSSurveyScheduledEvent = DomainEvent<'nps.survey_scheduled', NPSSurveyScheduledPayload>;

/**
 * NPSSurveySent - Emitted when an NPS survey is sent to the patient
 */
export interface NPSSurveySentPayload {
  readonly surveyId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly channel: NPSSurveyChannel;
  readonly templateName: string;
  readonly messageId?: string;
  readonly sentAt: string; // ISO 8601
}

export type NPSSurveySentEvent = DomainEvent<'nps.survey_sent', NPSSurveySentPayload>;

/**
 * NPSResponseReceived - Emitted when a patient responds to an NPS survey
 */
export interface NPSResponseReceivedPayload {
  readonly surveyId: string;
  readonly responseId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;

  /** NPS score (0-10) */
  readonly score: number;

  /** Classification derived from score */
  readonly classification: NPSClassification;

  /** Free-form feedback text */
  readonly feedback?: string;

  /** Channel through which response was received */
  readonly channel: NPSSurveyChannel;

  /** Response latency in minutes */
  readonly responseLatencyMinutes: number;

  /** When the response was received */
  readonly respondedAt: string; // ISO 8601

  /** Trigger type that initiated the survey */
  readonly triggerType: NPSTriggerType;

  /** Related appointment ID */
  readonly appointmentId?: string;

  /** Related procedure type */
  readonly procedureType?: string;
}

export type NPSResponseReceivedEvent = DomainEvent<'nps.response_received', NPSResponseReceivedPayload>;

/**
 * NPSSurveyExpired - Emitted when an NPS survey expires without response
 */
export interface NPSSurveyExpiredPayload {
  readonly surveyId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly triggerType: NPSTriggerType;
  readonly channel: NPSSurveyChannel;
  readonly sentAt: string; // ISO 8601
  readonly expiredAt: string; // ISO 8601
  readonly reason: 'timeout' | 'undelivered' | 'blocked';
}

export type NPSSurveyExpiredEvent = DomainEvent<'nps.survey_expired', NPSSurveyExpiredPayload>;

/**
 * NPSSurveySkipped - Emitted when an NPS survey is skipped
 */
export interface NPSSurveySkippedPayload {
  readonly surveyId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly reason:
    | 'no_consent'
    | 'recent_survey'
    | 'opt_out'
    | 'invalid_phone'
    | 'contact_not_found'
    | 'frequency_limit';
  readonly details?: string;
}

export type NPSSurveySkippedEvent = DomainEvent<'nps.survey_skipped', NPSSurveySkippedPayload>;

// ============================================================================
// NPS FOLLOW-UP EVENTS
// ============================================================================

/**
 * NPSFollowUpRequired - Emitted when a detractor response needs follow-up
 */
export interface NPSFollowUpRequiredPayload {
  readonly responseId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly score: number;
  readonly classification: NPSClassification;
  readonly feedback?: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly reason: string;
  readonly assignedTo?: string;
  readonly dueDate: string; // ISO 8601
}

export type NPSFollowUpRequiredEvent = DomainEvent<'nps.follow_up_required', NPSFollowUpRequiredPayload>;

/**
 * NPSFollowUpCompleted - Emitted when a follow-up is completed
 */
export interface NPSFollowUpCompletedPayload {
  readonly responseId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly completedBy: string;
  readonly notes: string;
  readonly outcome: 'resolved' | 'escalated' | 'no_response' | 'patient_satisfied';
  readonly completedAt: string; // ISO 8601
}

export type NPSFollowUpCompletedEvent = DomainEvent<'nps.follow_up_completed', NPSFollowUpCompletedPayload>;

// ============================================================================
// NPS ANALYTICS EVENTS
// ============================================================================

/**
 * NPSFeedbackAnalyzed - Emitted when feedback is analyzed for themes/sentiment
 */
export interface NPSFeedbackAnalyzedPayload {
  readonly responseId: string;
  readonly phone: string;
  readonly score: number;
  readonly feedback: string;
  readonly sentimentScore: number; // -1 to 1
  readonly detectedThemes: readonly string[];
  readonly language: 'ro' | 'en' | 'de';
  readonly analysisMethod: 'ai' | 'rule_based';
}

export type NPSFeedbackAnalyzedEvent = DomainEvent<'nps.feedback_analyzed', NPSFeedbackAnalyzedPayload>;

/**
 * NPSScoreSynced - Emitted when NPS score is synced to CRM
 */
export interface NPSScoreSyncedPayload {
  readonly responseId: string;
  readonly phone: string;
  readonly hubspotContactId: string;
  readonly score: number;
  readonly classification: NPSClassification;
  readonly properties: Record<string, string>;
  readonly syncedAt: string; // ISO 8601
}

export type NPSScoreSyncedEvent = DomainEvent<'nps.score_synced', NPSScoreSyncedPayload>;

// ============================================================================
// UNION TYPE FOR ALL NPS EVENTS
// ============================================================================

/**
 * Union of all NPS domain events
 */
export type NPSDomainEvent =
  | NPSSurveyScheduledEvent
  | NPSSurveySentEvent
  | NPSResponseReceivedEvent
  | NPSSurveyExpiredEvent
  | NPSSurveySkippedEvent
  | NPSFollowUpRequiredEvent
  | NPSFollowUpCompletedEvent
  | NPSFeedbackAnalyzedEvent
  | NPSScoreSyncedEvent;

/**
 * Event type discriminator
 */
export type NPSEventType = NPSDomainEvent['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Create NPSSurveyScheduled event
 */
export function createNPSSurveyScheduledEvent(
  aggregateId: string,
  payload: NPSSurveyScheduledPayload,
  metadata: EventMetadata
): NPSSurveyScheduledEvent {
  return {
    type: 'nps.survey_scheduled',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSSurveySent event
 */
export function createNPSSurveySentEvent(
  aggregateId: string,
  payload: NPSSurveySentPayload,
  metadata: EventMetadata
): NPSSurveySentEvent {
  return {
    type: 'nps.survey_sent',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSResponseReceived event
 */
export function createNPSResponseReceivedEvent(
  aggregateId: string,
  payload: NPSResponseReceivedPayload,
  metadata: EventMetadata
): NPSResponseReceivedEvent {
  return {
    type: 'nps.response_received',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSSurveyExpired event
 */
export function createNPSSurveyExpiredEvent(
  aggregateId: string,
  payload: NPSSurveyExpiredPayload,
  metadata: EventMetadata
): NPSSurveyExpiredEvent {
  return {
    type: 'nps.survey_expired',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSSurveySkipped event
 */
export function createNPSSurveySkippedEvent(
  aggregateId: string,
  payload: NPSSurveySkippedPayload,
  metadata: EventMetadata
): NPSSurveySkippedEvent {
  return {
    type: 'nps.survey_skipped',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSFollowUpRequired event
 */
export function createNPSFollowUpRequiredEvent(
  aggregateId: string,
  payload: NPSFollowUpRequiredPayload,
  metadata: EventMetadata
): NPSFollowUpRequiredEvent {
  return {
    type: 'nps.follow_up_required',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSFollowUpCompleted event
 */
export function createNPSFollowUpCompletedEvent(
  aggregateId: string,
  payload: NPSFollowUpCompletedPayload,
  metadata: EventMetadata
): NPSFollowUpCompletedEvent {
  return {
    type: 'nps.follow_up_completed',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSFeedbackAnalyzed event
 */
export function createNPSFeedbackAnalyzedEvent(
  aggregateId: string,
  payload: NPSFeedbackAnalyzedPayload,
  metadata: EventMetadata
): NPSFeedbackAnalyzedEvent {
  return {
    type: 'nps.feedback_analyzed',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create NPSScoreSynced event
 */
export function createNPSScoreSyncedEvent(
  aggregateId: string,
  payload: NPSScoreSyncedPayload,
  metadata: EventMetadata
): NPSScoreSyncedEvent {
  return {
    type: 'nps.score_synced',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for NPSSurveyScheduled event
 */
export function isNPSSurveyScheduledEvent(event: NPSDomainEvent): event is NPSSurveyScheduledEvent {
  return event.type === 'nps.survey_scheduled';
}

/**
 * Type guard for NPSSurveySent event
 */
export function isNPSSurveySentEvent(event: NPSDomainEvent): event is NPSSurveySentEvent {
  return event.type === 'nps.survey_sent';
}

/**
 * Type guard for NPSResponseReceived event
 */
export function isNPSResponseReceivedEvent(event: NPSDomainEvent): event is NPSResponseReceivedEvent {
  return event.type === 'nps.response_received';
}

/**
 * Type guard for NPSSurveyExpired event
 */
export function isNPSSurveyExpiredEvent(event: NPSDomainEvent): event is NPSSurveyExpiredEvent {
  return event.type === 'nps.survey_expired';
}

/**
 * Type guard for NPSSurveySkipped event
 */
export function isNPSSurveySkippedEvent(event: NPSDomainEvent): event is NPSSurveySkippedEvent {
  return event.type === 'nps.survey_skipped';
}

/**
 * Type guard for NPSFollowUpRequired event
 */
export function isNPSFollowUpRequiredEvent(event: NPSDomainEvent): event is NPSFollowUpRequiredEvent {
  return event.type === 'nps.follow_up_required';
}

/**
 * Type guard for NPSFollowUpCompleted event
 */
export function isNPSFollowUpCompletedEvent(event: NPSDomainEvent): event is NPSFollowUpCompletedEvent {
  return event.type === 'nps.follow_up_completed';
}

/**
 * Type guard for NPSFeedbackAnalyzed event
 */
export function isNPSFeedbackAnalyzedEvent(event: NPSDomainEvent): event is NPSFeedbackAnalyzedEvent {
  return event.type === 'nps.feedback_analyzed';
}

/**
 * Type guard for NPSScoreSynced event
 */
export function isNPSScoreSyncedEvent(event: NPSDomainEvent): event is NPSScoreSyncedEvent {
  return event.type === 'nps.score_synced';
}

// Re-export createEventMetadata for convenience
export { createEventMetadata };
