/**
 * @fileoverview Capacity Planning Service
 *
 * High-level service facade for capacity planning operations.
 * Provides a simplified API for common capacity planning tasks.
 *
 * @module domain/capacity-planning/capacity-planning-service
 */

import { CapacityScore } from '../shared-kernel/value-objects/capacity-score.js';
import {
  createStaffShift,
  updateShiftBookings,
  updateShiftStatus,
  getShiftWorkingHours,
  shiftsOverlap,
  type StaffShift,
  type CreateStaffShiftInput,
  type ShiftStatus,
  type ShiftConflict,
} from './entities/staff-shift.js';
import {
  createCapacityPlan,
  getCriticalDates,
  getUnderutilizedDates,
  hasCriticalIssues,
  type CapacityPlan,
  type DailyCapacitySummary,
  type StaffingRecommendation,
  type DemandForecast,
  type HistoricalDemandData,
} from './entities/capacity-plan.js';
import {
  type CapacityPlanningPolicy,
  createCapacityPlanningPolicy,
  type CapacityPlanningConfig,
  type ConflictDetectionResult,
  type StaffingAnalysisResult,
  type OptimizationSuggestion,
} from './services/capacity-planning-policy.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the capacity planning service
 */
export interface CapacityPlanningServiceConfig {
  /** Policy configuration */
  policy?: Partial<CapacityPlanningConfig>;
  /** Enable AI-enhanced forecasting (future) */
  aiEnhancedForecasting?: boolean;
}

/**
 * Result of creating a shift
 */
export interface CreateShiftResult {
  success: boolean;
  shift?: StaffShift;
  errors?: { field: string; message: string }[];
}

/**
 * Result of analyzing capacity
 */
export interface CapacityAnalysisResult {
  plan: CapacityPlan;
  conflicts: ConflictDetectionResult;
  staffing: StaffingAnalysisResult;
  optimizations: OptimizationSuggestion[];
  criticalDates: DailyCapacitySummary[];
  underutilizedDates: DailyCapacitySummary[];
  hasCriticalIssues: boolean;
}

/**
 * Weekly capacity overview
 */
export interface WeeklyCapacityOverview {
  weekStartDate: Date;
  weekEndDate: Date;
  totalShifts: number;
  totalStaff: number;
  totalSlots: number;
  bookedSlots: number;
  averageUtilization: number;
  dailyBreakdown: DailyCapacitySummary[];
  conflicts: ShiftConflict[];
  urgentRecommendations: StaffingRecommendation[];
}

// ============================================================================
// CAPACITY PLANNING SERVICE
// ============================================================================

/**
 * Capacity Planning Service
 *
 * Provides a high-level API for capacity planning operations.
 * Use this service for common tasks; for complex orchestration,
 * use the PlanCapacityUseCase directly.
 *
 * @example
 * ```typescript
 * const service = createCapacityPlanningService();
 *
 * // Create a shift
 * const result = service.createShift({
 *   clinicId: 'clinic-123',
 *   staffId: 'staff-456',
 *   staffName: 'Dr. Smith',
 *   staffRole: 'DENTIST',
 *   shiftType: 'MORNING',
 *   startTime: new Date('2024-01-15T08:00:00'),
 *   endTime: new Date('2024-01-15T14:00:00'),
 * });
 *
 * // Analyze weekly capacity
 * const overview = service.getWeeklyOverview(shifts);
 * ```
 */
export class CapacityPlanningService {
  private readonly policy: CapacityPlanningPolicy;
  private readonly config: CapacityPlanningServiceConfig;

  constructor(config: CapacityPlanningServiceConfig = {}) {
    this.config = config;
    this.policy = createCapacityPlanningPolicy(config.policy);
  }

  // ============================================================================
  // SHIFT OPERATIONS
  // ============================================================================

  /**
   * Create a new staff shift
   */
  public createShift(input: CreateStaffShiftInput): CreateShiftResult {
    const result = createStaffShift(input);
    if (result.valid) {
      return { success: true, shift: result.shift };
    }
    return { success: false, errors: result.errors };
  }

  /**
   * Update shift booking count
   */
  public updateBookings(shift: StaffShift, bookedCount: number): StaffShift {
    return updateShiftBookings(shift, bookedCount);
  }

  /**
   * Update shift status
   */
  public updateStatus(shift: StaffShift, status: ShiftStatus): StaffShift {
    return updateShiftStatus(shift, status);
  }

  /**
   * Calculate working hours for a shift
   */
  public getWorkingHours(shift: StaffShift): number {
    return getShiftWorkingHours(shift);
  }

  /**
   * Check if two shifts overlap
   */
  public doShiftsOverlap(shift1: StaffShift, shift2: StaffShift): boolean {
    return shiftsOverlap(shift1, shift2);
  }

  // ============================================================================
  // CAPACITY ANALYSIS
  // ============================================================================

