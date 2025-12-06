/**
 * @fileoverview Capacity Planning Policy Service
 *
 * Pure domain logic for capacity planning decisions.
 * Contains business rules for shift scheduling, conflict detection,
 * and staffing recommendations.
 *
 * @module domain/capacity-planning/services/capacity-planning-policy
 */

import { CapacityScore } from '../../shared-kernel/value-objects/capacity-score.js';
import type { StaffShift, ShiftConflict, StaffRole } from '../entities/staff-shift.js';
import type {
  DailyCapacitySummary,
  StaffingRecommendation,
  DemandForecast,
  HistoricalDemandData,
} from '../entities/capacity-plan.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for capacity planning policies
 */
export interface CapacityPlanningConfig {
  /** Maximum hours per week per staff member */
  maxWeeklyHours: number;
  /** Maximum consecutive working days */
  maxConsecutiveDays: number;
  /** Minimum rest hours between shifts */
  minRestHours: number;
  /** Optimal utilization target (percentage) */
  optimalUtilizationTarget: number;
  /** Critical utilization threshold (percentage) */
  criticalUtilizationThreshold: number;
  /** Minimum required dentists per day */
  minDentistsPerDay: number;
  /** Minimum support staff ratio (support:dentist) */
  minSupportStaffRatio: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CAPACITY_CONFIG: CapacityPlanningConfig = {
  maxWeeklyHours: 45,
  maxConsecutiveDays: 6,
  minRestHours: 8,
  optimalUtilizationTarget: 70,
  criticalUtilizationThreshold: 85,
  minDentistsPerDay: 1,
  minSupportStaffRatio: 1.5,
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of conflict detection
 */
export interface ConflictDetectionResult {
  conflicts: ShiftConflict[];
  hasBlockers: boolean;
  hasCritical: boolean;
  summary: string;
}

/**
 * Result of staffing analysis
 */
export interface StaffingAnalysisResult {
  isAdequate: boolean;
  recommendations: StaffingRecommendation[];
  gapAnalysis: StaffingGap[];
}

/**
 * Staffing gap for a specific role/time
 */
export interface StaffingGap {
  date: Date;
  role: StaffRole;
  required: number;
  scheduled: number;
  gap: number;
}

/**
 * Optimization suggestion
 */
export interface OptimizationSuggestion {
  type: 'REDISTRIBUTE' | 'ADD_SHIFT' | 'REMOVE_SHIFT' | 'EXTEND_SHIFT' | 'SHORTEN_SHIFT';
  shiftId?: string;
  staffId?: string;
  description: string;
  impact: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ============================================================================
// CAPACITY PLANNING POLICY SERVICE
// ============================================================================

/**
 * Capacity Planning Policy Service
 *
 * Contains pure domain logic for capacity planning decisions.
 * No side effects, no I/O - pure business rules.
 */
export class CapacityPlanningPolicy {
  private config: CapacityPlanningConfig;

  constructor(config: Partial<CapacityPlanningConfig> = {}) {
    this.config = { ...DEFAULT_CAPACITY_CONFIG, ...config };
  }

  // ============================================================================
  // CONFLICT DETECTION
  // ============================================================================

  /**
   * Detect all conflicts in a set of shifts
   */
  public detectConflicts(shifts: StaffShift[]): ConflictDetectionResult {
    const conflicts: ShiftConflict[] = [];

    // Group shifts by staff member
    const staffShifts = this.groupShiftsByStaff(shifts);

    for (const [staffId, memberShifts] of staffShifts) {
      // Detect individual staff conflicts
      conflicts.push(...this.detectStaffConflicts(staffId, memberShifts));
    }

    // Detect team-level conflicts
    conflicts.push(...this.detectTeamConflicts(shifts));

    const hasBlockers = conflicts.some((c) => c.severity === 'CRITICAL');
    const hasCritical = conflicts.some((c) => c.severity === 'CRITICAL' || c.severity === 'HIGH');

    return {
      conflicts,
      hasBlockers,
      hasCritical,
      summary: this.generateConflictSummary(conflicts),
    };
  }

  /**
   * Detect conflicts for a single staff member
   */
  private detectStaffConflicts(staffId: string, shifts: StaffShift[]): ShiftConflict[] {
    const conflicts: ShiftConflict[] = [];
    const sorted = [...shifts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Check for overlaps and rest violations
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1]!;

      // Overlap check
      if (current.endTime > next.startTime) {
        conflicts.push({
          type: 'OVERLAP',
          shiftId: current.id,
          conflictingShiftId: next.id,
          staffId,
          description: `${current.staffName}: Shifts overlap between ${this.formatTime(current.endTime)} and ${this.formatTime(next.startTime)}`,
          severity: 'CRITICAL',
          suggestedResolution: 'Adjust shift times to eliminate overlap',
        });
      }

      // Rest period check
      const restHours = (next.startTime.getTime() - current.endTime.getTime()) / (1000 * 60 * 60);
      if (restHours > 0 && restHours < this.config.minRestHours) {
        conflicts.push({
          type: 'REST_VIOLATION',
          shiftId: next.id,
          conflictingShiftId: current.id,
          staffId,
          description: `${current.staffName}: Only ${restHours.toFixed(1)}h rest (minimum: ${this.config.minRestHours}h)`,
          severity: 'MEDIUM',
          suggestedResolution: `Ensure at least ${this.config.minRestHours} hours between shifts`,
        });
      }
    }

    // Check consecutive days
    const consecutiveDays = this.calculateConsecutiveDays(shifts);
    const firstShift = shifts[0];
    if (consecutiveDays > this.config.maxConsecutiveDays && firstShift) {
      conflicts.push({
        type: 'CONSECUTIVE_DAYS',
        shiftId: firstShift.id,
        staffId,
        description: `${firstShift.staffName}: ${consecutiveDays} consecutive days (max: ${this.config.maxConsecutiveDays})`,
        severity: 'HIGH',
        suggestedResolution: 'Schedule a day off within the work period',
      });
    }

    // Check weekly hours
    const weeklyHours = this.calculateWeeklyHours(shifts);
    if (weeklyHours > this.config.maxWeeklyHours && firstShift) {
      conflicts.push({
        type: 'OVERTIME',
        shiftId: firstShift.id,
        staffId,
        description: `${firstShift.staffName}: ${weeklyHours.toFixed(1)}h/week (max: ${this.config.maxWeeklyHours}h)`,
        severity: 'MEDIUM',
        suggestedResolution: 'Reduce hours or redistribute shifts',
      });
    }

    return conflicts;
  }

  /**
   * Detect team-level conflicts
   */
  private detectTeamConflicts(shifts: StaffShift[]): ShiftConflict[] {
    const conflicts: ShiftConflict[] = [];

    // Group shifts by date
    const dateShifts = this.groupShiftsByDate(shifts);

    for (const [dateStr, dayShifts] of dateShifts) {
      const dentistCount = dayShifts.filter(
        (s) => s.staffRole === 'DENTIST' || s.staffRole === 'SPECIALIST'
      ).length;

      const supportCount = dayShifts.filter(
        (s) =>
          s.staffRole === 'DENTAL_ASSISTANT' ||
          s.staffRole === 'HYGIENIST' ||
          s.staffRole === 'RECEPTIONIST'
      ).length;

      // Check minimum dentists
      const firstDayShift = dayShifts[0];
      if (dayShifts.length > 0 && dentistCount < this.config.minDentistsPerDay && firstDayShift) {
        conflicts.push({
          type: 'UNDERSTAFFED',
          shiftId: firstDayShift.id,
          staffId: '',
          description: `${dateStr}: Only ${dentistCount} dentist(s) (min: ${this.config.minDentistsPerDay})`,
          severity: 'CRITICAL',
          suggestedResolution: 'Schedule additional dentist coverage',
        });
      }

      // Check support staff ratio
      if (dentistCount > 0 && firstDayShift) {
        const actualRatio = supportCount / dentistCount;
        if (actualRatio < this.config.minSupportStaffRatio) {
          conflicts.push({
            type: 'UNDERSTAFFED',
            shiftId: firstDayShift.id,
            staffId: '',
            description: `${dateStr}: Support ratio ${actualRatio.toFixed(1)}:1 (min: ${this.config.minSupportStaffRatio}:1)`,
            severity: 'MEDIUM',
            suggestedResolution: 'Add support staff (assistant/hygienist/receptionist)',
          });
        }
      }
    }

    return conflicts;
  }

  // ============================================================================
  // CAPACITY ANALYSIS
  // ============================================================================

  /**
   * Analyze capacity for a set of shifts
   */
  public analyzeCapacity(shifts: StaffShift[]): DailyCapacitySummary[] {
    const dateShifts = this.groupShiftsByDate(shifts);
    const summaries: DailyCapacitySummary[] = [];

    for (const [dateStr, dayShifts] of dateShifts) {
      const totalSlots = dayShifts.reduce((sum, s) => sum + s.maxAppointments, 0);
      const bookedSlots = dayShifts.reduce((sum, s) => sum + s.bookedAppointments, 0);
      const utilization = totalSlots > 0 ? (bookedSlots / totalSlots) * 100 : 0;
      const capacity = CapacityScore.fromSlots(bookedSlots, totalSlots);
      const staffIds = new Set(dayShifts.map((s) => s.staffId));
      const conflicts = this.detectTeamConflicts(dayShifts);

      summaries.push({
        date: new Date(dateStr),
        totalSlots,
        bookedSlots,
        utilization: Math.round(utilization * 10) / 10,
        level: capacity.level,
        shiftCount: dayShifts.length,
        staffCount: staffIds.size,
        conflicts: Object.freeze(conflicts),
      });
    }

    return summaries.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Calculate overall capacity score
   */
  public calculateOverallCapacity(summaries: DailyCapacitySummary[]): CapacityScore {
    if (summaries.length === 0) {
      return CapacityScore.fromSlots(0, 0);
    }

    const totalSlots = summaries.reduce((sum, s) => sum + s.totalSlots, 0);
    const bookedSlots = summaries.reduce((sum, s) => sum + s.bookedSlots, 0);

    return CapacityScore.fromSlots(bookedSlots, totalSlots);
  }

  // ============================================================================
  // STAFFING RECOMMENDATIONS
  // ============================================================================

  /**
   * Analyze staffing and generate recommendations
   */
  public analyzeStaffing(
    summaries: DailyCapacitySummary[],
    historicalData?: HistoricalDemandData[]
  ): StaffingAnalysisResult {
    const recommendations: StaffingRecommendation[] = [];
    const gaps: StaffingGap[] = [];
    let isAdequate = true;

    for (const summary of summaries) {
      // Check for capacity issues
      if (summary.level === 'CRITICAL' || summary.level === 'OVERBOOKED') {
        isAdequate = false;
        recommendations.push({
          date: summary.date,
          shiftType: 'ALL',
          currentStaff: summary.staffCount,
          recommendedStaff: summary.staffCount + Math.ceil((summary.utilization - 85) / 15),
          role: 'DENTIST',
          priority: summary.level === 'OVERBOOKED' ? 'URGENT' : 'HIGH',
          reason: `Utilization at ${summary.utilization}% - exceeds optimal threshold`,
        });
      }

      // Check for underutilization
      if (summary.level === 'UNDERUTILIZED' && summary.staffCount > 1) {
        recommendations.push({
          date: summary.date,
          shiftType: 'ALL',
          currentStaff: summary.staffCount,
          recommendedStaff: Math.max(1, summary.staffCount - 1),
          role: 'DENTAL_ASSISTANT',
          priority: 'LOW',
          reason: `Utilization at ${summary.utilization}% - below optimal, consider reducing staff`,
        });
      }

      // Check against historical data if available
      if (historicalData) {
        const dayOfWeek = summary.date.getDay();
        const relevantHistory = historicalData.filter((h) => h.dayOfWeek === dayOfWeek);

        if (relevantHistory.length > 0) {
          const avgDemand =
            relevantHistory.reduce((sum, h) => sum + h.appointments, 0) / relevantHistory.length;

          if (summary.totalSlots < avgDemand * 0.9) {
            gaps.push({
              date: summary.date,
              role: 'DENTIST',
              required: Math.ceil(avgDemand / 8), // Assume 8 appts per dentist
              scheduled: summary.staffCount,
              gap: Math.ceil(avgDemand / 8) - summary.staffCount,
            });

            recommendations.push({
              date: summary.date,
              shiftType: 'ALL',
              currentStaff: summary.staffCount,
              recommendedStaff: Math.ceil(avgDemand / 8),
              role: 'DENTIST',
              priority: 'MEDIUM',
              reason: `Historical demand (${Math.round(avgDemand)}) exceeds capacity (${summary.totalSlots} slots)`,
            });
          }
        }
      }
    }

    return {
      isAdequate,
      recommendations,
      gapAnalysis: gaps,
    };
  }

  // ============================================================================
  // DEMAND FORECASTING
  // ============================================================================

  /**
   * Generate demand forecasts
   */
  public forecastDemand(
    startDate: Date,
    endDate: Date,
    historicalData: HistoricalDemandData[]
  ): DemandForecast[] {
    const forecasts: DemandForecast[] = [];

    if (historicalData.length === 0) {
      return forecasts;
    }

    // Calculate day-of-week averages
    const dayStats = new Map<number, { total: number; count: number }>();
    for (const data of historicalData) {
      const existing = dayStats.get(data.dayOfWeek) ?? { total: 0, count: 0 };
      existing.total += data.appointments;
      existing.count++;
      dayStats.set(data.dayOfWeek, existing);
    }

    // Calculate trend from recent vs older data
    const trend = this.calculateTrend(historicalData);

    // Generate forecasts
    const current = new Date(startDate);
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      const stats = dayStats.get(dayOfWeek);

      if (stats && stats.count > 0) {
        const baseAvg = stats.total / stats.count;
        const trendMultiplier = trend === 'INCREASING' ? 1.05 : trend === 'DECREASING' ? 0.95 : 1.0;

        forecasts.push({
          date: new Date(current),
          predictedDemand: Math.round(baseAvg * trendMultiplier),
          confidence: Math.min(0.95, 0.5 + stats.count * 0.03),
          basedOn: `${stats.count} historical data points`,
          trend,
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return forecasts;
  }

  /**
   * Calculate demand trend
   */
  private calculateTrend(
    historicalData: HistoricalDemandData[]
  ): 'INCREASING' | 'STABLE' | 'DECREASING' {
    if (historicalData.length < 14) {
      return 'STABLE';
    }

    const sorted = [...historicalData].sort((a, b) => a.date.getTime() - b.date.getTime());
    const midpoint = Math.floor(sorted.length / 2);
    const olderHalf = sorted.slice(0, midpoint);
    const recentHalf = sorted.slice(midpoint);

    const olderAvg = olderHalf.reduce((sum, d) => sum + d.appointments, 0) / olderHalf.length;
    const recentAvg = recentHalf.reduce((sum, d) => sum + d.appointments, 0) / recentHalf.length;

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (changePercent > 10) return 'INCREASING';
    if (changePercent < -10) return 'DECREASING';
    return 'STABLE';
  }

  // ============================================================================
  // OPTIMIZATION SUGGESTIONS
  // ============================================================================

  /**
   * Generate optimization suggestions
   */
  public generateOptimizationSuggestions(
    shifts: StaffShift[],
    summaries: DailyCapacitySummary[]
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Find underutilized days
    const underutilized = summaries.filter((s) => s.level === 'UNDERUTILIZED');
    const overbooked = summaries.filter((s) => s.level === 'CRITICAL' || s.level === 'OVERBOOKED');

    // Suggest redistribution if both exist
    if (underutilized.length > 0 && overbooked.length > 0) {
      suggestions.push({
        type: 'REDISTRIBUTE',
        description: `Move staff from underutilized days (${underutilized.map((u) => this.formatDate(u.date)).join(', ')}) to high-demand days`,
        impact: `Could improve utilization balance by redistributing ${underutilized.length} shifts`,
        priority: 'HIGH',
      });
    }

    // Check for very short shifts
    const shortShifts = shifts.filter((s) => {
      const hours = (s.endTime.getTime() - s.startTime.getTime()) / (1000 * 60 * 60);
      return hours < 4;
    });

    for (const shift of shortShifts) {
      suggestions.push({
        type: 'EXTEND_SHIFT',
        shiftId: shift.id,
        staffId: shift.staffId,
        description: `Extend ${shift.staffName}'s short shift on ${this.formatDate(shift.startTime)}`,
        impact: 'Short shifts are less efficient - extending could improve coverage',
        priority: 'LOW',
      });
    }

    // Check for gaps in coverage
    for (const summary of summaries) {
      if (summary.shiftCount === 0) {
        suggestions.push({
          type: 'ADD_SHIFT',
          description: `Add shift coverage for ${this.formatDate(summary.date)}`,
          impact: 'No staff scheduled - adding coverage will enable appointments',
          priority: 'HIGH',
        });
      }
    }

    return suggestions;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private groupShiftsByStaff(shifts: StaffShift[]): Map<string, StaffShift[]> {
    const grouped = new Map<string, StaffShift[]>();
    for (const shift of shifts) {
      const existing = grouped.get(shift.staffId) ?? [];
      existing.push(shift);
      grouped.set(shift.staffId, existing);
    }
    return grouped;
  }

  private groupShiftsByDate(shifts: StaffShift[]): Map<string, StaffShift[]> {
    const grouped = new Map<string, StaffShift[]>();
    for (const shift of shifts) {
      const dateStr = this.formatDate(shift.startTime);
      const existing = grouped.get(dateStr) ?? [];
      existing.push(shift);
      grouped.set(dateStr, existing);
    }
    return grouped;
  }

  private calculateConsecutiveDays(shifts: StaffShift[]): number {
    const dates = new Set(shifts.map((s) => this.formatDate(s.startTime)));
    const sortedDates = [...dates].sort();

    let maxConsecutive = 0;
    let currentStreak = 0;

    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        currentStreak = 1;
      } else {
        const prevDate = sortedDates[i - 1];
        const currDate = sortedDates[i];
        if (prevDate && currDate) {
          const prev = new Date(prevDate);
          const curr = new Date(currDate);
          const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

          if (diffDays === 1) {
            currentStreak++;
          } else {
            currentStreak = 1;
          }
        }
      }
      maxConsecutive = Math.max(maxConsecutive, currentStreak);
    }

    return maxConsecutive;
  }

  private calculateWeeklyHours(shifts: StaffShift[]): number {
    return shifts.reduce((total, shift) => {
      const hours =
        (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60) -
        shift.breakMinutes / 60;
      return total + hours;
    }, 0);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0] ?? '';
  }

  private formatTime(date: Date): string {
    return date.toTimeString().slice(0, 5);
  }

  private generateConflictSummary(conflicts: ShiftConflict[]): string {
    if (conflicts.length === 0) {
      return 'No conflicts detected';
    }

    const bySeverity = {
      CRITICAL: conflicts.filter((c) => c.severity === 'CRITICAL').length,
      HIGH: conflicts.filter((c) => c.severity === 'HIGH').length,
      MEDIUM: conflicts.filter((c) => c.severity === 'MEDIUM').length,
      LOW: conflicts.filter((c) => c.severity === 'LOW').length,
    };

    const parts: string[] = [];
    if (bySeverity.CRITICAL > 0) parts.push(`${bySeverity.CRITICAL} critical`);
    if (bySeverity.HIGH > 0) parts.push(`${bySeverity.HIGH} high`);
    if (bySeverity.MEDIUM > 0) parts.push(`${bySeverity.MEDIUM} medium`);
    if (bySeverity.LOW > 0) parts.push(`${bySeverity.LOW} low`);

    return `${conflicts.length} conflict(s): ${parts.join(', ')}`;
  }
}

/**
 * Create a configured capacity planning policy
 */
export function createCapacityPlanningPolicy(
  config: Partial<CapacityPlanningConfig> = {}
): CapacityPlanningPolicy {
  return new CapacityPlanningPolicy(config);
}
