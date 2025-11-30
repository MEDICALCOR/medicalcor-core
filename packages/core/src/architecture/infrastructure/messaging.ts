/**
 * @module architecture/infrastructure/messaging
 *
 * Message Broker Abstraction
 * ==========================
 *
 * Vendor-agnostic message queue and pub/sub.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface Message<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: T;
  readonly metadata: MessageMetadata;
  readonly timestamp: Date;
}

export interface MessageMetadata {
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly headers?: Record<string, string>;
}

export interface PublishResult {
  readonly messageId: string;
  readonly timestamp: Date;
}

export interface ReceivedMessage<T = unknown> extends Message<T> {
  ack(): Promise<void>;
  nack(options?: { requeue?: boolean }): Promise<void>;
}

// ============================================================================
// QUEUE TYPES
// ============================================================================

export interface QueueConfig {
  readonly name: string;
  readonly durable?: boolean;
  readonly maxLength?: number;
  readonly deadLetterQueue?: string;
}

export interface QueueInfo {
  readonly name: string;
  readonly messageCount: number;
  readonly consumerCount: number;
}

// ============================================================================
// MESSAGING ERROR
// ============================================================================

export class MessagingError extends Error {
  constructor(
    message: string,
    readonly code: MessagingErrorCode,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

export type MessagingErrorCode =
  | 'QUEUE_NOT_FOUND'
  | 'TOPIC_NOT_FOUND'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

// ============================================================================
// MESSAGE QUEUE SERVICE
// ============================================================================

export interface MessageQueueService {
  createQueue(config: QueueConfig): Promise<Result<void, MessagingError>>;
  deleteQueue(name: string): Promise<Result<void, MessagingError>>;
  getQueueInfo(name: string): Promise<Result<QueueInfo, MessagingError>>;
  send<T>(
    queue: string,
    message: T,
    options?: SendOptions
  ): Promise<Result<PublishResult, MessagingError>>;
  receive<T>(
    queue: string,
    options?: ReceiveOptions
  ): Promise<Result<ReceivedMessage<T>[], MessagingError>>;
  subscribe<T>(queue: string, handler: MessageHandler<T>): Promise<Subscription>;
}

export interface SendOptions {
  readonly delay?: number;
  readonly correlationId?: string;
}

export interface ReceiveOptions {
  readonly maxMessages?: number;
  readonly waitTimeSeconds?: number;
}

export type MessageHandler<T> = (message: ReceivedMessage<T>) => Promise<void>;

export interface Subscription {
  readonly id: string;
  readonly queue: string;
  unsubscribe(): Promise<void>;
}

// ============================================================================
// IN-MEMORY MESSAGE QUEUE
// ============================================================================

export class InMemoryMessageQueue implements MessageQueueService {
  private queues = new Map<string, { config: QueueConfig; messages: ReceivedMessage[] }>();
  private subscriptions = new Map<string, MessageHandler<unknown>[]>();

  async createQueue(config: QueueConfig): Promise<Result<void, MessagingError>> {
    if (!this.queues.has(config.name)) {
      this.queues.set(config.name, { config, messages: [] });
    }
    return Ok(undefined);
  }

  async deleteQueue(name: string): Promise<Result<void, MessagingError>> {
    this.queues.delete(name);
    this.subscriptions.delete(name);
    return Ok(undefined);
  }

  async getQueueInfo(name: string): Promise<Result<QueueInfo, MessagingError>> {
    const queue = this.queues.get(name);
    if (!queue) {
      return Err(new MessagingError('Queue not found', 'QUEUE_NOT_FOUND'));
    }
    return Ok({
      name,
      messageCount: queue.messages.length,
      consumerCount: this.subscriptions.get(name)?.length ?? 0,
    });
  }

  async send<T>(
    queue: string,
    payload: T,
    options?: SendOptions
  ): Promise<Result<PublishResult, MessagingError>> {
    const q = this.queues.get(queue);
    if (!q) {
      return Err(new MessagingError('Queue not found', 'QUEUE_NOT_FOUND'));
    }

    const msg = this.createMessage(payload, options);
    q.messages.push(msg);

    const handlers = this.subscriptions.get(queue) ?? [];
    for (const handler of handlers) {
      setImmediate(() => handler(msg));
    }

    return Ok({ messageId: msg.id, timestamp: msg.timestamp });
  }

  async receive<T>(
    queue: string,
    options?: ReceiveOptions
  ): Promise<Result<ReceivedMessage<T>[], MessagingError>> {
    const q = this.queues.get(queue);
    if (!q) {
      return Err(new MessagingError('Queue not found', 'QUEUE_NOT_FOUND'));
    }

    const maxMessages = options?.maxMessages ?? 10;
    const messages = q.messages.splice(0, maxMessages) as ReceivedMessage<T>[];
    return Ok(messages);
  }

  async subscribe<T>(queue: string, handler: MessageHandler<T>): Promise<Subscription> {
    const handlers = this.subscriptions.get(queue) ?? [];
    handlers.push(handler as MessageHandler<unknown>);
    this.subscriptions.set(queue, handlers);

    const id = crypto.randomUUID();
    return {
      id,
      queue,
      unsubscribe: async () => {
        const current = this.subscriptions.get(queue) ?? [];
        this.subscriptions.set(
          queue,
          current.filter((h) => h !== handler)
        );
      },
    };
  }

  private createMessage<T>(payload: T, options?: SendOptions): ReceivedMessage<T> {
    const id = crypto.randomUUID();
    return {
      id,
      type: (payload as { type?: string }).type ?? 'unknown',
      payload,
      metadata: { correlationId: options?.correlationId },
      timestamp: new Date(),
      ack: async () => {},
      nack: async () => {},
    };
  }
}
