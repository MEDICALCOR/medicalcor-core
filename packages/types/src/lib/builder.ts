/**
 * @fileoverview Type-Safe Builder Patterns with Fluent APIs
 *
 * Implements compile-time safe builder patterns that:
 * - Track required vs optional fields at the type level
 * - Prevent building incomplete objects
 * - Provide fluent chainable APIs
 * - Support step-by-step construction with inference
 *
 * @module @medicalcor/types/builder
 * @version 2.0.0
 */

/* eslint-disable @typescript-eslint/no-empty-object-type -- {} is intentional for generic type constraints in builder patterns */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- non-null assertions are safe in builder patterns where required fields are tracked at type level */
/* eslint-disable @typescript-eslint/no-dynamic-delete -- dynamic delete is necessary for removing keys from builder state */

import { z } from 'zod';
import type { LeadId, TraceId, E164PhoneNumber, EmailAddress } from './primitives.js';
import { createLeadId, createTraceId } from './primitives.js';

// =============================================================================
// GENERIC TYPE-SAFE BUILDER
// =============================================================================

/**
 * Generic builder that tracks field completion at the type level
 * Only allows build() when all required fields are set
 *
 * @example
 * type Person = { name: string; age: number; email?: string };
 *
 * const personBuilder = createBuilder<Person>()
 *   .require('name', 'age')
 *   .optional('email');
 *
 * // Type error: 'age' is not set
 * personBuilder.set('name', 'John').build();
 *
 * // Works!
 * personBuilder.set('name', 'John').set('age', 30).build();
 */
export class TypeSafeBuilder<TFinal, TCurrent extends Partial<TFinal> = {}> {
  private data: TCurrent;

  constructor(data: TCurrent = {} as TCurrent) {
    this.data = data;
  }

  /**
   * Sets a field value
   */
  set<K extends keyof TFinal>(
    key: K,
    value: TFinal[K]
  ): TypeSafeBuilder<TFinal, TCurrent & Pick<TFinal, K>> {
    return new TypeSafeBuilder({ ...this.data, [key]: value } as TCurrent & Pick<TFinal, K>);
  }

  /**
   * Sets multiple fields at once
   */
  setMany<TFields extends Partial<TFinal>>(
    fields: TFields
  ): TypeSafeBuilder<TFinal, TCurrent & TFields> {
    return new TypeSafeBuilder({ ...this.data, ...fields });
  }

  /**
   * Builds the final object
   */
  build(): TFinal {
    return this.data as unknown as TFinal;
  }

  /**
   * Gets current data for inspection
   */
  getData(): TCurrent {
    return { ...this.data };
  }
}

/**
 * Creates a new type-safe builder
 */
export function createBuilder<T>(): TypeSafeBuilder<T> {
  return new TypeSafeBuilder<T, {}>();
}

// =============================================================================
// LEAD BUILDER - Domain-Specific Builder
// =============================================================================

/**
 * Lead creation data structure
 */
