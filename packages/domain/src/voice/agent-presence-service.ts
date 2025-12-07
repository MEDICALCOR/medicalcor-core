/**
 * Agent Presence Service
 * M2 Milestone: WebSocket-based Agent Presence
 *
 * Provides domain logic for real-time agent presence tracking including:
 * - Online/offline/busy status management
 * - Heartbeat processing and timeout detection
 * - Status transition validation
 * - Presence metrics calculation
 *
 * @module domain/voice/agent-presence-service
 */
import { EventEmitter } from 'events';

import type {
  AgentPresence,
  AgentPresenceStatus,
  AgentPresenceMetrics,
  HeartbeatConfig,
  HeartbeatMessage,
  HeartbeatAck,
  PresenceChangeReason,
  TeamPresenceSummary,
} from '@medicalcor/types';
import {
  AgentPresenceSchema,
  AgentPresenceMetricsSchema,
  HeartbeatAckSchema,
  TeamPresenceSummarySchema,
} from '@medicalcor/types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Agent presence service configuration
 */
export interface AgentPresenceServiceConfig {
  /**
   * Heartbeat configuration
   */
  heartbeat?: Partial<HeartbeatConfig>;

  /**
   * Maximum number of agents to track
   */
  maxAgents?: number;

  /**
   * Enable automatic status transitions (e.g., busy when call starts)
   */
  autoStatusTransitions?: boolean;

  /**
   * Allowed status transitions (for validation)
   */
  allowedTransitions?: Record<AgentPresenceStatus, AgentPresenceStatus[]>;
}

/**
 * Fully resolved configuration
 */
interface ResolvedConfig {
  heartbeat: HeartbeatConfig;
  maxAgents: number;
  autoStatusTransitions: boolean;
  allowedTransitions: Record<AgentPresenceStatus, AgentPresenceStatus[]>;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 15000, // 15 seconds
  missedThreshold: 3, // 3 missed = 45 seconds
  gracePeriodMs: 5000, // 5 second grace period
};

/**
 * Default allowed status transitions
 * Defines valid state machine transitions
 */
const DEFAULT_TRANSITIONS: Record<AgentPresenceStatus, AgentPresenceStatus[]> = {
  online: ['busy', 'away', 'dnd', 'offline'],
  offline: ['online'],
  busy: ['online', 'away', 'dnd', 'offline'],
  away: ['online', 'busy', 'dnd', 'offline'],
  dnd: ['online', 'away', 'offline'],
};

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Events emitted by the presence service
 */
export interface AgentPresenceServiceEvents {
  /** Agent connected/came online */
  'agent:connected': (agent: AgentPresence) => void;

  /** Agent disconnected/went offline */
  'agent:disconnected': (agentId: string, reason: PresenceChangeReason) => void;

  /** Agent status changed */
  'agent:status_changed': (
    agentId: string,
    previousStatus: AgentPresenceStatus,
    newStatus: AgentPresenceStatus,
    reason: PresenceChangeReason
  ) => void;

  /** Heartbeat received */
  'agent:heartbeat': (agentId: string, timestamp: Date) => void;

  /** Agent timed out (missed heartbeats) */
  'agent:timeout': (agentId: string, lastHeartbeat: Date, missedCount: number) => void;

  /** Team presence summary updated */
  'team:summary_updated': (summary: TeamPresenceSummary) => void;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

/**
 * Internal agent tracking state
 */
interface TrackedAgent {
  presence: AgentPresence;
  heartbeatSequence: number;
  missedHeartbeats: number;
  checkTimer: NodeJS.Timeout | null;
  metrics: {
    onlineStartTime: Date | null;
    busyStartTime: Date | null;
    awayStartTime: Date | null;
    onlineTimeToday: number;
    busyTimeToday: number;
    awayTimeToday: number;
    statusChangesToday: number;
    callsHandledToday: number;
  };
}

// =============================================================================
// AGENT PRESENCE SERVICE
// =============================================================================

/**
 * Domain service for managing agent presence state
 */
export class AgentPresenceService extends EventEmitter {
  private readonly config: ResolvedConfig;
  private readonly agents = new Map<string, TrackedAgent>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: AgentPresenceServiceConfig = {}) {
    super();
    this.config = {
      heartbeat: {
        ...DEFAULT_HEARTBEAT_CONFIG,
        ...config.heartbeat,
      },
      maxAgents: config.maxAgents ?? 500,
      autoStatusTransitions: config.autoStatusTransitions ?? true,
      allowedTransitions: config.allowedTransitions ?? DEFAULT_TRANSITIONS,
    };

    // Start periodic cleanup of stale data
    this.startCleanupTimer();
  }

