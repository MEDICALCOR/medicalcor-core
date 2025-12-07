/**
 * Presence WebSocket Manager
 * M2 Milestone: WebSocket-based Agent Presence
 *
 * Domain-level manager for WebSocket presence communication.
 * Handles event broadcasting, client subscriptions, and message routing.
 * Infrastructure layer provides the actual WebSocket implementation via ports.
 *
 * @module domain/voice/presence-websocket-manager
 */
import { EventEmitter } from 'events';

import type {
  AgentPresence,
  HeartbeatAck,
  PresenceEvent,
  PresenceConnectEvent,
  PresenceConnectedEvent,
  PresenceDisconnectEvent,
  PresenceDisconnectedEvent,
  PresenceStatusChangeEvent,
  PresenceHeartbeatEvent,
  PresenceHeartbeatAckEvent,
  PresenceQueryEvent,
  PresenceQueryResponseEvent,
  PresenceRosterEvent,
  AgentPresenceStatus,
  PresenceChangeReason,
} from '@medicalcor/types';

import type { AgentPresenceService } from './agent-presence-service.js';

// =============================================================================
// PORT INTERFACES
// =============================================================================

/**
 * WebSocket connection abstraction
 */
export interface IWebSocketConnection {
  /** Unique connection ID */
  id: string;

  /** Send a message to this connection */
  send(data: string): void;

  /** Close the connection */
  close(code?: number, reason?: string): void;

  /** Check if connection is open */
  isOpen(): boolean;
}

/**
 * WebSocket server port for infrastructure injection
 */
export interface IPresenceWebSocketPort {
  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: string): void;

  /**
   * Send a message to a specific connection
   */
  sendTo(connectionId: string, message: string): void;

  /**
   * Send a message to multiple connections
   */
  sendToMany(connectionIds: string[], message: string): void;

  /**
   * Get all active connection IDs
   */
  getConnectionIds(): string[];

  /**
   * Check if a connection exists and is open
   */
  hasConnection(connectionId: string): boolean;

  /**
   * Close a specific connection
   */
  closeConnection(connectionId: string, code?: number, reason?: string): void;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * WebSocket manager configuration
 */
export interface PresenceWebSocketManagerConfig {
  /**
   * Enable roster broadcasting on changes
   */
  broadcastRosterOnChange?: boolean;

  /**
   * Debounce roster broadcasts (ms)
   */
  rosterBroadcastDebounceMs?: number;

  /**
   * Maximum subscribers per channel
   */
  maxSubscribersPerChannel?: number;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Events emitted by the WebSocket manager
 */
export interface PresenceWebSocketManagerEvents {
  /** Client connected */
  'client:connected': (connectionId: string, agentId: string) => void;

  /** Client disconnected */
  'client:disconnected': (connectionId: string, agentId: string, reason: string) => void;

  /** Invalid message received */
  'client:invalid_message': (connectionId: string, error: string) => void;

  /** Broadcast sent */
  'broadcast:sent': (eventType: string, recipientCount: number) => void;
}

// =============================================================================
// CLIENT STATE
// =============================================================================

/**
 * Connected client state
 */
interface ConnectedClient {
  connectionId: string;
  agentId: string;
  agentName?: string;
  connectedAt: Date;
  subscriptions: Set<string>; // Channels they're subscribed to
  lastActivity: Date;
}

// =============================================================================
// PRESENCE WEBSOCKET MANAGER
// =============================================================================

/**
 * Manager for WebSocket-based presence communication
 */
export class PresenceWebSocketManager extends EventEmitter {
  private readonly config: Required<PresenceWebSocketManagerConfig>;
  private readonly presenceService: AgentPresenceService;
  private wsPort: IPresenceWebSocketPort | null = null;

  /** Map of connectionId -> client state */
  private readonly clients = new Map<string, ConnectedClient>();

  /** Map of agentId -> connectionId for quick lookups */
  private readonly agentConnections = new Map<string, string>();

  /** Channel subscriptions: channel -> Set<connectionId> */
  private readonly subscriptions = new Map<string, Set<string>>();

  /** Roster broadcast debounce timer */
  private rosterDebounceTimer: NodeJS.Timeout | null = null;

  constructor(presenceService: AgentPresenceService, config: PresenceWebSocketManagerConfig = {}) {
    super();
    this.presenceService = presenceService;
    this.config = {
      broadcastRosterOnChange: config.broadcastRosterOnChange ?? true,
      rosterBroadcastDebounceMs: config.rosterBroadcastDebounceMs ?? 500,
      maxSubscribersPerChannel: config.maxSubscribersPerChannel ?? 1000,
    };

    this.setupPresenceServiceListeners();
  }

