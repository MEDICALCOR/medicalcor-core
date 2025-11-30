/**
 * @module architecture/security/audit
 *
 * Audit Logging Infrastructure
 * ============================
 *
 * Complete audit trail for compliance and security.
 */

import type { Identity } from './authentication.js';

// ============================================================================
// AUDIT EVENT TYPES
// ============================================================================

/**
 * Audit event
 */
export interface AuditEvent {
  readonly eventId: string;
  readonly timestamp: string;
  readonly eventType: AuditEventType;
  readonly category: AuditCategory;
  readonly severity: AuditSeverity;
  readonly actor: AuditActor;
  readonly resource: AuditResource;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly details: Record<string, unknown>;
  readonly changes?: AuditChange[];
  readonly context: AuditContext;
}

export type AuditEventType =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'data_deletion'
  | 'configuration_change'
  | 'security_event'
  | 'system_event'
  | 'admin_action';

export type AuditCategory = 'security' | 'compliance' | 'operational' | 'data' | 'access';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AuditOutcome = 'success' | 'failure' | 'partial' | 'unknown';

/**
 * Who performed the action
 */
export interface AuditActor {
  readonly id: string;
  readonly type: 'user' | 'service' | 'system' | 'anonymous';
  readonly name?: string;
  readonly email?: string;
  readonly roles?: string[];
  readonly tenantId?: string;
  readonly sessionId?: string;
}

/**
 * What was affected
 */
export interface AuditResource {
  readonly type: string;
  readonly id?: string;
  readonly name?: string;
  readonly path?: string;
  readonly tenantId?: string;
}

/**
 * What changed
 */
export interface AuditChange {
  readonly field: string;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly sensitive?: boolean;
}

/**
 * Context of the action
 */
export interface AuditContext {
  readonly correlationId: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly location?: {
    readonly country?: string;
    readonly region?: string;
    readonly city?: string;
  };
  readonly source?: string;
}

// ============================================================================
// AUDIT SERVICE
// ============================================================================

/**
 * Audit service interface
 */
export interface AuditService {
  /**
   * Log an audit event
   */
  log(event: AuditEvent): Promise<void>;

  /**
   * Log multiple events
   */
  logBatch(events: AuditEvent[]): Promise<void>;

  /**
   * Query audit events
   */
  query(criteria: AuditQueryCriteria): Promise<AuditQueryResult>;

  /**
   * Get audit trail for a resource
   */
  getResourceAuditTrail(resourceType: string, resourceId: string): Promise<AuditEvent[]>;

  /**
   * Get audit trail for a user
   */
  getUserAuditTrail(
    userId: string,
    options?: { fromDate?: Date; toDate?: Date }
  ): Promise<AuditEvent[]>;
}

export interface AuditQueryCriteria {
  readonly eventTypes?: AuditEventType[];
  readonly categories?: AuditCategory[];
  readonly severities?: AuditSeverity[];
  readonly outcomes?: AuditOutcome[];
  readonly actorId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly correlationId?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: 'timestamp' | 'severity';
  readonly orderDirection?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  readonly events: AuditEvent[];
  readonly total: number;
  readonly hasMore: boolean;
}

// ============================================================================
// AUDIT EVENT BUILDER
// ============================================================================

/**
 * Builder for creating audit events
 */
export class AuditEventBuilder {
  private event: Partial<AuditEvent> = {};

  /**
   * Set the event type
   */
  type(type: AuditEventType): this {
    this.event.eventType = type;
    return this;
  }

  /**
   * Set the category
   */
  category(category: AuditCategory): this {
    this.event.category = category;
    return this;
  }

  /**
   * Set the severity
   */
  severity(severity: AuditSeverity): this {
    this.event.severity = severity;
    return this;
  }

  /**
   * Set the actor from identity
   */
  actor(identity: Identity | null): this {
    if (identity) {
      this.event.actor = {
        id: identity.id,
        type:
          identity.type === 'anonymous'
            ? 'anonymous'
            : identity.type === 'service'
              ? 'service'
              : 'user',
        name: identity.name,
        email: identity.email,
        roles: identity.roles,
        tenantId: identity.tenantId,
      };
    } else {
      this.event.actor = {
        id: 'anonymous',
        type: 'anonymous',
      };
    }
    return this;
  }

  /**
   * Set the actor directly
   */
  actorRaw(actor: AuditActor): this {
    this.event.actor = actor;
    return this;
  }

  /**
   * Set the resource
   */
  resource(type: string, id?: string, name?: string): this {
    this.event.resource = { type, id, name };
    return this;
  }

  /**
   * Set the action
   */
  action(action: string): this {
    this.event.action = action;
    return this;
  }

  /**
   * Set the outcome
   */
  outcome(outcome: AuditOutcome): this {
    this.event.outcome = outcome;
    return this;
  }

  /**
   * Add details
   */
  details(details: Record<string, unknown>): this {
    this.event.details = { ...this.event.details, ...details };
    return this;
  }

  /**
   * Add changes
   */
  changes(changes: AuditChange[]): this {
    this.event.changes = changes;
    return this;
  }

  /**
   * Set context
   */
  context(context: Partial<AuditContext>): this {
    this.event.context = {
      correlationId: context.correlationId ?? crypto.randomUUID(),
      ...context,
    };
    return this;
  }

