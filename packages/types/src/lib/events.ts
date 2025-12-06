/**
 * @fileoverview Type-Safe Event System with Full Inference
 *
 * Provides a comprehensive event system with:
 * - Strongly typed event definitions
 * - Type-safe event handlers
 * - Event bus with subscription management
 * - Pattern matching for event handling
 * - Event sourcing utilities
 *
 * @module @medicalcor/types/events
 * @version 2.0.0
 */

import type { TraceId, IdempotencyKey } from './primitives.js';
import { createTraceId, createIdempotencyKey } from './primitives.js';

// =============================================================================
// EVENT BASE TYPES
// =============================================================================

/**
 * Base event metadata that all events must have
 */
export interface EventMetadata {
  /** Unique event ID */
  readonly id: string;
  /** Event timestamp */
  readonly timestamp: string;
  /** Correlation ID for distributed tracing */
  readonly correlationId: TraceId;
  /** Idempotency key for safe replay */
  readonly idempotencyKey: IdempotencyKey;
  /** Event schema version */
  readonly version: number;
  /** Source service/component */
  readonly source?: string;
  /** User/actor who triggered the event */
  readonly actor?: string;
}

/**
 * Base event structure
 */
export interface BaseEvent<TType extends string, TPayload> extends EventMetadata {
  /** Event type discriminator */
  readonly type: TType;
  /** Event payload */
  readonly payload: TPayload;
}

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates event metadata
 */
export function createEventMetadata(options: Partial<EventMetadata> = {}): EventMetadata {
  const base = {
    id: options.id ?? generateUUID(),
    timestamp: options.timestamp ?? new Date().toISOString(),
    correlationId: options.correlationId ?? createTraceId(),
    idempotencyKey: options.idempotencyKey ?? createIdempotencyKey(),
    version: options.version ?? 1,
  };

  if (options.source !== undefined && options.actor !== undefined) {
    return { ...base, source: options.source, actor: options.actor };
  }
  if (options.source !== undefined) {
    return { ...base, source: options.source };
  }
  if (options.actor !== undefined) {
    return { ...base, actor: options.actor };
  }
  return base;
}

// =============================================================================
// EVENT DEFINITION SYSTEM
// =============================================================================

/**
 * Event definition - describes an event type and its payload
 */
export interface EventDefinition<TType extends string, TPayload> {
  readonly type: TType;
  readonly create: (
    payload: TPayload,
    metadata?: Partial<EventMetadata>
  ) => BaseEvent<TType, TPayload>;
  readonly is: (event: unknown) => event is BaseEvent<TType, TPayload>;
}

/**
 * Creates a type-safe event definition
 *
 * @example
 * const LeadCreated = defineEvent('lead.created', {
 *   phone: z.string(),
 *   source: z.enum(['whatsapp', 'voice', 'web']),
 * });
 *
 * const event = LeadCreated.create({ phone: '+40123456789', source: 'whatsapp' });
 * if (LeadCreated.is(someEvent)) {
 *   console.log(someEvent.payload.phone);
 * }
 */
export function defineEvent<TType extends string, TPayload>(
  type: TType,
  _payloadSchema?: unknown // Optional Zod schema for runtime validation
): EventDefinition<TType, TPayload> {
  return {
    type,
    create: (payload: TPayload, metadata?: Partial<EventMetadata>) => ({
      type,
      payload,
      ...createEventMetadata(metadata),
    }),
    is: (event: unknown): event is BaseEvent<TType, TPayload> => {
      return (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type: unknown }).type === type
      );
    },
  };
}

// =============================================================================
// DOMAIN EVENTS - Lead Lifecycle
// =============================================================================

/** Lead created event payload */
export interface LeadCreatedPayload {
  phone: string;
  source: string;
  hubspotContactId?: string;
  clinicId?: string;
}

/** Lead scored event payload */
export interface LeadScoredPayload {
  phone: string;
  hubspotContactId?: string;
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  confidence: number;
  reasoning: string;
  previousScore?: number;
}

