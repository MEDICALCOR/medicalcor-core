/**
 * Queue Actions Handler
 * Domain service for handling queue action requests using Zod schemas.
 *
 * Processes queue actions like breach recording, alerts, escalation,
 * resolution, and acknowledgement with full type safety.
 *
 * @module domain/voice/queue-actions-handler
 */

import type {
  QueueActionRequest,
  QueueActionType,
  QueueEventPayload,
  QueueEventResult,
  BatchQueueEventRequest,
  BatchQueueEventResult,
} from '@medicalcor/types';
import {
  QueueActionRequestSchema,
  QueueEventPayloadSchema,
  createQueueEventSuccess,
  createQueueEventFailure,
} from '@medicalcor/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Handler result for individual action processing
 */
export interface ActionHandlerResult {
  success: boolean;
  eventId?: string;
  action: QueueActionType;
  processedAt: Date;
  error?: string;
}

/**
 * Port for queue event persistence
 */
export interface IQueueEventPort {
  /** Get event by ID */
  getEvent(eventId: string): Promise<QueueEventPayload | null>;

  /** Save or update event */
  saveEvent(event: QueueEventPayload): Promise<void>;

  /** Record breach for event */
  recordBreach(eventId: string, payload: QueueEventPayload): Promise<void>;

  /** Mark event as alerted */
  markAlertSent(eventId: string, actorId?: string): Promise<void>;

  /** Mark event as escalated */
  markEscalated(eventId: string, actorId?: string): Promise<void>;

  /** Mark event as resolved */
  markResolved(eventId: string, actorId?: string, notes?: string): Promise<void>;

  /** Mark event as acknowledged */
  markAcknowledged(eventId: string, actorId?: string, notes?: string): Promise<void>;
}

/**
 * Port for alert notification
 */
export interface IAlertNotificationPort {
  /** Send alert notification for queue event */
  sendAlert(event: QueueEventPayload): Promise<boolean>;

  /** Send escalation notification */
  sendEscalation(event: QueueEventPayload, actorId?: string): Promise<boolean>;
}

/**
 * Service configuration
 */
export interface QueueActionsHandlerConfig {
  /** Maximum retries for action processing */
  maxRetries?: number;
  /** Enable duplicate detection */
  enableDuplicateDetection?: boolean;
  /** Duplicate detection window in seconds */
  duplicateWindowSeconds?: number;
}

// =============================================================================
// IN-MEMORY IMPLEMENTATION (for testing/demo)
// =============================================================================

/**
 * In-memory implementation of queue event port
 */
export class InMemoryQueueEventPort implements IQueueEventPort {
  private events = new Map<string, QueueEventPayload>();

  getEvent(eventId: string): Promise<QueueEventPayload | null> {
    return Promise.resolve(this.events.get(eventId) ?? null);
  }

  saveEvent(event: QueueEventPayload): Promise<void> {
    this.events.set(event.id, event);
    return Promise.resolve();
  }

  recordBreach(eventId: string, payload: QueueEventPayload): Promise<void> {
    this.events.set(eventId, payload);
    return Promise.resolve();
  }

  markAlertSent(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      this.events.set(eventId, { ...event, alertSent: true });
    }
    return Promise.resolve();
  }

  markEscalated(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      this.events.set(eventId, { ...event, escalated: true });
    }
    return Promise.resolve();
  }

  markResolved(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      this.events.set(eventId, { ...event, resolvedAt: new Date() });
    }
    return Promise.resolve();
  }

  markAcknowledged(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      this.events.set(eventId, {
        ...event,
        metadata: { ...event.metadata, acknowledged: true, acknowledgedAt: new Date() },
      });
    }
    return Promise.resolve();
  }

  /** Get all events (for testing) */
  getAllEvents(): QueueEventPayload[] {
    return Array.from(this.events.values());
  }

  /** Clear all events (for testing) */
  clear(): void {
    this.events.clear();
  }
}

/**
 * In-memory implementation of alert notification port
 */
export class InMemoryAlertNotificationPort implements IAlertNotificationPort {
  private alerts: { event: QueueEventPayload; type: 'alert' | 'escalation' }[] = [];

