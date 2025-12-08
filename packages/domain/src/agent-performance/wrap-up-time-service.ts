/**
 * @fileoverview Agent Wrap-Up Time Service
 *
 * M8: Wrap-Up Time Tracking - Track time between calls, disposition entry
 * Provides agent productivity metrics for after-call work (ACW).
 *
 * @module domain/agent-performance/wrap-up-time-service
 */

import { createLogger } from '@medicalcor/core';
import type {
  WrapUpEvent,
  WrapUpStats,
  WrapUpTrendPoint,
  AgentWrapUpPerformance,
  WrapUpDashboardData,
  StartWrapUpRequest,
  CompleteWrapUpRequest,
  AgentPerformanceTimeRange,
} from '@medicalcor/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const logger = createLogger({ name: 'wrap-up-time-service' });

/**
 * Time range to days mapping
 */
const TIME_RANGE_DAYS: Record<AgentPerformanceTimeRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};

/**
 * Default wrap-up timeout in minutes
 */
const DEFAULT_WRAP_UP_TIMEOUT_MINUTES = 30;

/**
 * Trend thresholds for determining performance direction
 */
const TREND_THRESHOLDS = {
  IMPROVING: -0.1, // 10% decrease is improving (faster wrap-up)
  DECLINING: 0.1, // 10% increase is declining (slower wrap-up)
};

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

/**
 * Repository interface for wrap-up time data access
 */
export interface IWrapUpTimeRepository {
  // Event operations
  startWrapUp(request: StartWrapUpRequest): Promise<WrapUpEvent>;
  completeWrapUp(request: CompleteWrapUpRequest): Promise<WrapUpEvent | null>;
  abandonWrapUp(callSid: string, agentId: string): Promise<void>;
  getActiveWrapUp(agentId: string): Promise<WrapUpEvent | null>;
  getWrapUpByCallSid(callSid: string, agentId: string): Promise<WrapUpEvent | null>;