/** Lead qualified event payload */
export interface LeadQualifiedPayload {
  phone: string;
  hubspotContactId: string;
  qualificationCriteria: string[];
}

/** Lead assigned event payload */
export interface LeadAssignedPayload {
  phone: string;
  hubspotContactId: string;
  assignedTo: string;
  assignmentReason: string;
}

/** Lead status changed event payload */
export interface LeadStatusChangedPayload {
  phone: string;
  hubspotContactId?: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

// Define lead events
export const LeadCreated = defineEvent<'lead.created', LeadCreatedPayload>('lead.created');
export const LeadScored = defineEvent<'lead.scored', LeadScoredPayload>('lead.scored');
export const LeadQualified = defineEvent<'lead.qualified', LeadQualifiedPayload>('lead.qualified');
export const LeadAssigned = defineEvent<'lead.assigned', LeadAssignedPayload>('lead.assigned');
export const LeadStatusChanged = defineEvent<'lead.status.changed', LeadStatusChangedPayload>(
  'lead.status.changed'
);

// =============================================================================
// DOMAIN EVENTS - WhatsApp
// =============================================================================

/** WhatsApp message received payload */
export interface WhatsAppMessageReceivedPayload {
  messageId: string;
  from: string;
  phoneNumberId: string;
  messageType: string;
  content?: string;
  timestamp: string;
}

/** WhatsApp message sent payload */
export interface WhatsAppMessageSentPayload {
  messageId: string;
  to: string;
  templateName?: string;
  content?: string;
}

/** WhatsApp status update payload */
export interface WhatsAppStatusUpdatePayload {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipientId: string;
  errorCode?: string;
}

export const WhatsAppMessageReceived = defineEvent<
  'whatsapp.message.received',
  WhatsAppMessageReceivedPayload
>('whatsapp.message.received');
export const WhatsAppMessageSent = defineEvent<'whatsapp.message.sent', WhatsAppMessageSentPayload>(
  'whatsapp.message.sent'
);
export const WhatsAppStatusUpdate = defineEvent<
  'whatsapp.status.updated',
  WhatsAppStatusUpdatePayload
>('whatsapp.status.updated');

// =============================================================================
// DOMAIN EVENTS - Voice
// =============================================================================

/** Voice call initiated payload */
export interface VoiceCallInitiatedPayload {
  callSid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound' | 'outbound-api' | 'outbound-dial';
}

/** Voice call completed payload */
export interface VoiceCallCompletedPayload {
  callSid: string;
  duration: number;
  status: string;
  recordingUrl?: string;
}

/** Voice transcript ready payload */
export interface VoiceTranscriptReadyPayload {
  callSid: string;
  transcript: string;
  language?: string;
  sentiment?: string;
}

export const VoiceCallInitiated = defineEvent<'voice.call.initiated', VoiceCallInitiatedPayload>(
  'voice.call.initiated'
);
export const VoiceCallCompleted = defineEvent<'voice.call.completed', VoiceCallCompletedPayload>(
  'voice.call.completed'
);
export const VoiceTranscriptReady = defineEvent<
  'voice.transcript.ready',
  VoiceTranscriptReadyPayload
>('voice.transcript.ready');

// =============================================================================
// DOMAIN EVENTS - Payment
// =============================================================================

/** Payment received payload */
export interface PaymentReceivedPayload {
  stripePaymentId: string;
  hubspotContactId?: string;
  amount: number;
  currency: string;
  description?: string;
}

/** Payment failed payload */
export interface PaymentFailedPayload {
  stripePaymentId: string;
  hubspotContactId?: string;
  amount: number;
  currency: string;
  failureReason: string;
}

export const PaymentReceived = defineEvent<'payment.received', PaymentReceivedPayload>(
  'payment.received'
);
export const PaymentFailed = defineEvent<'payment.failed', PaymentFailedPayload>('payment.failed');

// =============================================================================
// DOMAIN EVENTS - Appointment
// =============================================================================

/** Appointment scheduled payload */
export interface AppointmentScheduledPayload {
  appointmentId: string;
  hubspotContactId: string;
  scheduledAt: string;
  procedureType: string;
  clinicLocation?: string;
}

/** Appointment reminder sent payload */
export interface AppointmentReminderSentPayload {
  appointmentId: string;
  hubspotContactId: string;
  channel: string;
  reminderType: '24h' | '2h' | '1h';
}

/** Appointment cancelled payload */
export interface AppointmentCancelledPayload {
  appointmentId: string;
  hubspotContactId: string;
  reason?: string;
  cancelledBy: 'patient' | 'clinic' | 'system';
}

export const AppointmentScheduled = defineEvent<
  'appointment.scheduled',
  AppointmentScheduledPayload
>('appointment.scheduled');
export const AppointmentReminderSent = defineEvent<
  'appointment.reminder.sent',
  AppointmentReminderSentPayload
>('appointment.reminder.sent');
export const AppointmentCancelled = defineEvent<
  'appointment.cancelled',
  AppointmentCancelledPayload
>('appointment.cancelled');

// =============================================================================
// DOMAIN EVENTS - Consent
// =============================================================================

/** Consent recorded payload */
export interface ConsentRecordedPayload {
  phone: string;
  hubspotContactId?: string;
  consentType: 'marketing' | 'medical_data' | 'communication';
  granted: boolean;
  consentText: string;
  ipAddress?: string;
}

export const ConsentRecorded = defineEvent<'consent.recorded', ConsentRecordedPayload>(
  'consent.recorded'
);

// =============================================================================
// EVENT UNION TYPE
// =============================================================================

/**
 * All domain event types
 */
export type DomainEventType =
  | typeof LeadCreated
  | typeof LeadScored
  | typeof LeadQualified
  | typeof LeadAssigned
  | typeof LeadStatusChanged
  | typeof WhatsAppMessageReceived
  | typeof WhatsAppMessageSent
  | typeof WhatsAppStatusUpdate
  | typeof VoiceCallInitiated
  | typeof VoiceCallCompleted
  | typeof VoiceTranscriptReady
  | typeof PaymentReceived
  | typeof PaymentFailed
  | typeof AppointmentScheduled
  | typeof AppointmentReminderSent
  | typeof AppointmentCancelled
  | typeof ConsentRecorded;

/**
 * All domain events union
 */
export type DomainEventUnion =
  | BaseEvent<'lead.created', LeadCreatedPayload>
  | BaseEvent<'lead.scored', LeadScoredPayload>
  | BaseEvent<'lead.qualified', LeadQualifiedPayload>
  | BaseEvent<'lead.assigned', LeadAssignedPayload>
  | BaseEvent<'lead.status.changed', LeadStatusChangedPayload>
  | BaseEvent<'whatsapp.message.received', WhatsAppMessageReceivedPayload>
  | BaseEvent<'whatsapp.message.sent', WhatsAppMessageSentPayload>
  | BaseEvent<'whatsapp.status.updated', WhatsAppStatusUpdatePayload>
  | BaseEvent<'voice.call.initiated', VoiceCallInitiatedPayload>
  | BaseEvent<'voice.call.completed', VoiceCallCompletedPayload>
  | BaseEvent<'voice.transcript.ready', VoiceTranscriptReadyPayload>
  | BaseEvent<'payment.received', PaymentReceivedPayload>
  | BaseEvent<'payment.failed', PaymentFailedPayload>
  | BaseEvent<'appointment.scheduled', AppointmentScheduledPayload>
  | BaseEvent<'appointment.reminder.sent', AppointmentReminderSentPayload>
  | BaseEvent<'appointment.cancelled', AppointmentCancelledPayload>
  | BaseEvent<'consent.recorded', ConsentRecordedPayload>;

/**
 * Event type literal union
 */
export type DomainEventTypeLiteral = DomainEventUnion['type'];

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Event handler function type
 */
export type EventHandler<T extends DomainEventUnion> = (event: T) => void | Promise<void>;

/**
 * Event handler map type - ensures all event types are handled
 */
export type EventHandlerMap<T extends DomainEventUnion = DomainEventUnion> = {
  [E in T as E['type']]: EventHandler<E>;
};

/**
 * Partial event handler map - for selective handling
 */
export type PartialEventHandlerMap<T extends DomainEventUnion = DomainEventUnion> = Partial<
  EventHandlerMap<T>
>;

// =============================================================================
// EVENT BUS IMPLEMENTATION
// =============================================================================

/**
 * Subscription handle for unsubscribing
 */
export interface Subscription {
  unsubscribe: () => void;
}

/**
 * Event bus options
 */
export interface EventBusOptions {
  /** Catch and log handler errors instead of throwing */
  catchErrors?: boolean;
  /** Error handler */
  onError?: (error: Error, event: DomainEventUnion) => void;
}

/**
 * Type-safe event bus with subscription management
 *
 * @example
 * const bus = new EventBus();
 *
 * // Subscribe to specific event
 * bus.on('lead.created', (event) => {
 *   console.log('New lead:', event.payload.phone);
 * });
 *
 * // Subscribe to multiple events
 * bus.onMany(['lead.scored', 'lead.qualified'], (event) => {
 *   console.log('Lead updated:', event.type);
 * });
 *
 * // Publish event
 * bus.publish(LeadCreated.create({ phone: '+40123456789', source: 'whatsapp' }));
 */
export class EventBus {
  private handlers = new Map<DomainEventTypeLiteral, Set<EventHandler<DomainEventUnion>>>();
  private allHandlers = new Set<EventHandler<DomainEventUnion>>();
  private options: EventBusOptions;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
  }