  /**
   * Build the audit event
   */
  build(): AuditEvent {
    if (!this.event.eventType) throw new Error('Event type is required');
    if (!this.event.actor) throw new Error('Actor is required');
    if (!this.event.resource) throw new Error('Resource is required');
    if (!this.event.action) throw new Error('Action is required');

    return {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: this.event.eventType,
      category: this.event.category ?? 'operational',
      severity: this.event.severity ?? 'low',
      actor: this.event.actor,
      resource: this.event.resource,
      action: this.event.action,
      outcome: this.event.outcome ?? 'success',
      details: this.event.details ?? {},
      changes: this.event.changes,
      context: this.event.context ?? { correlationId: crypto.randomUUID() },
    };
  }
}

/**
 * Create an audit event builder
 */
export function auditEvent(): AuditEventBuilder {
  return new AuditEventBuilder();
}

// ============================================================================
// AUDIT DECORATORS
// ============================================================================

/**
 * Decorator to audit method calls
 */
export function Audited(
  eventType: AuditEventType,
  options: {
    resourceType: string;
    action: string;
    severity?: AuditSeverity;
  }
) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (
      this: { auditService?: AuditService; getIdentity?: () => Identity | null },
      ...args: unknown[]
    ) {
      const startTime = Date.now();
      const identity = this.getIdentity?.() ?? null;

      try {
        const result = await original.apply(this, args);

        // Log success
        if (this.auditService) {
          const event = auditEvent()
            .type(eventType)
            .severity(options.severity ?? 'low')
            .actor(identity)
            .resource(options.resourceType)
            .action(options.action)
            .outcome('success')
            .details({ durationMs: Date.now() - startTime })
            .context({ correlationId: crypto.randomUUID() })
            .build();

          await this.auditService.log(event);
        }

        return result;
      } catch (error) {
        // Log failure
        if (this.auditService) {
          const event = auditEvent()
            .type(eventType)
            .severity('high')
            .actor(identity)
            .resource(options.resourceType)
            .action(options.action)
            .outcome('failure')
            .details({
              durationMs: Date.now() - startTime,
              error: error instanceof Error ? error.message : String(error),
            })
            .context({ correlationId: crypto.randomUUID() })
            .build();

          await this.auditService.log(event);
        }

        throw error;
      }
    };

    return descriptor;
  };
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Detect changes between two objects
 */
export function detectChanges<T extends object>(
  oldValue: T | null,
  newValue: T | null,
  sensitiveFields: string[] = []
): AuditChange[] {
  const changes: AuditChange[] = [];

  if (!oldValue && !newValue) return changes;

  if (!oldValue) {
    // New record - all fields are new
    if (newValue) {
      for (const [key, value] of Object.entries(newValue)) {
        changes.push({
          field: key,
          oldValue: undefined,
          newValue: sensitiveFields.includes(key) ? '[REDACTED]' : value,
          sensitive: sensitiveFields.includes(key),
        });
      }
    }
    return changes;
  }

  if (!newValue) {
    // Deleted record
    for (const [key, value] of Object.entries(oldValue)) {
      changes.push({
        field: key,
        oldValue: sensitiveFields.includes(key) ? '[REDACTED]' : value,
        newValue: undefined,
        sensitive: sensitiveFields.includes(key),
      });
    }
    return changes;
  }

  // Compare fields
  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  for (const key of allKeys) {
    const oldVal = (oldValue as Record<string, unknown>)[key];
    const newVal = (newValue as Record<string, unknown>)[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        oldValue: sensitiveFields.includes(key) ? '[REDACTED]' : oldVal,
        newValue: sensitiveFields.includes(key) ? '[REDACTED]' : newVal,
        sensitive: sensitiveFields.includes(key),
      });
    }
  }

  return changes;
}

// ============================================================================
// IN-MEMORY AUDIT STORE (for testing)
// ============================================================================

/**
 * In-memory audit store implementation
 */
export class InMemoryAuditStore implements AuditService {
  private events: AuditEvent[] = [];

  async log(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async logBatch(events: AuditEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async query(criteria: AuditQueryCriteria): Promise<AuditQueryResult> {
    let filtered = [...this.events];

    if (criteria.eventTypes?.length) {
      filtered = filtered.filter((e) => criteria.eventTypes!.includes(e.eventType));
    }

    if (criteria.actorId) {
      filtered = filtered.filter((e) => e.actor.id === criteria.actorId);
    }

    if (criteria.resourceType) {
      filtered = filtered.filter((e) => e.resource.type === criteria.resourceType);
    }

    if (criteria.resourceId) {
      filtered = filtered.filter((e) => e.resource.id === criteria.resourceId);
    }

    const total = filtered.length;
    const offset = criteria.offset ?? 0;
    const limit = criteria.limit ?? 100;

    filtered = filtered.slice(offset, offset + limit);

    return {
      events: filtered,
      total,
      hasMore: offset + filtered.length < total,
    };
  }

  async getResourceAuditTrail(resourceType: string, resourceId: string): Promise<AuditEvent[]> {
    return this.events.filter(
      (e) => e.resource.type === resourceType && e.resource.id === resourceId
    );
  }

  async getUserAuditTrail(userId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.actor.id === userId);
  }

  // For testing
  clear(): void {
    this.events = [];
  }

  getAll(): AuditEvent[] {
    return [...this.events];
  }
}
