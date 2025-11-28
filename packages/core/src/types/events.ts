/**
 * Type-Safe Event System
 *
 * A discriminated union-based event system that provides compile-time
 * guarantees for event handling. This is the foundation for event sourcing
 * and domain events in the medical CRM.
 *
 * @example
 * ```ts
 * // Define domain events
 * type DomainEvents =
 *   | LeadScoredEvent
 *   | AppointmentScheduledEvent
 *   | ConsentRecordedEvent;
 *
 * // Type-safe event handling
 * const handler: EventHandler<DomainEvents> = {
 *   LeadScored: (event) => { ... },
 *   AppointmentScheduled: (event) => { ... },
 *   ConsentRecorded: (event) => { ... },
 * };
 * ```
 *
 * @module types/events
 */

import type {
  CorrelationId,
  PatientId,
  LeadId,
  AppointmentId,
  ConsentId,
  ISOTimestamp,
  TraceId,
  E164PhoneNumber,
  LeadScore,
  ConfidenceScore,
} from './branded.js';

// ============================================================================
// BASE EVENT TYPE
// ============================================================================

/**
 * Base interface for all domain events.
 * Events are immutable facts about something that happened.
 */
export interface BaseEvent<TType extends string = string> {
  /** Unique event identifier */
  readonly id: string;

  /** Event type discriminant */
  readonly type: TType;

  /** When the event occurred */
  readonly timestamp: ISOTimestamp;

  /** Correlation ID for distributed tracing */
  readonly correlationId: CorrelationId;

  /** Optional trace ID for OpenTelemetry */
  readonly traceId?: TraceId;

  /** Event version for schema evolution */
  readonly version: number;

  /** Aggregate ID this event belongs to */
  readonly aggregateId?: string;

  /** Aggregate type (e.g., 'Lead', 'Patient', 'Appointment') */
  readonly aggregateType?: string;
}

// ============================================================================
// LEAD EVENTS
// ============================================================================

export interface LeadScoredEvent extends BaseEvent<'LeadScored'> {
  readonly aggregateType: 'Lead';
  readonly payload: {
    readonly leadId: LeadId;
    readonly phone: E164PhoneNumber;
    readonly channel: 'whatsapp' | 'voice' | 'web' | 'referral';
    readonly score: LeadScore;
    readonly classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
    readonly confidence: ConfidenceScore;
    readonly reasoning: string;
    readonly reasoningValidated: boolean;
    readonly reasoningWarnings?: readonly string[];
    readonly suggestedAction: string;
    readonly detectedIntent?: string;
    readonly source: string;
  };
}

export interface LeadCreatedEvent extends BaseEvent<'LeadCreated'> {
  readonly aggregateType: 'Lead';
  readonly payload: {
    readonly leadId: LeadId;
    readonly phone: E164PhoneNumber;
    readonly channel: 'whatsapp' | 'voice' | 'web' | 'referral';
    readonly source: string;
    readonly utmParams?: {
      readonly source?: string;
      readonly medium?: string;
      readonly campaign?: string;
    };
  };
}

export interface LeadQualifiedEvent extends BaseEvent<'LeadQualified'> {
  readonly aggregateType: 'Lead';
  readonly payload: {
    readonly leadId: LeadId;
    readonly qualifiedBy: string;
    readonly method: 'ai' | 'manual';
    readonly convertedToPatientId?: PatientId;
  };
}

export interface LeadDisqualifiedEvent extends BaseEvent<'LeadDisqualified'> {
  readonly aggregateType: 'Lead';
  readonly payload: {
    readonly leadId: LeadId;
    readonly reason: string;
    readonly disqualifiedBy: string;
  };
}

// ============================================================================
// APPOINTMENT EVENTS
// ============================================================================