  /**
   * Subscribe to a specific event type
   */
  on<T extends DomainEventTypeLiteral>(
    type: T,
    handler: EventHandler<Extract<DomainEventUnion, { type: T }>>
  ): Subscription {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const handlers = this.handlers.get(type);
    if (handlers) handlers.add(handler as EventHandler<DomainEventUnion>);

    return {
      unsubscribe: () => {
        this.handlers.get(type)?.delete(handler as EventHandler<DomainEventUnion>);
      },
    };
  }

  /**
   * Subscribe to multiple event types
   */
  onMany<T extends DomainEventTypeLiteral>(
    types: T[],
    handler: EventHandler<Extract<DomainEventUnion, { type: T }>>
  ): Subscription {
    const subscriptions = types.map((type) => this.on(type, handler));
    return {
      unsubscribe: () => subscriptions.forEach((s) => s.unsubscribe()),
    };
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: EventHandler<DomainEventUnion>): Subscription {
    this.allHandlers.add(handler);
    return {
      unsubscribe: () => this.allHandlers.delete(handler),
    };
  }

  /**
   * Subscribe with handler that runs once
   */
  once<T extends DomainEventTypeLiteral>(
    type: T,
    handler: EventHandler<Extract<DomainEventUnion, { type: T }>>
  ): Subscription {
    const subscription = this.on(type, (event) => {
      subscription.unsubscribe();
      void handler(event);
    });
    return subscription;
  }

