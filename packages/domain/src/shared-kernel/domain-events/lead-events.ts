/**
 * @fileoverview Lead Domain Events
 *
 * Banking/Medical Grade Domain Events for Lead Aggregate.
 * Strictly typed events following Event Sourcing patterns.
 *
 * @module domain/shared-kernel/domain-events/lead-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. VERSIONING - Schema version for evolution
 * 4. IDEMPOTENCY - Events have unique IDs for deduplication
 */

import type { LeadClassification } from '../value-objects/lead-score.js';

// ============================================================================
// BASE EVENT TYPES
// ============================================================================

/**
 * Event metadata - common to all domain events
 */
export interface EventMetadata {
  /** Unique event identifier (UUID v4) */
  readonly eventId: string;

  /** Event timestamp (ISO 8601) */
  readonly timestamp: string;

  /** Correlation ID for distributed tracing */
  readonly correlationId: string;

  /** Causation ID - which event/command caused this */
  readonly causationId?: string;

  /** Idempotency key for safe retries */
  readonly idempotencyKey: string;

  /** Schema version for event evolution */
  readonly version: number;

  /** Source service that emitted the event */
  readonly source: string;

  /** Actor who triggered the event (user ID, system, etc.) */
  readonly actor?: string;
}

/**
 * Base domain event interface
 */
export interface DomainEvent<TType extends string, TPayload> {
  /** Event type discriminator */
  readonly type: TType;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type */
  readonly aggregateType: 'Lead' | 'Patient' | 'Appointment' | 'Consent';

  /** Event metadata */
  readonly metadata: EventMetadata;

  /** Event payload (strongly typed) */
  readonly payload: TPayload;
}

// ============================================================================
// LEAD LIFECYCLE EVENTS
// ============================================================================

/**
 * LeadCreated - Emitted when a new lead enters the system
 */
export interface LeadCreatedPayload {
  readonly phone: string;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly source:
    | 'whatsapp'
    | 'voice'
    | 'web_form'
    | 'hubspot'
    | 'facebook'
    | 'google'
    | 'referral'
    | 'manual';
  readonly hubspotContactId?: string;
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;
  readonly language?: 'ro' | 'en' | 'de';
}

export type LeadCreatedEvent = DomainEvent<'lead.created', LeadCreatedPayload>;

/**
 * LeadScored - Emitted when a lead receives a score
 */
export interface LeadScoredPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly channel: 'whatsapp' | 'voice' | 'web' | 'hubspot';

  /** Numeric score (1-5) */
  readonly score: number;

  /** Classification derived from score */
  readonly classification: LeadClassification;

  /** Scoring confidence (0-1) */
  readonly confidence: number;

  /** Scoring method used */
  readonly method: 'ai' | 'rule_based' | 'manual';

  /** Reasoning for the score */
  readonly reasoning: string;

  /** Suggested next action */
  readonly suggestedAction: string;

  /** Detected intent from conversation */
  readonly detectedIntent?: string;

  /** Urgency indicators found */
  readonly urgencyIndicators?: readonly string[];

  /** Whether budget was mentioned */
  readonly budgetMentioned?: boolean;

  /** Procedures the lead is interested in */
  readonly procedureInterest?: readonly string[];

  /** Previous score (if rescoring) */
  readonly previousScore?: number;
  readonly previousClassification?: LeadClassification;
}

export type LeadScoredEvent = DomainEvent<'lead.scored', LeadScoredPayload>;

/**
 * LeadQualified - Emitted when a lead is qualified (HOT)
 */
export interface LeadQualifiedPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly score: number;
  readonly classification: 'HOT';
  readonly qualificationReason: string;
  readonly procedureInterest: readonly string[];
  readonly estimatedValue?: number;
  readonly assignedTo?: string;
}

export type LeadQualifiedEvent = DomainEvent<'lead.qualified', LeadQualifiedPayload>;

/**
 * LeadAssigned - Emitted when a lead is assigned to an agent
 */