  // ===========================================================================
  // AGENT LIFECYCLE
  // ===========================================================================

  /**
   * Register a new agent or reconnect an existing one
   */
  registerAgent(params: {
    agentId: string;
    agentName?: string;
    connectionId: string;
    deviceId?: string;
    clientType?: 'web' | 'desktop' | 'mobile' | 'api';
    requestedStatus?: AgentPresenceStatus;
    queueSids?: string[];
    skills?: string[];
  }): AgentPresence {
    const {
      agentId,
      agentName,
      connectionId,
      deviceId,
      clientType,
      requestedStatus = 'online',
      queueSids = [],
      skills = [],
    } = params;

    // Check capacity
    if (this.agents.size >= this.config.maxAgents && !this.agents.has(agentId)) {
      throw new Error(`Maximum agent capacity (${this.config.maxAgents}) reached`);
    }

    const now = new Date();
    const existingAgent = this.agents.get(agentId);
    const previousStatus = existingAgent?.presence.status;

    const presence: AgentPresence = AgentPresenceSchema.parse({
      agentId,
      agentName,
      status: requestedStatus,
      previousStatus,
      statusReason: existingAgent ? 'connection_restored' : 'login',
      connectionId,
      deviceId,
      clientType,
      queueSids,
      skills,
      onlineSince: requestedStatus === 'online' ? now : undefined,
      statusChangedAt: now,
      lastHeartbeat: now,
      sessionStartedAt: now,
    });

    const tracked: TrackedAgent = {
      presence,
      heartbeatSequence: 0,
      missedHeartbeats: 0,
      checkTimer: null,
      metrics: {
        onlineStartTime: requestedStatus === 'online' ? now : null,
        busyStartTime: requestedStatus === 'busy' ? now : null,
        awayStartTime: requestedStatus === 'away' ? now : null,
        onlineTimeToday: existingAgent?.metrics.onlineTimeToday ?? 0,
        busyTimeToday: existingAgent?.metrics.busyTimeToday ?? 0,
        awayTimeToday: existingAgent?.metrics.awayTimeToday ?? 0,
        statusChangesToday: existingAgent?.metrics.statusChangesToday ?? 0,
        callsHandledToday: existingAgent?.metrics.callsHandledToday ?? 0,
      },
    };

    this.agents.set(agentId, tracked);
    this.startHeartbeatCheck(agentId);

    this.emit('agent:connected', presence);

    if (previousStatus && previousStatus !== requestedStatus) {
      this.emit(
        'agent:status_changed',
        agentId,
        previousStatus,
        requestedStatus,
        'connection_restored'
      );
    }

    return presence;
  }

  /**
   * Unregister an agent (disconnect)
   */
  unregisterAgent(agentId: string, reason: PresenceChangeReason = 'logout'): boolean {
    const tracked = this.agents.get(agentId);
    if (!tracked) return false;

    // Save previous status before changing
    const previousStatus = tracked.presence.status;

    // Update metrics before removal
    this.updateStatusMetrics(tracked, 'offline');

    // Stop heartbeat checking
    this.stopHeartbeatCheck(agentId);

    // Update presence to offline (don't delete, keep for metrics)
    tracked.presence.previousStatus = previousStatus;
    tracked.presence.status = 'offline';
    tracked.presence.statusReason = reason;
    tracked.presence.statusChangedAt = new Date();
    tracked.presence.connectionId = undefined;

    this.emit('agent:disconnected', agentId, reason);
    this.emit('agent:status_changed', agentId, previousStatus, 'offline', reason);

    return true;
  }

  /**
   * Get an agent's current presence
   */
  getAgent(agentId: string): AgentPresence | undefined {
    return this.agents.get(agentId)?.presence;
  }

  /**
   * Get all agents (optionally filtered)
   */
  getAgents(filter?: {
    status?: AgentPresenceStatus[];
    queueSid?: string;
    includeOffline?: boolean;
  }): AgentPresence[] {
    let agents = Array.from(this.agents.values()).map((t) => t.presence);

    if (filter) {
      const statusFilter = filter.status;
      if (statusFilter && statusFilter.length > 0) {
        agents = agents.filter((a) => statusFilter.includes(a.status));
      }

      if (!filter.includeOffline) {
        agents = agents.filter((a) => a.status !== 'offline');
      }

      const queueFilter = filter.queueSid;
      if (queueFilter) {
        agents = agents.filter((a) => a.queueSids.includes(queueFilter));
      }
    }

    return agents;
  }

  /**
   * Get agents available for calls
   */
  getAvailableAgents(queueSid?: string): AgentPresence[] {
    return this.getAgents({
      status: ['online'],
      queueSid,
      includeOffline: false,
    });
  }