  /**
   * Publish an event
   */
  async publish(event: DomainEventUnion): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? new Set();
    const allHandlers = [...handlers, ...this.allHandlers];

    for (const handler of allHandlers) {
      try {
        await handler(event);
      } catch (error) {
        if (this.options.catchErrors) {
          this.options.onError?.(error as Error, event);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Publish multiple events
   */
  async publishAll(events: DomainEventUnion[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.allHandlers.clear();
  }

  /**
   * Get handler count for an event type
   */
  handlerCount(type: DomainEventTypeLiteral): number {
    return (this.handlers.get(type)?.size ?? 0) + this.allHandlers.size;
  }
}

// =============================================================================
// EVENT STORE INTERFACE
// =============================================================================

/**
 * Event store for event sourcing
 */
export interface EventStore {
  /** Append an event to the store */
  append(event: DomainEventUnion): Promise<void>;
  /** Get events by aggregate ID */
  getEvents(aggregateId: string, afterVersion?: number): Promise<DomainEventUnion[]>;
  /** Get all events of a specific type */
  getEventsByType<T extends DomainEventTypeLiteral>(
    type: T
  ): Promise<Extract<DomainEventUnion, { type: T }>[]>;
  /** Get events in a time range */
  getEventsInRange(from: Date, to: Date): Promise<DomainEventUnion[]>;
}

// =============================================================================
// EVENT SOURCING UTILITIES
// =============================================================================

/**
 * Aggregate state reducer type
 */
export type EventReducer<TState, TEvent extends DomainEventUnion> = (
  state: TState,
  event: TEvent
) => TState;

/**
 * Creates an aggregate from events
 */
export function replayEvents<TState>(
  initialState: TState,
  events: DomainEventUnion[],
  reducer: EventReducer<TState, DomainEventUnion>
): TState {
  return events.reduce(reducer, initialState);
}

/**
 * Event projection builder
 */
export class ProjectionBuilder<TState> {
  private initialState: TState;
  private handlers = new Map<DomainEventTypeLiteral, EventReducer<TState, DomainEventUnion>>();

  constructor(initialState: TState) {
    this.initialState = initialState;
  }

  /**
   * Adds a handler for an event type
   */
  on<T extends DomainEventTypeLiteral>(
    type: T,
    handler: EventReducer<TState, Extract<DomainEventUnion, { type: T }>>
  ): this {
    this.handlers.set(type, handler as EventReducer<TState, DomainEventUnion>);
    return this;
  }

  /**
   * Builds the projection function
   */
  build(): (events: DomainEventUnion[]) => TState {
    return (events) => {
      return events.reduce((state, event) => {
        const handler = this.handlers.get(event.type);
        return handler ? handler(state, event) : state;
      }, this.initialState);
    };
  }
}

/**
 * Creates a projection builder
 *
 * @example
 * const leadProjection = projection({ leads: 0, qualified: 0 })
 *   .on('lead.created', (state) => ({ ...state, leads: state.leads + 1 }))
 *   .on('lead.qualified', (state) => ({ ...state, qualified: state.qualified + 1 }))
 *   .build();
 *
 * const stats = leadProjection(events);
 */
export function projection<TState>(initialState: TState): ProjectionBuilder<TState> {
  return new ProjectionBuilder(initialState);
}

// =============================================================================
// EVENT MATCHERS
// =============================================================================

/**
 * Pattern matcher for domain events
 *
 * @example
 * const result = matchEvent(event, {
 *   'lead.created': (e) => `New lead: ${e.payload.phone}`,
 *   'lead.scored': (e) => `Score: ${e.payload.score}`,
 *   _: () => 'Unknown event',
 * });
 */
export function matchEvent<R>(
  event: DomainEventUnion,
  handlers: { [E in DomainEventUnion as E['type']]?: (event: E) => R } & { _?: () => R }
): R | undefined {
  const handler = handlers[event.type as keyof typeof handlers];
  if (handler) {
    return handler(event as never) as R | undefined;
  }
  return handlers._?.();
}

/**
 * Filters events by type
 */
export function filterEvents<T extends DomainEventTypeLiteral>(
  events: DomainEventUnion[],
  type: T
): Extract<DomainEventUnion, { type: T }>[] {
  return events.filter((e): e is Extract<DomainEventUnion, { type: T }> => e.type === type);
}

/**
 * Groups events by type
 */
export function groupEventsByType(
  events: DomainEventUnion[]
): Map<DomainEventTypeLiteral, DomainEventUnion[]> {
  const groups = new Map<DomainEventTypeLiteral, DomainEventUnion[]>();
  for (const event of events) {
    if (!groups.has(event.type)) {
      groups.set(event.type, []);
    }
    const group = groups.get(event.type);
    if (group) group.push(event);
  }
  return groups;
}
