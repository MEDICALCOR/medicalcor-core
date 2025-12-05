/**
 * Type-Safe Event System Unit Tests
 *
 * Tests for the event system including:
 * - Event metadata creation
 * - Event definitions and creation
 * - Domain event definitions
 * - Event bus subscription and publishing
 * - Event store interface
 * - Event sourcing utilities (replay, projections)
 * - Event filtering and grouping
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Event metadata
  createEventMetadata,
  type EventMetadata,
  // Event definition
  defineEvent,
  type EventDefinition,
  // Domain events
  LeadCreated,
  LeadScored,
  LeadQualified,
  WhatsAppMessageReceived,
  VoiceCallInitiated,
  PaymentReceived,
  AppointmentScheduled,
  ConsentRecorded,
  type DomainEventUnion,
  type DomainEventTypeLiteral,
  // Event bus
  EventBus,
  type Subscription,
  // Event sourcing
  replayEvents,
  projection,
  ProjectionBuilder,
  // Event utilities
  matchEvent,
  filterEvents,
  groupEventsByType,
} from '../lib/events.js';
import type { TraceId, IdempotencyKey } from '../lib/primitives.js';

describe('createEventMetadata', () => {
  it('should create metadata with default values', () => {
    const meta = createEventMetadata();

    expect(meta.id).toBeDefined();
    expect(meta.timestamp).toBeDefined();
    expect(meta.correlationId).toBeDefined();
    expect(meta.idempotencyKey).toBeDefined();
    expect(meta.version).toBe(1);
  });

  it('should accept custom values', () => {
    const meta = createEventMetadata({
      id: 'custom-id',
      timestamp: '2024-01-01T00:00:00Z',
      correlationId: 'corr-123' as TraceId,
      idempotencyKey: 'idem-456' as IdempotencyKey,
      version: 2,
    });

    expect(meta.id).toBe('custom-id');
    expect(meta.timestamp).toBe('2024-01-01T00:00:00Z');
    expect(meta.correlationId).toBe('corr-123');
    expect(meta.idempotencyKey).toBe('idem-456');
    expect(meta.version).toBe(2);
  });

  it('should include source when provided', () => {
    const meta = createEventMetadata({ source: 'api-gateway' });

    expect(meta.source).toBe('api-gateway');
  });

  it('should include actor when provided', () => {
    const meta = createEventMetadata({ actor: 'user-123' });

    expect(meta.actor).toBe('user-123');
  });

  it('should include both source and actor when provided', () => {
    const meta = createEventMetadata({ source: 'api', actor: 'user-123' });

    expect(meta.source).toBe('api');
    expect(meta.actor).toBe('user-123');
  });

  it('should generate valid UUID', () => {
    const meta = createEventMetadata();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(meta.id).toMatch(uuidRegex);
  });

  it('should generate ISO timestamp', () => {
    const meta = createEventMetadata();

    expect(new Date(meta.timestamp).toISOString()).toBe(meta.timestamp);
  });
});

describe('defineEvent', () => {
  interface TestPayload {
    message: string;
    value: number;
  }

  it('should create event definition', () => {
    const TestEvent = defineEvent<'test.event', TestPayload>('test.event');

    expect(TestEvent.type).toBe('test.event');
    expect(TestEvent.create).toBeInstanceOf(Function);
    expect(TestEvent.is).toBeInstanceOf(Function);
  });

  it('should create event with payload', () => {
    const TestEvent = defineEvent<'test.event', TestPayload>('test.event');
    const event = TestEvent.create({ message: 'hello', value: 42 });

    expect(event.type).toBe('test.event');
    expect(event.payload).toEqual({ message: 'hello', value: 42 });
    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
  });

  it('should create event with custom metadata', () => {
    const TestEvent = defineEvent<'test.event', TestPayload>('test.event');
    const event = TestEvent.create(
      { message: 'hello', value: 42 },
      { source: 'test-source', actor: 'test-actor' }
    );

    expect(event.source).toBe('test-source');
    expect(event.actor).toBe('test-actor');
  });

  it('should provide type guard', () => {
    const TestEvent = defineEvent<'test.event', TestPayload>('test.event');
    const OtherEvent = defineEvent<'other.event', TestPayload>('other.event');

    const event = TestEvent.create({ message: 'hello', value: 42 });

    expect(TestEvent.is(event)).toBe(true);
    expect(OtherEvent.is(event)).toBe(false);
  });

  it('should type guard correctly with unknown', () => {
    const TestEvent = defineEvent<'test.event', TestPayload>('test.event');
    const unknown: unknown = { type: 'test.event', payload: {} };

    if (TestEvent.is(unknown)) {
      // TypeScript should narrow the type
      expect(unknown.type).toBe('test.event');
    }
  });

  it('should handle non-object values in type guard', () => {
    const TestEvent = defineEvent<'test.event', TestPayload>('test.event');

    expect(TestEvent.is(null)).toBe(false);
    expect(TestEvent.is(undefined)).toBe(false);
    expect(TestEvent.is('string')).toBe(false);
    expect(TestEvent.is(42)).toBe(false);
  });
});

describe('Domain Events', () => {
  describe('LeadCreated', () => {
    it('should create lead created event', () => {
      const event = LeadCreated.create({
        phone: '+40712345678',
        source: 'whatsapp',
        clinicId: 'clinic-123',
      });

      expect(event.type).toBe('lead.created');
      expect(event.payload.phone).toBe('+40712345678');
      expect(event.payload.source).toBe('whatsapp');
    });

    it('should identify lead created events', () => {
      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });

      expect(LeadCreated.is(event)).toBe(true);
      expect(LeadScored.is(event)).toBe(false);
    });
  });

  describe('LeadScored', () => {
    it('should create lead scored event', () => {
      const event = LeadScored.create({
        phone: '+40712345678',
        score: 4,
        classification: 'HOT',
        confidence: 0.95,
        reasoning: 'High engagement',
      });

      expect(event.type).toBe('lead.scored');
      expect(event.payload.score).toBe(4);
      expect(event.payload.classification).toBe('HOT');
    });
  });

  describe('WhatsAppMessageReceived', () => {
    it('should create whatsapp message received event', () => {
      const event = WhatsAppMessageReceived.create({
        messageId: 'msg-123',
        from: '+40712345678',
        phoneNumberId: 'phone-456',
        messageType: 'text',
        content: 'Hello',
        timestamp: '2024-01-01T00:00:00Z',
      });

      expect(event.type).toBe('whatsapp.message.received');
      expect(event.payload.messageId).toBe('msg-123');
    });
  });

  describe('VoiceCallInitiated', () => {
    it('should create voice call initiated event', () => {
      const event = VoiceCallInitiated.create({
        callSid: 'call-123',
        from: '+40712345678',
        to: '+40987654321',
        direction: 'inbound',
      });

      expect(event.type).toBe('voice.call.initiated');
      expect(event.payload.callSid).toBe('call-123');
    });
  });

  describe('PaymentReceived', () => {
    it('should create payment received event', () => {
      const event = PaymentReceived.create({
        stripePaymentId: 'pi_123',
        amount: 10000,
        currency: 'USD',
        description: 'Consultation fee',
      });

      expect(event.type).toBe('payment.received');
      expect(event.payload.amount).toBe(10000);
    });
  });

  describe('AppointmentScheduled', () => {
    it('should create appointment scheduled event', () => {
      const event = AppointmentScheduled.create({
        appointmentId: 'appt-123',
        hubspotContactId: 'hs-456',
        scheduledAt: '2024-06-01T10:00:00Z',
        procedureType: 'Cleaning',
      });

      expect(event.type).toBe('appointment.scheduled');
      expect(event.payload.procedureType).toBe('Cleaning');
    });
  });

  describe('ConsentRecorded', () => {
    it('should create consent recorded event', () => {
      const event = ConsentRecorded.create({
        phone: '+40712345678',
        consentType: 'marketing',
        granted: true,
        consentText: 'I agree to receive marketing communications',
      });

      expect(event.type).toBe('consent.recorded');
      expect(event.payload.granted).toBe(true);
    });
  });
});

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on', () => {
    it('should subscribe to specific event type', async () => {
      const handler = vi.fn();
      bus.on('lead.created', handler);

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not call handler for different event types', async () => {
      const handler = vi.fn();
      bus.on('lead.created', handler);

      const event = LeadScored.create({
        phone: '+40712345678',
        score: 4,
        classification: 'HOT',
        confidence: 0.95,
        reasoning: 'Test',
      });
      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return subscription that can unsubscribe', async () => {
      const handler = vi.fn();
      const subscription = bus.on('lead.created', handler);

      subscription.unsubscribe();

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for same event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('lead.created', handler1);
      bus.on('lead.created', handler2);

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle async handlers', async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      bus.on('lead.created', handler);

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('onMany', () => {
    it('should subscribe to multiple event types', async () => {
      const handler = vi.fn();
      bus.onMany(['lead.created', 'lead.scored'], handler);

      const event1 = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      const event2 = LeadScored.create({
        phone: '+40712345678',
        score: 4,
        classification: 'HOT',
        confidence: 0.95,
        reasoning: 'Test',
      });

      await bus.publish(event1);
      await bus.publish(event2);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe from all events', async () => {
      const handler = vi.fn();
      const subscription = bus.onMany(['lead.created', 'lead.scored'], handler);

      subscription.unsubscribe();

      const event1 = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      const event2 = LeadScored.create({
        phone: '+40712345678',
        score: 4,
        classification: 'HOT',
        confidence: 0.95,
        reasoning: 'Test',
      });

      await bus.publish(event1);
      await bus.publish(event2);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onAll', () => {
    it('should subscribe to all events', async () => {
      const handler = vi.fn();
      bus.onAll(handler);

      const event1 = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      const event2 = PaymentReceived.create({
        stripePaymentId: 'pi_123',
        amount: 10000,
        currency: 'USD',
      });

      await bus.publish(event1);
      await bus.publish(event2);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe from all events', async () => {
      const handler = vi.fn();
      const subscription = bus.onAll(handler);

      subscription.unsubscribe();

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should call handler only once', async () => {
      const handler = vi.fn();
      bus.once('lead.created', handler);

      const event1 = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      const event2 = LeadCreated.create({ phone: '+40987654321', source: 'voice' });

      await bus.publish(event1);
      await bus.publish(event2);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event1);
    });

    it('should auto-unsubscribe after first call', async () => {
      const handler = vi.fn();
      const subscription = bus.once('lead.created', handler);

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      // Subscription should be auto-unsubscribed
      await bus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish', () => {
    it('should publish events to handlers', async () => {
      const handler = vi.fn();
      bus.on('lead.created', handler);

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle errors in handlers when catchErrors is true', async () => {
      const onError = vi.fn();
      const errorBus = new EventBus({ catchErrors: true, onError });

      errorBus.on('lead.created', () => {
        throw new Error('Handler error');
      });

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await errorBus.publish(event);

      expect(onError).toHaveBeenCalled();
    });

    it('should throw errors when catchErrors is false', async () => {
      const errorBus = new EventBus({ catchErrors: false });

      errorBus.on('lead.created', () => {
        throw new Error('Handler error');
      });

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });

      await expect(errorBus.publish(event)).rejects.toThrow('Handler error');
    });

    it('should call handlers in order', async () => {
      const order: number[] = [];

      bus.on('lead.created', async () => {
        order.push(1);
      });
      bus.on('lead.created', async () => {
        order.push(2);
      });
      bus.onAll(async () => {
        order.push(3);
      });

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('publishAll', () => {
    it('should publish multiple events', async () => {
      const handler = vi.fn();
      bus.onAll(handler);

      const events = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        LeadScored.create({
          phone: '+40712345678',
          score: 4,
          classification: 'HOT',
          confidence: 0.95,
          reasoning: 'Test',
        }),
      ];

      await bus.publishAll(events);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('clear', () => {
    it('should remove all handlers', async () => {
      const handler = vi.fn();
      bus.on('lead.created', handler);
      bus.onAll(handler);

      bus.clear();

      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });
      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('handlerCount', () => {
    it('should return handler count for event type', () => {
      bus.on('lead.created', () => {});
      bus.on('lead.created', () => {});
      bus.onAll(() => {});

      expect(bus.handlerCount('lead.created')).toBe(3); // 2 specific + 1 all
    });

    it('should return 0 for events with no handlers', () => {
      expect(bus.handlerCount('lead.created')).toBe(0);
    });

    it('should count onAll handlers', () => {
      bus.onAll(() => {});

      expect(bus.handlerCount('lead.created')).toBe(1);
    });
  });
});

describe('Event Sourcing', () => {
  describe('replayEvents', () => {
    it('should replay events to build state', () => {
      interface LeadState {
        phone: string | null;
        score: number | null;
        qualified: boolean;
      }

      const initialState: LeadState = { phone: null, score: null, qualified: false };

      const reducer = (state: LeadState, event: DomainEventUnion): LeadState => {
        if (LeadCreated.is(event)) {
          return { ...state, phone: event.payload.phone };
        }
        if (LeadScored.is(event)) {
          return { ...state, score: event.payload.score };
        }
        if (LeadQualified.is(event)) {
          return { ...state, qualified: true };
        }
        return state;
      };

      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        LeadScored.create({
          phone: '+40712345678',
          score: 4,
          classification: 'HOT',
          confidence: 0.95,
          reasoning: 'Test',
        }),
        LeadQualified.create({
          phone: '+40712345678',
          hubspotContactId: 'hs-123',
          qualificationCriteria: ['high score'],
        }),
      ];

      const finalState = replayEvents(initialState, events, reducer);

      expect(finalState).toEqual({
        phone: '+40712345678',
        score: 4,
        qualified: true,
      });
    });

    it('should handle empty event list', () => {
      const initialState = { count: 0 };
      const reducer = (state: typeof initialState) => state;

      const finalState = replayEvents(initialState, [], reducer);

      expect(finalState).toEqual(initialState);
    });
  });

  describe('ProjectionBuilder', () => {
    it('should build projection from events', () => {
      interface Stats {
        totalLeads: number;
        qualifiedLeads: number;
      }

      const initialState: Stats = { totalLeads: 0, qualifiedLeads: 0 };

      const proj = new ProjectionBuilder(initialState)
        .on('lead.created', (state) => ({
          ...state,
          totalLeads: state.totalLeads + 1,
        }))
        .on('lead.qualified', (state) => ({
          ...state,
          qualifiedLeads: state.qualifiedLeads + 1,
        }))
        .build();

      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        LeadCreated.create({ phone: '+40987654321', source: 'voice' }),
        LeadQualified.create({
          phone: '+40712345678',
          hubspotContactId: 'hs-123',
          qualificationCriteria: [],
        }),
      ];

      const stats = proj(events);

      expect(stats).toEqual({
        totalLeads: 2,
        qualifiedLeads: 1,
      });
    });

    it('should ignore unhandled events', () => {
      const proj = new ProjectionBuilder({ count: 0 })
        .on('lead.created', (state) => ({ ...state, count: state.count + 1 }))
        .build();

      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        PaymentReceived.create({
          stripePaymentId: 'pi_123',
          amount: 10000,
          currency: 'USD',
        }),
      ];

      const result = proj(events);

      expect(result.count).toBe(1);
    });
  });

  describe('projection', () => {
    it('should create projection with fluent API', () => {
      const proj = projection({ leads: 0, payments: 0 })
        .on('lead.created', (state) => ({ ...state, leads: state.leads + 1 }))
        .on('payment.received', (state) => ({ ...state, payments: state.payments + 1 }))
        .build();

      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        PaymentReceived.create({
          stripePaymentId: 'pi_123',
          amount: 10000,
          currency: 'USD',
        }),
      ];

      const stats = proj(events);

      expect(stats).toEqual({ leads: 1, payments: 1 });
    });
  });
});

describe('Event Utilities', () => {
  describe('matchEvent', () => {
    it('should match event to handler', () => {
      const event = LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' });

      const result = matchEvent(event, {
        'lead.created': (e) => `Created: ${e.payload.phone}`,
        'lead.scored': (e) => `Scored: ${e.payload.score}`,
        _: () => 'Unknown',
      });

      expect(result).toBe('Created: +40712345678');
    });

    it('should use default handler for unmatched events', () => {
      const event = PaymentReceived.create({
        stripePaymentId: 'pi_123',
        amount: 10000,
        currency: 'USD',
      });

      const result = matchEvent(event, {
        'lead.created': () => 'Lead',
        'lead.scored': () => 'Score',
        _: () => 'Other',
      });

      expect(result).toBe('Other');
    });

    it('should return undefined when no handler matches and no default', () => {
      const event = PaymentReceived.create({
        stripePaymentId: 'pi_123',
        amount: 10000,
        currency: 'USD',
      });

      const result = matchEvent(event, {
        'lead.created': () => 'Lead',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('filterEvents', () => {
    it('should filter events by type', () => {
      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        LeadScored.create({
          phone: '+40712345678',
          score: 4,
          classification: 'HOT',
          confidence: 0.95,
          reasoning: 'Test',
        }),
        LeadCreated.create({ phone: '+40987654321', source: 'voice' }),
      ];

      const leadCreatedEvents = filterEvents(events, 'lead.created');

      expect(leadCreatedEvents).toHaveLength(2);
      expect(leadCreatedEvents.every((e) => e.type === 'lead.created')).toBe(true);
    });

    it('should return empty array when no matches', () => {
      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
      ];

      const filtered = filterEvents(events, 'payment.received');

      expect(filtered).toEqual([]);
    });
  });

  describe('groupEventsByType', () => {
    it('should group events by type', () => {
      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        LeadScored.create({
          phone: '+40712345678',
          score: 4,
          classification: 'HOT',
          confidence: 0.95,
          reasoning: 'Test',
        }),
        LeadCreated.create({ phone: '+40987654321', source: 'voice' }),
        PaymentReceived.create({
          stripePaymentId: 'pi_123',
          amount: 10000,
          currency: 'USD',
        }),
      ];

      const grouped = groupEventsByType(events);

      expect(grouped.size).toBe(3);
      expect(grouped.get('lead.created')).toHaveLength(2);
      expect(grouped.get('lead.scored')).toHaveLength(1);
      expect(grouped.get('payment.received')).toHaveLength(1);
    });

    it('should handle empty event list', () => {
      const grouped = groupEventsByType([]);

      expect(grouped.size).toBe(0);
    });

    it('should handle single event type', () => {
      const events: DomainEventUnion[] = [
        LeadCreated.create({ phone: '+40712345678', source: 'whatsapp' }),
        LeadCreated.create({ phone: '+40987654321', source: 'voice' }),
      ];

      const grouped = groupEventsByType(events);

      expect(grouped.size).toBe(1);
      expect(grouped.get('lead.created')).toHaveLength(2);
    });
  });
});
