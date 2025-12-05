import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDomainEvent, type DomainEvent } from '../events.js';

describe('createDomainEvent', () => {
  const originalServiceName = process.env.SERVICE_NAME;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'test-service';
  });

  afterEach(() => {
    if (originalServiceName !== undefined) {
      process.env.SERVICE_NAME = originalServiceName;
    } else {
      delete process.env.SERVICE_NAME;
    }
  });

  it('should create a basic domain event with required fields', () => {
    const event = createDomainEvent('test.event', { message: 'Hello' });

    expect(event.type).toBe('test.event');
    expect(event.payload).toEqual({ message: 'Hello' });
    expect(event.metadata).toMatchObject({
      eventId: expect.any(String),
      timestamp: expect.any(Date),
      source: 'test-service',
      version: 1,
    });
    expect(event.metadata.correlationId).toBeUndefined();
    expect(event.metadata.causationId).toBeUndefined();
  });

  it('should generate unique event IDs', () => {
    const event1 = createDomainEvent('test.event', { value: 1 });
    const event2 = createDomainEvent('test.event', { value: 2 });

    expect(event1.metadata.eventId).not.toBe(event2.metadata.eventId);
    expect(event1.metadata.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('should set current timestamp', () => {
    const before = new Date();
    const event = createDomainEvent('test.event', {});
    const after = new Date();

    expect(event.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.metadata.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should include correlationId when provided', () => {
    const correlationId = 'corr-123';
    const event = createDomainEvent('test.event', {}, { correlationId });

    expect(event.metadata.correlationId).toBe(correlationId);
  });

  it('should include causationId when provided', () => {
    const causationId = 'cause-456';
    const event = createDomainEvent('test.event', {}, { causationId });

    expect(event.metadata.causationId).toBe(causationId);
  });

  it('should include both correlationId and causationId when provided', () => {
    const options = {
      correlationId: 'corr-123',
      causationId: 'cause-456',
    };
    const event = createDomainEvent('test.event', {}, options);

    expect(event.metadata.correlationId).toBe('corr-123');
    expect(event.metadata.causationId).toBe('cause-456');
  });

  it('should use custom source when provided', () => {
    const event = createDomainEvent('test.event', {}, { source: 'custom-service' });

    expect(event.metadata.source).toBe('custom-service');
  });

  it('should use custom version when provided', () => {
    const event = createDomainEvent('test.event', {}, { version: 2 });

    expect(event.metadata.version).toBe(2);
  });

  it('should use default source from SERVICE_NAME env var', () => {
    process.env.SERVICE_NAME = 'api-service';
    const event = createDomainEvent('test.event', {});

    expect(event.metadata.source).toBe('api-service');
  });

  it('should use fallback source when SERVICE_NAME env var is not set', () => {
    delete process.env.SERVICE_NAME;
    const event = createDomainEvent('test.event', {});

    expect(event.metadata.source).toBe('medicalcor');
  });

  it('should handle complex payload types', () => {
    const complexPayload = {
      user: { id: 123, name: 'John' },
      items: [1, 2, 3],
      metadata: { tags: ['a', 'b'] },
    };
    const event = createDomainEvent('user.updated', complexPayload);

    expect(event.payload).toEqual(complexPayload);
  });

  it('should handle empty payload', () => {
    const event = createDomainEvent('system.startup', {});

    expect(event.payload).toEqual({});
  });

  it('should handle null values in payload', () => {
    const event = createDomainEvent('test.event', { value: null });

    expect(event.payload).toEqual({ value: null });
  });

  it('should preserve type information for strongly-typed events', () => {
    interface UserCreatedPayload {
      userId: string;
      email: string;
    }

    const payload: UserCreatedPayload = {
      userId: 'user-123',
      email: 'test@example.com',
    };

    const event: DomainEvent<'user.created', UserCreatedPayload> = createDomainEvent(
      'user.created',
      payload
    );

    expect(event.type).toBe('user.created');
    expect(event.payload.userId).toBe('user-123');
    expect(event.payload.email).toBe('test@example.com');
  });

  it('should handle all options together', () => {
    const options = {
      correlationId: 'corr-123',
      causationId: 'cause-456',
      source: 'custom-service',
      version: 3,
    };
    const event = createDomainEvent('test.event', { data: 'test' }, options);

    expect(event.type).toBe('test.event');
    expect(event.payload).toEqual({ data: 'test' });
    expect(event.metadata).toMatchObject({
      eventId: expect.any(String),
      timestamp: expect.any(Date),
      correlationId: 'corr-123',
      causationId: 'cause-456',
      source: 'custom-service',
      version: 3,
    });
  });

  describe('Event type examples', () => {
    it('should create lead.created event', () => {
      const event = createDomainEvent('lead.created', {
        leadId: 'lead-123',
        phone: '+40721000001',
        channel: 'whatsapp',
      });

      expect(event.type).toBe('lead.created');
      expect(event.payload).toMatchObject({
        leadId: 'lead-123',
        phone: '+40721000001',
        channel: 'whatsapp',
      });
    });

    it('should create appointment.scheduled event', () => {
      const event = createDomainEvent('appointment.scheduled', {
        appointmentId: 'appt-456',
        patientId: 'patient-789',
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
      });

      expect(event.type).toBe('appointment.scheduled');
      expect(event.payload.appointmentId).toBe('appt-456');
    });

    it('should create payment.completed event', () => {
      const event = createDomainEvent('payment.completed', {
        paymentId: 'pay-123',
        amount: 150.0,
        currency: 'RON',
      });

      expect(event.type).toBe('payment.completed');
      expect(event.payload.amount).toBe(150.0);
    });
  });
});
