/**
 * Notifications SSE Streaming Integration Tests
 *
 * Tests real SSE streaming behavior for the notifications endpoint
 * using native HTTP client.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  notificationsSSERoutes,
  getNotificationsSSEManager,
  NotificationsSSEManager,
  type NotificationType,
} from '../routes/notifications-sse.js';
import {
  createSSEClient,
  httpRequest,
  getAvailablePort,
  delay,
  createMultipleSSEClients,
  type SSEClientResult,
} from './streaming-test-utils.js';

// =============================================================================
// Test Suite
// =============================================================================

describe('Notifications SSE Streaming Integration', () => {
  let app: FastifyInstance;
  let port: number;
  let clients: SSEClientResult[] = [];

  beforeAll(async () => {
    // Reset singleton before tests
    NotificationsSSEManager.resetInstance();

    port = await getAvailablePort();
    app = Fastify({ logger: false });
    await app.register(notificationsSSERoutes);
    await app.listen({ port, host: '127.0.0.1' });
  });

  afterAll(async () => {
    clients.forEach((client) => client.close());
    clients = [];
    await app.close();
    NotificationsSSEManager.resetInstance();
  });

  beforeEach(() => {
    clients.forEach((client) => client.close());
    clients = [];
  });

  // ==========================================================================
  // Connection Establishment
  // ==========================================================================

  describe('Connection Establishment', () => {
    it('should establish SSE connection with valid user ID', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-test-123' },
      });
      clients.push(client);

      expect(client.statusCode).toBe(200);
      expect(client.headers['content-type']).toBe('text/event-stream');
      expect(client.headers['cache-control']).toBe('no-cache');
      expect(client.headers['connection']).toBe('keep-alive');
    });

    it('should include X-Accel-Buffering header for nginx compatibility', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-nginx-test' },
      });
      clients.push(client);

      expect(client.headers['x-accel-buffering']).toBe('no');
    });

    it('should send system.status event on connect', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-connect-test' },
      });
      clients.push(client);

      const event = await client.waitForEventType('system.status', 2000);

      expect(event.eventType).toBe('system.status');
      expect(event.data).toHaveProperty('data');
      expect((event.data.data as Record<string, unknown>).clientId).toBeDefined();
    });

    it('should return 400 for missing user ID header', async () => {
      const response = await httpRequest({
        port,
        path: '/notifications/events',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe('x-user-id header is required');
    });

    it('should generate unique client IDs', async () => {
      const client1 = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-unique-1' },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-unique-2' },
      });
      clients.push(client2);

      const event1 = await client1.waitForEventType('system.status', 2000);
      const event2 = await client2.waitForEventType('system.status', 2000);

      const clientId1 = (event1.data.data as Record<string, unknown>).clientId;
      const clientId2 = (event2.data.data as Record<string, unknown>).clientId;

      expect(clientId1).not.toBe(clientId2);
    });
  });

  // ==========================================================================
  // Subscription Management
  // ==========================================================================

  describe('Subscription Management', () => {
    it('should accept subscription types via query parameter', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events?types=lead.scored,lead.updated',
        headers: { 'x-user-id': 'user-sub-test' },
      });
      clients.push(client);

      const event = await client.waitForEventType('system.status', 2000);
      const subscriptions = (event.data.data as Record<string, unknown>).subscriptions as string[];

      expect(subscriptions).toContain('lead.scored');
      expect(subscriptions).toContain('lead.updated');
      expect(subscriptions).toHaveLength(2);
    });

    it('should subscribe to all types by default', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-default-sub' },
      });
      clients.push(client);

      const event = await client.waitForEventType('system.status', 2000);
      const subscriptions = (event.data.data as Record<string, unknown>).subscriptions as string[];

      expect(subscriptions.length).toBeGreaterThan(2);
      expect(subscriptions).toContain('system.alert');
      expect(subscriptions).toContain('metrics.update');
    });

    it('should filter out invalid subscription types', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events?types=lead.scored,invalid.type,lead.updated',
        headers: { 'x-user-id': 'user-invalid-types' },
      });
      clients.push(client);

      const event = await client.waitForEventType('system.status', 2000);
      const subscriptions = (event.data.data as Record<string, unknown>).subscriptions as string[];

      expect(subscriptions).toContain('lead.scored');
      expect(subscriptions).toContain('lead.updated');
      expect(subscriptions).not.toContain('invalid.type');
    });

    it('should update subscriptions via POST endpoint', async () => {
      // Connect client
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-update-sub' },
      });
      clients.push(client);

      const connectEvent = await client.waitForEventType('system.status', 2000);
      const clientId = (connectEvent.data.data as Record<string, unknown>).clientId as string;

      // Update subscriptions
      const response = await httpRequest({
        port,
        path: '/notifications/events/subscribe',
        method: 'POST',
        body: {
          clientId,
          types: ['budget.warning', 'call.alert'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ success: boolean; subscriptions: string[] }>();
      expect(body.success).toBe(true);
      expect(body.subscriptions).toContain('budget.warning');
      expect(body.subscriptions).toContain('call.alert');
    });

    it('should return 404 when updating non-existent client', async () => {
      const response = await httpRequest({
        port,
        path: '/notifications/events/subscribe',
        method: 'POST',
        body: {
          clientId: 'non-existent-client',
          types: ['system.alert'],
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ==========================================================================
  // Event Broadcasting
  // ==========================================================================

  describe('Event Broadcasting', () => {
    it('should broadcast notifications to subscribed clients', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events?types=lead.scored',
        headers: { 'x-user-id': 'user-broadcast-test' },
      });
      clients.push(client);

      await client.waitForEventType('system.status', 2000);

      const manager = getNotificationsSSEManager();
      manager.broadcast({
        eventId: 'test-event-1',
        eventType: 'lead.scored',
        timestamp: new Date(),
        priority: 'medium',
        title: 'Lead Scored',
        message: 'A new lead has been scored',
        data: { leadId: 'lead-123', score: 4 },
      });

      const event = await client.waitForEventType('lead.scored', 2000);
      expect(event).toBeDefined();
      expect(event.data.title).toBe('Lead Scored');
    });

    it('should not send events to unsubscribed clients', async () => {
      // Client subscribed only to lead.scored
      const client = await createSSEClient({
        port,
        path: '/notifications/events?types=lead.scored',
        headers: { 'x-user-id': 'user-filter-test' },
      });
      clients.push(client);

      await client.waitForEventType('system.status', 2000);

      const manager = getNotificationsSSEManager();

      // Send a budget.warning (not subscribed)
      manager.broadcast({
        eventId: 'test-event-2',
        eventType: 'budget.warning',
        timestamp: new Date(),
        priority: 'high',
        title: 'Budget Warning',
        message: 'Budget threshold exceeded',
      });

      // Wait briefly
      await delay(200);

      // Should only have the connection event, not the budget warning
      const budgetEvent = client.events.find((e) => e.eventType === 'budget.warning');
      expect(budgetEvent).toBeUndefined();
    });

    it('should broadcast to multiple clients', async () => {
      const multiClients = await createMultipleSSEClients(
        3,
        { port, path: '/notifications/events?types=metrics.update' },
        (i) => ({ 'x-user-id': `user-multi-${i}` })
      );
      clients.push(...multiClients);

      await Promise.all(multiClients.map((c) => c.waitForEventType('system.status', 2000)));

      const manager = getNotificationsSSEManager();
      manager.broadcast({
        eventId: 'test-multi-1',
        eventType: 'metrics.update',
        timestamp: new Date(),
        priority: 'low',
        title: 'Metrics Update',
        message: 'System metrics updated',
        data: { cpu: 45, memory: 60 },
      });

      // All clients should receive the event
      await Promise.all(multiClients.map((c) => c.waitForEventType('metrics.update', 2000)));

      for (const client of multiClients) {
        const event = client.events.find((e) => e.eventType === 'metrics.update');
        expect(event).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Status Endpoint
  // ==========================================================================

  describe('Status Endpoint', () => {
    it('should return connected client count', async () => {
      // Get initial count
      const initialResponse = await httpRequest({
        port,
        path: '/notifications/events/status',
      });
      const initialCount = initialResponse.json<{ connectedClients: number }>().connectedClients;

      // Connect a client
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-status-test' },
      });
      clients.push(client);

      await client.waitForEventType('system.status', 2000);

      // Check count increased
      const afterResponse = await httpRequest({
        port,
        path: '/notifications/events/status',
      });
      const afterCount = afterResponse.json<{ connectedClients: number }>().connectedClients;

      expect(afterCount).toBe(initialCount + 1);
    });

    it('should return subscription counts by type', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events?types=system.alert,budget.warning',
        headers: { 'x-user-id': 'user-sub-count-test' },
      });
      clients.push(client);

      await client.waitForEventType('system.status', 2000);

      const response = await httpRequest({
        port,
        path: '/notifications/events/status',
      });

      const body = response.json<{
        subscriptionCounts: Record<string, number>;
        notificationTypes: string[];
      }>();

      expect(body.subscriptionCounts).toBeDefined();
      expect(body.subscriptionCounts['system.alert']).toBeGreaterThanOrEqual(1);
      expect(body.subscriptionCounts['budget.warning']).toBeGreaterThanOrEqual(1);
      expect(body.notificationTypes.length).toBeGreaterThan(0);
    });

    it('should include timestamp in status response', async () => {
      const response = await httpRequest({
        port,
        path: '/notifications/events/status',
      });

      const body = response.json<{ timestamp: string }>();
      expect(body.timestamp).toBeDefined();

      const date = new Date(body.timestamp);
      expect(isNaN(date.getTime())).toBe(false);
    });
  });

  // ==========================================================================
  // Connection Lifecycle
  // ==========================================================================

  describe('Connection Lifecycle', () => {
    it('should clean up client on disconnect', async () => {
      const initialResponse = await httpRequest({
        port,
        path: '/notifications/events/status',
      });
      const initialCount = initialResponse.json<{ connectedClients: number }>().connectedClients;

      // Connect and disconnect
      const client = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': 'user-cleanup-test' },
      });

      await client.waitForEventType('system.status', 2000);
      client.close();

      await delay(150);

      // Count should be back to initial
      const afterResponse = await httpRequest({
        port,
        path: '/notifications/events/status',
      });
      const afterCount = afterResponse.json<{ connectedClients: number }>().connectedClients;

      expect(afterCount).toBe(initialCount);
    });

    it('should handle same user with multiple connections', async () => {
      const userId = 'user-multi-conn';

      const client1 = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': userId },
      });
      clients.push(client1);

      const client2 = await createSSEClient({
        port,
        path: '/notifications/events',
        headers: { 'x-user-id': userId },
      });
      clients.push(client2);

      await Promise.all([
        client1.waitForEventType('system.status', 2000),
        client2.waitForEventType('system.status', 2000),
      ]);

      // Both should receive events
      const manager = getNotificationsSSEManager();
      manager.broadcast({
        eventId: 'multi-conn-test',
        eventType: 'system.alert',
        timestamp: new Date(),
        priority: 'high',
        title: 'Test Alert',
        message: 'Multi-connection test',
      });

      await Promise.all([
        client1.waitForEventType('system.alert', 2000),
        client2.waitForEventType('system.alert', 2000),
      ]);

      expect(client1.events.find((e) => e.eventType === 'system.alert')).toBeDefined();
      expect(client2.events.find((e) => e.eventType === 'system.alert')).toBeDefined();
    });
  });

  // ==========================================================================
  // Notification Types
  // ==========================================================================

  describe('Notification Types', () => {
    it('should support all notification types', async () => {
      const manager = getNotificationsSSEManager();
      const types = manager.getAllNotificationTypes();

      expect(types).toContain('system.alert');
      expect(types).toContain('system.status');
      expect(types).toContain('metrics.update');
      expect(types).toContain('lead.scored');
      expect(types).toContain('lead.updated');
      expect(types).toContain('appointment.reminder');
      expect(types).toContain('call.alert');
      expect(types).toContain('budget.warning');
    });

    it('should handle priority levels in notifications', async () => {
      const client = await createSSEClient({
        port,
        path: '/notifications/events?types=system.alert',
        headers: { 'x-user-id': 'user-priority-test' },
      });
      clients.push(client);

      await client.waitForEventType('system.status', 2000);

      const manager = getNotificationsSSEManager();

      // Send critical priority notification
      manager.broadcast({
        eventId: 'priority-test',
        eventType: 'system.alert',
        timestamp: new Date(),
        priority: 'critical',
        title: 'Critical Alert',
        message: 'System requires immediate attention',
      });

      const event = await client.waitForEventType('system.alert', 2000);
      expect(event.data.priority).toBe('critical');
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should require clientId in subscribe endpoint', async () => {
      const response = await httpRequest({
        port,
        path: '/notifications/events/subscribe',
        method: 'POST',
        body: { types: ['system.alert'] },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toContain('clientId');
    });

    it('should require types array in subscribe endpoint', async () => {
      const response = await httpRequest({
        port,
        path: '/notifications/events/subscribe',
        method: 'POST',
        body: { clientId: 'some-client' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string }>();
      expect(body.error).toContain('types');
    });
  });
});
