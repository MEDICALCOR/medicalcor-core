/**
 * Queue SLA Service
 * H8: Queue SLA Tracking for Call Center
 *
 * Provides domain logic for tracking call center queue SLAs,
 * detecting breaches, and generating metrics for the supervisor dashboard.
 *
 * @module domain/voice/queue-sla-service
 */

import type { QueueSLAConfig, QueueSLAStatus, SLABreachEvent, SLAReport } from '@medicalcor/types';
import {
  QueueSLAConfigSchema,
  QueueSLAStatusSchema,
  SLABreachEventSchema,
  SLAReportSchema,
} from '@medicalcor/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * SLA breach types
 */
export type SLABreachType =
  | 'wait_time_exceeded'
  | 'queue_size_exceeded'
  | 'abandon_rate_exceeded'
  | 'agent_availability_low'
  | 'service_level_missed';

/**
 * Queue metrics input for SLA evaluation
 */
export interface QueueMetricsInput {
  queueSid: string;
  queueName: string;
  currentQueueSize: number;
  longestWaitTime: number;
  averageWaitTime: number;
  availableAgents: number;
  busyAgents: number;
  totalAgents: number;
  callsHandledToday: number;
  callsAbandonedToday: number;
  serviceLevel: number;
}

/**
 * SLA evaluation result
 */
export interface SLAEvaluationResult {
  status: QueueSLAStatus;
  breaches: SLABreachEvent[];
  requiresAlert: boolean;
  requiresEscalation: boolean;
}

/**
 * Historical metrics for reporting
 */
export interface HistoricalMetrics {
  periodStart: Date;
  periodEnd: Date;
  totalCalls: number;
  callsAnswered: number;
  callsAbandoned: number;
  callsWithinSLA: number;
  averageWaitTime: number;
  averageHandleTime: number;
  maxWaitTime: number;
  averageAgentUtilization: number;
  peakQueueSize: number;
}

/**
 * Port for queue metrics data access
 */
export interface IQueueMetricsPort {
  /** Get current SLA configuration for a queue */
  getSLAConfig(queueSid: string): Promise<QueueSLAConfig | null>;

  /** Get all active SLA configurations */
  getAllSLAConfigs(): Promise<QueueSLAConfig[]>;

  /** Save or update SLA configuration */
  saveSLAConfig(config: QueueSLAConfig): Promise<void>;

  /** Get current queue status */
  getQueueStatus(queueSid: string): Promise<QueueSLAStatus | null>;

  /** Save queue status */
  saveQueueStatus(status: QueueSLAStatus): Promise<void>;

  /** Record a breach event */
  recordBreach(breach: SLABreachEvent): Promise<void>;

  /** Get breaches for a time period */
  getBreaches(queueSid: string, startTime: Date, endTime: Date): Promise<SLABreachEvent[]>;

  /** Get historical metrics for reporting */
  getHistoricalMetrics(
    queueSid: string,
    startTime: Date,
    endTime: Date
  ): Promise<HistoricalMetrics>;

  /** Save generated report */
  saveReport(report: SLAReport): Promise<void>;

  /** Get previous SLA status for comparison */
  getPreviousStatus(queueSid: string): Promise<QueueSLAStatus | null>;
}

/**
 * Service configuration
 */
export interface QueueSLAServiceConfig {
  /** Default SLA config when none is found in database */
  defaultConfig?: Partial<Omit<QueueSLAConfig, 'queueSid' | 'queueName'>>;
  /** Minimum calls before abandonment rate is evaluated */
  minCallsForAbandonRate?: number;
  /** Minimum calls before service level is evaluated */
  minCallsForServiceLevel?: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_SLA_CONFIG: Omit<QueueSLAConfig, 'queueSid' | 'queueName'> = {
  targetAnswerTime: 30, // 30 seconds
  maxWaitTime: 120, // 2 minutes
  criticalWaitTime: 300, // 5 minutes
  maxQueueSize: 10,
  criticalQueueSize: 20,
  maxAbandonRate: 5, // 5%
  minAvailableAgents: 1,
  targetAgentUtilization: 80,
  serviceLevelTarget: 80, // 80% answered within target time
  alertEnabled: true,
  escalationEnabled: true,
};

// =============================================================================
// QUEUE SLA SERVICE
// =============================================================================

/**
 * Domain service for queue SLA tracking and breach detection
 */
export class QueueSLAService {
  private readonly config: Required<QueueSLAServiceConfig>;

