/**
 * Type-Safe Builder Patterns Unit Tests
 *
 * Tests for builder implementations including:
 * - Generic TypeSafeBuilder with type-level field tracking
 * - LeadBuilder with step-by-step construction
 * - EventBuilder for domain events
 * - ApiRequestBuilder for HTTP requests
 * - SchemaBuilder for Zod schemas
 * - QueryBuilder for type-safe queries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Generic builder
  TypeSafeBuilder,
  createBuilder,
  // Lead builder
  LeadBuilder,
  type LeadData,
  // Event builder
  EventBuilder,
  // API request builder
  ApiRequestBuilder,
  type ApiRequestConfig,
  // Schema builder
  SchemaBuilder,
  // Query builder
  QueryBuilder,
  type QueryConfig,
} from '../lib/builder.js';
import { z } from 'zod';
import type { E164PhoneNumber } from '../lib/primitives.js';

describe('TypeSafeBuilder', () => {
  interface Person {
    name: string;
    age: number;
    email?: string;
  }

  it('should create empty builder', () => {
    const builder = createBuilder<Person>();

    expect(builder).toBeInstanceOf(TypeSafeBuilder);
    expect(builder.getData()).toEqual({});
  });

  it('should set individual fields', () => {
    const builder = createBuilder<Person>().set('name', 'John').set('age', 30);

    expect(builder.getData()).toEqual({ name: 'John', age: 30 });
  });

  it('should set multiple fields at once', () => {
    const builder = createBuilder<Person>().setMany({ name: 'John', age: 30 });

    expect(builder.getData()).toEqual({ name: 'John', age: 30 });
  });

  it('should build final object', () => {
    const person = createBuilder<Person>().set('name', 'John').set('age', 30).build();

    expect(person).toEqual({ name: 'John', age: 30 });
  });

  it('should chain multiple operations', () => {
    const person = createBuilder<Person>()
      .set('name', 'John')
      .set('age', 30)
      .set('email', 'john@example.com')
      .build();

    expect(person).toEqual({
      name: 'John',
      age: 30,
      email: 'john@example.com',
    });
  });

  it('should allow overwriting fields', () => {
    const builder = createBuilder<Person>().set('name', 'John').set('name', 'Jane');

    expect(builder.getData().name).toBe('Jane');
  });

  it('should get current data for inspection', () => {
    const builder = createBuilder<Person>().set('name', 'John');
    const data = builder.getData();

    expect(data).toEqual({ name: 'John' });
    // Should be a copy, not reference
    data.name = 'Jane';
    expect(builder.getData().name).toBe('John');
  });
});

describe('LeadBuilder', () => {
  it('should create new builder with defaults', () => {
    const builder = LeadBuilder.create();

    // Builder requires phone, source, and status before it can be built
    expect(() => builder.tryBuild()).toThrow('Phone is required');

    // With required fields set
    const data = builder
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .tryBuild();

    expect(data.id).toBeDefined();
    expect(data.status).toBe('new');
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.updatedAt).toBeInstanceOf(Date);
  });

  it('should require phone, source, and status before building', () => {
    const builder = LeadBuilder.create();

    expect(() => builder.tryBuild()).toThrow('Phone is required');
  });

  it('should build with required fields', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .build();

    expect(lead.phone).toBe('+40712345678');
    expect(lead.source).toBe('whatsapp');
    expect(lead.status).toBe('new');
  });

  it('should set phone number', () => {
    const builder = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new');

    const data = builder.tryBuild();
    expect(data.phone).toBe('+40712345678');
  });

  it('should set lead source', () => {
    const builder = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('voice')
      .withStatus('new');

    expect(builder.tryBuild().source).toBe('voice');
  });

  it('should set lead status and update timestamp', () => {
    const builder = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('contacted');

    const lead = builder.tryBuild();
    expect(lead.status).toBe('contacted');
    expect(lead.updatedAt).toBeInstanceOf(Date);
  });

  it('should set priority', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withPriority('high')
      .build();

    expect(lead.priority).toBe('high');
  });

  it('should set patient name', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withName('John', 'Doe')
      .build();

    expect(lead.firstName).toBe('John');
    expect(lead.lastName).toBe('Doe');
  });

  it('should set name without last name', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withName('John')
      .build();

    expect(lead.firstName).toBe('John');
    expect(lead.lastName).toBeUndefined();
  });

  it('should set email', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withEmail('john@example.com')
      .build();

    expect(lead.email).toBe('john@example.com');
  });

  it('should set HubSpot ID', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withHubSpotId('hubspot-123')
      .build();

    expect(lead.hubspotContactId).toBe('hubspot-123');
  });

  it('should set clinic ID for multi-tenancy', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .forClinic('clinic-123')
      .build();

    expect(lead.clinicId).toBe('clinic-123');
  });

  it('should set custom metadata', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withMetadata({ utm_source: 'facebook', utm_campaign: 'spring2024' })
      .build();

    expect(lead.metadata).toEqual({
      utm_source: 'facebook',
      utm_campaign: 'spring2024',
    });
  });

  it('should merge metadata on multiple calls', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withMetadata({ key1: 'value1' })
      .withMetadata({ key2: 'value2' })
      .build();

    expect(lead.metadata).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });

  it('should set custom ID', () => {
    const lead = LeadBuilder.create()
      .withId('custom-id-123')
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .build();

    expect(lead.id).toBe('custom-id-123');
  });

  it('should create from existing data', () => {
    const existingLead: LeadData = {
      id: 'existing-id' as any,
      phone: '+40712345678' as E164PhoneNumber,
      source: 'whatsapp',
      status: 'contacted',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    };

    const builder = LeadBuilder.from(existingLead);
    const lead = builder.build();

    expect(lead.id).toBe('existing-id');
    expect(lead.status).toBe('contacted');
  });

  it('should support fluent chaining', () => {
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .withPriority('critical')
      .withName('John', 'Doe')
      .withEmail('john@example.com')
      .withHubSpotId('hs-123')
      .forClinic('clinic-456')
      .withMetadata({ source: 'ad' })
      .build();

    expect(lead).toMatchObject({
      phone: '+40712345678',
      source: 'whatsapp',
      status: 'new',
      priority: 'critical',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      hubspotContactId: 'hs-123',
      clinicId: 'clinic-456',
      metadata: { source: 'ad' },
    });
  });

  it('should update timestamp on build', () => {
    const before = new Date();
    const lead = LeadBuilder.create()
      .withPhone('+40712345678')
      .fromSource('whatsapp')
      .withStatus('new')
      .build();

    expect(lead.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

describe('EventBuilder', () => {
  it('should create event with type', () => {
    const builder = EventBuilder.create('lead.created');
    const data = builder.withPayload({ phone: '+40123456789' }).build();

    expect(data.type).toBe('lead.created');
    expect(data.id).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(data.correlationId).toBeDefined();
    expect(data.idempotencyKey).toBeDefined();
    expect(data.version).toBe(1);
  });

  it('should set payload', () => {
    const payload = { phone: '+40123456789', source: 'whatsapp' };
    const event = EventBuilder.create('lead.created').withPayload(payload).build();

    expect(event.payload).toEqual(payload);
  });

  it('should set correlation ID', () => {
    const event = EventBuilder.create('lead.created')
      .withPayload({})
      .withCorrelationId('corr-123' as any)
      .build();

    expect(event.correlationId).toBe('corr-123');
  });

  it('should set idempotency key', () => {
    const event = EventBuilder.create('lead.created')
      .withPayload({})
      .withIdempotencyKey('idem-123')
      .build();

    expect(event.idempotencyKey).toBe('idem-123');
  });

  it('should set version', () => {
    const event = EventBuilder.create('lead.created').withPayload({}).withVersion(2).build();

    expect(event.version).toBe(2);
  });

  it('should set custom timestamp', () => {
    const customDate = new Date('2024-01-01T00:00:00Z');
    const event = EventBuilder.create('lead.created').withPayload({}).at(customDate).build();

    expect(event.timestamp).toBe(customDate.toISOString());
  });

  it('should accept timestamp as string', () => {
    const timestamp = '2024-01-01T00:00:00Z';
    const event = EventBuilder.create('lead.created').withPayload({}).at(timestamp).build();

    expect(event.timestamp).toBe(timestamp);
  });

  it('should support fluent chaining', () => {
    const event = EventBuilder.create('payment.received')
      .withPayload({ amount: 100, currency: 'USD' })
      .withCorrelationId('corr-123' as any)
      .withIdempotencyKey('idem-456')
      .withVersion(2)
      .at('2024-01-01T00:00:00Z')
      .build();

    expect(event).toMatchObject({
      type: 'payment.received',
      payload: { amount: 100, currency: 'USD' },
      correlationId: 'corr-123',
      idempotencyKey: 'idem-456',
      version: 2,
      timestamp: '2024-01-01T00:00:00Z',
    });
  });
});

describe('ApiRequestBuilder', () => {
  describe('HTTP method builders', () => {
    it('should create GET request', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads').build();

      expect(config.method).toBe('GET');
      expect(config.path).toBe('/api/v1/leads');
    });

    it('should create POST request', () => {
      const config = ApiRequestBuilder.post('/api/v1/leads').build();

      expect(config.method).toBe('POST');
      expect(config.path).toBe('/api/v1/leads');
    });

    it('should create PUT request', () => {
      const config = ApiRequestBuilder.put('/api/v1/leads/123').build();

      expect(config.method).toBe('PUT');
    });

    it('should create PATCH request', () => {
      const config = ApiRequestBuilder.patch('/api/v1/leads/123').build();

      expect(config.method).toBe('PATCH');
    });

    it('should create DELETE request', () => {
      const config = ApiRequestBuilder.delete('/api/v1/leads/123').build();

      expect(config.method).toBe('DELETE');
    });
  });

  describe('withAuth', () => {
    it('should add Bearer auth header', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withAuth('token123')
        .build();

      expect(config.headers?.['Authorization']).toBe('Bearer token123');
    });

    it('should add Basic auth header', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withAuth('credentials', 'Basic')
        .build();

      expect(config.headers?.['Authorization']).toBe('Basic credentials');
    });
  });

  describe('withHeader', () => {
    it('should add custom header', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withHeader('X-Custom-Header', 'value')
        .build();

      expect(config.headers?.['X-Custom-Header']).toBe('value');
    });

    it('should merge multiple headers', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withHeader('X-Header-1', 'value1')
        .withHeader('X-Header-2', 'value2')
        .build();

      expect(config.headers?.['X-Header-1']).toBe('value1');
      expect(config.headers?.['X-Header-2']).toBe('value2');
    });
  });

  describe('withBody', () => {
    it('should set request body and content-type', () => {
      const body = { name: 'John', phone: '+40123456789' };
      const config = ApiRequestBuilder.post('/api/v1/leads').withBody(body).build();

      expect(config.body).toEqual(body);
      expect(config.headers?.['Content-Type']).toBe('application/json');
    });
  });

  describe('withQuery', () => {
    it('should add query parameters', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withQuery({ status: 'new', limit: 20 })
        .build();

      expect(config.query).toEqual({ status: 'new', limit: 20 });
    });

    it('should merge multiple query calls', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withQuery({ status: 'new' })
        .withQuery({ limit: 20 })
        .build();

      expect(config.query).toEqual({ status: 'new', limit: 20 });
    });

    it('should support boolean query params', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withQuery({ includeDeleted: true })
        .build();

      expect(config.query?.includeDeleted).toBe(true);
    });
  });

  describe('withTimeout', () => {
    it('should set timeout', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads').withTimeout(5000).build();

      expect(config.timeout).toBe(5000);
    });
  });

  describe('withRetries', () => {
    it('should set retry count', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads').withRetries(3).build();

      expect(config.retries).toBe(3);
    });
  });

  describe('withTraceId', () => {
    it('should add correlation ID header', () => {
      const config = ApiRequestBuilder.get('/api/v1/leads')
        .withTraceId('trace-123' as any)
        .build();

      expect(config.headers?.['X-Correlation-Id']).toBe('trace-123');
    });
  });

  it('should support complete fluent API', () => {
    const config = ApiRequestBuilder.post('/api/v1/leads')
      .withAuth('token123')
      .withBody({ phone: '+40123456789' })
      .withQuery({ source: 'api' })
      .withTimeout(5000)
      .withRetries(3)
      .withTraceId('trace-123' as any)
      .withHeader('X-Custom', 'value')
      .build();

    expect(config).toMatchObject({
      method: 'POST',
      path: '/api/v1/leads',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'trace-123',
        'X-Custom': 'value',
      },
      body: { phone: '+40123456789' },
      query: { source: 'api' },
      timeout: 5000,
      retries: 3,
    });
  });
});

describe('SchemaBuilder', () => {
  it('should create empty schema', () => {
    const schema = SchemaBuilder.object().build();

    expect(schema.parse({})).toEqual({});
  });

  it('should add required fields', () => {
    const schema = SchemaBuilder.object()
      .field('name', z.string())
      .field('age', z.number())
      .build();

    expect(schema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
  });

  it('should add optional fields', () => {
    const schema = SchemaBuilder.object()
      .field('name', z.string())
      .optional('email', z.string().email())
      .build();

    expect(schema.parse({ name: 'John' })).toEqual({ name: 'John' });
    expect(schema.parse({ name: 'John', email: 'john@example.com' })).toEqual({
      name: 'John',
      email: 'john@example.com',
    });
  });

  it('should add nullable fields', () => {
    const schema = SchemaBuilder.object()
      .field('name', z.string())
      .nullable('middleName', z.string())
      .build();

    expect(schema.parse({ name: 'John', middleName: null })).toEqual({
      name: 'John',
      middleName: null,
    });
  });

  it('should add fields with default values', () => {
    const schema = SchemaBuilder.object()
      .field('name', z.string())
      .withDefault('status', z.string(), 'active')
      .build();

    expect(schema.parse({ name: 'John' })).toEqual({ name: 'John', status: 'active' });
  });

  it('should merge shapes', () => {
    const baseShape = { id: z.string() };
    const schema = SchemaBuilder.object()
      .field('name', z.string())
      .merge(baseShape)
      .build();

    expect(schema.parse({ id: '123', name: 'John' })).toEqual({ id: '123', name: 'John' });
  });

  it('should pick specific fields', () => {
    const schema = SchemaBuilder.object()
      .field('id', z.string())
      .field('name', z.string())
      .field('age', z.number())
      .pick('id', 'name')
      .build();

    const result = schema.parse({ id: '123', name: 'John' });
    expect(result).toEqual({ id: '123', name: 'John' });
  });

  it('should omit specific fields', () => {
    const schema = SchemaBuilder.object()
      .field('id', z.string())
      .field('name', z.string())
      .field('password', z.string())
      .omit('password')
      .build();

    const result = schema.parse({ id: '123', name: 'John' });
    expect(result).toEqual({ id: '123', name: 'John' });
  });

  it('should build with strict mode', () => {
    const schema = SchemaBuilder.object().field('name', z.string()).buildStrict();

    expect(() => schema.parse({ name: 'John', extra: 'field' })).toThrow();
  });

  it('should support complex chaining', () => {
    const schema = SchemaBuilder.object()
      .field('id', z.string().uuid())
      .field('email', z.string().email())
      .optional('phone', z.string())
      .withDefault('status', z.enum(['active', 'inactive']), 'active')
      .build();

    const result = schema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
    });

    expect(result).toMatchObject({
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      status: 'active',
    });
  });
});

describe('QueryBuilder', () => {
  interface TestEntity {
    id: string;
    name: string;
    age: number;
    status: 'active' | 'inactive';
  }

  it('should create empty query', () => {
    const config = QueryBuilder.for<TestEntity>().build();

    expect(config.filters).toEqual([]);
    expect(config.sort).toEqual([]);
  });

  it('should add filter conditions', () => {
    const config = QueryBuilder.for<TestEntity>().where('status', 'eq', 'active').build();

    expect(config.filters).toEqual([{ field: 'status', operator: 'eq', value: 'active' }]);
  });

  it('should add multiple filters', () => {
    const config = QueryBuilder.for<TestEntity>()
      .where('status', 'eq', 'active')
      .where('age', 'gte', 18)
      .build();

    expect(config.filters).toHaveLength(2);
    expect(config.filters[0]).toEqual({ field: 'status', operator: 'eq', value: 'active' });
    expect(config.filters[1]).toEqual({ field: 'age', operator: 'gte', value: 18 });
  });

  it('should add equality filter with shorthand', () => {
    const config = QueryBuilder.for<TestEntity>().whereEq('status', 'active').build();

    expect(config.filters).toEqual([{ field: 'status', operator: 'eq', value: 'active' }]);
  });

  it('should add in filter', () => {
    const config = QueryBuilder.for<TestEntity>()
      .whereIn('status', ['active', 'inactive'])
      .build();

    expect(config.filters).toEqual([
      { field: 'status', operator: 'in', value: ['active', 'inactive'] },
    ]);
  });

  it('should add sort specification', () => {
    const config = QueryBuilder.for<TestEntity>().orderBy('name', 'asc').build();

    expect(config.sort).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('should default sort to ascending', () => {
    const config = QueryBuilder.for<TestEntity>().orderBy('name').build();

    expect(config.sort[0].direction).toBe('asc');
  });

  it('should add multiple sorts', () => {
    const config = QueryBuilder.for<TestEntity>()
      .orderBy('status', 'desc')
      .orderBy('name', 'asc')
      .build();

    expect(config.sort).toHaveLength(2);
  });

  it('should set limit', () => {
    const config = QueryBuilder.for<TestEntity>().limit(20).build();

    expect(config.limit).toBe(20);
  });

  it('should set offset', () => {
    const config = QueryBuilder.for<TestEntity>().offset(40).build();

    expect(config.offset).toBe(40);
  });

  it('should set cursor', () => {
    const config = QueryBuilder.for<TestEntity>().afterCursor('cursor-123').build();

    expect(config.cursor).toBe('cursor-123');
  });

  it('should select specific fields', () => {
    const config = QueryBuilder.for<TestEntity>().select('id', 'name').build();

    expect(config.select).toEqual(['id', 'name']);
  });

  it('should support complete fluent API', () => {
    const config = QueryBuilder.for<TestEntity>()
      .where('status', 'eq', 'active')
      .where('age', 'gte', 18)
      .orderBy('name', 'asc')
      .limit(20)
      .offset(40)
      .select('id', 'name', 'age')
      .build();

    expect(config).toMatchObject({
      filters: [
        { field: 'status', operator: 'eq', value: 'active' },
        { field: 'age', operator: 'gte', value: 18 },
      ],
      sort: [{ field: 'name', direction: 'asc' }],
      limit: 20,
      offset: 40,
      select: ['id', 'name', 'age'],
    });
  });

  it('should support pagination pattern', () => {
    const config = QueryBuilder.for<TestEntity>()
      .whereEq('status', 'active')
      .orderBy('name')
      .limit(20)
      .afterCursor('cursor-abc')
      .build();

    expect(config.limit).toBe(20);
    expect(config.cursor).toBe('cursor-abc');
  });
});