  // ===========================================================================
  // STATUS MANAGEMENT
  // ===========================================================================

  /**
   * Change an agent's status
   */
  changeStatus(
    agentId: string,
    newStatus: AgentPresenceStatus,
    reason: PresenceChangeReason = 'manual',
    options?: {
      statusMessage?: string;
      activeCallSid?: string;
      activeTaskId?: string;
    }
  ): { success: boolean; error?: string; previousStatus?: AgentPresenceStatus } {
    const tracked = this.agents.get(agentId);
    if (!tracked) {
      return { success: false, error: 'Agent not found' };
    }

    const currentStatus = tracked.presence.status;

    // Don't change if already in this status
    if (currentStatus === newStatus) {
      return { success: true, previousStatus: currentStatus };
    }

    // Validate transition
    if (!this.isValidTransition(currentStatus, newStatus)) {
      return {
        success: false,
        error: `Invalid status transition from ${currentStatus} to ${newStatus}`,
        previousStatus: currentStatus,
      };
    }

    // Update metrics for the time spent in previous status
    this.updateStatusMetrics(tracked, newStatus);

    // Update presence
    const now = new Date();
    tracked.presence.previousStatus = currentStatus;
    tracked.presence.status = newStatus;
    tracked.presence.statusReason = reason;
    tracked.presence.statusChangedAt = now;
    tracked.presence.statusMessage = options?.statusMessage;
    tracked.presence.activeCallSid = options?.activeCallSid;
    tracked.presence.activeTaskId = options?.activeTaskId;

    if (newStatus === 'online' && currentStatus === 'offline') {
      tracked.presence.onlineSince = now;
    }

    tracked.metrics.statusChangesToday++;

    this.emit('agent:status_changed', agentId, currentStatus, newStatus, reason);

    return { success: true, previousStatus: currentStatus };
  }

  /**
   * Set agent to busy (typically called when call starts)
   */
  setAgentBusy(agentId: string, callSid: string): { success: boolean; error?: string } {
    if (!this.config.autoStatusTransitions) {
      return { success: false, error: 'Auto status transitions disabled' };
    }

    return this.changeStatus(agentId, 'busy', 'call_started', { activeCallSid: callSid });
  }

  /**
   * Set agent back to online (typically called when call ends)
   */
  setAgentAvailable(agentId: string): { success: boolean; error?: string } {
    if (!this.config.autoStatusTransitions) {
      return { success: false, error: 'Auto status transitions disabled' };
    }

    const tracked = this.agents.get(agentId);
    if (tracked) {
      tracked.metrics.callsHandledToday++;
    }

    return this.changeStatus(agentId, 'online', 'call_ended', {
      activeCallSid: undefined,
      activeTaskId: undefined,
    });
  }

  /**
   * Check if a status transition is valid
   */
  isValidTransition(from: AgentPresenceStatus, to: AgentPresenceStatus): boolean {
    const allowed = this.config.allowedTransitions[from];
    return allowed.includes(to);
  }

  // ===========================================================================
  // HEARTBEAT MANAGEMENT
  // ===========================================================================

  /**
   * Process a heartbeat from an agent
   */
  processHeartbeat(heartbeat: HeartbeatMessage): HeartbeatAck | null {
    const tracked = this.agents.get(heartbeat.agentId);
    if (!tracked) return null;

    // Verify connection ID matches
    if (tracked.presence.connectionId !== heartbeat.connectionId) {
      return null; // Stale connection, ignore
    }

    const now = new Date();

    // Update tracking
    tracked.presence.lastHeartbeat = now;
    tracked.heartbeatSequence = heartbeat.sequence ?? tracked.heartbeatSequence + 1;
    tracked.missedHeartbeats = 0;

    // Check for status sync issues
    if (heartbeat.status && heartbeat.status !== tracked.presence.status) {
      // Status mismatch - server is authoritative, but log it
      // The client should use the returned status to sync
    }

    this.emit('agent:heartbeat', heartbeat.agentId, now);

    const nextHeartbeatDue = new Date(now.getTime() + this.config.heartbeat.intervalMs);
    const heartbeatTimestamp = heartbeat.timestamp;
    const rttMs = Math.max(0, now.getTime() - new Date(heartbeatTimestamp).getTime());

    return HeartbeatAckSchema.parse({
      serverTime: now,
      status: tracked.presence.status,
      nextHeartbeatDue,
      rttMs,
    });
  }

  /**
   * Get heartbeat configuration (for clients)
   */
  getHeartbeatConfig(): HeartbeatConfig {
    return { ...this.config.heartbeat };
  }

