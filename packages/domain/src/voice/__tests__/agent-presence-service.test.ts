import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  AgentPresenceService,
  createAgentPresenceService,
  resetAgentPresenceService,
  getAgentPresenceService,
} from '../agent-presence-service.js';

/**
 * Tests for AgentPresenceService
 *
 * Covers:
 * - Agent registration and unregistration
 * - Status management and transitions
 * - Heartbeat processing
 * - Metrics calculation
 * - Team summary
 * - Event emission
 * - Edge cases
 */

describe('AgentPresenceService', () => {
  let service: AgentPresenceService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = createAgentPresenceService();
  });

  afterEach(() => {
    service.destroy();
    resetAgentPresenceService();
    vi.useRealTimers();
  });

  // ============================================================================
  // AGENT REGISTRATION
  // ============================================================================

  describe('Agent Registration', () => {
    it('should register a new agent with online status', () => {
      const agent = service.registerAgent({
        agentId: 'agent-1',
        agentName: 'John Doe',
        connectionId: 'conn-1',
      });

      expect(agent.agentId).toBe('agent-1');
      expect(agent.agentName).toBe('John Doe');
      expect(agent.status).toBe('online');
      expect(agent.connectionId).toBe('conn-1');
      expect(agent.statusReason).toBe('login');
    });

    it('should register agent with requested status', () => {
      const agent = service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
        requestedStatus: 'away',
      });

      expect(agent.status).toBe('away');
    });

    it('should register agent with queue and skill assignments', () => {
      const agent = service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
        queueSids: ['queue-1', 'queue-2'],
        skills: ['spanish', 'dental-surgery'],
      });

      expect(agent.queueSids).toEqual(['queue-1', 'queue-2']);
      expect(agent.skills).toEqual(['spanish', 'dental-surgery']);
    });

    it('should emit agent:connected event on registration', () => {
      const handler = vi.fn();
      service.on('agent:connected', handler);

      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          status: 'online',
        })
      );
    });

    it('should handle reconnection of existing agent', () => {
      // First connection
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      // Disconnect
      service.unregisterAgent('agent-1', 'connection_lost');

      // Reconnect
      const agent = service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-2',
      });

      expect(agent.connectionId).toBe('conn-2');
      expect(agent.statusReason).toBe('connection_restored');
    });

    it('should throw error when max capacity reached', () => {
      const limitedService = createAgentPresenceService({ maxAgents: 2 });

      limitedService.registerAgent({ agentId: 'agent-1', connectionId: 'conn-1' });
      limitedService.registerAgent({ agentId: 'agent-2', connectionId: 'conn-2' });

      expect(() => {
        limitedService.registerAgent({ agentId: 'agent-3', connectionId: 'conn-3' });
      }).toThrow('Maximum agent capacity (2) reached');

      limitedService.destroy();
    });
  });

  // ============================================================================
  // AGENT UNREGISTRATION
  // ============================================================================

  describe('Agent Unregistration', () => {
    it('should unregister an agent', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      const result = service.unregisterAgent('agent-1');

      expect(result).toBe(true);
      const agent = service.getAgent('agent-1');
      expect(agent?.status).toBe('offline');
      expect(agent?.connectionId).toBeUndefined();
    });

    it('should return false when unregistering non-existent agent', () => {
      const result = service.unregisterAgent('non-existent');
      expect(result).toBe(false);
    });

    it('should emit events on unregistration', () => {
      const disconnectHandler = vi.fn();
      const statusChangeHandler = vi.fn();

      service.on('agent:disconnected', disconnectHandler);
      service.on('agent:status_changed', statusChangeHandler);

      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      service.unregisterAgent('agent-1', 'logout');

      expect(disconnectHandler).toHaveBeenCalledWith('agent-1', 'logout');
      expect(statusChangeHandler).toHaveBeenCalledWith('agent-1', 'online', 'offline', 'logout');
    });
  });

  // ============================================================================
  // AGENT QUERIES
  // ============================================================================

  describe('Agent Queries', () => {
    beforeEach(() => {
      service.registerAgent({ agentId: 'agent-1', connectionId: 'conn-1' });
      service.registerAgent({
        agentId: 'agent-2',
        connectionId: 'conn-2',
        requestedStatus: 'busy',
      });
      service.registerAgent({
        agentId: 'agent-3',
        connectionId: 'conn-3',
        requestedStatus: 'away',
        queueSids: ['queue-A'],
      });
    });

    it('should get a specific agent', () => {
      const agent = service.getAgent('agent-1');
      expect(agent).toBeDefined();
      expect(agent?.agentId).toBe('agent-1');
    });

    it('should return undefined for non-existent agent', () => {
      const agent = service.getAgent('non-existent');
      expect(agent).toBeUndefined();
    });

    it('should get all agents excluding offline by default', () => {
      const agents = service.getAgents();
      expect(agents).toHaveLength(3);
    });

    it('should filter agents by status', () => {
      const busyAgents = service.getAgents({ status: ['busy'] });
      expect(busyAgents).toHaveLength(1);
      expect(busyAgents[0].agentId).toBe('agent-2');
    });

    it('should filter agents by multiple statuses', () => {
      const agents = service.getAgents({ status: ['online', 'busy'] });
      expect(agents).toHaveLength(2);
    });

    it('should filter agents by queue', () => {
      const queueAgents = service.getAgents({ queueSid: 'queue-A' });
      expect(queueAgents).toHaveLength(1);
      expect(queueAgents[0].agentId).toBe('agent-3');
    });

    it('should get available agents', () => {
      const available = service.getAvailableAgents();
      expect(available).toHaveLength(1);
      expect(available[0].agentId).toBe('agent-1');
    });

    it('should include offline agents when requested', () => {
      service.unregisterAgent('agent-1');
      const allAgents = service.getAgents({ includeOffline: true });
      expect(allAgents).toHaveLength(3);
    });
  });

  // ============================================================================
  // STATUS MANAGEMENT
  // ============================================================================

  describe('Status Management', () => {
    beforeEach(() => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });
    });

    it('should change status successfully', () => {
      const result = service.changeStatus('agent-1', 'busy', 'call_started', {
        activeCallSid: 'call-123',
      });

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('online');

      const agent = service.getAgent('agent-1');
      expect(agent?.status).toBe('busy');
      expect(agent?.activeCallSid).toBe('call-123');
    });

    it('should reject invalid status transitions', () => {
      // First go offline
      service.changeStatus('agent-1', 'offline', 'logout');

      // Try to go to busy directly (not allowed from offline)
      const result = service.changeStatus('agent-1', 'busy', 'manual');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status transition');
    });

    it('should allow valid transitions through the state machine', () => {
      // online -> busy
      let result = service.changeStatus('agent-1', 'busy', 'call_started');
      expect(result.success).toBe(true);

      // busy -> away
      result = service.changeStatus('agent-1', 'away', 'manual');
      expect(result.success).toBe(true);

      // away -> dnd
      result = service.changeStatus('agent-1', 'dnd', 'manual');
      expect(result.success).toBe(true);

      // dnd -> online
      result = service.changeStatus('agent-1', 'online', 'manual');
      expect(result.success).toBe(true);
    });

    it('should not change when already in the same status', () => {
      const result = service.changeStatus('agent-1', 'online', 'manual');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('online');
    });

    it('should return error for non-existent agent', () => {
      const result = service.changeStatus('non-existent', 'busy', 'manual');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found');
    });

    it('should emit status_changed event', () => {
      const handler = vi.fn();
      service.on('agent:status_changed', handler);

      service.changeStatus('agent-1', 'busy', 'call_started');

      expect(handler).toHaveBeenCalledWith('agent-1', 'online', 'busy', 'call_started');
    });

    it('should set agent busy when call starts (auto transition)', () => {
      const result = service.setAgentBusy('agent-1', 'call-123');

      expect(result.success).toBe(true);
      expect(service.getAgent('agent-1')?.status).toBe('busy');
      expect(service.getAgent('agent-1')?.activeCallSid).toBe('call-123');
    });

    it('should set agent available when call ends', () => {
      service.setAgentBusy('agent-1', 'call-123');

      const result = service.setAgentAvailable('agent-1');

      expect(result.success).toBe(true);
      expect(service.getAgent('agent-1')?.status).toBe('online');
      expect(service.getAgent('agent-1')?.activeCallSid).toBeUndefined();
    });
  });

  // ============================================================================
  // HEARTBEAT PROCESSING
  // ============================================================================

  describe('Heartbeat Processing', () => {
    beforeEach(() => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });
    });

    it('should process valid heartbeat', () => {
      const ack = service.processHeartbeat({
        agentId: 'agent-1',
        connectionId: 'conn-1',
        timestamp: new Date(),
      });

      expect(ack).not.toBeNull();
      expect(ack?.status).toBe('online');
      expect(ack?.serverTime).toBeDefined();
      expect(ack?.nextHeartbeatDue).toBeDefined();
    });

    it('should return null for unknown agent', () => {
      const ack = service.processHeartbeat({
        agentId: 'unknown',
        connectionId: 'conn-1',
        timestamp: new Date(),
      });

      expect(ack).toBeNull();
    });

    it('should return null for wrong connection ID', () => {
      const ack = service.processHeartbeat({
        agentId: 'agent-1',
        connectionId: 'wrong-conn',
        timestamp: new Date(),
      });

      expect(ack).toBeNull();
    });

    it('should emit heartbeat event', () => {
      const handler = vi.fn();
      service.on('agent:heartbeat', handler);

      service.processHeartbeat({
        agentId: 'agent-1',
        connectionId: 'conn-1',
        timestamp: new Date(),
      });

      expect(handler).toHaveBeenCalledWith('agent-1', expect.any(Date));
    });

    it('should calculate RTT when timestamp provided', () => {
      const clientTime = new Date(Date.now() - 50); // 50ms ago
      const ack = service.processHeartbeat({
        agentId: 'agent-1',
        connectionId: 'conn-1',
        timestamp: clientTime,
      });

      expect(ack?.rttMs).toBeGreaterThanOrEqual(50);
    });
  });

  // ============================================================================
  // HEARTBEAT TIMEOUT
  // ============================================================================

  describe('Heartbeat Timeout', () => {
    it('should mark agent offline after missed heartbeats', () => {
      const customService = createAgentPresenceService({
        heartbeat: {
          intervalMs: 1000, // 1 second
          missedThreshold: 2, // 2 missed
          gracePeriodMs: 500, // 0.5 second grace
        },
      });

      const timeoutHandler = vi.fn();
      const statusChangeHandler = vi.fn();
      customService.on('agent:timeout', timeoutHandler);
      customService.on('agent:status_changed', statusChangeHandler);

      customService.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      // Advance time past missed threshold (2 intervals + grace period)
      vi.advanceTimersByTime(3500); // 3.5 seconds

      expect(timeoutHandler).toHaveBeenCalledWith('agent-1', expect.any(Date), expect.any(Number));

      const agent = customService.getAgent('agent-1');
      expect(agent?.status).toBe('offline');
      expect(agent?.statusReason).toBe('heartbeat_timeout');

      customService.destroy();
    });

    it('should not timeout if heartbeats are received', () => {
      const customService = createAgentPresenceService({
        heartbeat: {
          intervalMs: 1000,
          missedThreshold: 2,
          gracePeriodMs: 500,
        },
      });

      const timeoutHandler = vi.fn();
      customService.on('agent:timeout', timeoutHandler);

      customService.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      // Send heartbeats at regular intervals
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(800); // Less than interval
        customService.processHeartbeat({
          agentId: 'agent-1',
          connectionId: 'conn-1',
          timestamp: new Date(),
        });
      }

      expect(timeoutHandler).not.toHaveBeenCalled();
      expect(customService.getAgent('agent-1')?.status).toBe('online');

      customService.destroy();
    });
  });

  // ============================================================================
  // METRICS
  // ============================================================================

  describe('Agent Metrics', () => {
    it('should track time in online status', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      // Advance 60 seconds while online
      vi.advanceTimersByTime(60000);

      const metrics = service.getAgentMetrics('agent-1');

      expect(metrics).not.toBeNull();
      expect(metrics!.onlineTimeToday).toBeGreaterThanOrEqual(60);
      expect(metrics!.sessionDuration).toBeGreaterThanOrEqual(60);
    });

    it('should track time in busy status', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      service.setAgentBusy('agent-1', 'call-123');

      // Advance time while busy
      vi.advanceTimersByTime(60000);

      const metrics = service.getAgentMetrics('agent-1');

      // Should have tracked time in busy status (at least some time)
      expect(metrics!.busyTimeToday).toBeGreaterThan(0);
      expect(metrics!.busyTimeToday).toBeLessThanOrEqual(120);
    });

    it('should calculate utilization percentage', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      // 30s online
      vi.advanceTimersByTime(30000);

      // 30s busy
      service.setAgentBusy('agent-1', 'call-123');
      vi.advanceTimersByTime(30000);

      const metrics = service.getAgentMetrics('agent-1');

      // Utilization = busy / (online + busy) = 30 / 60 = 50%
      expect(metrics!.utilizationPercent).toBeCloseTo(50, 0);
    });

    it('should track status changes', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      service.changeStatus('agent-1', 'busy', 'call_started');
      service.changeStatus('agent-1', 'online', 'call_ended');
      service.changeStatus('agent-1', 'away', 'manual');

      const metrics = service.getAgentMetrics('agent-1');

      expect(metrics!.statusChangesToday).toBe(3);
    });

    it('should track calls handled', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      // Simulate handling 3 calls
      for (let i = 0; i < 3; i++) {
        service.setAgentBusy('agent-1', `call-${i}`);
        service.setAgentAvailable('agent-1');
      }

      const metrics = service.getAgentMetrics('agent-1');

      expect(metrics!.callsHandledToday).toBe(3);
    });

    it('should return null for non-existent agent', () => {
      const metrics = service.getAgentMetrics('non-existent');
      expect(metrics).toBeNull();
    });
  });

  // ============================================================================
  // TEAM SUMMARY
  // ============================================================================

  describe('Team Summary', () => {
    it('should calculate team summary', () => {
      service.registerAgent({ agentId: 'agent-1', connectionId: 'conn-1' });
      service.registerAgent({
        agentId: 'agent-2',
        connectionId: 'conn-2',
        requestedStatus: 'busy',
      });
      service.registerAgent({
        agentId: 'agent-3',
        connectionId: 'conn-3',
        requestedStatus: 'away',
      });
      service.registerAgent({ agentId: 'agent-4', connectionId: 'conn-4', requestedStatus: 'dnd' });

      const summary = service.getTeamSummary();

      expect(summary.totalAgents).toBe(4);
      expect(summary.byStatus.online).toBe(1);
      expect(summary.byStatus.busy).toBe(1);
      expect(summary.byStatus.away).toBe(1);
      expect(summary.byStatus.dnd).toBe(1);
      expect(summary.byStatus.offline).toBe(0);
      expect(summary.availableForCalls).toBe(1);
      expect(summary.onCalls).toBe(1);
    });

    it('should include offline agents in count', () => {
      service.registerAgent({ agentId: 'agent-1', connectionId: 'conn-1' });
      service.unregisterAgent('agent-1');

      const summary = service.getTeamSummary();

      expect(summary.byStatus.offline).toBe(1);
    });

    it('should calculate queue coverage', () => {
      service.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
        queueSids: ['queue-A', 'queue-B'],
      });
      service.registerAgent({
        agentId: 'agent-2',
        connectionId: 'conn-2',
        requestedStatus: 'busy',
        queueSids: ['queue-B', 'queue-C'],
      });

      const summary = service.getTeamSummary();

      expect(summary.queueCoverage).toBeDefined();
      expect(summary.queueCoverage!['queue-A']).toBe(true); // agent-1 is online
      expect(summary.queueCoverage!['queue-B']).toBe(true); // agent-1 is online
      expect(summary.queueCoverage!['queue-C']).toBe(false); // agent-2 is busy
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  describe('Configuration', () => {
    it('should return heartbeat config', () => {
      const config = service.getHeartbeatConfig();

      expect(config.intervalMs).toBe(15000);
      expect(config.missedThreshold).toBe(3);
      expect(config.gracePeriodMs).toBe(5000);
    });

    it('should use custom heartbeat config', () => {
      const customService = createAgentPresenceService({
        heartbeat: {
          intervalMs: 30000,
          missedThreshold: 5,
          gracePeriodMs: 10000,
        },
      });

      const config = customService.getHeartbeatConfig();

      expect(config.intervalMs).toBe(30000);
      expect(config.missedThreshold).toBe(5);
      expect(config.gracePeriodMs).toBe(10000);

      customService.destroy();
    });

    it('should disable auto status transitions', () => {
      const customService = createAgentPresenceService({
        autoStatusTransitions: false,
      });

      customService.registerAgent({
        agentId: 'agent-1',
        connectionId: 'conn-1',
      });

      const result = customService.setAgentBusy('agent-1', 'call-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Auto status transitions disabled');

      customService.destroy();
    });
  });

  // ============================================================================
  // SINGLETON
  // ============================================================================

  describe('Singleton Factory', () => {
    afterEach(() => {
      resetAgentPresenceService();
    });

    it('should return same instance', () => {
      const instance1 = getAgentPresenceService();
      const instance2 = getAgentPresenceService();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getAgentPresenceService();
      instance1.registerAgent({ agentId: 'agent-1', connectionId: 'conn-1' });

      resetAgentPresenceService();

      const instance2 = getAgentPresenceService();
      expect(instance2.getAgent('agent-1')).toBeUndefined();
    });
  });

  // ============================================================================
  // STATUS TRANSITION VALIDATION
  // ============================================================================

  describe('Status Transition Validation', () => {
    it('should validate online transitions', () => {
      expect(service.isValidTransition('online', 'busy')).toBe(true);
      expect(service.isValidTransition('online', 'away')).toBe(true);
      expect(service.isValidTransition('online', 'dnd')).toBe(true);
      expect(service.isValidTransition('online', 'offline')).toBe(true);
    });

    it('should validate offline transitions', () => {
      expect(service.isValidTransition('offline', 'online')).toBe(true);
      expect(service.isValidTransition('offline', 'busy')).toBe(false);
      expect(service.isValidTransition('offline', 'away')).toBe(false);
    });

    it('should validate busy transitions', () => {
      expect(service.isValidTransition('busy', 'online')).toBe(true);
      expect(service.isValidTransition('busy', 'away')).toBe(true);
      expect(service.isValidTransition('busy', 'offline')).toBe(true);
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('Cleanup', () => {
    it('should clean up all resources on destroy', () => {
      service.registerAgent({ agentId: 'agent-1', connectionId: 'conn-1' });
      service.registerAgent({ agentId: 'agent-2', connectionId: 'conn-2' });

      service.destroy();

      // After destroy, getAgents should return empty
      expect(service.getAgents({ includeOffline: true })).toHaveLength(0);
    });
  });
});
