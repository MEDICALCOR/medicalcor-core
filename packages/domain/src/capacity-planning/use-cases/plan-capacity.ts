/**
 * @fileoverview Plan Capacity Use Case
 *
 * Application layer orchestration for creating and managing capacity plans.
 * This use case coordinates between domain services, repositories, and events.
 *
 * @module domain/capacity-planning/use-cases/plan-capacity
 */

import {
  createCapacityPlan,
  type CapacityPlan,
  type HistoricalDemandData,
  type DailyCapacitySummary,
} from '../entities/capacity-plan.js';
import {
  CapacityPlanningPolicy,
  type ConflictDetectionResult,
  type StaffingAnalysisResult,
  type OptimizationSuggestion,
} from '../services/capacity-planning-policy.js';
import type { ICapacityPlanningRepository } from '../repositories/capacity-planning-repository.js';
import {
  createPlanCreatedEvent,
  createCapacityCalculatedEvent,
  createCapacityCriticalEvent,
  createConflictDetectedEvent,
  createStaffingRecommendationEvent,
  createStaffingGapDetectedEvent,
  type CapacityDomainEvent,
  type EventMetadata,
} from '../events/capacity-events.js';

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for planning capacity
 */
export interface PlanCapacityInput {
  /** Clinic ID */
  readonly clinicId: string;
  /** Start date of plan period */
  readonly startDate: Date;
  /** End date of plan period */
  readonly endDate: Date;
  /** Plan period type */
  readonly period: 'DAY' | 'WEEK' | 'MONTH';
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Idempotency key to prevent duplicate operations */
  readonly idempotencyKey?: string;
  /** Whether to include demand forecasts */
  readonly includeForecast?: boolean;
  /** Whether to include optimization suggestions */
  readonly includeOptimizations?: boolean;
}

/**
 * Output of capacity planning
 */
export interface PlanCapacityOutput {
  /** Generated capacity plan */
  readonly plan: CapacityPlan;
  /** Conflict detection results */
  readonly conflictAnalysis: ConflictDetectionResult;
  /** Staffing analysis results */
  readonly staffingAnalysis: StaffingAnalysisResult;
  /** Optimization suggestions (if requested) */
  readonly optimizations: readonly OptimizationSuggestion[];
  /** Domain events emitted */
  readonly events: readonly CapacityDomainEvent[];
  /** Summary message */
  readonly summary: string;
}

/**
 * Error types for plan capacity use case
 */
export type PlanCapacityErrorCode =
  | 'INVALID_DATE_RANGE'
  | 'CLINIC_NOT_FOUND'
  | 'NO_SHIFTS_FOUND'
  | 'REPOSITORY_ERROR'
  | 'VALIDATION_ERROR';

/**
 * Plan capacity error
 */
export interface PlanCapacityError {
  readonly code: PlanCapacityErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Result type for plan capacity use case
 */
export type PlanCapacityResult =
  | { success: true; value: PlanCapacityOutput }
  | { success: false; error: PlanCapacityError };

// ============================================================================
// USE CASE IMPLEMENTATION
// ============================================================================

/**
 * Plan Capacity Use Case
 *
 * Orchestrates the creation of a capacity plan by:
 * 1. Fetching shifts for the date range
 * 2. Detecting conflicts
 * 3. Analyzing staffing
 * 4. Generating forecasts (optional)
 * 5. Creating optimization suggestions (optional)
 * 6. Emitting domain events
 */
export class PlanCapacityUseCase {
  private readonly repository: ICapacityPlanningRepository;
  private readonly policy: CapacityPlanningPolicy;

  constructor(repository: ICapacityPlanningRepository, policy?: CapacityPlanningPolicy) {
    this.repository = repository;
    this.policy = policy ?? new CapacityPlanningPolicy();
  }

