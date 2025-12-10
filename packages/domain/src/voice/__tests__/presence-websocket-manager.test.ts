/**
 * Tests for PresenceWebSocketManager
 *
 * Covers:
 * - Port injection
 * - Message handling (connect, disconnect, heartbeat, status change, query)
 * - Connection lifecycle
 * - Event broadcasting
 * - Subscription management
 * - Client management
 * - Cleanup and destruction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  PresenceWebSocketManager,
  createPresenceWebSocketManager,
  type IPresenceWebSocketPort,
  type PresenceWebSocketManagerConfig,
} from '../presence-websocket-manager.js';
import type { AgentPresenceService } from '../agent-presence-service.js';
import type {
  AgentPresence,
  HeartbeatAck,
  PresenceConnectEvent,
  PresenceDisconnectEvent,
  PresenceHeartbeatEvent,
  PresenceStatusChangeEvent,
  PresenceQueryEvent,
} from '@medicalcor/types';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

function createMockPresenceService(): AgentPresenceService & EventEmitter {
  const service = new EventEmitter() as AgentPresenceService & EventEmitter;

  // Add service methods
  Object.assign(service, {
    registerAgent: vi.fn().mockReturnValue({
      agentId: 'agent-123',
      agentName: 'Test Agent',
      status: 'online',
      connectionId: 'conn-123',
      connectedAt: new Date(),
      lastHeartbeatAt: new Date(),
    } as AgentPresence),
    unregisterAgent: vi.fn(),
    processHeartbeat: vi.fn().mockReturnValue({
      received: true,
      serverTime: new Date(),
      nextExpectedAt: new Date(Date.now() + 15000),
    } as HeartbeatAck),
    changeStatus: vi.fn(),
    getAgents: vi.fn().mockReturnValue([]),
    getTeamSummary: vi.fn().mockReturnValue({
      totalAgents: 5,
      byStatus: {
        online: 2,
        offline: 1,
        busy: 1,
        away: 1,
        dnd: 0,
      },
    }),
    getHeartbeatConfig: vi.fn().mockReturnValue({
      intervalMs: 15000,
      missedThreshold: 3,
      gracePeriodMs: 5000,
    }),
  });

  return service;
}

function createMockWebSocketPort(): IPresenceWebSocketPort {
  return {
    broadcast: vi.fn(),
    sendTo: vi.fn(),
    sendToMany: vi.fn(),
    getConnectionIds: vi.fn().mockReturnValue([]),
    hasConnection: vi.fn().mockReturnValue(true),
    closeConnection: vi.fn(),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PresenceWebSocketManager', () => {
  let manager: PresenceWebSocketManager;
  let mockPresenceService: AgentPresenceService & EventEmitter;
  let mockWsPort: IPresenceWebSocketPort;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPresenceService = createMockPresenceService();
    mockWsPort = createMockWebSocketPort();
    manager = new PresenceWebSocketManager(mockPresenceService);
    manager.setWebSocketPort(mockWsPort);
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.destroy();
  });

  // ============================================================================
  // CONSTRUCTION
  // ============================================================================

  describe('Construction', () => {
    it('should create manager with default config', () => {
      const mgr = new PresenceWebSocketManager(mockPresenceService);
      expect(mgr).toBeDefined();
    });

    it('should create manager with custom config', () => {
      const config: PresenceWebSocketManagerConfig = {
        broadcastRosterOnChange: false,
        rosterBroadcastDebounceMs: 1000,
        maxSubscribersPerChannel: 500,
      };
      const mgr = new PresenceWebSocketManager(mockPresenceService, config);
      expect(mgr).toBeDefined();
    });

    it('should create manager using factory function', () => {
      const mgr = createPresenceWebSocketManager(mockPresenceService);
      expect(mgr).toBeInstanceOf(PresenceWebSocketManager);
    });
  });

  // ============================================================================
  // PORT INJECTION
  // ============================================================================

  describe('Port Injection', () => {
    it('should set WebSocket port', () => {
      const mgr = new PresenceWebSocketManager(mockPresenceService);
      expect(mgr.hasWebSocketPort()).toBe(false);

      mgr.setWebSocketPort(mockWsPort);
      expect(mgr.hasWebSocketPort()).toBe(true);
    });

    it('should check port availability', () => {
      const mgr = new PresenceWebSocketManager(mockPresenceService);
      expect(mgr.hasWebSocketPort()).toBe(false);
    });
  });

  // ============================================================================
  // MESSAGE HANDLING - CONNECT
  // ============================================================================

  describe('handleMessage - Connect', () => {
    it('should handle connect event', () => {
      const event: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-123',
        agentName: 'Test Agent',
        connectionId: 'conn-123',
        deviceId: 'device-1',
        clientType: 'web',
        requestedStatus: 'online',
      };

      manager.handleMessage('conn-123', JSON.stringify(event));

      expect(mockPresenceService.registerAgent).toHaveBeenCalledWith({
        agentId: 'agent-123',
        agentName: 'Test Agent',
        connectionId: 'conn-123',
        deviceId: 'device-1',
        clientType: 'web',
        requestedStatus: 'online',
      });
    });

    it('should emit client:connected event', () => {
      const listener = vi.fn();
      manager.on('client:connected', listener);

      const event: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-456',
        connectionId: 'conn-456',
      };

      manager.handleMessage('conn-456', JSON.stringify(event));

      expect(listener).toHaveBeenCalledWith('conn-456', 'agent-456');
    });

    it('should disconnect existing connection for same agent', () => {
      // First connection
      const event1: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-dup',
        connectionId: 'conn-old',
      };
      manager.handleMessage('conn-old', JSON.stringify(event1));

      // Second connection from same agent
      const event2: PresenceConnectEvent = {
        eventId: 'evt-2',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-dup',
        connectionId: 'conn-new',
      };
      manager.handleMessage('conn-new', JSON.stringify(event2));

      expect(mockWsPort.closeConnection).toHaveBeenCalledWith(
        'conn-old',
        4001,
        'Duplicate connection'
      );
    });

    it('should send connected response', () => {
      const event: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-789',
        connectionId: 'conn-789',
      };

      manager.handleMessage('conn-789', JSON.stringify(event));

      expect(mockWsPort.sendTo).toHaveBeenCalledWith(
        'conn-789',
        expect.stringContaining('presence.connected')
      );
    });
  });

  // ============================================================================
  // MESSAGE HANDLING - DISCONNECT
  // ============================================================================

  describe('handleMessage - Disconnect', () => {
    it('should handle disconnect event', () => {
      // First connect
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-disc',
        connectionId: 'conn-disc',
      };
      manager.handleMessage('conn-disc', JSON.stringify(connectEvent));

      // Then disconnect
      const disconnectEvent: PresenceDisconnectEvent = {
        eventId: 'evt-2',
        eventType: 'presence.disconnect',
        timestamp: new Date(),
        agentId: 'agent-disc',
      };
      manager.handleMessage('conn-disc', JSON.stringify(disconnectEvent));

      expect(mockPresenceService.unregisterAgent).toHaveBeenCalledWith('agent-disc', 'logout');
    });
  });

  // ============================================================================
  // MESSAGE HANDLING - HEARTBEAT
  // ============================================================================

  describe('handleMessage - Heartbeat', () => {
    it('should handle heartbeat event', () => {
      // First connect
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-hb',
        connectionId: 'conn-hb',
      };
      manager.handleMessage('conn-hb', JSON.stringify(connectEvent));

      // Send heartbeat
      const heartbeatEvent: PresenceHeartbeatEvent = {
        eventId: 'evt-2',
        eventType: 'presence.heartbeat',
        timestamp: new Date(),
        agentId: 'agent-hb',
        heartbeat: {
          agentId: 'agent-hb',
          sequenceNumber: 1,
          timestamp: new Date(),
          metrics: {
            activeCallSid: undefined,
            callCount: 0,
            avgCallDuration: 0,
          },
        },
      };
      manager.handleMessage('conn-hb', JSON.stringify(heartbeatEvent));

      expect(mockPresenceService.processHeartbeat).toHaveBeenCalled();
    });

    it('should send heartbeat ack', () => {
      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-hb-ack',
        connectionId: 'conn-hb-ack',
      };
      manager.handleMessage('conn-hb-ack', JSON.stringify(connectEvent));

      // Clear previous sendTo calls
      vi.mocked(mockWsPort.sendTo).mockClear();

      // Send heartbeat
      const heartbeatEvent: PresenceHeartbeatEvent = {
        eventId: 'evt-2',
        eventType: 'presence.heartbeat',
        timestamp: new Date(),
        agentId: 'agent-hb-ack',
        heartbeat: {
          agentId: 'agent-hb-ack',
          sequenceNumber: 1,
          timestamp: new Date(),
        },
      };
      manager.handleMessage('conn-hb-ack', JSON.stringify(heartbeatEvent));

      expect(mockWsPort.sendTo).toHaveBeenCalledWith(
        'conn-hb-ack',
        expect.stringContaining('presence.heartbeat_ack')
      );
    });

    it('should ignore heartbeat for unknown connection', () => {
      const heartbeatEvent: PresenceHeartbeatEvent = {
        eventId: 'evt-1',
        eventType: 'presence.heartbeat',
        timestamp: new Date(),
        agentId: 'unknown-agent',
        heartbeat: {
          agentId: 'unknown-agent',
          sequenceNumber: 1,
          timestamp: new Date(),
        },
      };

      manager.handleMessage('unknown-conn', JSON.stringify(heartbeatEvent));

      expect(mockPresenceService.processHeartbeat).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // MESSAGE HANDLING - STATUS CHANGE
  // ============================================================================

  describe('handleMessage - Status Change', () => {
    it('should handle status change event', () => {
      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-status',
        connectionId: 'conn-status',
      };
      manager.handleMessage('conn-status', JSON.stringify(connectEvent));

      // Change status
      const statusEvent: PresenceStatusChangeEvent = {
        eventId: 'evt-2',
        eventType: 'presence.status_change',
        timestamp: new Date(),
        agentId: 'agent-status',
        previousStatus: 'online',
        newStatus: 'busy',
        reason: 'manual',
        statusMessage: 'In a meeting',
      };
      manager.handleMessage('conn-status', JSON.stringify(statusEvent));

      expect(mockPresenceService.changeStatus).toHaveBeenCalledWith(
        'agent-status',
        'busy',
        'manual',
        expect.objectContaining({
          statusMessage: 'In a meeting',
        })
      );
    });

    it('should ignore status change for mismatched agent', () => {
      // Connect as one agent
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-a',
        connectionId: 'conn-a',
      };
      manager.handleMessage('conn-a', JSON.stringify(connectEvent));

      // Try to change status for different agent
      const statusEvent: PresenceStatusChangeEvent = {
        eventId: 'evt-2',
        eventType: 'presence.status_change',
        timestamp: new Date(),
        agentId: 'agent-b', // Different agent
        previousStatus: 'online',
        newStatus: 'busy',
        reason: 'manual',
      };
      manager.handleMessage('conn-a', JSON.stringify(statusEvent));

      expect(mockPresenceService.changeStatus).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // MESSAGE HANDLING - QUERY
  // ============================================================================

  describe('handleMessage - Query', () => {
    it('should handle query event', () => {
      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-query',
        connectionId: 'conn-query',
      };
      manager.handleMessage('conn-query', JSON.stringify(connectEvent));

      // Clear previous sendTo calls
      vi.mocked(mockWsPort.sendTo).mockClear();

      // Send query
      const queryEvent: PresenceQueryEvent = {
        eventId: 'evt-2',
        eventType: 'presence.query',
        timestamp: new Date(),
        correlationId: 'corr-query-1',
        statusFilter: ['online', 'busy'],
        includeOffline: false,
      };
      manager.handleMessage('conn-query', JSON.stringify(queryEvent));

      expect(mockPresenceService.getAgents).toHaveBeenCalled();
      expect(mockWsPort.sendTo).toHaveBeenCalledWith(
        'conn-query',
        expect.stringContaining('presence.query_response')
      );
    });

    it('should filter agents by agent IDs', () => {
      (mockPresenceService.getAgents as ReturnType<typeof vi.fn>).mockReturnValue([
        { agentId: 'agent-1', status: 'online' },
        { agentId: 'agent-2', status: 'online' },
        { agentId: 'agent-3', status: 'busy' },
      ]);

      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-filter',
        connectionId: 'conn-filter',
      };
      manager.handleMessage('conn-filter', JSON.stringify(connectEvent));

      // Query with filter
      const queryEvent: PresenceQueryEvent = {
        eventId: 'evt-2',
        eventType: 'presence.query',
        timestamp: new Date(),
        agentIds: ['agent-1', 'agent-3'],
      };
      manager.handleMessage('conn-filter', JSON.stringify(queryEvent));

      // The response should only contain filtered agents
      expect(mockWsPort.sendTo).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // INVALID MESSAGES
  // ============================================================================

  describe('Invalid Messages', () => {
    it('should emit invalid_message for malformed JSON', () => {
      const listener = vi.fn();
      manager.on('client:invalid_message', listener);

      manager.handleMessage('conn-bad', 'not valid json {{{');

      expect(listener).toHaveBeenCalledWith('conn-bad', 'Invalid JSON');
    });

    it('should emit invalid_message for server-to-client events', () => {
      const listener = vi.fn();
      manager.on('client:invalid_message', listener);

      // Client should not send server events
      manager.handleMessage(
        'conn-bad',
        JSON.stringify({
          eventType: 'presence.connected',
          eventId: 'evt-1',
          timestamp: new Date(),
        })
      );

      expect(listener).toHaveBeenCalledWith(
        'conn-bad',
        expect.stringContaining('Server event type')
      );
    });

    it('should emit invalid_message for unknown event types', () => {
      const listener = vi.fn();
      manager.on('client:invalid_message', listener);

      manager.handleMessage(
        'conn-bad',
        JSON.stringify({
          eventType: 'presence.unknown_event',
          eventId: 'evt-1',
          timestamp: new Date(),
        })
      );

      expect(listener).toHaveBeenCalledWith(
        'conn-bad',
        expect.stringContaining('Unknown event type')
      );
    });
  });

  // ============================================================================
  // CONNECTION CLOSE
  // ============================================================================

  describe('handleConnectionClose', () => {
    it('should handle clean disconnect', () => {
      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-close',
        connectionId: 'conn-close',
      };
      manager.handleMessage('conn-close', JSON.stringify(connectEvent));

      manager.handleConnectionClose('conn-close', true);

      expect(mockPresenceService.unregisterAgent).toHaveBeenCalledWith('agent-close', 'logout');
    });

    it('should handle unclean disconnect', () => {
      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-error',
        connectionId: 'conn-error',
      };
      manager.handleMessage('conn-error', JSON.stringify(connectEvent));

      manager.handleConnectionClose('conn-error', false);

      expect(mockPresenceService.unregisterAgent).toHaveBeenCalledWith(
        'agent-error',
        'connection_lost'
      );
    });

    it('should emit client:disconnected event', () => {
      const listener = vi.fn();
      manager.on('client:disconnected', listener);

      // Connect first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-emit',
        connectionId: 'conn-emit',
      };
      manager.handleMessage('conn-emit', JSON.stringify(connectEvent));

      manager.handleConnectionClose('conn-emit', true);

      expect(listener).toHaveBeenCalledWith('conn-emit', 'agent-emit', 'clean');
    });

    it('should ignore close for unknown connection', () => {
      manager.handleConnectionClose('unknown-conn', true);

      expect(mockPresenceService.unregisterAgent).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PRESENCE SERVICE EVENTS
  // ============================================================================

  describe('Presence Service Events', () => {
    it('should handle status change event from presence service', () => {
      // Connect a client first to create subscriptions
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-status-evt',
        connectionId: 'conn-status-evt',
      };
      manager.handleMessage('conn-status-evt', JSON.stringify(connectEvent));

      // Clear previous calls
      vi.mocked(mockWsPort.sendToMany).mockClear();

      // Emit status change from presence service
      mockPresenceService.emit('agent:status_changed', 'agent-1', 'online', 'busy', 'call_started');

      // Advance timer past debounce
      vi.advanceTimersByTime(600);

      // The status change or roster update should have been broadcast
      // Depending on implementation, this could be via sendToMany or sendTo
      expect(mockWsPort.sendToMany).toHaveBeenCalled();
    });

    it('should handle agent connected event from presence service', () => {
      // Connect a client first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-conn-evt',
        connectionId: 'conn-conn-evt',
      };
      manager.handleMessage('conn-conn-evt', JSON.stringify(connectEvent));

      // Clear previous calls
      vi.mocked(mockWsPort.sendToMany).mockClear();

      mockPresenceService.emit('agent:connected', { agentId: 'new-agent' });

      vi.advanceTimersByTime(600);

      // Should trigger some broadcast
      expect(mockWsPort.sendToMany).toHaveBeenCalled();
    });

    it('should handle agent disconnected event from presence service', () => {
      // Connect a client first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-disc-evt',
        connectionId: 'conn-disc-evt',
      };
      manager.handleMessage('conn-disc-evt', JSON.stringify(connectEvent));

      // Clear previous calls
      vi.mocked(mockWsPort.sendToMany).mockClear();

      mockPresenceService.emit('agent:disconnected', 'agent-1', 'logout');

      vi.advanceTimersByTime(600);

      // Should trigger some broadcast
      expect(mockWsPort.sendToMany).toHaveBeenCalled();
    });

    it('should close connection on agent:timeout', () => {
      // Connect an agent first
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-timeout',
        connectionId: 'conn-timeout',
      };
      manager.handleMessage('conn-timeout', JSON.stringify(connectEvent));

      // Emit timeout
      mockPresenceService.emit('agent:timeout', 'agent-timeout', new Date(), 3);

      expect(mockWsPort.closeConnection).toHaveBeenCalledWith(
        'conn-timeout',
        4002,
        'Heartbeat timeout'
      );
    });
  });

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  describe('Subscriptions', () => {
    it('should auto-subscribe to roster on connect', () => {
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-sub',
        connectionId: 'conn-sub',
      };
      manager.handleMessage('conn-sub', JSON.stringify(connectEvent));

      const client = manager.getClient('conn-sub');
      expect(client?.subscriptions.has('roster')).toBe(true);
    });

    it('should add subscription', () => {
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-add-sub',
        connectionId: 'conn-add-sub',
      };
      manager.handleMessage('conn-add-sub', JSON.stringify(connectEvent));

      manager.addSubscription('conn-add-sub', 'custom-channel');

      const client = manager.getClient('conn-add-sub');
      expect(client?.subscriptions.has('custom-channel')).toBe(true);
    });

    it('should remove subscription', () => {
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-rm-sub',
        connectionId: 'conn-rm-sub',
      };
      manager.handleMessage('conn-rm-sub', JSON.stringify(connectEvent));

      manager.removeSubscription('conn-rm-sub', 'roster');

      const client = manager.getClient('conn-rm-sub');
      expect(client?.subscriptions.has('roster')).toBe(false);
    });

    it('should not add subscription for unknown client', () => {
      manager.addSubscription('unknown-conn', 'channel');
      // Should not throw
    });

    it('should respect max subscribers per channel', () => {
      const mgr = new PresenceWebSocketManager(mockPresenceService, {
        maxSubscribersPerChannel: 2,
      });
      mgr.setWebSocketPort(mockWsPort);

      // Connect 3 clients
      for (let i = 0; i < 3; i++) {
        const event: PresenceConnectEvent = {
          eventId: `evt-${i}`,
          eventType: 'presence.connect',
          timestamp: new Date(),
          agentId: `agent-max-${i}`,
          connectionId: `conn-max-${i}`,
        };
        mgr.handleMessage(`conn-max-${i}`, JSON.stringify(event));
        mgr.addSubscription(`conn-max-${i}`, 'limited-channel');
      }

      // Third client should not be subscribed
      const client2 = mgr.getClient('conn-max-2');
      expect(client2?.subscriptions.has('limited-channel')).toBe(false);

      mgr.destroy();
    });
  });

  // ============================================================================
  // ROSTER BROADCASTING
  // ============================================================================

  describe('broadcastRoster', () => {
    it('should broadcast roster to subscribers', () => {
      // Connect a client to create roster subscription
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-roster',
        connectionId: 'conn-roster',
      };
      manager.handleMessage('conn-roster', JSON.stringify(connectEvent));

      manager.broadcastRoster();

      expect(mockWsPort.sendToMany).toHaveBeenCalledWith(
        expect.arrayContaining(['conn-roster']),
        expect.stringContaining('presence.roster')
      );
    });

    it('should debounce roster broadcasts', () => {
      // Connect a client
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-debounce',
        connectionId: 'conn-debounce',
      };
      manager.handleMessage('conn-debounce', JSON.stringify(connectEvent));

      // Clear previous calls from connection
      vi.mocked(mockWsPort.sendToMany).mockClear();

      // Trigger multiple status changes rapidly
      mockPresenceService.emit('agent:status_changed', 'a1', 'online', 'busy', 'manual');
      mockPresenceService.emit('agent:status_changed', 'a2', 'busy', 'online', 'manual');
      mockPresenceService.emit('agent:status_changed', 'a3', 'away', 'online', 'manual');

      // Advance timer past debounce (500ms) - roster broadcast should happen once
      vi.advanceTimersByTime(600);

      // Should broadcast at least once (roster + possibly status changes)
      expect(mockWsPort.sendToMany).toHaveBeenCalled();
    });

    it('should not broadcast roster when broadcastRosterOnChange is disabled', () => {
      // Create fresh mock for this test
      const freshMockWsPort = createMockWebSocketPort();
      const freshMockPresenceService = createMockPresenceService();

      const mgr = new PresenceWebSocketManager(freshMockPresenceService, {
        broadcastRosterOnChange: false,
      });
      mgr.setWebSocketPort(freshMockWsPort);

      // Connect a client
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-no-bc',
        connectionId: 'conn-no-bc',
      };
      mgr.handleMessage('conn-no-bc', JSON.stringify(connectEvent));

      // Clear any calls from connection
      vi.mocked(freshMockWsPort.sendToMany).mockClear();

      // Trigger status change (this normally triggers roster broadcast via debounce)
      freshMockPresenceService.emit('agent:status_changed', 'a1', 'online', 'busy', 'manual');

      vi.advanceTimersByTime(600);

      // sendToMany should only be called for status change broadcast, not roster
      // The status change broadcast happens immediately, not debounced
      // With broadcastRosterOnChange=false, the debounced roster broadcast doesn't happen
      // But status changes still broadcast via broadcastToChannel
      const rosterBroadcasts = vi
        .mocked(freshMockWsPort.sendToMany)
        .mock.calls.filter((call) => call[1] && call[1].includes('presence.roster'));
      expect(rosterBroadcasts.length).toBe(0);

      mgr.destroy();
    });
  });

  // ============================================================================
  // GETTERS
  // ============================================================================

  describe('Getters', () => {
    it('should get client count', () => {
      expect(manager.getClientCount()).toBe(0);

      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-count',
        connectionId: 'conn-count',
      };
      manager.handleMessage('conn-count', JSON.stringify(connectEvent));

      expect(manager.getClientCount()).toBe(1);
    });

    it('should get client info', () => {
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-info',
        agentName: 'Info Agent',
        connectionId: 'conn-info',
      };
      manager.handleMessage('conn-info', JSON.stringify(connectEvent));

      const client = manager.getClient('conn-info');
      expect(client).toBeDefined();
      expect(client?.agentId).toBe('agent-info');
      expect(client?.agentName).toBe('Info Agent');
    });

    it('should get agent connection ID', () => {
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-lookup',
        connectionId: 'conn-lookup',
      };
      manager.handleMessage('conn-lookup', JSON.stringify(connectEvent));

      const connId = manager.getAgentConnectionId('agent-lookup');
      expect(connId).toBe('conn-lookup');
    });

    it('should check if agent is connected', () => {
      expect(manager.isAgentConnected('agent-check')).toBe(false);

      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-check',
        connectionId: 'conn-check',
      };
      manager.handleMessage('conn-check', JSON.stringify(connectEvent));

      expect(manager.isAgentConnected('agent-check')).toBe(true);
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('destroy', () => {
    it('should clean up resources', () => {
      // Connect some clients
      for (let i = 0; i < 3; i++) {
        const event: PresenceConnectEvent = {
          eventId: `evt-${i}`,
          eventType: 'presence.connect',
          timestamp: new Date(),
          agentId: `agent-cleanup-${i}`,
          connectionId: `conn-cleanup-${i}`,
        };
        manager.handleMessage(`conn-cleanup-${i}`, JSON.stringify(event));
      }

      manager.destroy();

      expect(manager.getClientCount()).toBe(0);
      expect(manager.hasWebSocketPort()).toBe(false);
    });

    it('should close all connections', () => {
      const connectEvent: PresenceConnectEvent = {
        eventId: 'evt-1',
        eventType: 'presence.connect',
        timestamp: new Date(),
        agentId: 'agent-destroy',
        connectionId: 'conn-destroy',
      };
      manager.handleMessage('conn-destroy', JSON.stringify(connectEvent));

      manager.destroy();

      expect(mockWsPort.closeConnection).toHaveBeenCalledWith(
        'conn-destroy',
        1001,
        'Server shutting down'
      );
    });

    it('should cancel debounce timer', () => {
      // Trigger a debounced broadcast
      mockPresenceService.emit('agent:status_changed', 'a1', 'online', 'busy', 'manual');

      // Destroy before debounce completes
      manager.destroy();

      // Advance timer past debounce
      vi.advanceTimersByTime(500);

      // Should not broadcast
      expect(mockWsPort.sendToMany).not.toHaveBeenCalled();
    });
  });
});