export interface AppointmentScheduledEvent extends BaseEvent<'AppointmentScheduled'> {
  readonly aggregateType: 'Appointment';
  readonly payload: {
    readonly appointmentId: AppointmentId;
    readonly patientId: PatientId;
    readonly serviceType: string;
    readonly dateTime: ISOTimestamp;
    readonly doctor: {
      readonly id: string;
      readonly name: string;
    };
    readonly location: string;
    readonly source: string;
    readonly consentVerified: boolean;
    readonly consentVerifiedAt?: ISOTimestamp;
  };
}

export interface AppointmentCancelledEvent extends BaseEvent<'AppointmentCancelled'> {
  readonly aggregateType: 'Appointment';
  readonly payload: {
    readonly appointmentId: AppointmentId;
    readonly reason?: string;
    readonly cancelledBy: string;
    readonly notifiedPatient: boolean;
    readonly source: string;
  };
}

export interface AppointmentRescheduledEvent extends BaseEvent<'AppointmentRescheduled'> {
  readonly aggregateType: 'Appointment';
  readonly payload: {
    readonly appointmentId: AppointmentId;
    readonly previousDateTime: ISOTimestamp;
    readonly newDateTime: ISOTimestamp;
    readonly reason?: string;
    readonly rescheduledBy: string;
  };
}

export interface AppointmentCompletedEvent extends BaseEvent<'AppointmentCompleted'> {
  readonly aggregateType: 'Appointment';
  readonly payload: {
    readonly appointmentId: AppointmentId;
    readonly completedAt: ISOTimestamp;
    readonly notes?: string;
    readonly followUpRequired: boolean;
  };
}

export interface AppointmentConsentViolationEvent extends BaseEvent<'AppointmentConsentViolation'> {
  readonly aggregateType: 'Consent';
  readonly payload: {
    readonly patientId: PatientId;
    readonly phone?: E164PhoneNumber;
    readonly missingConsents: readonly string[];
    readonly attemptedAction: string;
    readonly serviceType?: string;
    readonly source: string;
    readonly blockedAt: ISOTimestamp;
  };
}

// ============================================================================
// CONSENT EVENTS
// ============================================================================

export interface ConsentRecordedEvent extends BaseEvent<'ConsentRecorded'> {
  readonly aggregateType: 'Consent';
  readonly payload: {
    readonly consentId: ConsentId;
    readonly patientId: PatientId;
    readonly phone: E164PhoneNumber;
    readonly consentType:
      | 'data_processing'
      | 'marketing_whatsapp'
      | 'marketing_email'
      | 'marketing_sms'
      | 'appointment_reminders'
      | 'treatment_updates'
      | 'third_party_sharing';
    readonly status: 'granted' | 'denied' | 'withdrawn';
    readonly source: string;
    readonly recordedAt: ISOTimestamp;
  };
}

export interface ConsentWithdrawnEvent extends BaseEvent<'ConsentWithdrawn'> {
  readonly aggregateType: 'Consent';
  readonly payload: {
    readonly consentId: ConsentId;
    readonly patientId: PatientId;
    readonly consentType: string;
    readonly reason?: string;
    readonly source: string;
  };
}

// ============================================================================
// MESSAGING EVENTS
// ============================================================================

export interface WhatsAppMessageSentEvent extends BaseEvent<'WhatsAppMessageSent'> {
  readonly payload: {
    readonly messageId: string;
    readonly to: E164PhoneNumber;
    readonly templateName?: string;
    readonly status: 'sent' | 'delivered' | 'read' | 'failed';
    readonly source: string;
  };
}

export interface WhatsAppMessageReceivedEvent extends BaseEvent<'WhatsAppMessageReceived'> {
  readonly payload: {
    readonly messageId: string;
    readonly from: E164PhoneNumber;
    readonly content: string;
    readonly mediaType?: string;
    readonly timestamp: ISOTimestamp;
  };
}

// ============================================================================
// WORKFLOW EVENTS
// ============================================================================