  /**
   * Execute the use case
   */
  public async execute(input: PlanCapacityInput): Promise<PlanCapacityResult> {
    // Validate input
    const validation = this.validateInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.message,
          details: validation.details,
        },
      };
    }

    // Fetch shifts for the date range
    const shiftsResult = await this.repository.getShiftsInRange(
      input.clinicId,
      input.startDate,
      input.endDate
    );

    if (!shiftsResult.success) {
      return {
        success: false,
        error: {
          code: 'REPOSITORY_ERROR',
          message: shiftsResult.error.message,
          details: { repositoryError: shiftsResult.error },
        },
      };
    }

    const shifts = shiftsResult.value;

    // Fetch historical data for forecasting
    let historicalData: HistoricalDemandData[] = [];
    if (input.includeForecast) {
      const historicalResult = await this.repository.getHistoricalDemand(
        input.clinicId,
        new Date(input.startDate.getTime() - 90 * 24 * 60 * 60 * 1000), // 90 days back
        input.startDate
      );
      if (historicalResult.success) {
        historicalData = historicalResult.value;
      }
    }

    // Create capacity plan
    const plan = createCapacityPlan({
      clinicId: input.clinicId,
      startDate: input.startDate,
      endDate: input.endDate,
      period: input.period,
      shifts,
      historicalData,
    });

    // Detect conflicts
    const conflictAnalysis = this.policy.detectConflicts(shifts);

    // Analyze staffing
    const staffingAnalysis = this.policy.analyzeStaffing(
      plan.dailySummaries as DailyCapacitySummary[],
      historicalData
    );

    // Generate optimizations if requested
    const optimizations = input.includeOptimizations
      ? this.policy.generateOptimizationSuggestions(
          shifts,
          plan.dailySummaries as DailyCapacitySummary[]
        )
      : [];

    // Emit domain events
    const events = this.emitEvents(input, plan, conflictAnalysis, staffingAnalysis);

    // Generate summary
    const summary = this.generateSummary(plan, conflictAnalysis, staffingAnalysis);

    // Save the plan
    const saveResult = await this.repository.savePlan(plan);
    if (!saveResult.success) {
      // Log warning but don't fail - plan was generated successfully
      console.warn('Failed to save capacity plan:', saveResult.error);
    }

    return {
      success: true,
      value: {
        plan,
        conflictAnalysis,
        staffingAnalysis,
        optimizations: Object.freeze(optimizations),
        events: Object.freeze(events),
        summary,
      },
    };
  }

  /**
   * Validate input parameters
   */
  private validateInput(input: PlanCapacityInput): {
    valid: boolean;
    message: string;
    details?: Record<string, unknown>;
  } {
    if (!input.clinicId.trim()) {
      return { valid: false, message: 'Clinic ID is required' };
    }

    if (!(input.startDate instanceof Date) || isNaN(input.startDate.getTime())) {
      return { valid: false, message: 'Valid start date is required' };
    }

    if (!(input.endDate instanceof Date) || isNaN(input.endDate.getTime())) {
      return { valid: false, message: 'Valid end date is required' };
    }

    if (input.startDate >= input.endDate) {
      return {
        valid: false,
        message: 'End date must be after start date',
        details: {
          startDate: input.startDate.toISOString(),
          endDate: input.endDate.toISOString(),
        },
      };
    }

    // Max 31 days for now
    const daysDiff = (input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 31) {
      return {
        valid: false,
        message: 'Date range cannot exceed 31 days',
        details: { daysDiff },
      };
    }

    if (!input.correlationId.trim()) {
      return { valid: false, message: 'Correlation ID is required' };
    }

    return { valid: true, message: 'OK' };
  }

  /**
   * Emit domain events for the planning operation
   */
  private emitEvents(
    input: PlanCapacityInput,
    plan: CapacityPlan,
    conflictAnalysis: ConflictDetectionResult,
    staffingAnalysis: StaffingAnalysisResult
  ): CapacityDomainEvent[] {
    const events: CapacityDomainEvent[] = [];
    const metadata: EventMetadata = {
      clinicId: input.clinicId,
      source: 'system',
    };

    // Plan created event
    events.push(
      createPlanCreatedEvent(
        plan.id,
        {
          planId: plan.id,
          clinicId: plan.clinicId,
          startDate: plan.startDate.toISOString(),
          endDate: plan.endDate.toISOString(),
          period: plan.period,
          shiftCount: plan.shifts.length,
          conflictCount: plan.conflicts.length,
        },
        input.correlationId,
        metadata
      )
    );

    // Capacity calculated events for each day
    for (const summary of plan.dailySummaries) {
      events.push(
        createCapacityCalculatedEvent(
          plan.id,
          {
            planId: plan.id,
            clinicId: plan.clinicId,
            date: summary.date.toISOString(),
            utilizationPercent: summary.utilization,
            level: summary.level,
            totalSlots: summary.totalSlots,
            bookedSlots: summary.bookedSlots,
            staffCount: summary.staffCount,
          },
          input.correlationId,
          metadata
        )
      );

      // Critical capacity events
      if (summary.level === 'CRITICAL' || summary.level === 'OVERBOOKED') {
        events.push(
          createCapacityCriticalEvent(
            plan.id,
            {
              planId: plan.id,
              clinicId: plan.clinicId,
              date: summary.date.toISOString(),
              utilizationPercent: summary.utilization,
              affectedShifts: plan.shifts
                .filter((s) => {
                  const shiftDate = new Date(s.startTime);
                  shiftDate.setHours(0, 0, 0, 0);
                  const summaryDate = new Date(summary.date);
                  summaryDate.setHours(0, 0, 0, 0);
                  return shiftDate.getTime() === summaryDate.getTime();
                })
                .map((s) => s.id),
              recommendedAction:
                summary.level === 'OVERBOOKED'
                  ? 'Reschedule appointments or add emergency staff'
                  : 'Add additional staff or limit new bookings',
            },
            input.correlationId,
            metadata
          )
        );
      }
    }

    // Conflict detected events
    for (const conflict of conflictAnalysis.conflicts) {
      events.push(
        createConflictDetectedEvent(
          conflict.shiftId,
          {
            conflictType: conflict.type,
            shiftId: conflict.shiftId,
            conflictingShiftId: conflict.conflictingShiftId,
            staffId: conflict.staffId,
            severity: conflict.severity,
            description: conflict.description,
            suggestedResolution: conflict.suggestedResolution,
          },
          input.correlationId,
          metadata
        )
      );
    }

    // Staffing recommendation events
    for (const rec of staffingAnalysis.recommendations) {
      events.push(
        createStaffingRecommendationEvent(
          plan.id,
          {
            clinicId: plan.clinicId,
            date: rec.date.toISOString(),
            currentStaff: rec.currentStaff,
            recommendedStaff: rec.recommendedStaff,
            role: rec.role,
            priority: rec.priority,
            reason: rec.reason,
          },
          input.correlationId,
          metadata
        )
      );
    }

    // Staffing gap events
    for (const gap of staffingAnalysis.gapAnalysis) {
      events.push(
        createStaffingGapDetectedEvent(
          plan.id,
          {
            clinicId: plan.clinicId,
            date: gap.date.toISOString(),
            role: gap.role,
            required: gap.required,
            scheduled: gap.scheduled,
            gap: gap.gap,
          },
          input.correlationId,
          metadata
        )
      );
    }

    return events;
  }

  /**
   * Generate a summary message
   */
  private generateSummary(
    plan: CapacityPlan,
    conflictAnalysis: ConflictDetectionResult,
    staffingAnalysis: StaffingAnalysisResult
  ): string {
    const parts: string[] = [];

    parts.push(
      `Capacity plan created for ${plan.shifts.length} shifts over ${plan.dailySummaries.length} days.`
    );

    if (conflictAnalysis.conflicts.length > 0) {
      parts.push(conflictAnalysis.summary);
    } else {
      parts.push('No scheduling conflicts detected.');
    }

    if (!staffingAnalysis.isAdequate) {
      parts.push(
        `Staffing gaps identified: ${staffingAnalysis.recommendations.filter((r) => r.priority === 'URGENT' || r.priority === 'HIGH').length} urgent/high priority recommendations.`
      );
    } else {
      parts.push('Staffing levels are adequate.');
    }

    const utilizationAvg =
      plan.dailySummaries.reduce((sum, d) => sum + d.utilization, 0) / plan.dailySummaries.length;
    parts.push(`Average utilization: ${utilizationAvg.toFixed(1)}%`);

    return parts.join(' ');
  }
}

/**
 * Create a plan capacity use case instance
 */
export function createPlanCapacityUseCase(
  repository: ICapacityPlanningRepository,
  policy?: CapacityPlanningPolicy
): PlanCapacityUseCase {
  return new PlanCapacityUseCase(repository, policy);
}