  // ===========================================================================
  // PORT INJECTION
  // ===========================================================================

  /**
   * Inject the WebSocket port (infrastructure adapter)
   */
  setWebSocketPort(port: IPresenceWebSocketPort): void {
    this.wsPort = port;
  }

  /**
   * Check if WebSocket port is available
   */
  hasWebSocketPort(): boolean {
    return this.wsPort !== null;
  }

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(connectionId: string, message: string): void {
    let event: PresenceEvent;

    try {
      event = JSON.parse(message) as PresenceEvent;
    } catch {
      this.emit('client:invalid_message', connectionId, 'Invalid JSON');
      return;
    }

    // Validate event structure (eventType is required but may be missing in malformed messages)
    const eventType = event.eventType;

    switch (eventType) {
      case 'presence.connect':
        this.handleConnect(connectionId, event);
        break;

      case 'presence.disconnect':
        this.handleDisconnect(connectionId, event);
        break;

      case 'presence.heartbeat':
        this.handleHeartbeat(connectionId, event);
        break;

      case 'presence.status_change':
        this.handleStatusChange(connectionId, event);
        break;

      case 'presence.query':
        this.handleQuery(connectionId, event);
        break;

      // Server-to-client events - should not be received from clients
      case 'presence.connected':
      case 'presence.disconnected':
      case 'presence.heartbeat_ack':
      case 'presence.query_response':
      case 'presence.bulk_update':
      case 'presence.roster':
        this.emit(
          'client:invalid_message',
          connectionId,
          `Server event type received from client: ${eventType}`
        );
        break;

      default:
        // Handle unknown event types (cast needed for exhaustiveness)
        this.emit(
          'client:invalid_message',
          connectionId,
          `Unknown event type: ${eventType as string}`
        );
        break;
    }
  }