  /**
   * Start heartbeat monitoring for an agent
   */
  private startHeartbeatCheck(agentId: string): void {
    const tracked = this.agents.get(agentId);
    if (!tracked) return;

    // Clear existing timer
    this.stopHeartbeatCheck(agentId);

    // Check at twice the heartbeat interval
    const checkInterval = this.config.heartbeat.intervalMs;

    tracked.checkTimer = setInterval(() => {
      this.checkAgentHeartbeat(agentId);
    }, checkInterval);
  }

  /**
   * Stop heartbeat monitoring for an agent
   */
  private stopHeartbeatCheck(agentId: string): void {
    const tracked = this.agents.get(agentId);
    if (tracked?.checkTimer) {
      clearInterval(tracked.checkTimer);
      tracked.checkTimer = null;
    }
  }

  /**
   * Check if an agent has missed heartbeats
   */
  private checkAgentHeartbeat(agentId: string): void {
    const tracked = this.agents.get(agentId);
    if (!tracked || tracked.presence.status === 'offline') return;

    const now = Date.now();
    const lastHeartbeat = tracked.presence.lastHeartbeat.getTime();
    const expectedInterval = this.config.heartbeat.intervalMs;
    const gracePeriod = this.config.heartbeat.gracePeriodMs;

    const timeSinceLastHeartbeat = now - lastHeartbeat;
    const threshold = expectedInterval + gracePeriod;

    if (timeSinceLastHeartbeat > threshold) {
      tracked.missedHeartbeats++;

      if (tracked.missedHeartbeats >= this.config.heartbeat.missedThreshold) {
        // Agent has timed out
        this.emit(
          'agent:timeout',
          agentId,
          tracked.presence.lastHeartbeat,
          tracked.missedHeartbeats
        );

        // Mark as offline
        this.changeStatus(agentId, 'offline', 'heartbeat_timeout');
        this.stopHeartbeatCheck(agentId);
      }
    }
  }

  // ===========================================================================
  // METRICS
  // ===========================================================================

  /**
   * Get metrics for a specific agent
   */
  getAgentMetrics(agentId: string): AgentPresenceMetrics | null {
    const tracked = this.agents.get(agentId);
    if (!tracked) return null;

    const now = new Date();

    // Calculate current time in status
    let currentOnlineTime = tracked.metrics.onlineTimeToday;
    let currentBusyTime = tracked.metrics.busyTimeToday;
    let currentAwayTime = tracked.metrics.awayTimeToday;

    if (tracked.metrics.onlineStartTime) {
      currentOnlineTime += Math.floor(
        (now.getTime() - tracked.metrics.onlineStartTime.getTime()) / 1000
      );
    }
    if (tracked.metrics.busyStartTime) {
      currentBusyTime += Math.floor(
        (now.getTime() - tracked.metrics.busyStartTime.getTime()) / 1000
      );
    }
    if (tracked.metrics.awayStartTime) {
      currentAwayTime += Math.floor(
        (now.getTime() - tracked.metrics.awayStartTime.getTime()) / 1000
      );
    }

    const totalTime = currentOnlineTime + currentBusyTime + currentAwayTime;
    const utilizationPercent = totalTime > 0 ? (currentBusyTime / totalTime) * 100 : 0;

    const sessionDuration = tracked.presence.sessionStartedAt
      ? Math.floor((now.getTime() - new Date(tracked.presence.sessionStartedAt).getTime()) / 1000)
      : 0;

    return AgentPresenceMetricsSchema.parse({
      agentId,
      onlineTimeToday: currentOnlineTime,
      busyTimeToday: currentBusyTime,
      awayTimeToday: currentAwayTime,
      statusChangesToday: tracked.metrics.statusChangesToday,
      callsHandledToday: tracked.metrics.callsHandledToday,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      lastActivity: tracked.presence.lastHeartbeat,
      sessionDuration,
    });
  }