  // Statistics
  getWrapUpStats(agentId: string, startDate: Date, endDate: Date): Promise<WrapUpStats>;
  getWrapUpTrend(
    agentId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpTrendPoint[]>;
  getTeamWrapUpStats(clinicId: string, startDate: Date, endDate: Date): Promise<WrapUpStats>;

  // Dashboard data
  getAgentWrapUpPerformance(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentWrapUpPerformance[]>;
  getWrapUpDashboardData(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpDashboardData>;

  // Maintenance
  abandonStaleWrapUps(maxAgeMinutes: number): Promise<number>;
}

/**
 * Service configuration options
 */
export interface WrapUpTimeServiceConfig {
  /** Maximum wrap-up duration before auto-abandon (minutes) */
  maxWrapUpMinutes?: number;
  /** Target wrap-up time in seconds (for performance evaluation) */
  targetWrapUpSeconds?: number;
  /** Whether to enable automatic stale wrap-up cleanup */
  enableAutoAbandon?: boolean;
}

/**
 * Service dependencies
 */
export interface WrapUpTimeServiceDeps {
  repository: IWrapUpTimeRepository;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Service for tracking agent wrap-up time between calls
 *
 * Wrap-up time (also known as After-Call Work or ACW) is the time an agent
 * spends after a call ends completing administrative tasks such as:
 * - Entering call disposition/outcome
 * - Adding notes to the lead record
 * - Scheduling follow-ups
 * - Updating CRM information
 */
export class WrapUpTimeService {
  private readonly config: Required<WrapUpTimeServiceConfig>;
  private readonly repository: IWrapUpTimeRepository;

  constructor(deps: WrapUpTimeServiceDeps, config?: WrapUpTimeServiceConfig) {
    this.repository = deps.repository;
    this.config = {
      maxWrapUpMinutes: config?.maxWrapUpMinutes ?? DEFAULT_WRAP_UP_TIMEOUT_MINUTES,
      targetWrapUpSeconds: config?.targetWrapUpSeconds ?? 60, // 1 minute target
      enableAutoAbandon: config?.enableAutoAbandon ?? true,
    };
  }

  // ============================================================================
  // WRAP-UP LIFECYCLE
  // ============================================================================

  /**
   * Start tracking wrap-up time for an agent after a call ends
   *
   * @param request - The wrap-up start request
   * @returns The created wrap-up event
   */
  async startWrapUp(request: StartWrapUpRequest): Promise<WrapUpEvent> {
    logger.info(
      { agentId: request.agentId, callSid: request.callSid },
      'Starting wrap-up tracking'
    );

    // Check for existing active wrap-up (shouldn't happen normally)
    const existingWrapUp = await this.repository.getActiveWrapUp(request.agentId);
    if (existingWrapUp) {
      logger.warn(
        { agentId: request.agentId, existingCallSid: existingWrapUp.callSid },
        'Agent has existing active wrap-up, abandoning it'
      );
      await this.repository.abandonWrapUp(existingWrapUp.callSid, request.agentId);
    }

    const wrapUpEvent = await this.repository.startWrapUp(request);

    logger.info({ wrapUpId: wrapUpEvent.id, agentId: request.agentId }, 'Wrap-up tracking started');

    return wrapUpEvent;
  }

  /**
   * Complete wrap-up tracking when disposition is entered
   *
   * @param request - The wrap-up completion request
   * @returns The completed wrap-up event with duration, or null if no active wrap-up
   */
  async completeWrapUp(request: CompleteWrapUpRequest): Promise<WrapUpEvent | null> {
    logger.info(
      { agentId: request.agentId, callSid: request.callSid },
      'Completing wrap-up tracking'
    );

    const wrapUpEvent = await this.repository.completeWrapUp(request);

    if (!wrapUpEvent) {
      logger.warn(
        { agentId: request.agentId, callSid: request.callSid },
        'No active wrap-up found to complete'
      );
      return null;
    }

    logger.info(
      {
        wrapUpId: wrapUpEvent.id,
        durationSeconds: wrapUpEvent.durationSeconds,
        agentId: request.agentId,
      },
      'Wrap-up completed'
    );

    return wrapUpEvent;
  }

  /**
   * Get the currently active wrap-up for an agent
   *
   * @param agentId - The agent ID
   * @returns The active wrap-up event, or null if none
   */
  async getActiveWrapUp(agentId: string): Promise<WrapUpEvent | null> {
    return this.repository.getActiveWrapUp(agentId);
  }

  /**
   * Calculate current wrap-up duration for an active wrap-up
   *
   * @param agentId - The agent ID
   * @returns Duration in seconds, or null if no active wrap-up
   */
  async getCurrentWrapUpDuration(agentId: string): Promise<number | null> {
    const activeWrapUp = await this.repository.getActiveWrapUp(agentId);

    if (!activeWrapUp) {
      return null;
    }

    const startedAt = new Date(activeWrapUp.startedAt);
    const now = new Date();
    return Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  }

  // ============================================================================
  // STATISTICS & ANALYTICS
  // ============================================================================

  /**
   * Get wrap-up statistics for an agent over a time period
   *
   * @param agentId - The agent ID
   * @param timeRange - The time range to analyze
   * @returns Wrap-up statistics
   */
  async getAgentWrapUpStats(
    agentId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpStats> {
    const days = TIME_RANGE_DAYS[timeRange];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.repository.getWrapUpStats(agentId, startDate, endDate);
  }

  /**
   * Get wrap-up time trend for an agent
   *
   * @param agentId - The agent ID
   * @param timeRange - The time range to analyze
   * @returns Array of trend data points
   */
  async getAgentWrapUpTrend(
    agentId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpTrendPoint[]> {
    return this.repository.getWrapUpTrend(agentId, timeRange);
  }

  /**
   * Calculate the average wrap-up time for an agent
   *
   * @param agentId - The agent ID
   * @param timeRange - The time range to analyze
   * @returns Average wrap-up time in seconds
   */
  async getAverageWrapUpTime(
    agentId: string,
    timeRange: AgentPerformanceTimeRange = '30d'
  ): Promise<number> {
    const stats = await this.getAgentWrapUpStats(agentId, timeRange);
    return stats.avgWrapUpTimeSeconds;
  }

  /**
   * Evaluate an agent's wrap-up performance against target
   *
   * @param agentId - The agent ID
   * @param timeRange - The time range to analyze
   * @returns Performance assessment
   */
  async evaluateAgentPerformance(
    agentId: string,
    timeRange: AgentPerformanceTimeRange = '30d'
  ): Promise<{
    avgWrapUpSeconds: number;
    targetSeconds: number;
    percentOfTarget: number;
    meetsTarget: boolean;
    trend: 'improving' | 'stable' | 'declining';
  }> {
    const stats = await this.getAgentWrapUpStats(agentId, timeRange);
    const trend = await this.getAgentWrapUpTrend(agentId, timeRange);

    const avgWrapUpSeconds = stats.avgWrapUpTimeSeconds;
    const targetSeconds = this.config.targetWrapUpSeconds;
    const percentOfTarget = targetSeconds > 0 ? (avgWrapUpSeconds / targetSeconds) * 100 : 0;

    // Calculate trend direction
    const trendDirection = this.calculateTrendDirection(trend);

    return {
      avgWrapUpSeconds,
      targetSeconds,
      percentOfTarget: Math.round(percentOfTarget),
      meetsTarget: avgWrapUpSeconds <= targetSeconds,
      trend: trendDirection,
    };
  }

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  /**
   * Get wrap-up performance data for all agents in a clinic
   *
   * @param clinicId - The clinic ID
   * @param timeRange - The time range to analyze
   * @returns Array of agent wrap-up performance data
   */
  async getClinicWrapUpPerformance(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentWrapUpPerformance[]> {
    return this.repository.getAgentWrapUpPerformance(clinicId, timeRange);
  }

  /**
   * Get complete wrap-up dashboard data for a clinic
   *
   * @param clinicId - The clinic ID
   * @param timeRange - The time range to analyze
   * @returns Complete dashboard data
   */
  async getWrapUpDashboardData(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpDashboardData> {
    return this.repository.getWrapUpDashboardData(clinicId, timeRange);
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  /**
   * Abandon stale wrap-ups that exceeded the maximum duration
   * This should be run periodically via a cron job
   *
   * @returns Number of wrap-ups abandoned
   */
  async abandonStaleWrapUps(): Promise<number> {
    if (!this.config.enableAutoAbandon) {
      return 0;
    }

    const count = await this.repository.abandonStaleWrapUps(this.config.maxWrapUpMinutes);

    if (count > 0) {
      logger.info(
        { count, maxAgeMinutes: this.config.maxWrapUpMinutes },
        'Abandoned stale wrap-ups'
      );
    }

    return count;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Calculate trend direction from trend data points
   */
  private calculateTrendDirection(trend: WrapUpTrendPoint[]): 'improving' | 'stable' | 'declining' {
    if (trend.length < 2) {
      return 'stable';
    }

    // Compare first half average to second half average
    const midpoint = Math.floor(trend.length / 2);
    const firstHalf = trend.slice(0, midpoint);
    const secondHalf = trend.slice(midpoint);

    const firstHalfAvg = this.calculateAverageWrapUpTime(firstHalf);
    const secondHalfAvg = this.calculateAverageWrapUpTime(secondHalf);

    if (firstHalfAvg === 0) {
      return 'stable';
    }

    const percentChange = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

    if (percentChange <= TREND_THRESHOLDS.IMPROVING) {
      return 'improving'; // Wrap-up time is decreasing (faster)
    } else if (percentChange >= TREND_THRESHOLDS.DECLINING) {
      return 'declining'; // Wrap-up time is increasing (slower)
    }

    return 'stable';
  }

  /**
   * Calculate average wrap-up time from trend points
   */
  private calculateAverageWrapUpTime(points: WrapUpTrendPoint[]): number {
    if (points.length === 0) return 0;

    const totalWrapUps = points.reduce((sum, p) => sum + p.wrapUpCount, 0);
    const totalTime = points.reduce((sum, p) => sum + p.totalWrapUpTimeSeconds, 0);

    return totalWrapUps > 0 ? totalTime / totalWrapUps : 0;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new WrapUpTimeService instance
 */
export function createWrapUpTimeService(
  deps: WrapUpTimeServiceDeps,
  config?: WrapUpTimeServiceConfig
): WrapUpTimeService {
  return new WrapUpTimeService(deps, config);
}