export interface LeadData {
  id: LeadId;
  phone: E164PhoneNumber;
  email?: EmailAddress;
  firstName?: string;
  lastName?: string;
  source:
    | 'whatsapp'
    | 'voice'
    | 'web_form'
    | 'hubspot'
    | 'facebook'
    | 'google'
    | 'referral'
    | 'manual';
  status: 'new' | 'contacted' | 'qualified' | 'nurturing' | 'scheduled' | 'converted' | 'lost';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  clinicId?: string;
  hubspotContactId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lead builder state - tracks which fields have been set at the type level
 */
interface LeadBuilderState {
  hasPhone: boolean;
  hasSource: boolean;
  hasStatus: boolean;
}

/**
 * Type-safe Lead builder with step-by-step construction
 * Ensures required fields are set before building
 *
 * @example
 * const lead = LeadBuilder.create()
 *   .withPhone('+40712345678')
 *   .fromSource('whatsapp')
 *   .withStatus('new')
 *   .withName('John', 'Doe')
 *   .build();
 */
export class LeadBuilder<
  TState extends LeadBuilderState = { hasPhone: false; hasSource: false; hasStatus: false },
> {
  private data: Partial<LeadData>;

  private constructor(data: Partial<LeadData> = {}) {
    this.data = data;
  }

  /**
   * Creates a new Lead builder
   */
  static create(): LeadBuilder<{ hasPhone: false; hasSource: false; hasStatus: false }> {
    const now = new Date();
    return new LeadBuilder({
      id: createLeadId(crypto.randomUUID()),
      status: 'new',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Creates a builder from existing data (for updates)
   */
  static from(data: LeadData): LeadBuilder<{ hasPhone: true; hasSource: true; hasStatus: true }> {
    return new LeadBuilder(data);
  }

  /**
   * Sets the phone number (required)
   */
  withPhone(phone: E164PhoneNumber | string): LeadBuilder<TState & { hasPhone: true }> {
    return new LeadBuilder({
      ...this.data,
      phone: phone as E164PhoneNumber,
    });
  }

  /**
   * Sets the lead source (required)
   */
  fromSource(source: LeadData['source']): LeadBuilder<TState & { hasSource: true }> {
    return new LeadBuilder({
      ...this.data,
      source,
    });
  }

  /**
   * Sets the lead status
   */
  withStatus(status: LeadData['status']): LeadBuilder<TState & { hasStatus: true }> {
    return new LeadBuilder({
      ...this.data,
      status,
      updatedAt: new Date(),
    });
  }

  /**
   * Sets the lead priority
   */
  withPriority(priority: NonNullable<LeadData['priority']>): LeadBuilder<TState> {
    return new LeadBuilder({
      ...this.data,
      priority,
    });
  }

  /**
   * Sets the patient name
   */
  withName(firstName: string, lastName?: string): LeadBuilder<TState> {
    const newData: Partial<LeadData> = { ...this.data, firstName };
    if (lastName !== undefined) newData.lastName = lastName;
    return new LeadBuilder(newData);
  }

  /**
   * Sets the email address
   */
  withEmail(email: EmailAddress | string): LeadBuilder<TState> {
    return new LeadBuilder({
      ...this.data,
      email: email as EmailAddress,
    });
  }

  /**
   * Sets the HubSpot contact ID
   */
  withHubSpotId(hubspotContactId: string): LeadBuilder<TState> {
    return new LeadBuilder({
      ...this.data,
      hubspotContactId,
    });
  }

  /**
   * Sets the clinic ID (multi-tenancy)
   */
  forClinic(clinicId: string): LeadBuilder<TState> {
    return new LeadBuilder({
      ...this.data,
      clinicId,
    });
  }

  /**
   * Sets custom metadata
   */
  withMetadata(metadata: Record<string, string | number | boolean | null>): LeadBuilder<TState> {
    return new LeadBuilder({
      ...this.data,
      metadata: { ...this.data.metadata, ...metadata },
    });
  }

  /**
   * Sets specific ID (for testing or imports)
   */
  withId(id: LeadId | string): LeadBuilder<TState> {
    return new LeadBuilder({
      ...this.data,
      id: id as LeadId,
    });
  }

  /**
   * Builds the Lead (only available when all required fields are set)
   */
  build(this: LeadBuilder<{ hasPhone: true; hasSource: true; hasStatus: true }>): LeadData {
    const data = this.data as LeadData;
    return {
      ...data,
      updatedAt: new Date(),
    };
  }

  /**
   * Validates and builds the Lead
   * @throws Error if required fields are missing
   */
  tryBuild(): LeadData {
    if (!this.data.phone) throw new Error('Phone is required');
    if (!this.data.source) throw new Error('Source is required');
    if (!this.data.status) throw new Error('Status is required');
    return this.data as LeadData;
  }
}

// =============================================================================
// EVENT BUILDER - Type-Safe Domain Event Construction
// =============================================================================

/**
 * Base event data
 */
export interface EventData<TType extends string, TPayload> {
  id: string;
  type: TType;
  timestamp: string;
  correlationId: TraceId;
  idempotencyKey: string;
  version: number;
  payload: TPayload;
}

/**
 * Type-safe event builder
 *
 * @example
 * const event = EventBuilder.create('lead.created')
 *   .withPayload({ phone: '+40123456789', channel: 'whatsapp' })
 *   .withCorrelationId(traceId)
 *   .build();
 */
export class EventBuilder<
  TType extends string,
  TPayload = undefined,
  TState extends { hasPayload: boolean } = { hasPayload: false },
> {
  private data: Partial<EventData<TType, TPayload>>;

  private constructor(type: TType, data: Partial<EventData<TType, TPayload>> = {}) {
    this.data = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      correlationId: createTraceId(),
      idempotencyKey: crypto.randomUUID(),
      version: 1,
      ...data,
    };
  }

  /**
   * Creates a new event builder
   */
  static create<T extends string>(type: T): EventBuilder<T, undefined, { hasPayload: false }> {
    return new EventBuilder(type);
  }

  /**
   * Sets the event payload
   */
  withPayload<P>(payload: P): EventBuilder<TType, P, { hasPayload: true }> {
    return new EventBuilder(this.data.type!, {
      ...this.data,
      payload,
    } as Partial<EventData<TType, P>>);
  }

  /**
   * Sets the correlation ID for distributed tracing
   */
  withCorrelationId(correlationId: TraceId | string): EventBuilder<TType, TPayload, TState> {
    return new EventBuilder(this.data.type!, {
      ...this.data,
      correlationId: correlationId as TraceId,
    });
  }

  /**
   * Sets the idempotency key
   */
  withIdempotencyKey(key: string): EventBuilder<TType, TPayload, TState> {
    return new EventBuilder(this.data.type!, {
      ...this.data,
      idempotencyKey: key,
    });
  }

  /**
   * Sets the event version
   */
  withVersion(version: number): EventBuilder<TType, TPayload, TState> {
    return new EventBuilder(this.data.type!, {
      ...this.data,
      version,
    });
  }

  /**
   * Sets a specific timestamp
   */
  at(timestamp: Date | string): EventBuilder<TType, TPayload, TState> {
    return new EventBuilder(this.data.type!, {
      ...this.data,
      timestamp: typeof timestamp === 'string' ? timestamp : timestamp.toISOString(),
    });
  }

  /**
   * Builds the event (requires payload)
   */
  build(this: EventBuilder<TType, TPayload, { hasPayload: true }>): EventData<TType, TPayload> {
    return this.data as EventData<TType, TPayload>;
  }
}

// =============================================================================
// API REQUEST BUILDER
// =============================================================================

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * API request configuration
 */
export interface ApiRequestConfig<TBody = unknown> {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: TBody;
  timeout?: number;
  retries?: number;
}

/**
 * Type-safe API request builder
 *
 * @example
 * const request = ApiRequestBuilder.post('/api/v1/leads')
 *   .withAuth(token)
 *   .withBody({ phone: '+40123456789' })
 *   .withTimeout(5000)
 *   .build();
 */
export class ApiRequestBuilder<
  TMethod extends HttpMethod = 'GET',
  TBody = undefined,
  TState extends { hasAuth: boolean } = { hasAuth: false },
> {
  private config: Partial<ApiRequestConfig<TBody>>;

  private constructor(
    method: TMethod,
    path: string,
    config: Partial<ApiRequestConfig<TBody>> = {}
  ) {
    this.config = {
      method,
      path,
      headers: {},
      ...config,
    };
  }

  /**
   * Creates a GET request builder
   */
  static get(path: string): ApiRequestBuilder<'GET', undefined, { hasAuth: false }> {
    return new ApiRequestBuilder('GET', path);
  }

  /**
   * Creates a POST request builder
   */
  static post(path: string): ApiRequestBuilder<'POST', undefined, { hasAuth: false }> {
    return new ApiRequestBuilder('POST', path);
  }

  /**
   * Creates a PUT request builder
   */
  static put(path: string): ApiRequestBuilder<'PUT', undefined, { hasAuth: false }> {
    return new ApiRequestBuilder('PUT', path);
  }

  /**
   * Creates a PATCH request builder
   */
  static patch(path: string): ApiRequestBuilder<'PATCH', undefined, { hasAuth: false }> {
    return new ApiRequestBuilder('PATCH', path);
  }

  /**
   * Creates a DELETE request builder
   */
  static delete(path: string): ApiRequestBuilder<'DELETE', undefined, { hasAuth: false }> {
    return new ApiRequestBuilder('DELETE', path);
  }

  /**
   * Adds authentication header
   */
  withAuth(
    token: string,
    type: 'Bearer' | 'Basic' = 'Bearer'
  ): ApiRequestBuilder<TMethod, TBody, { hasAuth: true }> {
    return new ApiRequestBuilder(this.config.method as TMethod, this.config.path!, {
      ...this.config,
      headers: {
        ...this.config.headers,
        Authorization: `${type} ${token}`,
      },
    });
  }

  /**
   * Adds a header
   */
  withHeader(key: string, value: string): ApiRequestBuilder<TMethod, TBody, TState> {
    return new ApiRequestBuilder(this.config.method as TMethod, this.config.path!, {
      ...this.config,
      headers: {
        ...this.config.headers,
        [key]: value,
      },
    });
  }

  /**
   * Sets the request body
   */
  withBody<B>(body: B): ApiRequestBuilder<TMethod, B, TState> {
    return new ApiRequestBuilder(this.config.method as TMethod, this.config.path!, {
      ...this.config,
      body,
      headers: {
        ...this.config.headers,
        'Content-Type': 'application/json',
      },
    } as Partial<ApiRequestConfig<B>>);
  }

  /**
   * Adds query parameters
   */
  withQuery(
    query: Record<string, string | number | boolean>
  ): ApiRequestBuilder<TMethod, TBody, TState> {
    return new ApiRequestBuilder(this.config.method as TMethod, this.config.path!, {
      ...this.config,
      query: { ...this.config.query, ...query },
    });
  }

  /**
   * Sets the timeout
   */
  withTimeout(ms: number): ApiRequestBuilder<TMethod, TBody, TState> {
    return new ApiRequestBuilder(this.config.method as TMethod, this.config.path!, {
      ...this.config,
      timeout: ms,
    });
  }

  /**
   * Sets retry count
   */
  withRetries(count: number): ApiRequestBuilder<TMethod, TBody, TState> {
    return new ApiRequestBuilder(this.config.method as TMethod, this.config.path!, {
      ...this.config,
      retries: count,
    });
  }

  /**
   * Adds correlation ID for tracing
   */
  withTraceId(traceId: TraceId | string): ApiRequestBuilder<TMethod, TBody, TState> {
    return this.withHeader('X-Correlation-Id', traceId as string);
  }

  /**
   * Builds the request configuration
   */
  build(): ApiRequestConfig<TBody> {
    return this.config as ApiRequestConfig<TBody>;
  }
}

// =============================================================================
// ZOD SCHEMA BUILDER - Type-Safe Schema Construction
// =============================================================================

/**
 * Schema builder for creating complex Zod schemas with fluent API
 *
 * @example
 * const schema = SchemaBuilder.object()
 *   .field('name', z.string())
 *   .field('email', z.string().email())
 *   .optional('phone', z.string())
 *   .build();
 */
export class SchemaBuilder<T extends z.ZodRawShape = {}> {
  private shape: T;

  private constructor(shape: T = {} as T) {
    this.shape = shape;
  }

  /**
   * Creates a new object schema builder
   */
  static object(): SchemaBuilder {
    return new SchemaBuilder({});
  }

  /**
   * Adds a required field
   */
  field<K extends string, S extends z.ZodTypeAny>(
    key: K,
    schema: S
  ): SchemaBuilder<T & Record<K, S>> {
    return new SchemaBuilder({
      ...this.shape,
      [key]: schema,
    } as T & Record<K, S>);
  }

  /**
   * Adds an optional field
   */
  optional<K extends string, S extends z.ZodTypeAny>(
    key: K,
    schema: S
  ): SchemaBuilder<T & Record<K, z.ZodOptional<S>>> {
    return new SchemaBuilder({
      ...this.shape,
      [key]: schema.optional(),
    } as T & Record<K, z.ZodOptional<S>>);
  }

  /**
   * Adds a nullable field
   */
  nullable<K extends string, S extends z.ZodTypeAny>(
    key: K,
    schema: S
  ): SchemaBuilder<T & Record<K, z.ZodNullable<S>>> {
    return new SchemaBuilder({
      ...this.shape,
      [key]: schema.nullable(),
    } as T & Record<K, z.ZodNullable<S>>);
  }

  /**
   * Adds a field with default value
   */
  withDefault<K extends string, S extends z.ZodTypeAny>(
    key: K,
    schema: S,
    defaultValue: z.infer<S>
  ): SchemaBuilder<T & Record<K, z.ZodDefault<S>>> {
    return new SchemaBuilder({
      ...this.shape,
      [key]: schema.default(defaultValue),
    } as T & Record<K, z.ZodDefault<S>>);
  }

  /**
   * Merges another shape
   */
  merge<U extends z.ZodRawShape>(other: U): SchemaBuilder<T & U> {
    return new SchemaBuilder({
      ...this.shape,
      ...other,
    });
  }

  /**
   * Picks specific fields
   */
  pick<K extends keyof T>(...keys: K[]): SchemaBuilder<Pick<T, K>> {
    const picked = {} as Pick<T, K>;
    for (const key of keys) {
      picked[key] = this.shape[key];
    }
    return new SchemaBuilder(picked);
  }

  /**
   * Omits specific fields
   */
  omit<K extends keyof T>(...keys: K[]): SchemaBuilder<Omit<T, K>> {
    const result = { ...this.shape } as Omit<T, K>;
    for (const key of keys) {
      delete (result as Record<string, unknown>)[key as string];
    }
    return new SchemaBuilder(result);
  }

  /**
   * Builds the Zod schema
   */
  build(): z.ZodObject<T> {
    return z.object(this.shape);
  }

  /**
   * Builds with strict mode (no extra keys allowed)
   */
  buildStrict(): z.ZodObject<T, 'strict'> {
    return z.object(this.shape).strict();
  }
}

// =============================================================================
// QUERY BUILDER - Type-Safe Database Query Construction
// =============================================================================

/**
 * Filter operators
 */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains'
  | 'startsWith';

/**
 * Filter condition
 */
export interface FilterCondition<T, K extends keyof T = keyof T> {
  field: K;
  operator: FilterOperator;
  value: T[K] | T[K][];
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
export interface SortSpec<T> {
  field: keyof T;
  direction: SortDirection;
}

/**
 * Query configuration
 */
export interface QueryConfig<T> {
  filters: FilterCondition<T>[];
  sort: SortSpec<T>[];
  limit?: number;
  offset?: number;
  cursor?: string;
  select?: (keyof T)[];
}

/**
 * Type-safe query builder
 *
 * @example
 * const query = QueryBuilder.for<Lead>()
 *   .where('status', 'eq', 'new')
 *   .where('score', 'gte', 3)
 *   .orderBy('createdAt', 'desc')
 *   .limit(20)
 *   .build();
 */
export class QueryBuilder<T> {
  private config: QueryConfig<T>;

  private constructor(config: Partial<QueryConfig<T>> = {}) {
    this.config = {
      filters: [],
      sort: [],
      ...config,
    };
  }

  /**
   * Creates a new query builder for a type
   */
  static for<T>(): QueryBuilder<T> {
    return new QueryBuilder<T>();
  }

  /**
   * Adds a filter condition
   */
  where<K extends keyof T>(
    field: K,
    operator: FilterOperator,
    value: T[K] | T[K][]
  ): QueryBuilder<T> {
    return new QueryBuilder({
      ...this.config,
      filters: [...this.config.filters, { field, operator, value }],
    });
  }

  /**
   * Adds an equality filter (shorthand)
   */
  whereEq<K extends keyof T>(field: K, value: T[K]): QueryBuilder<T> {
    return this.where(field, 'eq', value);
  }

  /**
   * Adds an 'in' filter
   */
  whereIn<K extends keyof T>(field: K, values: T[K][]): QueryBuilder<T> {
    return this.where(field, 'in', values);
  }

  /**
   * Adds a sort specification
   */
  orderBy(field: keyof T, direction: SortDirection = 'asc'): QueryBuilder<T> {
    return new QueryBuilder({
      ...this.config,
      sort: [...this.config.sort, { field, direction }],
    });
  }

  /**
   * Sets the limit
   */
  limit(count: number): QueryBuilder<T> {
    return new QueryBuilder({
      ...this.config,
      limit: count,
    });
  }

  /**
   * Sets the offset
   */
  offset(count: number): QueryBuilder<T> {
    return new QueryBuilder({
      ...this.config,
      offset: count,
    });
  }

  /**
   * Sets a cursor for pagination
   */
  afterCursor(cursor: string): QueryBuilder<T> {
    return new QueryBuilder({
      ...this.config,
      cursor,
    });
  }

  /**
   * Selects specific fields
   */
  select(...fields: (keyof T)[]): QueryBuilder<T> {
    return new QueryBuilder({
      ...this.config,
      select: fields,
    });
  }

  /**
   * Builds the query configuration
   */
  build(): QueryConfig<T> {
    return { ...this.config };
  }
}