export interface WorkflowTriggeredEvent extends BaseEvent<'WorkflowTriggered'> {
  readonly payload: {
    readonly taskId: string;
    readonly workflow: string;
    readonly priority: 'low' | 'normal' | 'high';
    readonly source: string;
  };
}

export interface WorkflowCompletedEvent extends BaseEvent<'WorkflowCompleted'> {
  readonly payload: {
    readonly taskId: string;
    readonly workflow: string;
    readonly status: 'completed' | 'failed';
    readonly result?: unknown;
    readonly error?: string;
    readonly durationMs: number;
  };
}

// ============================================================================
// AI EVENTS
// ============================================================================

export interface AIOutputValidationIssueEvent extends BaseEvent<'AIOutputValidationIssue'> {
  readonly payload: {
    readonly functionName: string;
    readonly traceId?: TraceId;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly severity: 'warning' | 'error';
    readonly timestamp: ISOTimestamp;
  };
}

export interface AIReasoningValidationFailedEvent extends BaseEvent<'AIReasoningValidationFailed'> {
  readonly payload: {
    readonly function: string;
    readonly issues: readonly string[];
    readonly severity: 'none' | 'warning' | 'critical';
    readonly source: string;
    readonly originalReasoning?: string;
  };
}

// ============================================================================
// PATIENT EVENTS
// ============================================================================

export interface PatientCreatedEvent extends BaseEvent<'PatientCreated'> {
  readonly aggregateType: 'Patient';
  readonly payload: {
    readonly patientId: PatientId;
    readonly firstName: string;
    readonly lastName: string;
    readonly email?: string;
    readonly phone: E164PhoneNumber;
    readonly source: string;
  };
}

export interface PatientUpdatedEvent extends BaseEvent<'PatientUpdated'> {
  readonly aggregateType: 'Patient';
  readonly payload: {
    readonly patientId: PatientId;
    readonly updatedFields: readonly string[];
    readonly updatedBy: string;
  };
}

// ============================================================================
// AGGREGATE EVENT UNION
// ============================================================================

/**
 * Union of all domain events in the medical CRM.
 * This is the master event type that enables exhaustive handling.
 */
export type DomainEvent =
  // Lead events
  | LeadScoredEvent
  | LeadCreatedEvent
  | LeadQualifiedEvent
  | LeadDisqualifiedEvent
  // Appointment events
  | AppointmentScheduledEvent
  | AppointmentCancelledEvent
  | AppointmentRescheduledEvent
  | AppointmentCompletedEvent
  | AppointmentConsentViolationEvent
  // Consent events
  | ConsentRecordedEvent
  | ConsentWithdrawnEvent
  // Messaging events
  | WhatsAppMessageSentEvent
  | WhatsAppMessageReceivedEvent
  // Workflow events
  | WorkflowTriggeredEvent
  | WorkflowCompletedEvent
  // AI events
  | AIOutputValidationIssueEvent
  | AIReasoningValidationFailedEvent
  // Patient events
  | PatientCreatedEvent
  | PatientUpdatedEvent;

/**
 * Extract event type string union from DomainEvent
 */
export type DomainEventType = DomainEvent['type'];

/**
 * Extract specific event by type
 */
export type EventByType<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

/**
 * Extract payload type for a specific event
 */
export type EventPayload<T extends DomainEventType> = EventByType<T>['payload'];

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Type-safe event handler map.
 * Ensures all event types are handled.
 */
export type EventHandlerMap<TReturn = void> = {
  [K in DomainEventType]: (event: EventByType<K>) => TReturn;
};

/**
 * Partial event handler map.
 * Only handle some events.
 */
export type PartialEventHandlerMap<TReturn = void> = Partial<EventHandlerMap<TReturn>>;

/**
 * Async event handler map.
 */
export type AsyncEventHandlerMap<TReturn = void> = {
  [K in DomainEventType]: (event: EventByType<K>) => Promise<TReturn>;
};

/**
 * Handle a domain event with type-safe dispatch
 */