  sendAlert(event: QueueEventPayload): Promise<boolean> {
    this.alerts.push({ event, type: 'alert' });
    return Promise.resolve(true);
  }

  sendEscalation(event: QueueEventPayload): Promise<boolean> {
    this.alerts.push({ event, type: 'escalation' });
    return Promise.resolve(true);
  }

  /** Get all alerts (for testing) */
  getAlerts(): { event: QueueEventPayload; type: 'alert' | 'escalation' }[] {
    return [...this.alerts];
  }

  /** Clear all alerts (for testing) */
  clear(): void {
    this.alerts = [];
  }
}

// =============================================================================
// QUEUE ACTIONS HANDLER
// =============================================================================

/**
 * Domain service for handling queue action requests
 */
export class QueueActionsHandler {
  private readonly config: Required<QueueActionsHandlerConfig>;
  private readonly processedActions = new Map<string, Date>();

  constructor(
    private readonly eventPort: IQueueEventPort,
    private readonly alertPort: IAlertNotificationPort,
    config: QueueActionsHandlerConfig = {}
  ) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      enableDuplicateDetection: config.enableDuplicateDetection ?? true,
      duplicateWindowSeconds: config.duplicateWindowSeconds ?? 300,
    };
  }

  // ===========================================================================
  // MAIN ACTION HANDLER
  // ===========================================================================

  /**
   * Handle a queue action request
   *
   * @param request - Raw action request to process
   * @returns Processing result
   */
  async handleAction(request: unknown): Promise<QueueEventResult> {
    // Validate request
    const parseResult = QueueActionRequestSchema.safeParse(request);
    if (!parseResult.success) {
      return createQueueEventFailure('validation-error', parseResult.error.message);
    }

    const validRequest = parseResult.data;

    // Check for duplicates
    if (this.config.enableDuplicateDetection) {
      const duplicateKey = this.getDuplicateKey(validRequest);
      if (this.isDuplicate(duplicateKey)) {
        return createQueueEventFailure('duplicate', 'Action already processed recently');
      }
      this.recordProcessedAction(duplicateKey);
    }

    // Route to appropriate handler
    try {
      const result = await this.routeAction(validRequest);
      if (result.success) {
        return createQueueEventSuccess(result.eventId);
      }
      return createQueueEventFailure('processing-error', result.error);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createQueueEventFailure('processing-error', message);
    }
  }

  /**
   * Handle a queue action request with event payload
   *
   * @param action - Action type to perform
   * @param payload - Raw event payload
   * @param actorId - Actor performing the action
   * @param notes - Optional notes
   * @returns Processing result
   */
  async handleActionWithPayload(
    action: QueueActionType,
    payload: unknown,
    actorId?: string,
    notes?: string
  ): Promise<QueueEventResult> {
    // Validate payload
    const parseResult = QueueEventPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      return createQueueEventFailure('invalid-payload', parseResult.error.message);
    }

    const validPayload = parseResult.data;

    // Route to appropriate handler
    try {
      const result = await this.executeAction(action, validPayload, actorId, notes);
      if (result.success) {
        return createQueueEventSuccess(result.eventId);
      }
      return createQueueEventFailure('processing-error', result.error);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createQueueEventFailure('processing-error', message);
    }
  }

  /**
   * Process a batch of queue events
   *
   * @param request - Batch request with events and options
   * @returns Batch processing result
   */
  async handleBatch(request: BatchQueueEventRequest): Promise<BatchQueueEventResult> {
    const startTime = Date.now();
    const results: BatchQueueEventResult['results'] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    const options = {
      failFast: request.options?.failFast ?? false,
      skipInvalid: request.options?.skipInvalid ?? true,
      concurrency: request.options?.concurrency ?? 5,
    };

    // Process events with concurrency control
    const chunks = this.chunkArray(request.events, options.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (event, chunkIndex) => {
          const index = chunks.indexOf(chunk) * options.concurrency + chunkIndex;

          // Validate event
          const parseResult = QueueEventPayloadSchema.safeParse(event);
          if (!parseResult.success) {
            if (options.skipInvalid) {
              return {
                index,
                eventId: undefined,
                result: createQueueEventFailure('invalid-payload', parseResult.error.message),
                skipped: true,
              };
            }
            if (options.failFast) {
              throw new Error(`Invalid payload at index ${index}: ${parseResult.error.message}`);
            }
            return {
              index,
              eventId: undefined,
              result: createQueueEventFailure('invalid-payload', parseResult.error.message),
              skipped: false,
            };
          }

          const validEvent = parseResult.data;

          try {
            await this.eventPort.saveEvent(validEvent);
            return {
              index,
              eventId: validEvent.id,
              result: createQueueEventSuccess(validEvent.id),
              skipped: false,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (options.failFast) {
              throw new Error(`Processing failed at index ${index}: ${message}`);
            }
            return {
              index,
              eventId: validEvent.id,
              result: createQueueEventFailure('processing-error', message),
              skipped: false,
            };
          }
        })
      );

      for (const result of chunkResults) {
        results.push({
          index: result.index,
          eventId: result.eventId,
          result: result.result,
        });

        if (result.skipped) {
          skipped++;
        } else if (result.result.ok) {
          succeeded++;
        } else {
          failed++;
        }
      }
    }

    return {
      total: request.events.length,
      succeeded,
      failed,
      skipped,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  // ===========================================================================
  // ACTION ROUTING
  // ===========================================================================

  /**
   * Route action request to appropriate handler
   */
  private async routeAction(request: QueueActionRequest): Promise<ActionHandlerResult> {
    const event = await this.eventPort.getEvent(request.eventId);
    if (!event) {
      return {
        success: false,
        action: request.action,
        processedAt: new Date(),
        error: `Event not found: ${request.eventId}`,
      };
    }

    return this.executeAction(request.action, event, request.actorId, request.notes);
  }

  /**
   * Execute action on validated event
   */
  private async executeAction(
    action: QueueActionType,
    event: QueueEventPayload,
    actorId?: string,
    notes?: string
  ): Promise<ActionHandlerResult> {
    switch (action) {
      case 'record_breach':
        return this.handleRecordBreach(event);
      case 'send_alert':
        return this.handleSendAlert(event);
      case 'escalate':
        return this.handleEscalate(event, actorId);
      case 'resolve':
        return this.handleResolve(event, actorId, notes);
      case 'acknowledge':
        return this.handleAcknowledge(event, actorId, notes);
      default: {
        // Exhaustive check - this should never be reached
        const _exhaustiveCheck: never = action;
        throw new Error(`Unhandled action type: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  // ===========================================================================
  // ACTION HANDLERS
  // ===========================================================================

  /**
   * Handle record_breach action
   */
  private async handleRecordBreach(event: QueueEventPayload): Promise<ActionHandlerResult> {
    await this.eventPort.recordBreach(event.id, event);

    return {
      success: true,
      eventId: event.id,
      action: 'record_breach',
      processedAt: new Date(),
    };
  }

  /**
   * Handle send_alert action
   */
  private async handleSendAlert(event: QueueEventPayload): Promise<ActionHandlerResult> {
    // Skip if alert already sent
    if (event.alertSent) {
      return {
        success: true,
        eventId: event.id,
        action: 'send_alert',
        processedAt: new Date(),
      };
    }

    const alertSent = await this.alertPort.sendAlert(event);
    if (alertSent) {
      await this.eventPort.markAlertSent(event.id);
    }

    return {
      success: alertSent,
      eventId: event.id,
      action: 'send_alert',
      processedAt: new Date(),
      error: alertSent ? undefined : 'Failed to send alert',
    };
  }

  /**
   * Handle escalate action
   */
  private async handleEscalate(
    event: QueueEventPayload,
    actorId?: string
  ): Promise<ActionHandlerResult> {
    // Skip if already escalated
    if (event.escalated) {
      return {
        success: true,
        eventId: event.id,
        action: 'escalate',
        processedAt: new Date(),
      };
    }

    const escalated = await this.alertPort.sendEscalation(event, actorId);
    if (escalated) {
      await this.eventPort.markEscalated(event.id, actorId);
    }

    return {
      success: escalated,
      eventId: event.id,
      action: 'escalate',
      processedAt: new Date(),
      error: escalated ? undefined : 'Failed to escalate',
    };
  }

  /**
   * Handle resolve action
   */
  private async handleResolve(
    event: QueueEventPayload,
    actorId?: string,
    notes?: string
  ): Promise<ActionHandlerResult> {
    // Skip if already resolved
    if (event.resolvedAt) {
      return {
        success: true,
        eventId: event.id,
        action: 'resolve',
        processedAt: new Date(),
      };
    }

    await this.eventPort.markResolved(event.id, actorId, notes);

    return {
      success: true,
      eventId: event.id,
      action: 'resolve',
      processedAt: new Date(),
    };
  }

  /**
   * Handle acknowledge action
   */
  private async handleAcknowledge(
    event: QueueEventPayload,
    actorId?: string,
    notes?: string
  ): Promise<ActionHandlerResult> {
    await this.eventPort.markAcknowledged(event.id, actorId, notes);

    return {
      success: true,
      eventId: event.id,
      action: 'acknowledge',
      processedAt: new Date(),
    };
  }

  // ===========================================================================
  // DUPLICATE DETECTION
  // ===========================================================================

  /**
   * Generate duplicate detection key
   */
  private getDuplicateKey(request: QueueActionRequest): string {
    return `${request.action}:${request.eventId}`;
  }

  /**
   * Check if action was recently processed
   */
  private isDuplicate(key: string): boolean {
    const lastProcessed = this.processedActions.get(key);
    if (!lastProcessed) return false;

    const elapsedSeconds = (Date.now() - lastProcessed.getTime()) / 1000;
    return elapsedSeconds < this.config.duplicateWindowSeconds;
  }

  /**
   * Record processed action for duplicate detection
   */
  private recordProcessedAction(key: string): void {
    this.processedActions.set(key, new Date());
    this.cleanupOldActions();
  }

  /**
   * Cleanup old entries from duplicate detection map
   */
  private cleanupOldActions(): void {
    const cutoff = Date.now() - this.config.duplicateWindowSeconds * 1000;
    for (const [key, timestamp] of this.processedActions.entries()) {
      if (timestamp.getTime() < cutoff) {
        this.processedActions.delete(key);
      }
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Split array into chunks for concurrent processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Validate action request (static method for external use)
   */
  static validateRequest(request: unknown): {
    valid: boolean;
    data?: QueueActionRequest;
    error?: string;
  } {
    const result = QueueActionRequestSchema.safeParse(request);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error.message };
  }

  /**
   * Validate event payload (static method for external use)
   */
  static validatePayload(payload: unknown): {
    valid: boolean;
    data?: QueueEventPayload;
    error?: string;
  } {
    const result = QueueEventPayloadSchema.safeParse(payload);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error.message };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let handlerInstance: QueueActionsHandler | null = null;

/**
 * Create or get the queue actions handler singleton
 */
export function getQueueActionsHandler(
  eventPort?: IQueueEventPort,
  alertPort?: IAlertNotificationPort,
  config?: QueueActionsHandlerConfig
): QueueActionsHandler {
  if (!handlerInstance) {
    const ep = eventPort ?? new InMemoryQueueEventPort();
    const ap = alertPort ?? new InMemoryAlertNotificationPort();
    handlerInstance = new QueueActionsHandler(ep, ap, config);
  }
  return handlerInstance;
}

/**
 * Create a new queue actions handler instance
 */
export function createQueueActionsHandler(
  eventPort: IQueueEventPort,
  alertPort: IAlertNotificationPort,
  config?: QueueActionsHandlerConfig
): QueueActionsHandler {
  return new QueueActionsHandler(eventPort, alertPort, config);
}

/**
 * Reset the singleton (for testing)
 */
export function resetQueueActionsHandler(): void {
  handlerInstance = null;
}
