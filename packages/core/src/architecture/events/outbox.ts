/**
 * @module architecture/events/outbox
 *
 * Outbox Pattern
 * ==============
 *
 * Reliable event publishing with transactional guarantees.
 */

import type { DomainEvent } from '../layers/contracts.js';
import { createLogger, type Logger } from '../../logger.js';

const logger: Logger = createLogger({ name: 'outbox' });

// ============================================================================
// OUTBOX TYPES
// ============================================================================

/**
 * Outbox message
 */
export interface OutboxMessage {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly payload: unknown;
  readonly metadata: OutboxMetadata;
  readonly status: OutboxStatus;
  readonly createdAt: Date;
  readonly processedAt?: Date;
  readonly retryCount: number;
  readonly lastError?: string;
}

export interface OutboxMetadata {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly timestamp: string;
}

export type OutboxStatus = 'pending' | 'processing' | 'published' | 'failed' | 'dead_letter';

/**
 * Outbox store interface
 */
export interface OutboxStore {
  /**
   * Add a message to the outbox
   */
  add(
    message: Omit<OutboxMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>
  ): Promise<OutboxMessage>;

  /**
   * Add multiple messages
   */
  addBatch(
    messages: Omit<OutboxMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>[]
  ): Promise<OutboxMessage[]>;

  /**
   * Get pending messages
   */
  getPending(batchSize: number): Promise<OutboxMessage[]>;

  /**
   * Mark message as processing
   */
  markAsProcessing(id: string): Promise<void>;

  /**
   * Mark message as published
   */
  markAsPublished(id: string): Promise<void>;

  /**
   * Mark message as failed
   */
  markAsFailed(id: string, error: string): Promise<void>;

  /**
   * Move to dead letter
   */
  moveToDeadLetter(id: string, error: string): Promise<void>;

  /**
   * Get failed messages
   */
  getFailed(limit: number): Promise<OutboxMessage[]>;

  /**
   * Get dead letter messages
   */
  getDeadLetter(limit: number): Promise<OutboxMessage[]>;

  /**
   * Retry a failed message
   */
  retry(id: string): Promise<void>;
}

// ============================================================================
// IN-MEMORY OUTBOX STORE
// ============================================================================

/**
 * In-memory outbox store implementation
 */
export class InMemoryOutboxStore implements OutboxStore {
  private messages = new Map<string, OutboxMessage>();

  async add(
    message: Omit<OutboxMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>
  ): Promise<OutboxMessage> {
    const outboxMessage: OutboxMessage = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      retryCount: 0,
      status: 'pending',
    };

    this.messages.set(outboxMessage.id, outboxMessage);
    return outboxMessage;
  }

  async addBatch(
    messages: Omit<OutboxMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>[]
  ): Promise<OutboxMessage[]> {
    return Promise.all(messages.map((m) => this.add(m)));
  }

  async getPending(batchSize: number): Promise<OutboxMessage[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, batchSize);
  }

  async markAsProcessing(id: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      this.messages.set(id, { ...message, status: 'processing' });
    }
  }

  async markAsPublished(id: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      this.messages.set(id, {
        ...message,
        status: 'published',
        processedAt: new Date(),
      });
    }
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      this.messages.set(id, {
        ...message,
        status: 'failed',
        retryCount: message.retryCount + 1,
        lastError: error,
      });
    }
  }

  async moveToDeadLetter(id: string, error: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      this.messages.set(id, {
        ...message,
        status: 'dead_letter',
        lastError: error,
      });
    }
  }

  async getFailed(limit: number): Promise<OutboxMessage[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.status === 'failed')
      .slice(0, limit);
  }

  async getDeadLetter(limit: number): Promise<OutboxMessage[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.status === 'dead_letter')
      .slice(0, limit);
  }

  async retry(id: string): Promise<void> {
    const message = this.messages.get(id);
    if (message && (message.status === 'failed' || message.status === 'dead_letter')) {
      this.messages.set(id, { ...message, status: 'pending' });
    }
  }

  /**
   * Clear all messages (for testing)
   */
  clear(): void {
    this.messages.clear();
  }

  /**
   * Get all messages (for testing)
   */
  getAll(): OutboxMessage[] {
    return Array.from(this.messages.values());
  }
}