  /**
   * Analyze capacity for a set of shifts
   */
  public analyzeCapacity(
    clinicId: string,
    startDate: Date,
    endDate: Date,
    shifts: StaffShift[],
    historicalData?: HistoricalDemandData[]
  ): CapacityAnalysisResult {
    // Create capacity plan
    const plan = createCapacityPlan({
      clinicId,
      startDate,
      endDate,
      period: 'WEEK',
      shifts,
      historicalData,
    });

    // Detect conflicts
    const conflicts = this.policy.detectConflicts(shifts);

    // Analyze staffing
    const staffing = this.policy.analyzeStaffing(
      plan.dailySummaries as DailyCapacitySummary[],
      historicalData
    );

    // Generate optimizations
    const optimizations = this.policy.generateOptimizationSuggestions(
      shifts,
      plan.dailySummaries as DailyCapacitySummary[]
    );

    // Get critical and underutilized dates
    const criticalDates = getCriticalDates(plan);
    const underutilizedDates = getUnderutilizedDates(plan);

    return {
      plan,
      conflicts,
      staffing,
      optimizations,
      criticalDates,
      underutilizedDates,
      hasCriticalIssues: hasCriticalIssues(plan),
    };
  }

  /**
   * Get weekly capacity overview
   */
  public getWeeklyOverview(shifts: StaffShift[], weekStartDate?: Date): WeeklyCapacityOverview {
    // Default to current week
    const start = weekStartDate ?? this.getWeekStart(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    // Filter shifts for this week
    const weekShifts = shifts.filter((s) => {
      return s.startTime >= start && s.startTime <= end;
    });

    // Analyze capacity
    const dailySummaries = this.policy.analyzeCapacity(weekShifts);
    const conflicts = this.policy.detectConflicts(weekShifts);
    const staffing = this.policy.analyzeStaffing(dailySummaries);

    // Calculate totals
    const staffIds = new Set(weekShifts.map((s) => s.staffId));
    const totalSlots = weekShifts.reduce((sum, s) => sum + s.maxAppointments, 0);
    const bookedSlots = weekShifts.reduce((sum, s) => sum + s.bookedAppointments, 0);
    const avgUtilization = totalSlots > 0 ? (bookedSlots / totalSlots) * 100 : 0;

    return {
      weekStartDate: start,
      weekEndDate: end,
      totalShifts: weekShifts.length,
      totalStaff: staffIds.size,
      totalSlots,
      bookedSlots,
      averageUtilization: Math.round(avgUtilization * 10) / 10,
      dailyBreakdown: dailySummaries,
      conflicts: conflicts.conflicts,
      urgentRecommendations: staffing.recommendations.filter(
        (r) => r.priority === 'URGENT' || r.priority === 'HIGH'
      ),
    };
  }

  /**
   * Get capacity for a specific date
   */
  public getDailyCapacity(shifts: StaffShift[], date: Date): DailyCapacitySummary | null {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const dayShifts = shifts.filter((s) => s.startTime >= dayStart && s.startTime <= dayEnd);

    if (dayShifts.length === 0) {
      return null;
    }

    const summaries = this.policy.analyzeCapacity(dayShifts);
    return summaries[0] ?? null;
  }

  /**
   * Calculate capacity score from slots
   */
  public calculateCapacity(bookedSlots: number, totalSlots: number): CapacityScore {
    return CapacityScore.fromSlots(bookedSlots, totalSlots);
  }

  // ============================================================================
  // CONFLICT DETECTION
  // ============================================================================

  /**
   * Detect conflicts in shifts
   */
  public detectConflicts(shifts: StaffShift[]): ConflictDetectionResult {
    return this.policy.detectConflicts(shifts);
  }

  /**
   * Check if adding a shift would create conflicts
   */
  public wouldCreateConflict(newShift: StaffShift, existingShifts: StaffShift[]): boolean {
    const allShifts = [...existingShifts, newShift];
    const result = this.policy.detectConflicts(allShifts);
    // Check if the new shift is involved in any conflict (either as primary or conflicting)
    return result.conflicts.some(
      (c) => c.shiftId === newShift.id || c.conflictingShiftId === newShift.id
    );
  }

  // ============================================================================
  // STAFFING RECOMMENDATIONS
  // ============================================================================

  /**
   * Get staffing recommendations
   */
  public getStaffingRecommendations(
    shifts: StaffShift[],
    historicalData?: HistoricalDemandData[]
  ): StaffingAnalysisResult {
    const summaries = this.policy.analyzeCapacity(shifts);
    return this.policy.analyzeStaffing(summaries, historicalData);
  }

  // ============================================================================
  // DEMAND FORECASTING
  // ============================================================================

  /**
   * Forecast demand for a date range
   */
  public forecastDemand(
    startDate: Date,
    endDate: Date,
    historicalData: HistoricalDemandData[]
  ): DemandForecast[] {
    return this.policy.forecastDemand(startDate, endDate, historicalData);
  }

  // ============================================================================
  // OPTIMIZATION
  // ============================================================================

  /**
   * Get optimization suggestions
   */
  public getOptimizationSuggestions(shifts: StaffShift[]): OptimizationSuggestion[] {
    const summaries = this.policy.analyzeCapacity(shifts);
    return this.policy.generateOptimizationSuggestions(shifts, summaries);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get the start of the week (Monday)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

/**
 * Create a configured capacity planning service
 */
export function createCapacityPlanningService(
  config: CapacityPlanningServiceConfig = {}
): CapacityPlanningService {
  return new CapacityPlanningService(config);
}