export interface LeadAssignedPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly assignedTo: string;
  readonly assignedBy: 'auto' | 'manual';
  readonly reason: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly slaDeadline: string; // ISO 8601
}

export type LeadAssignedEvent = DomainEvent<'lead.assigned', LeadAssignedPayload>;

/**
 * LeadStatusChanged - Emitted when lead status changes
 */
export interface LeadStatusChangedPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly previousStatus: string;
  readonly newStatus:
    | 'new'
    | 'contacted'
    | 'qualified'
    | 'nurturing'
    | 'scheduled'
    | 'converted'
    | 'lost'
    | 'invalid';
  readonly reason?: string;
  readonly changedBy?: string;
}

export type LeadStatusChangedEvent = DomainEvent<'lead.status_changed', LeadStatusChangedPayload>;

/**
 * LeadConverted - Emitted when a lead becomes a patient
 */
export interface LeadConvertedPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly patientId: string;
  readonly procedure: string;
  readonly appointmentId?: string;
  readonly conversionValue?: number;
  readonly timeToConvertDays: number;
  readonly touchpoints: number;
}

export type LeadConvertedEvent = DomainEvent<'lead.converted', LeadConvertedPayload>;

/**
 * LeadLost - Emitted when a lead is lost
 */
export interface LeadLostPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly reason:
    | 'no_response'
    | 'competitor'
    | 'price'
    | 'timing'
    | 'invalid'
    | 'duplicate'
    | 'other';
  readonly reasonDetails?: string;
  readonly lastContactAt?: string;
  readonly totalTouchpoints: number;
}

export type LeadLostEvent = DomainEvent<'lead.lost', LeadLostPayload>;

// ============================================================================
// LEAD COMMUNICATION EVENTS
// ============================================================================

/**
 * LeadContacted - Emitted when a lead is contacted
 */
export interface LeadContactedPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly channel: 'whatsapp' | 'voice' | 'sms' | 'email';
  readonly direction: 'inbound' | 'outbound';
  readonly messagePreview?: string;
  readonly duration?: number; // For calls, in seconds
  readonly outcome?: 'connected' | 'voicemail' | 'no_answer' | 'busy';
}

export type LeadContactedEvent = DomainEvent<'lead.contacted', LeadContactedPayload>;

/**
 * LeadMessageReceived - Emitted when a message is received from lead
 */
export interface LeadMessageReceivedPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly channel: 'whatsapp' | 'voice' | 'web';
  readonly messageId: string;
  readonly content: string;
  readonly language?: 'ro' | 'en' | 'de';
  readonly sentiment?: 'positive' | 'neutral' | 'negative';
  readonly containsUrgency: boolean;
  readonly containsBudgetMention: boolean;
}

export type LeadMessageReceivedEvent = DomainEvent<
  'lead.message_received',
  LeadMessageReceivedPayload
>;

// ============================================================================
// LEAD SCHEDULING EVENTS
// ============================================================================

/**
 * LeadAppointmentScheduled - Emitted when an appointment is scheduled
 */
export interface LeadAppointmentScheduledPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly appointmentId: string;
  readonly appointmentType: string;
  readonly scheduledFor: string; // ISO 8601
  readonly duration: number; // minutes
  readonly location?: string;
  readonly provider?: string;
  readonly confirmationSent: boolean;
}

export type LeadAppointmentScheduledEvent = DomainEvent<
  'lead.appointment_scheduled',
  LeadAppointmentScheduledPayload
>;

/**
 * LeadAppointmentCancelled - Emitted when an appointment is cancelled
 */
export interface LeadAppointmentCancelledPayload {
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly appointmentId: string;
  readonly reason: string;
  readonly cancelledBy: 'patient' | 'clinic' | 'system';
  readonly rescheduled: boolean;
  readonly newAppointmentId?: string;
}

export type LeadAppointmentCancelledEvent = DomainEvent<
  'lead.appointment_cancelled',
  LeadAppointmentCancelledPayload
>;

// ============================================================================
// UNION TYPE FOR ALL LEAD EVENTS
// ============================================================================