  /**
   * Handle connection close
   */
  handleConnectionClose(connectionId: string, wasClean: boolean): void {
    const client = this.clients.get(connectionId);
    if (!client) return;

    // Unregister from presence service
    this.presenceService.unregisterAgent(client.agentId, wasClean ? 'logout' : 'connection_lost');

    // Clean up subscriptions
    for (const channel of client.subscriptions) {
      this.subscriptions.get(channel)?.delete(connectionId);
    }

    // Clean up mappings
    this.agentConnections.delete(client.agentId);
    this.clients.delete(connectionId);

    // Send disconnected event
    this.sendDisconnectedEvent(
      connectionId,
      client.agentId,
      wasClean ? 'logout' : 'connection_lost',
      wasClean
    );

    this.emit('client:disconnected', connectionId, client.agentId, wasClean ? 'clean' : 'error');
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  /**
   * Handle connect event
   */
  private handleConnect(connectionId: string, event: PresenceConnectEvent): void {
    // Check if agent already connected from another connection
    const existingConnectionId = this.agentConnections.get(event.agentId);
    if (existingConnectionId && existingConnectionId !== connectionId) {
      // Disconnect old connection
      this.handleConnectionClose(existingConnectionId, false);
      this.wsPort?.closeConnection(existingConnectionId, 4001, 'Duplicate connection');
    }

    // Register with presence service
    const presence = this.presenceService.registerAgent({
      agentId: event.agentId,
      agentName: event.agentName,
      connectionId,
      deviceId: event.deviceId,
      clientType: event.clientType,
      requestedStatus: event.requestedStatus,
    });

    // Track client
    const client: ConnectedClient = {
      connectionId,
      agentId: event.agentId,
      agentName: event.agentName,
      connectedAt: new Date(),
      subscriptions: new Set(['roster']), // Auto-subscribe to roster
      lastActivity: new Date(),
    };

    this.clients.set(connectionId, client);
    this.agentConnections.set(event.agentId, connectionId);

    // Add to roster subscription
    this.addSubscription(connectionId, 'roster');

    // Send connected response
    this.sendConnectedEvent(connectionId, presence);

    this.emit('client:connected', connectionId, event.agentId);
  }

  /**
   * Handle disconnect event
   */
  private handleDisconnect(connectionId: string, _event: PresenceDisconnectEvent): void {
    this.handleConnectionClose(connectionId, true);
  }

  /**
   * Handle heartbeat event
   */
  private handleHeartbeat(connectionId: string, event: PresenceHeartbeatEvent): void {
    const client = this.clients.get(connectionId);
    if (!client) return;

    client.lastActivity = new Date();

    const ack = this.presenceService.processHeartbeat(event.heartbeat);
    if (ack) {
      this.sendHeartbeatAck(connectionId, client.agentId, ack);
    }
  }

  /**
   * Handle status change request
   */
  private handleStatusChange(connectionId: string, event: PresenceStatusChangeEvent): void {
    const client = this.clients.get(connectionId);
    if (!client || client.agentId !== event.agentId) return;

    client.lastActivity = new Date();

    this.presenceService.changeStatus(event.agentId, event.newStatus, event.reason, {
      statusMessage: event.statusMessage,
      activeCallSid: event.activeCallSid,
      activeTaskId: event.activeTaskId,
    });
  }

  /**
   * Handle query request
   */
  private handleQuery(connectionId: string, event: PresenceQueryEvent): void {
    const client = this.clients.get(connectionId);
    if (!client) return;

    client.lastActivity = new Date();

    const agents = this.presenceService.getAgents({
      status: event.statusFilter,
      queueSid: event.queueSid,
      includeOffline: event.includeOffline,
    });

    // Filter by specific agent IDs if provided
    const agentIdsFilter = event.agentIds;
    const filteredAgents = agentIdsFilter
      ? agents.filter((a) => agentIdsFilter.includes(a.agentId))
      : agents;

    this.sendQueryResponse(connectionId, event.correlationId, filteredAgents);
  }

  // ===========================================================================
  // PRESENCE SERVICE LISTENERS
  // ===========================================================================

  /**
   * Set up listeners for presence service events
   */
  private setupPresenceServiceListeners(): void {
    this.presenceService.on('agent:status_changed', this.onAgentStatusChanged.bind(this));
    this.presenceService.on('agent:connected', this.onAgentConnected.bind(this));
    this.presenceService.on('agent:disconnected', this.onAgentDisconnected.bind(this));
    this.presenceService.on('agent:timeout', this.onAgentTimeout.bind(this));
  }

  /**
   * Handle agent status change from service
   */
  private onAgentStatusChanged(
    agentId: string,
    previousStatus: AgentPresenceStatus,
    newStatus: AgentPresenceStatus,
    reason: PresenceChangeReason
  ): void {
    this.broadcastStatusChange(agentId, previousStatus, newStatus, reason);
    this.scheduleRosterBroadcast();
  }

  /**
   * Handle agent connected from service
   */
  private onAgentConnected(_agent: AgentPresence): void {
    this.scheduleRosterBroadcast();
  }

  /**
   * Handle agent disconnected from service
   */
  private onAgentDisconnected(_agentId: string, _reason: PresenceChangeReason): void {
    this.scheduleRosterBroadcast();
  }

  /**
   * Handle agent timeout from service
   */
  private onAgentTimeout(agentId: string, _lastHeartbeat: Date, _missedCount: number): void {
    const connectionId = this.agentConnections.get(agentId);
    if (connectionId) {
      this.wsPort?.closeConnection(connectionId, 4002, 'Heartbeat timeout');
    }
  }

  // ===========================================================================
  // SENDING MESSAGES
  // ===========================================================================

  /**
   * Send connected event to client
   */
  private sendConnectedEvent(connectionId: string, presence: AgentPresence): void {
    const event: PresenceConnectedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'presence.connected',
      timestamp: new Date(),
      agentId: presence.agentId,
      connectionId,
      status: presence.status,
      heartbeatConfig: this.presenceService.getHeartbeatConfig(),
      serverTime: new Date(),
    };

    this.sendToClient(connectionId, event);
  }

  /**
   * Send disconnected event
   */
  private sendDisconnectedEvent(
    connectionId: string,
    agentId: string,
    reason: PresenceChangeReason,
    wasClean: boolean
  ): void {
    const event: PresenceDisconnectedEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'presence.disconnected',
      timestamp: new Date(),
      agentId,
      connectionId,
      reason,
      wasClean,
    };

    // Broadcast to roster subscribers
    this.broadcastToChannel('roster', event);
  }

  /**
   * Send heartbeat acknowledgment
   */
  private sendHeartbeatAck(connectionId: string, agentId: string, ack: HeartbeatAck): void {
    const event: PresenceHeartbeatAckEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'presence.heartbeat_ack',
      timestamp: new Date(),
      agentId,
      ack,
    };