// ============================================================================
// OUTBOX PROCESSOR
// ============================================================================

/**
 * Outbox processor - publishes messages from the outbox
 */
export class OutboxProcessor {
  private running = false;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    private store: OutboxStore,
    private publisher: OutboxPublisher,
    private options: OutboxProcessorOptions = {}
  ) {}

  /**
   * Start processing
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    const intervalMs = this.options.pollIntervalMs ?? 1000;

    this.intervalId = setInterval(() => {
      this.processMessages().catch((error) => {
        logger.error({ error }, 'Outbox processing error');
      });
    }, intervalMs);
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Process a batch of messages
   */
  async processMessages(): Promise<number> {
    const batchSize = this.options.batchSize ?? 100;
    const maxRetries = this.options.maxRetries ?? 3;
    const messages = await this.store.getPending(batchSize);

    let processed = 0;

    for (const message of messages) {
      try {
        await this.store.markAsProcessing(message.id);
        await this.publisher.publish(message);
        await this.store.markAsPublished(message.id);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (message.retryCount >= maxRetries) {
          await this.store.moveToDeadLetter(message.id, errorMessage);
        } else {
          await this.store.markAsFailed(message.id, errorMessage);
        }
      }
    }

    return processed;
  }
}

export interface OutboxProcessorOptions {
  readonly pollIntervalMs?: number;
  readonly batchSize?: number;
  readonly maxRetries?: number;
}

/**
 * Outbox publisher interface
 */
export interface OutboxPublisher {
  publish(message: OutboxMessage): Promise<void>;
}

// ============================================================================
// OUTBOX UNIT OF WORK
// ============================================================================

/**
 * Unit of work with outbox support
 */
export class OutboxUnitOfWork {
  private pendingMessages: Omit<OutboxMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>[] = [];
  private committed = false;

  constructor(private store: OutboxStore) {}

  /**
   * Add a domain event to the outbox (will be saved on commit)
   */
  addEvent(event: DomainEvent): void {
    this.pendingMessages.push({
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      payload: event.payload,
      metadata: {
        correlationId: event.metadata.correlationId,
        causationId: event.metadata.causationId,
        userId: event.metadata.userId,
        tenantId: event.metadata.tenantId,
        timestamp: event.metadata.timestamp,
      },
    });
  }

  /**
   * Commit pending messages to the outbox
   */
  async commit(): Promise<OutboxMessage[]> {
    if (this.committed) {
      throw new Error('Unit of work already committed');
    }

    this.committed = true;
    return this.store.addBatch(this.pendingMessages);
  }

  /**
   * Rollback (discard pending messages)
   */
  rollback(): void {
    this.pendingMessages = [];
  }
}

// ============================================================================
// DEAD LETTER QUEUE
// ============================================================================

/**
 * Dead letter queue service
 */
export class DeadLetterQueueService {
  constructor(private store: OutboxStore) {}

  /**
   * Get dead letter messages
   */
  async getMessages(limit = 100): Promise<OutboxMessage[]> {
    return this.store.getDeadLetter(limit);
  }

  /**
   * Retry a dead letter message
   */
  async retry(messageId: string): Promise<void> {
    await this.store.retry(messageId);
  }

  /**
   * Retry all dead letter messages
   */
  async retryAll(): Promise<number> {
    const messages = await this.store.getDeadLetter(1000);
    for (const message of messages) {
      await this.store.retry(message.id);
    }
    return messages.length;
  }
}

// Singleton instances
export const outboxStore = new InMemoryOutboxStore();
