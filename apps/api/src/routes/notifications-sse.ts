/**
 * Notifications SSE Endpoint
 *
 * Real-time Server-Sent Events endpoint for system notifications
 * including alerts, metrics updates, and system status changes.
 *
 * Features:
 * - HIPAA/GDPR compliant (PII redaction)
 * - Client subscription management
 * - Heartbeat keepalive
 * - Notification filtering by type
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { generateCorrelationId, createLogger, deepRedactObject } from '@medicalcor/core';

const logger = createLogger({ name: 'notifications-sse' });

// =============================================================================
// Types
// =============================================================================

export interface NotificationSSEClient {
  id: string;
  userId: string;
  response: FastifyReply;
  connectedAt: Date;
  subscriptions: NotificationType[];
}

export type NotificationType =
  | 'system.alert'
  | 'system.status'
  | 'metrics.update'
  | 'lead.scored'
  | 'lead.updated'
  | 'appointment.reminder'
  | 'call.alert'
  | 'budget.warning';

export interface NotificationEvent {
  eventId: string;
  eventType: NotificationType;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  expiresAt?: Date;
}

// =============================================================================
// SSE Manager
// =============================================================================

/**
 * Manages SSE client connections for notifications
 */
export class NotificationsSSEManager {
  private clients = new Map<string, NotificationSSEClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private static instance: NotificationsSSEManager | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): NotificationsSSEManager {
    NotificationsSSEManager.instance ??= new NotificationsSSEManager();
    return NotificationsSSEManager.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (NotificationsSSEManager.instance) {
      NotificationsSSEManager.instance.shutdown();
      NotificationsSSEManager.instance = null;
    }
  }

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Add a new client connection
   */
  addClient(userId: string, reply: FastifyReply, subscriptions: NotificationType[] = []): string {
    const clientId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const client: NotificationSSEClient = {
      id: clientId,
      userId,
      response: reply,
      connectedAt: new Date(),
      subscriptions: subscriptions.length > 0 ? subscriptions : this.getAllNotificationTypes(),
    };

    this.clients.set(clientId, client);

    logger.info(
      { clientId, userId, subscriptionCount: client.subscriptions.length },
      'Notification SSE client connected'
    );

    // Send connection established event
    this.sendToClient(client, {
      eventId: generateCorrelationId(),
      eventType: 'system.status',
      timestamp: new Date(),
      priority: 'low',
      title: 'Connected',
      message: 'SSE connection established',
      data: { clientId, subscriptions: client.subscriptions },
    });

    return clientId;
  }

  /**
   * Remove a client connection
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info({ clientId, userId: client.userId }, 'Notification SSE client disconnected');
    }
  }

  /**
   * Update client subscriptions
   */
  updateSubscriptions(clientId: string, subscriptions: NotificationType[]): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    client.subscriptions = subscriptions;
    logger.debug({ clientId, subscriptions }, 'Client subscriptions updated');
    return true;
  }

  /**
   * Broadcast notification to all subscribed clients
   */
  broadcast(notification: NotificationEvent): void {
    const sanitized = deepRedactObject(notification);

    for (const [_clientId, client] of this.clients.entries()) {
      // Only send if client is subscribed to this notification type
      if (client.subscriptions.includes(notification.eventType)) {
        this.sendToClient(client, sanitized);
      }
    }

    logger.debug(
      {
        eventType: notification.eventType,
        clientCount: this.getSubscribedClientCount(notification.eventType),
      },
      'Notification broadcast'
    );
  }

  /**
   * Send notification to a specific user (all their connected clients)
   */
  sendToUser(userId: string, notification: NotificationEvent): void {
    const sanitized = deepRedactObject(notification);

    for (const [, client] of this.clients.entries()) {
      if (client.userId === userId && client.subscriptions.includes(notification.eventType)) {
        this.sendToClient(client, sanitized);
      }
    }
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get count of clients subscribed to a specific notification type
   */
  getSubscribedClientCount(eventType: NotificationType): number {
    let count = 0;
    for (const [, client] of this.clients.entries()) {
      if (client.subscriptions.includes(eventType)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all notification types
   */
  getAllNotificationTypes(): NotificationType[] {
    return [
      'system.alert',
      'system.status',
      'metrics.update',
      'lead.scored',
      'lead.updated',
      'appointment.reminder',
      'call.alert',
      'budget.warning',
    ];
  }

  /**
   * Shutdown manager
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    for (const [clientId] of this.clients.entries()) {
      this.removeClient(clientId);
    }
  }

  private sendToClient(client: NotificationSSEClient, event: NotificationEvent): void {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.response.raw.write(data);
    } catch (error) {
      logger.debug({ error, clientId: client.id }, 'Failed to send notification');
      this.removeClient(client.id);
    }
  }

  private startHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      const heartbeat: NotificationEvent = {
        eventId: generateCorrelationId(),
        eventType: 'system.status',
        timestamp: new Date(),
        priority: 'low',
        title: 'Heartbeat',
        message: 'Connection alive',
        data: { connectedClients: this.clients.size },
      };

      // Send to all clients regardless of subscription
      for (const [, client] of this.clients.entries()) {
        this.sendToClient(client, heartbeat);
      }
    }, 30000);
  }
}

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Get or create SSE manager instance
 */
function getSSEManager(): NotificationsSSEManager {
  return NotificationsSSEManager.getInstance();
}

/**
 * Create notifications SSE routes
 */
export const notificationsSSERoutes: FastifyPluginAsync = async (fastify) => {
  const manager = getSSEManager();

  /**
   * GET /notifications/events
   * Establish SSE connection for real-time notifications
   *
   * Headers:
   * - x-user-id: Required - User identifier
   *
   * Query params:
   * - types: Optional - Comma-separated notification types to subscribe to
   */
  fastify.get(
    '/notifications/events',
    async (
      request: FastifyRequest<{
        Querystring: { types?: string };
      }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();
      const userId = request.headers['x-user-id'];

      if (!userId || typeof userId !== 'string') {
        return reply.status(400).send({
          error: 'x-user-id header is required',
          correlationId,
        });
      }

      // Parse subscription types from query
      let subscriptions: NotificationType[] = [];
      if (request.query.types) {
        subscriptions = request.query.types.split(',').map((t) => t.trim()) as NotificationType[];
        // Validate types
        const validTypes = manager.getAllNotificationTypes();
        subscriptions = subscriptions.filter((t) => validTypes.includes(t));
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Add client
      const clientId = manager.addClient(userId, reply, subscriptions);

      // Handle disconnect
      request.raw.on('close', () => {
        manager.removeClient(clientId);
      });

      // Keep connection open
      return;
    }
  );

  /**
   * GET /notifications/events/status
   * Get connection status and statistics
   */
  fastify.get('/notifications/events/status', async (_request, reply) => {
    const correlationId = generateCorrelationId();
    const types = manager.getAllNotificationTypes();
    const subscriptionCounts: Record<string, number> = {};

    for (const type of types) {
      subscriptionCounts[type] = manager.getSubscribedClientCount(type);
    }

    return reply.send({
      connectedClients: manager.getClientCount(),
      subscriptionCounts,
      notificationTypes: types,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  });

  /**
   * POST /notifications/events/subscribe
   * Update subscriptions for a connected client
   */
  fastify.post(
    '/notifications/events/subscribe',
    async (
      request: FastifyRequest<{
        Body: { clientId: string; types: string[] };
      }>,
      reply
    ) => {
      const correlationId = generateCorrelationId();
      const body = request.body as { clientId?: string; types?: string[] };

      if (!body.clientId) {
        return reply.status(400).send({
          error: 'clientId is required',
          correlationId,
        });
      }

      if (!body.types || !Array.isArray(body.types)) {
        return reply.status(400).send({
          error: 'types array is required',
          correlationId,
        });
      }

      const validTypes = manager.getAllNotificationTypes();
      const subscriptions = body.types.filter((t) =>
        validTypes.includes(t as NotificationType)
      ) as NotificationType[];

      const success = manager.updateSubscriptions(body.clientId, subscriptions);

      if (!success) {
        return reply.status(404).send({
          error: 'Client not found',
          correlationId,
        });
      }

      return reply.send({
        success: true,
        subscriptions,
        correlationId,
      });
    }
  );
};

// =============================================================================
// Exports
// =============================================================================

/**
 * Get the notifications SSE manager instance
 */
export function getNotificationsSSEManager(): NotificationsSSEManager {
  return NotificationsSSEManager.getInstance();
}

/**
 * Emit a notification to all subscribed clients
 */
export function emitNotification(notification: Omit<NotificationEvent, 'eventId'>): void {
  const manager = NotificationsSSEManager.getInstance();
  manager.broadcast({
    eventId: generateCorrelationId(),
    ...notification,
  });
}

/**
 * Emit a notification to a specific user
 */
export function emitUserNotification(
  userId: string,
  notification: Omit<NotificationEvent, 'eventId'>
): void {
  const manager = NotificationsSSEManager.getInstance();
  manager.sendToUser(userId, {
    eventId: generateCorrelationId(),
    ...notification,
  });
}