    this.sendToClient(connectionId, event);
  }

  /**
   * Send query response
   */
  private sendQueryResponse(
    connectionId: string,
    correlationId: string | undefined,
    agents: AgentPresence[]
  ): void {
    const event: PresenceQueryResponseEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'presence.query_response',
      timestamp: new Date(),
      correlationId,
      agents,
      totalCount: agents.length,
    };

    this.sendToClient(connectionId, event);
  }

  /**
   * Broadcast status change to all roster subscribers
   */
  private broadcastStatusChange(
    agentId: string,
    previousStatus: AgentPresenceStatus,
    newStatus: AgentPresenceStatus,
    reason: PresenceChangeReason
  ): void {
    const event: PresenceStatusChangeEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'presence.status_change',
      timestamp: new Date(),
      agentId,
      previousStatus,
      newStatus,
      reason,
    };

    this.broadcastToChannel('roster', event);
  }

  /**
   * Broadcast roster update (debounced)
   */
  private scheduleRosterBroadcast(): void {
    if (!this.config.broadcastRosterOnChange) return;

    if (this.rosterDebounceTimer) {
      clearTimeout(this.rosterDebounceTimer);
    }

    this.rosterDebounceTimer = setTimeout(() => {
      this.broadcastRoster();
      this.rosterDebounceTimer = null;
    }, this.config.rosterBroadcastDebounceMs);
  }

  /**
   * Broadcast full roster to all subscribers
   */
  broadcastRoster(): void {
    const agents = this.presenceService.getAgents({ includeOffline: false });
    const summary = this.presenceService.getTeamSummary();

    const event: PresenceRosterEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'presence.roster',
      timestamp: new Date(),
      agents,
      summary: {
        online: summary.byStatus.online,
        offline: summary.byStatus.offline,
        busy: summary.byStatus.busy,
        away: summary.byStatus.away,
        dnd: summary.byStatus.dnd,
        total: summary.totalAgents,
      },
    };

    this.broadcastToChannel('roster', event);
  }

  // ===========================================================================
  // SUBSCRIPTIONS
  // ===========================================================================

  /**
   * Add a subscription for a client
   */
  addSubscription(connectionId: string, channel: string): void {
    const client = this.clients.get(connectionId);
    if (!client) return;

    let subscribers = this.subscriptions.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.subscriptions.set(channel, subscribers);
    }

    if (subscribers.size >= this.config.maxSubscribersPerChannel) {
      return; // Don't add if at capacity
    }

    subscribers.add(connectionId);
    client.subscriptions.add(channel);
  }

  /**
   * Remove a subscription for a client
   */
  removeSubscription(connectionId: string, channel: string): void {
    const client = this.clients.get(connectionId);
    if (client) {
      client.subscriptions.delete(channel);
    }

    this.subscriptions.get(channel)?.delete(connectionId);
  }

  // ===========================================================================
  // LOW-LEVEL SENDING
  // ===========================================================================

  /**
   * Send event to a specific client
   */
  private sendToClient(connectionId: string, event: PresenceEvent): void {
    if (!this.wsPort?.hasConnection(connectionId)) return;

    try {
      this.wsPort.sendTo(connectionId, JSON.stringify(event));
    } catch {
      // Connection may have closed
    }
  }

  /**
   * Broadcast event to a channel
   */
  private broadcastToChannel(channel: string, event: PresenceEvent): void {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify(event);
    const connectionIds = Array.from(subscribers);

    if (this.wsPort) {
      this.wsPort.sendToMany(connectionIds, message);
      this.emit('broadcast:sent', event.eventType, connectionIds.length);
    }
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client info
   */
  getClient(connectionId: string): ConnectedClient | undefined {
    return this.clients.get(connectionId);
  }

  /**
   * Get connection ID for an agent
   */
  getAgentConnectionId(agentId: string): string | undefined {
    return this.agentConnections.get(agentId);
  }

  /**
   * Check if an agent is connected
   */
  isAgentConnected(agentId: string): boolean {
    const connectionId = this.agentConnections.get(agentId);
    return connectionId ? (this.wsPort?.hasConnection(connectionId) ?? false) : false;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Clean up resources
   */
  destroy(): void {
    // Cancel debounce timer
    if (this.rosterDebounceTimer) {
      clearTimeout(this.rosterDebounceTimer);
      this.rosterDebounceTimer = null;
    }

    // Close all connections
    for (const connectionId of this.clients.keys()) {
      this.wsPort?.closeConnection(connectionId, 1001, 'Server shutting down');
    }

    // Clear state
    this.clients.clear();
    this.agentConnections.clear();
    this.subscriptions.clear();

    // Remove listeners
    this.removeAllListeners();

    this.wsPort = null;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new WebSocket presence manager
 */
export function createPresenceWebSocketManager(
  presenceService: AgentPresenceService,
  config?: PresenceWebSocketManagerConfig
): PresenceWebSocketManager {
  return new PresenceWebSocketManager(presenceService, config);
}
