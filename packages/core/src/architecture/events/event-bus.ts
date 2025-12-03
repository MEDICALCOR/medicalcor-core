/**
 * @module architecture/events/event-bus
 *
 * Event Bus Infrastructure
 * ========================
 *
 * Publish-subscribe messaging for domain events.
 */

import type { DomainEvent, EventMetadata } from '../layers/contracts.js';
import { createLogger, type Logger } from '../../logger.js';

const logger: Logger = createLogger({ name: 'event-bus' });

// ============================================================================
// EVENT BUS TYPES
// ============================================================================

/**
 * Event subscription
 */
export interface EventSubscription {
  readonly id: string;
  readonly eventType: string | '*';
  readonly handler: EventHandler;
  readonly options: SubscriptionOptions;
  unsubscribe(): void;
}

/**
 * Event handler function
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  readonly groupId?: string;
  readonly priority?: number;
  readonly filter?: EventFilter;
  readonly retry?: RetryOptions;
  readonly timeout?: number;
}

export interface EventFilter {
  readonly aggregateTypes?: string[];
  readonly aggregateIds?: string[];
  readonly metadata?: Record<string, unknown>;
}

export interface RetryOptions {
  readonly maxRetries: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
}

/**
 * Event bus interface
 */
export interface EventBus {
  /**
   * Publish an event
   */
  publish<T extends DomainEvent>(event: T): Promise<void>;

  /**
   * Publish multiple events
   */
  publishAll(events: DomainEvent[]): Promise<void>;

  /**
   * Subscribe to events
   */
  subscribe<T extends DomainEvent>(
    eventType: string | '*',
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): EventSubscription;

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscription: EventSubscription): void;

  /**
   * Get all subscriptions for an event type
   */
  getSubscriptions(eventType: string): EventSubscription[];
}

// ============================================================================
// IN-MEMORY EVENT BUS
// ============================================================================

/**
 * In-memory event bus implementation
 */
export class InMemoryEventBus implements EventBus {
  private subscriptions = new Map<string, EventSubscription[]>();
  private wildcardSubscriptions: EventSubscription[] = [];
  private middlewares: EventMiddleware[] = [];

  /**
   * Add middleware
   */
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    // Run middlewares
    let processedEvent = event;
    for (const middleware of this.middlewares) {
      const result = await middleware.before(processedEvent);
      if (result === null) {
        return; // Event was filtered out
      }
      processedEvent = result as T;
    }

    // Get handlers
    const typeSubscriptions = this.subscriptions.get(event.eventType) ?? [];
    const allSubscriptions = [...typeSubscriptions, ...this.wildcardSubscriptions];