  /**
   * Get team presence summary
   */
  getTeamSummary(): TeamPresenceSummary {
    const agents = Array.from(this.agents.values());
    const now = new Date();

    const byStatus: Record<AgentPresenceStatus, number> = {
      online: 0,
      offline: 0,
      busy: 0,
      away: 0,
      dnd: 0,
    };

    let totalUtilization = 0;
    let onlineCount = 0;
    const queueCoverage: Record<string, boolean> = {};

    for (const tracked of agents) {
      byStatus[tracked.presence.status]++;

      if (tracked.presence.status !== 'offline') {
        onlineCount++;
        const metrics = this.getAgentMetrics(tracked.presence.agentId);
        if (metrics) {
          totalUtilization += metrics.utilizationPercent;
        }

        // Track queue coverage
        for (const queueSid of tracked.presence.queueSids) {
          if (tracked.presence.status === 'online') {
            queueCoverage[queueSid] = true;
          } else if (!(queueSid in queueCoverage)) {
            queueCoverage[queueSid] = false;
          }
        }
      }
    }

    return TeamPresenceSummarySchema.parse({
      totalAgents: agents.length,
      byStatus,
      availableForCalls: byStatus.online,
      onCalls: byStatus.busy,
      avgUtilization:
        onlineCount > 0 ? Math.round((totalUtilization / onlineCount) * 100) / 100 : 0,
      queueCoverage: Object.keys(queueCoverage).length > 0 ? queueCoverage : undefined,
      lastUpdated: now,
    });
  }

  /**
   * Update metrics when status changes
   */
  private updateStatusMetrics(tracked: TrackedAgent, newStatus: AgentPresenceStatus): void {
    const now = new Date();
    const currentStatus = tracked.presence.status;

    // Finalize time in previous status
    if (tracked.metrics.onlineStartTime && currentStatus === 'online') {
      tracked.metrics.onlineTimeToday += Math.floor(
        (now.getTime() - tracked.metrics.onlineStartTime.getTime()) / 1000
      );
      tracked.metrics.onlineStartTime = null;
    }

    if (tracked.metrics.busyStartTime && currentStatus === 'busy') {
      tracked.metrics.busyTimeToday += Math.floor(
        (now.getTime() - tracked.metrics.busyStartTime.getTime()) / 1000
      );
      tracked.metrics.busyStartTime = null;
    }

    if (tracked.metrics.awayStartTime && currentStatus === 'away') {
      tracked.metrics.awayTimeToday += Math.floor(
        (now.getTime() - tracked.metrics.awayStartTime.getTime()) / 1000
      );
      tracked.metrics.awayStartTime = null;
    }

    // Start timer for new status
    if (newStatus === 'online') {
      tracked.metrics.onlineStartTime = now;
    } else if (newStatus === 'busy') {
      tracked.metrics.busyStartTime = now;
    } else if (newStatus === 'away') {
      tracked.metrics.awayStartTime = now;
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every hour
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupStaleAgents();
        this.resetDailyMetrics();
      },
      60 * 60 * 1000
    );
  }

  /**
   * Remove stale offline agents
   */
  private cleanupStaleAgents(): void {
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [agentId, tracked] of this.agents.entries()) {
      if (tracked.presence.status === 'offline') {
        const lastActivity = tracked.presence.lastHeartbeat.getTime();
        if (now - lastActivity > staleThreshold) {
          this.stopHeartbeatCheck(agentId);
          this.agents.delete(agentId);
        }
      }
    }
  }

  /**
   * Reset daily metrics at midnight
   */
  private resetDailyMetrics(): void {
    const now = new Date();
    // Check if it's a new day (around midnight)
    if (now.getHours() === 0 && now.getMinutes() < 60) {
      for (const tracked of this.agents.values()) {
        tracked.metrics.onlineTimeToday = 0;
        tracked.metrics.busyTimeToday = 0;
        tracked.metrics.awayTimeToday = 0;
        tracked.metrics.statusChangesToday = 0;
        tracked.metrics.callsHandledToday = 0;

        // Reset start times if currently in a status
        const currentTime = new Date();
        if (tracked.presence.status === 'online') {
          tracked.metrics.onlineStartTime = currentTime;
        } else if (tracked.presence.status === 'busy') {
          tracked.metrics.busyStartTime = currentTime;
        } else if (tracked.presence.status === 'away') {
          tracked.metrics.awayStartTime = currentTime;
        }
      }
    }
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Stop all heartbeat checks
    for (const agentId of this.agents.keys()) {
      this.stopHeartbeatCheck(agentId);
    }

    // Clear all agents
    this.agents.clear();

    // Remove all listeners
    this.removeAllListeners();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let serviceInstance: AgentPresenceService | null = null;

/**
 * Create or get the agent presence service singleton
 */
export function getAgentPresenceService(config?: AgentPresenceServiceConfig): AgentPresenceService {
  serviceInstance ??= new AgentPresenceService(config);
  return serviceInstance;
}

/**
 * Create a new agent presence service instance
 */
export function createAgentPresenceService(
  config?: AgentPresenceServiceConfig
): AgentPresenceService {
  return new AgentPresenceService(config);
}

/**
 * Reset the singleton (for testing)
 */
export function resetAgentPresenceService(): void {
  if (serviceInstance) {
    serviceInstance.destroy();
    serviceInstance = null;
  }
}