  // In-memory stores for queue data (would be replaced by infrastructure adapter in production)
  private readonly queueStatuses = new Map<string, QueueSLAStatus>();
  private readonly queueConfigs = new Map<string, QueueSLAConfig>();
  private readonly breachHistory = new Map<string, SLABreachEvent[]>();

  constructor(config: QueueSLAServiceConfig = {}) {
    this.config = {
      defaultConfig: { ...DEFAULT_SLA_CONFIG, ...config.defaultConfig },
      minCallsForAbandonRate: config.minCallsForAbandonRate ?? 10,
      minCallsForServiceLevel: config.minCallsForServiceLevel ?? 10,
    };

    // Initialize with demo queues for development
    this.initializeDemoQueues();
  }

  /**
   * Initialize demo queues for development/testing
   */
  private initializeDemoQueues(): void {
    const demoQueues = [
      { queueSid: 'WQ001', queueName: 'General Inquiries', size: 3, waitTime: 45 },
      { queueSid: 'WQ002', queueName: 'All-on-X Consultations', size: 5, waitTime: 120 },
      { queueSid: 'WQ003', queueName: 'Emergency Line', size: 1, waitTime: 15 },
      { queueSid: 'WQ004', queueName: 'Scheduling', size: 2, waitTime: 30 },
    ];

    for (const demo of demoQueues) {
      const config = this.getConfigWithDefaults(demo.queueSid, demo.queueName);
      this.queueConfigs.set(demo.queueSid, config);

      const metrics: QueueMetricsInput = {
        queueSid: demo.queueSid,
        queueName: demo.queueName,
        currentQueueSize: demo.size,
        longestWaitTime: demo.waitTime,
        averageWaitTime: Math.floor(demo.waitTime * 0.7),
        availableAgents: Math.max(1, 4 - demo.size),
        busyAgents: Math.min(3, demo.size),
        totalAgents: 4,
        callsHandledToday: 45 + Math.floor(Math.random() * 30),
        callsAbandonedToday: Math.floor(Math.random() * 5),
        serviceLevel: 75 + Math.floor(Math.random() * 20),
      };

      const result = this.evaluateSLA(metrics, config);
      this.queueStatuses.set(demo.queueSid, result.status);

      // Store any breaches
      if (result.breaches.length > 0) {
        this.breachHistory.set(demo.queueSid, result.breaches);
      }
    }
  }

  // ===========================================================================
  // DATA ACCESS METHODS (for API/UI integration)
  // ===========================================================================

  /**
   * Get all queue statuses
   */
  getAllQueueStatuses(): Promise<QueueSLAStatus[]> {
    return Promise.resolve(Array.from(this.queueStatuses.values()));
  }

  /**
   * Get status for a specific queue
   */
  getQueueStatus(queueSid: string): Promise<QueueSLAStatus | null> {
    return Promise.resolve(this.queueStatuses.get(queueSid) ?? null);
  }

  /**
   * Get SLA configuration for a queue
   */
  getSLAConfig(queueSid: string): Promise<QueueSLAConfig | null> {
    return Promise.resolve(this.queueConfigs.get(queueSid) ?? null);
  }

  /**
   * Update SLA configuration for a queue
   */
  updateSLAConfig(queueSid: string, updates: Partial<QueueSLAConfig>): Promise<QueueSLAConfig> {
    const existing = this.queueConfigs.get(queueSid);
    if (!existing) {
      return Promise.reject(new Error(`Queue configuration not found: ${queueSid}`));
    }

    const updated = QueueSLAConfigSchema.parse({
      ...existing,
      ...updates,
      queueSid, // Ensure queueSid can't be changed
    });

    this.queueConfigs.set(queueSid, updated);
    return Promise.resolve(updated);
  }

  /**
   * Get breaches for a queue within a time period
   */
  getBreaches(
    queueSid: string,
    startTime: Date,
    endTime: Date,
    limit = 100
  ): Promise<SLABreachEvent[]> {
    const breaches = this.breachHistory.get(queueSid) ?? [];
    const filtered = breaches
      .filter((b) => b.detectedAt >= startTime && b.detectedAt <= endTime)
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, limit);
    return Promise.resolve(filtered);
  }