export function handleEvent<TReturn>(
  event: DomainEvent,
  handlers: EventHandlerMap<TReturn>
): TReturn {
  const handler = handlers[event.type] as (event: DomainEvent) => TReturn;
  return handler(event);
}

/**
 * Handle a domain event with partial handlers (returns undefined for unhandled)
 */
export function handleEventPartial<TReturn>(
  event: DomainEvent,
  handlers: PartialEventHandlerMap<TReturn>
): TReturn | undefined {
  const handler = handlers[event.type] as ((event: DomainEvent) => TReturn) | undefined;
  return handler?.(event);
}

/**
 * Handle a domain event asynchronously
 */
export async function handleEventAsync<TReturn>(
  event: DomainEvent,
  handlers: AsyncEventHandlerMap<TReturn>
): Promise<TReturn> {
  const handler = handlers[event.type] as (event: DomainEvent) => Promise<TReturn>;
  return handler(event);
}

// ============================================================================
// EVENT FACTORY
// ============================================================================

/**
 * Create a new event with auto-generated ID and timestamp
 */
export function createEvent<T extends DomainEventType>(
  type: T,
  correlationId: CorrelationId,
  payload: EventPayload<T>,
  options?: {
    aggregateId?: string;
    aggregateType?: string;
    traceId?: TraceId;
    version?: number;
  }
): EventByType<T> {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    correlationId,
    version: options?.version ?? 1,
    aggregateId: options?.aggregateId,
    aggregateType: options?.aggregateType,
    traceId: options?.traceId,
    payload,
  } as EventByType<T>;
}

// ============================================================================
// EVENT FILTERING
// ============================================================================

/**
 * Filter events by type
 */
export function filterEventsByType<T extends DomainEventType>(
  events: DomainEvent[],
  type: T
): EventByType<T>[] {
  return events.filter((e): e is EventByType<T> => e.type === type);
}

/**
 * Filter events by aggregate ID
 */
export function filterEventsByAggregate(events: DomainEvent[], aggregateId: string): DomainEvent[] {
  return events.filter((e) => e.aggregateId === aggregateId);
}

/**
 * Filter events by aggregate type
 */
export function filterEventsByAggregateType(
  events: DomainEvent[],
  aggregateType: string
): DomainEvent[] {
  return events.filter((e) => e.aggregateType === aggregateType);
}

/**
 * Filter events by time range
 */
export function filterEventsByTimeRange(
  events: DomainEvent[],
  start: Date,
  end: Date
): DomainEvent[] {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return events.filter((e) => {
    const eventTime = new Date(e.timestamp).getTime();
    return eventTime >= startTime && eventTime <= endTime;
  });
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for checking if an event is of a specific type
 */
export function isEventType<T extends DomainEventType>(
  event: DomainEvent,
  type: T
): event is EventByType<T> {
  return event.type === type;
}

/**
 * Type guard for Lead events
 */
export function isLeadEvent(
  event: DomainEvent
): event is LeadScoredEvent | LeadCreatedEvent | LeadQualifiedEvent | LeadDisqualifiedEvent {
  return event.aggregateType === 'Lead';
}

/**
 * Type guard for Appointment events
 */
export function isAppointmentEvent(
  event: DomainEvent
): event is
  | AppointmentScheduledEvent
  | AppointmentCancelledEvent
  | AppointmentRescheduledEvent
  | AppointmentCompletedEvent {
  return event.aggregateType === 'Appointment';
}

/**
 * Type guard for Consent events
 */
export function isConsentEvent(
  event: DomainEvent
): event is ConsentRecordedEvent | ConsentWithdrawnEvent | AppointmentConsentViolationEvent {
  return event.aggregateType === 'Consent';
}

/**
 * Type guard for Patient events
 */
export function isPatientEvent(
  event: DomainEvent
): event is PatientCreatedEvent | PatientUpdatedEvent {
  return event.aggregateType === 'Patient';
}