    // Sort by priority
    allSubscriptions.sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));

    // Execute handlers
    const errors: Error[] = [];

    for (const subscription of allSubscriptions) {
      if (!this.matchesFilter(event, subscription.options.filter)) {
        continue;
      }

      try {
        await this.executeHandler(subscription, processedEvent);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Run after middlewares
    for (const middleware of this.middlewares) {
      await middleware.after(processedEvent, errors);
    }

    if (errors.length > 0) {
      // Log errors but don't throw - events should be fire-and-forget
      logger.error(
        { eventType: event.eventType, errorCount: errors.length },
        'Event had handler errors'
      );
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends DomainEvent>(
    eventType: string | '*',
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): EventSubscription {
    const subscription: EventSubscription = {
      id: crypto.randomUUID(),
      eventType,
      handler: handler as EventHandler,
      options,
      unsubscribe: () => this.unsubscribe(subscription),
    };

    if (eventType === '*') {
      this.wildcardSubscriptions.push(subscription);
    } else {
      const existing = this.subscriptions.get(eventType) ?? [];
      existing.push(subscription);
      this.subscriptions.set(eventType, existing);
    }

    return subscription;
  }

  unsubscribe(subscription: EventSubscription): void {
    if (subscription.eventType === '*') {
      this.wildcardSubscriptions = this.wildcardSubscriptions.filter(
        (s) => s.id !== subscription.id
      );
    } else {
      const existing = this.subscriptions.get(subscription.eventType) ?? [];
      this.subscriptions.set(
        subscription.eventType,
        existing.filter((s) => s.id !== subscription.id)
      );
    }
  }

  getSubscriptions(eventType: string): EventSubscription[] {
    return [...(this.subscriptions.get(eventType) ?? []), ...this.wildcardSubscriptions];
  }

  private matchesFilter(event: DomainEvent, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.aggregateTypes && !filter.aggregateTypes.includes(event.aggregateType)) {
      return false;
    }

    if (filter.aggregateIds && !filter.aggregateIds.includes(event.aggregateId)) {
      return false;
    }

    if (filter.metadata) {
      const metadataRecord = event.metadata as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (metadataRecord[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  private async executeHandler(subscription: EventSubscription, event: DomainEvent): Promise<void> {
    const retry = subscription.options.retry;
    let lastError: Error | undefined;

    const maxAttempts = retry ? retry.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const timeout = subscription.options.timeout ?? 30000;
        await Promise.race([
          subscription.handler(event),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Handler timeout')), timeout)
          ),
        ]);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts - 1 && retry) {
          const delay = Math.min(retry.backoffMs * Math.pow(2, attempt), retry.maxBackoffMs);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void {
    this.subscriptions.clear();
    this.wildcardSubscriptions = [];
  }
}

// ============================================================================
// EVENT MIDDLEWARE
// ============================================================================

/**
 * Event middleware interface
 */
export interface EventMiddleware {
  before(event: DomainEvent): Promise<DomainEvent | null>;
  after(event: DomainEvent, errors: Error[]): Promise<void>;
}

/**
 * Logging middleware
 */
export class LoggingEventMiddleware implements EventMiddleware {
  constructor(
    private logger: {
      debug(msg: string, data?: object): void;
      error(msg: string, data?: object): void;
    }
  ) {}

  async before(event: DomainEvent): Promise<DomainEvent> {
    this.logger.debug(`Publishing event: ${event.eventType}`, {
      eventId: event.eventId,
      aggregateId: event.aggregateId,
    });
    return event;
  }

  async after(event: DomainEvent, errors: Error[]): Promise<void> {
    if (errors.length > 0) {
      this.logger.error(`Event ${event.eventType} had errors`, {
        eventId: event.eventId,
        errorCount: errors.length,
        errors: errors.map((e) => e.message),
      });
    }
  }
}

/**
 * Metrics middleware
 */
export class MetricsEventMiddleware implements EventMiddleware {
  private publishedEvents = new Map<string, number>();
  private errors = new Map<string, number>();

  async before(event: DomainEvent): Promise<DomainEvent> {
    const count = this.publishedEvents.get(event.eventType) ?? 0;
    this.publishedEvents.set(event.eventType, count + 1);
    return event;
  }

  async after(event: DomainEvent, errors: Error[]): Promise<void> {
    if (errors.length > 0) {
      const count = this.errors.get(event.eventType) ?? 0;
      this.errors.set(event.eventType, count + errors.length);
    }
  }

  getMetrics(): { published: Map<string, number>; errors: Map<string, number> } {
    return {
      published: new Map(this.publishedEvents),
      errors: new Map(this.errors),
    };
  }
}

/**
 * Validation middleware
 */
export class ValidationEventMiddleware implements EventMiddleware {
  constructor(private validators: Map<string, (event: DomainEvent) => boolean>) {}

  async before(event: DomainEvent): Promise<DomainEvent | null> {
    const validator = this.validators.get(event.eventType);
    if (validator && !validator(event)) {
      logger.warn({ eventType: event.eventType }, 'Event failed validation');
      return null;
    }
    return event;
  }

  async after(): Promise<void> {
    // No-op
  }
}

// ============================================================================
// EVENT DISPATCHER
// ============================================================================

/**
 * Typed event dispatcher for type-safe event handling
 */
export class TypedEventDispatcher<TEvents extends Record<string, DomainEvent>> {
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /**
   * Publish a typed event
   */
  async publish<K extends keyof TEvents>(eventType: K, event: TEvents[K]): Promise<void> {
    await this.bus.publish(event);
  }

  /**
   * Subscribe to a typed event
   */
  subscribe<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>,
    options?: SubscriptionOptions
  ): EventSubscription {
    return this.bus.subscribe(eventType as string, handler as EventHandler, options);
  }
}

// Singleton event bus
export const eventBus = new InMemoryEventBus();