  /**
   * Update queue status with new metrics
   */
  updateQueueStatus(metrics: QueueMetricsInput): Promise<SLAEvaluationResult> {
    let config = this.queueConfigs.get(metrics.queueSid);
    if (!config) {
      config = this.getConfigWithDefaults(metrics.queueSid, metrics.queueName);
      this.queueConfigs.set(metrics.queueSid, config);
    }

    const result = this.evaluateSLA(metrics, config);
    this.queueStatuses.set(metrics.queueSid, result.status);

    // Append new breaches to history
    if (result.breaches.length > 0) {
      const existing = this.breachHistory.get(metrics.queueSid) ?? [];
      this.breachHistory.set(metrics.queueSid, [...existing, ...result.breaches]);
    }

    return Promise.resolve(result);
  }

  // ===========================================================================
  // SLA EVALUATION
  // ===========================================================================

  /**
   * Evaluate SLA status for a queue based on current metrics
   */
  evaluateSLA(metrics: QueueMetricsInput, config: QueueSLAConfig): SLAEvaluationResult {
    const breaches: SLABreachType[] = [];
    let severity: 'ok' | 'warning' | 'critical' = 'ok';

    // Check wait time
    if (metrics.longestWaitTime > config.criticalWaitTime) {
      breaches.push('wait_time_exceeded');
      severity = 'critical';
    } else if (metrics.longestWaitTime > config.maxWaitTime) {
      breaches.push('wait_time_exceeded');
      severity = 'warning';
    }

    // Check queue size
    if (metrics.currentQueueSize > config.criticalQueueSize) {
      breaches.push('queue_size_exceeded');
      severity = 'critical';
    } else if (metrics.currentQueueSize > config.maxQueueSize) {
      breaches.push('queue_size_exceeded');
      if (severity === 'ok') severity = 'warning';
    }

    // Check agent availability
    if (metrics.availableAgents < config.minAvailableAgents && metrics.currentQueueSize > 0) {
      breaches.push('agent_availability_low');
      if (severity === 'ok') severity = 'warning';
    }

    // Check abandonment rate (only if we have enough calls)
    const totalCalls = metrics.callsHandledToday + metrics.callsAbandonedToday;
    const abandonRate = totalCalls > 0 ? (metrics.callsAbandonedToday / totalCalls) * 100 : 0;

    if (abandonRate > config.maxAbandonRate && totalCalls >= this.config.minCallsForAbandonRate) {
      breaches.push('abandon_rate_exceeded');
      if (severity === 'ok') severity = 'warning';
    }

    // Check service level
    if (
      metrics.serviceLevel < config.serviceLevelTarget &&
      totalCalls >= this.config.minCallsForServiceLevel
    ) {
      breaches.push('service_level_missed');
      if (severity === 'ok') severity = 'warning';
    }

    // Calculate agent utilization
    const agentUtilization =
      metrics.totalAgents > 0 ? (metrics.busyAgents / metrics.totalAgents) * 100 : 0;

    // Build status object
    const status: QueueSLAStatus = QueueSLAStatusSchema.parse({
      queueSid: metrics.queueSid,
      queueName: metrics.queueName,
      currentQueueSize: metrics.currentQueueSize,
      longestWaitTime: metrics.longestWaitTime,
      averageWaitTime: metrics.averageWaitTime,
      averageHandleTime: 0, // Would need historical data
      availableAgents: metrics.availableAgents,
      busyAgents: metrics.busyAgents,
      totalAgents: metrics.totalAgents,
      agentUtilization,
      callsHandledToday: metrics.callsHandledToday,
      callsAbandonedToday: metrics.callsAbandonedToday,
      abandonRate,
      serviceLevel: metrics.serviceLevel,
      isCompliant: breaches.length === 0,
      breaches,
      severity,
      lastUpdated: new Date(),
    });

    // Create breach events
    const breachEvents = this.createBreachEvents(metrics, config, breaches, severity);

    return {
      status,
      breaches: breachEvents,
      requiresAlert: config.alertEnabled && breaches.length > 0,
      requiresEscalation: config.escalationEnabled && severity === 'critical',
    };
  }