/**
 * Union of all lead domain events
 */
export type LeadDomainEvent =
  | LeadCreatedEvent
  | LeadScoredEvent
  | LeadQualifiedEvent
  | LeadAssignedEvent
  | LeadStatusChangedEvent
  | LeadConvertedEvent
  | LeadLostEvent
  | LeadContactedEvent
  | LeadMessageReceivedEvent
  | LeadAppointmentScheduledEvent
  | LeadAppointmentCancelledEvent;

/**
 * Event type discriminator
 */
export type LeadEventType = LeadDomainEvent['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate UUID v4 (browser and Node.js compatible)
 * Provides fallback for environments without crypto.randomUUID
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (Node 19+, modern browsers)

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback to manual UUID v4 generation for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create event metadata
 *
 * IDEMPOTENCY KEY DESIGN:
 * - Uses UUID instead of Date.now() to guarantee uniqueness
 * - Date.now() has 1ms precision which can cause collisions under high load (1000+ events/sec)
 * - UUID v4 provides 122 bits of randomness, making collisions virtually impossible
 * - Format: {source}-{correlationId}-{uuid} for debugging/tracing
 */
export function createEventMetadata(
  correlationId: string,
  source: string,
  causationId?: string,
  actor?: string
): EventMetadata {
  const metadata: EventMetadata = {
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    correlationId,
    // SECURITY FIX: Use UUID instead of Date.now() to prevent collisions under high load
    idempotencyKey: `${source}-${correlationId}-${generateUUID()}`,
    version: 1,
    source,
  };

  // Only add optional properties if they have values
  if (causationId !== undefined) {
    return { ...metadata, causationId };
  }
  if (actor !== undefined) {
    return { ...metadata, actor };
  }

  return metadata;
}

/**
 * Create LeadCreated event
 */
export function createLeadCreatedEvent(
  aggregateId: string,
  payload: LeadCreatedPayload,
  metadata: EventMetadata
): LeadCreatedEvent {
  return {
    type: 'lead.created',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create LeadScored event
 */
export function createLeadScoredEvent(
  aggregateId: string,
  payload: LeadScoredPayload,
  metadata: EventMetadata
): LeadScoredEvent {
  return {
    type: 'lead.scored',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create LeadQualified event
 */
export function createLeadQualifiedEvent(
  aggregateId: string,
  payload: LeadQualifiedPayload,
  metadata: EventMetadata
): LeadQualifiedEvent {
  return {
    type: 'lead.qualified',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create LeadStatusChanged event
 */
export function createLeadStatusChangedEvent(
  aggregateId: string,
  payload: LeadStatusChangedPayload,
  metadata: EventMetadata
): LeadStatusChangedEvent {
  return {
    type: 'lead.status_changed',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create LeadConverted event
 */
export function createLeadConvertedEvent(
  aggregateId: string,
  payload: LeadConvertedPayload,
  metadata: EventMetadata
): LeadConvertedEvent {
  return {
    type: 'lead.converted',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for LeadCreated event
 */
export function isLeadCreatedEvent(event: LeadDomainEvent): event is LeadCreatedEvent {
  return event.type === 'lead.created';
}

/**
 * Type guard for LeadScored event
 */
export function isLeadScoredEvent(event: LeadDomainEvent): event is LeadScoredEvent {
  return event.type === 'lead.scored';
}

/**
 * Type guard for LeadQualified event
 */
export function isLeadQualifiedEvent(event: LeadDomainEvent): event is LeadQualifiedEvent {
  return event.type === 'lead.qualified';
}

/**
 * Type guard for LeadStatusChanged event
 */
export function isLeadStatusChangedEvent(event: LeadDomainEvent): event is LeadStatusChangedEvent {
  return event.type === 'lead.status_changed';
}

/**
 * Type guard for LeadConverted event
 */
export function isLeadConvertedEvent(event: LeadDomainEvent): event is LeadConvertedEvent {
  return event.type === 'lead.converted';
}