  /**
   * Get or create SLA config for a queue
   */
  getConfigWithDefaults(
    queueSid: string,
    queueName: string,
    existingConfig?: Partial<QueueSLAConfig> | null
  ): QueueSLAConfig {
    return QueueSLAConfigSchema.parse({
      ...this.config.defaultConfig,
      ...existingConfig,
      queueSid,
      queueName,
    });
  }

  // ===========================================================================
  // BREACH MANAGEMENT
  // ===========================================================================

  /**
   * Create breach events from detected breaches
   */
  private createBreachEvents(
    metrics: QueueMetricsInput,
    config: QueueSLAConfig,
    breaches: SLABreachType[],
    severity: 'ok' | 'warning' | 'critical'
  ): SLABreachEvent[] {
    const events: SLABreachEvent[] = [];
    const now = new Date();

    for (const breachType of breaches) {
      const { threshold, currentValue } = this.getBreachDetails(
        breachType,
        metrics,
        config,
        severity
      );

      const event: SLABreachEvent = SLABreachEventSchema.parse({
        eventId: crypto.randomUUID(),
        queueSid: metrics.queueSid,
        queueName: metrics.queueName,
        breachType,
        severity: severity === 'critical' ? 'critical' : 'warning',
        threshold,
        currentValue,
        affectedCalls: metrics.currentQueueSize,
        detectedAt: now,
        alertSent: false,
        escalated: false,
      });

      events.push(event);
    }

    return events;
  }

  /**
   * Get threshold and current value for a breach type
   */
  private getBreachDetails(
    breachType: SLABreachType,
    metrics: QueueMetricsInput,
    config: QueueSLAConfig,
    severity: 'ok' | 'warning' | 'critical'
  ): { threshold: number; currentValue: number } {
    switch (breachType) {
      case 'wait_time_exceeded':
        return {
          threshold: severity === 'critical' ? config.criticalWaitTime : config.maxWaitTime,
          currentValue: metrics.longestWaitTime,
        };
      case 'queue_size_exceeded':
        return {
          threshold: severity === 'critical' ? config.criticalQueueSize : config.maxQueueSize,
          currentValue: metrics.currentQueueSize,
        };
      case 'abandon_rate_exceeded': {
        const totalCalls = metrics.callsHandledToday + metrics.callsAbandonedToday;
        const abandonRate = totalCalls > 0 ? (metrics.callsAbandonedToday / totalCalls) * 100 : 0;
        return {
          threshold: config.maxAbandonRate,
          currentValue: abandonRate,
        };
      }
      case 'agent_availability_low':
        return {
          threshold: config.minAvailableAgents,
          currentValue: metrics.availableAgents,
        };
      case 'service_level_missed':
        return {
          threshold: config.serviceLevelTarget,
          currentValue: metrics.serviceLevel,
        };
      default:
        return {
          threshold: 0,
          currentValue: 0,
        };
    }
  }

  /**
   * Check if a new breach is a continuation of an existing breach
   */
  isBreachContinuation(
    newBreach: SLABreachEvent,
    existingBreaches: SLABreachEvent[],
    thresholdSeconds = 300 // 5 minutes
  ): boolean {
    const matchingBreach = existingBreaches.find(
      (b) =>
        b.queueSid === newBreach.queueSid && b.breachType === newBreach.breachType && !b.resolvedAt
    );

    if (!matchingBreach) return false;

    const timeSinceLastBreach =
      (newBreach.detectedAt.getTime() - matchingBreach.detectedAt.getTime()) / 1000;

    return timeSinceLastBreach <= thresholdSeconds;
  }

  /**
   * Calculate breach duration in seconds
   */
  calculateBreachDuration(breach: SLABreachEvent): number {
    const endTime = breach.resolvedAt ?? new Date();
    return Math.floor((endTime.getTime() - breach.detectedAt.getTime()) / 1000);
  }

  // ===========================================================================
  // REPORTING
  // ===========================================================================

  /**
   * Generate SLA report for a time period
   */
  generateReport(
    queueSid: string,
    queueName: string,
    historicalMetrics: HistoricalMetrics,
    breaches: SLABreachEvent[],
    periodType: 'hourly' | 'daily' | 'weekly' | 'monthly'
  ): SLAReport {
    const totalBreaches = breaches.length;
    const criticalBreaches = breaches.filter((b) => b.severity === 'critical').length;

    // Count breaches by type
    const breachesByType: Record<string, number> = {};
    for (const breach of breaches) {
      breachesByType[breach.breachType] = (breachesByType[breach.breachType] ?? 0) + 1;
    }

    // Calculate overall service level
    const overallServiceLevel =
      historicalMetrics.totalCalls > 0
        ? (historicalMetrics.callsWithinSLA / historicalMetrics.totalCalls) * 100
        : 100;

    // Calculate abandon rate
    const abandonRate =
      historicalMetrics.totalCalls > 0
        ? (historicalMetrics.callsAbandoned / historicalMetrics.totalCalls) * 100
        : 0;

    // Calculate compliance rate (% of time without breaches)
    // This is a simplified calculation based on breach count
    const periodDurationMinutes =
      (historicalMetrics.periodEnd.getTime() - historicalMetrics.periodStart.getTime()) /
      (1000 * 60);
    const breachDurationMinutes = totalBreaches * 5; // Assume average 5 min per breach
    const complianceRate = Math.max(0, 100 - (breachDurationMinutes / periodDurationMinutes) * 100);

    return SLAReportSchema.parse({
      reportId: crypto.randomUUID(),
      queueSid,
      queueName,
      periodStart: historicalMetrics.periodStart,
      periodEnd: historicalMetrics.periodEnd,
      periodType,
      totalCalls: historicalMetrics.totalCalls,
      callsAnswered: historicalMetrics.callsAnswered,
      callsAbandoned: historicalMetrics.callsAbandoned,
      callsWithinSLA: historicalMetrics.callsWithinSLA,
      overallServiceLevel,
      averageWaitTime: historicalMetrics.averageWaitTime,
      averageHandleTime: historicalMetrics.averageHandleTime,
      maxWaitTime: historicalMetrics.maxWaitTime,
      abandonRate,
      averageAgentUtilization: historicalMetrics.averageAgentUtilization,
      peakQueueSize: historicalMetrics.peakQueueSize,
      totalBreaches,
      criticalBreaches,
      breachesByType,
      complianceRate,
      trend: this.calculateTrend(overallServiceLevel),
      generatedAt: new Date(),
    });
  }

  /**
   * Calculate trend based on service level
   */
  private calculateTrend(
    currentServiceLevel: number,
    previousServiceLevel?: number
  ): 'improving' | 'stable' | 'declining' {
    if (previousServiceLevel === undefined) return 'stable';

    const difference = currentServiceLevel - previousServiceLevel;

    if (difference > 2) return 'improving';
    if (difference < -2) return 'declining';
    return 'stable';
  }

  // ===========================================================================
  // METRICS CALCULATIONS
  // ===========================================================================

  /**
   * Calculate the current service level percentage
   * (calls answered within target time / total calls answered)
   */
  calculateServiceLevel(callsWithinTarget: number, totalCallsAnswered: number): number {
    if (totalCallsAnswered === 0) return 100;
    return (callsWithinTarget / totalCallsAnswered) * 100;
  }

  /**
   * Calculate agent utilization
   */
  calculateAgentUtilization(busyAgents: number, totalAgents: number): number {
    if (totalAgents === 0) return 0;
    return (busyAgents / totalAgents) * 100;
  }

  /**
   * Calculate abandon rate
   */
  calculateAbandonRate(callsAbandoned: number, totalCalls: number): number {
    if (totalCalls === 0) return 0;
    return (callsAbandoned / totalCalls) * 100;
  }

  /**
   * Get severity color for dashboard display
   */
  getSeverityColor(severity: 'ok' | 'warning' | 'critical'): string {
    switch (severity) {
      case 'ok':
        return 'green';
      case 'warning':
        return 'yellow';
      case 'critical':
        return 'red';
      default:
        return 'gray';
    }
  }

  /**
   * Format duration for display (seconds to human readable)
   */
  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let serviceInstance: QueueSLAService | null = null;

/**
 * Create or get the queue SLA service singleton
 */
export function getQueueSLAService(config?: QueueSLAServiceConfig): QueueSLAService {
  serviceInstance ??= new QueueSLAService(config);
  return serviceInstance;
}

/**
 * Create a new queue SLA service instance
 */
export function createQueueSLAService(config?: QueueSLAServiceConfig): QueueSLAService {
  return new QueueSLAService(config);
}

/**
 * Reset the singleton (for testing)
 */
export function resetQueueSLAService(): void {
  serviceInstance = null;
}
