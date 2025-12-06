/**
 * @fileoverview CapacityPlan Entity
 *
 * Represents a capacity plan for a clinic over a date range.
 * Aggregates shift data and provides capacity insights.
 *
 * @module domain/capacity-planning/entities/capacity-plan
 */

import {
  CapacityScore,
  type CapacityLevel,
} from '../../shared-kernel/value-objects/capacity-score.js';
import type { StaffShift, ShiftConflict, StaffRole } from './staff-shift.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Time period for capacity planning
 */
export type PlanPeriod = 'DAY' | 'WEEK' | 'MONTH';

/**
 * Staffing recommendation for the plan
 */
export interface StaffingRecommendation {
  readonly date: Date;
  readonly shiftType: string;
  readonly currentStaff: number;
  readonly recommendedStaff: number;
  readonly role: StaffRole;
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  readonly reason: string;
}

/**
 * Daily capacity summary
 */
export interface DailyCapacitySummary {
  readonly date: Date;
  readonly totalSlots: number;
  readonly bookedSlots: number;
  readonly utilization: number;
  readonly level: CapacityLevel;
  readonly shiftCount: number;
  readonly staffCount: number;
  readonly conflicts: readonly ShiftConflict[];
}

/**
 * Demand forecast for future planning
 */
export interface DemandForecast {
  readonly date: Date;
  readonly predictedDemand: number;
  readonly confidence: number;
  readonly basedOn: string;
  readonly trend: 'INCREASING' | 'STABLE' | 'DECREASING';
}

/**
 * Input for creating a capacity plan
 */
export interface CreateCapacityPlanInput {
  clinicId: string;
  startDate: Date;
  endDate: Date;
  period: PlanPeriod;
  shifts: StaffShift[];
  historicalData?: HistoricalDemandData[];
}

/**
 * Historical demand data for forecasting
 */
export interface HistoricalDemandData {
  date: Date;
  dayOfWeek: number;
  appointments: number;
  noShows: number;
  cancellations: number;
}

/**
 * Capacity plan entity
 */
export interface CapacityPlan {
  readonly id: string;
  readonly clinicId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly period: PlanPeriod;
  readonly shifts: readonly StaffShift[];
  readonly dailySummaries: readonly DailyCapacitySummary[];
  readonly overallCapacity: CapacityScore;
  readonly conflicts: readonly ShiftConflict[];
  readonly recommendations: readonly StaffingRecommendation[];
  readonly forecasts: readonly DemandForecast[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new capacity plan
 *
 * @param input - Input data for creating the plan
 * @returns The created capacity plan
 */
export function createCapacityPlan(input: CreateCapacityPlanInput): CapacityPlan {
  const { clinicId, startDate, endDate, period, shifts, historicalData } = input;

  // Generate daily summaries
  const dailySummaries = generateDailySummaries(startDate, endDate, shifts);

  // Calculate overall capacity
  const overallCapacity = calculateOverallCapacity(dailySummaries);

  // Detect conflicts across all shifts
  const conflicts = detectConflicts(shifts);

  // Generate staffing recommendations
  const recommendations = generateRecommendations(dailySummaries, historicalData);

  // Generate demand forecasts
  const forecasts = generateForecasts(startDate, endDate, historicalData);

  const now = new Date();
  const plan: CapacityPlan = {
    id: generatePlanId(),
    clinicId,
    startDate,
    endDate,
    period,
    shifts: Object.freeze([...shifts]),
    dailySummaries: Object.freeze(dailySummaries),
    overallCapacity,
    conflicts: Object.freeze(conflicts),
    recommendations: Object.freeze(recommendations),
    forecasts: Object.freeze(forecasts),
    createdAt: now,
    updatedAt: now,
  };

  return Object.freeze(plan);
}

/**
 * Update capacity plan with new shifts
 */
export function updateCapacityPlanShifts(plan: CapacityPlan, shifts: StaffShift[]): CapacityPlan {
  return createCapacityPlan({
    clinicId: plan.clinicId,
    startDate: plan.startDate,
    endDate: plan.endDate,
    period: plan.period,
    shifts,
  });
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get capacity for a specific date
 */
export function getCapacityForDate(plan: CapacityPlan, date: Date): DailyCapacitySummary | null {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return (
    plan.dailySummaries.find((summary) => {
      const summaryDate = new Date(summary.date);
      summaryDate.setHours(0, 0, 0, 0);
      return summaryDate.getTime() === targetDate.getTime();
    }) ?? null
  );
}

/**
 * Get all dates with critical capacity
 */
export function getCriticalDates(plan: CapacityPlan): DailyCapacitySummary[] {
  return plan.dailySummaries.filter(
    (summary) => summary.level === 'CRITICAL' || summary.level === 'OVERBOOKED'
  );
}

/**
 * Get all dates with underutilization
 */
export function getUnderutilizedDates(plan: CapacityPlan): DailyCapacitySummary[] {
  return plan.dailySummaries.filter((summary) => summary.level === 'UNDERUTILIZED');
}

/**
 * Get urgent recommendations
 */
export function getUrgentRecommendations(plan: CapacityPlan): StaffingRecommendation[] {
  return plan.recommendations.filter((rec) => rec.priority === 'URGENT' || rec.priority === 'HIGH');
}

/**
 * Check if plan has critical issues
 */
export function hasCriticalIssues(plan: CapacityPlan): boolean {
  return (
    plan.conflicts.some((c) => c.severity === 'CRITICAL' || c.severity === 'HIGH') ||
    plan.overallCapacity.isCritical() ||
    plan.overallCapacity.isOverbooked()
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique plan ID
 */
function generatePlanId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `plan_${timestamp}_${random}`;
}

/**
 * Generate daily capacity summaries
 */
function generateDailySummaries(
  startDate: Date,
  endDate: Date,
  shifts: StaffShift[]
): DailyCapacitySummary[] {
  const summaries: DailyCapacitySummary[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    const dateShifts = shifts.filter((shift) => {
      const shiftDate = new Date(shift.startTime);
      shiftDate.setHours(0, 0, 0, 0);
      return shiftDate.getTime() === current.getTime();
    });

    const totalSlots = dateShifts.reduce((sum, s) => sum + s.maxAppointments, 0);
    const bookedSlots = dateShifts.reduce((sum, s) => sum + s.bookedAppointments, 0);
    const utilization = totalSlots > 0 ? (bookedSlots / totalSlots) * 100 : 0;

    const capacity = CapacityScore.fromSlots(bookedSlots, totalSlots);
    const staffIds = new Set(dateShifts.map((s) => s.staffId));

    // Detect conflicts for this day
    const dayConflicts = detectDayConflicts(dateShifts);

    summaries.push({
      date: new Date(current),
      totalSlots,
      bookedSlots,
      utilization: Math.round(utilization * 10) / 10,
      level: capacity.level,
      shiftCount: dateShifts.length,
      staffCount: staffIds.size,
      conflicts: Object.freeze(dayConflicts),
    });

    current.setDate(current.getDate() + 1);
  }

  return summaries;
}

/**
 * Calculate overall capacity from daily summaries
 */
function calculateOverallCapacity(summaries: DailyCapacitySummary[]): CapacityScore {
  if (summaries.length === 0) {
    return CapacityScore.fromSlots(0, 0);
  }

  const totalSlots = summaries.reduce((sum, s) => sum + s.totalSlots, 0);
  const bookedSlots = summaries.reduce((sum, s) => sum + s.bookedSlots, 0);

  return CapacityScore.fromSlots(bookedSlots, totalSlots);
}

/**
 * Detect conflicts in shifts
 */
function detectConflicts(shifts: StaffShift[]): ShiftConflict[] {
  const conflicts: ShiftConflict[] = [];

  // Check for overlapping shifts per staff member
  const staffShifts = new Map<string, StaffShift[]>();
  for (const shift of shifts) {
    const existing = staffShifts.get(shift.staffId) ?? [];
    existing.push(shift);
    staffShifts.set(shift.staffId, existing);
  }

  for (const [staffId, memberShifts] of staffShifts) {
    // Sort by start time
    const sorted = [...memberShifts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1]!;

      // Check overlap
      if (current.endTime > next.startTime) {
        conflicts.push({
          type: 'OVERLAP',
          shiftId: current.id,
          conflictingShiftId: next.id,
          staffId,
          description: `Shifts overlap: ${current.staffName} has overlapping shifts`,
          severity: 'HIGH',
          suggestedResolution: 'Adjust shift times or reassign one shift to another staff member',
        });
      }

      // Check rest time (minimum 8 hours between shifts)
      const restHours = (next.startTime.getTime() - current.endTime.getTime()) / (1000 * 60 * 60);
      if (restHours > 0 && restHours < 8) {
        conflicts.push({
          type: 'REST_VIOLATION',
          shiftId: next.id,
          conflictingShiftId: current.id,
          staffId,
          description: `Insufficient rest: ${current.staffName} has only ${restHours.toFixed(1)} hours between shifts`,
          severity: 'MEDIUM',
          suggestedResolution: 'Ensure at least 8 hours rest between shifts',
        });
      }
    }

    // Check consecutive days (max 6 days in a row)
    const workDates = new Set(
      memberShifts.map((s) => {
        const d = new Date(s.startTime);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    let consecutiveDays = 0;
    let maxConsecutive = 0;
    const dates = [...workDates].sort();

    for (let i = 0; i < dates.length; i++) {
      if (i === 0) {
        consecutiveDays = 1;
      } else {
        const prevDate = dates[i - 1];
        const currDate = dates[i];
        if (prevDate && currDate) {
          const prev = new Date(prevDate);
          const curr = new Date(currDate);
          const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

          if (diffDays === 1) {
            consecutiveDays++;
          } else {
            consecutiveDays = 1;
          }
        }
      }
      maxConsecutive = Math.max(maxConsecutive, consecutiveDays);
    }

    const firstShift = memberShifts[0];
    if (maxConsecutive > 6 && firstShift) {
      conflicts.push({
        type: 'CONSECUTIVE_DAYS',
        shiftId: firstShift.id,
        staffId,
        description: `${firstShift.staffName} is scheduled for ${maxConsecutive} consecutive days`,
        severity: 'HIGH',
        suggestedResolution: 'Ensure at least 1 day off per 7 days worked',
      });
    }

    // Check weekly overtime (max 45 hours/week)
    const weeklyHours = memberShifts.reduce((sum, shift) => {
      const hours =
        (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60) -
        shift.breakMinutes / 60;
      return sum + hours;
    }, 0);

    if (weeklyHours > 45 && firstShift) {
      conflicts.push({
        type: 'OVERTIME',
        shiftId: firstShift.id,
        staffId,
        description: `${firstShift.staffName} is scheduled for ${weeklyHours.toFixed(1)} hours (exceeds 45h limit)`,
        severity: 'MEDIUM',
        suggestedResolution: 'Reduce scheduled hours or distribute to other staff',
      });
    }
  }

  return conflicts;
}

/**
 * Detect conflicts for a specific day
 */
function detectDayConflicts(shifts: StaffShift[]): ShiftConflict[] {
  const conflicts: ShiftConflict[] = [];

  // Check for minimum staffing requirements
  const dentistCount = shifts.filter(
    (s) => s.staffRole === 'DENTIST' || s.staffRole === 'SPECIALIST'
  ).length;

  const firstShiftForDay = shifts[0];
  if (shifts.length > 0 && dentistCount === 0 && firstShiftForDay) {
    conflicts.push({
      type: 'UNDERSTAFFED',
      shiftId: firstShiftForDay.id,
      staffId: '',
      description: 'No dentist or specialist scheduled for this day',
      severity: 'CRITICAL',
      suggestedResolution: 'Schedule at least one dentist or specialist',
    });
  }

  // Check for overlaps within the day
  const staffShifts = new Map<string, StaffShift[]>();
  for (const shift of shifts) {
    const existing = staffShifts.get(shift.staffId) ?? [];
    existing.push(shift);
    staffShifts.set(shift.staffId, existing);
  }

  for (const [staffId, memberShifts] of staffShifts) {
    if (memberShifts.length > 1) {
      for (let i = 0; i < memberShifts.length; i++) {
        for (let j = i + 1; j < memberShifts.length; j++) {
          const a = memberShifts[i]!;
          const b = memberShifts[j]!;
          if (a.startTime < b.endTime && b.startTime < a.endTime) {
            conflicts.push({
              type: 'DOUBLE_BOOKING',
              shiftId: a.id,
              conflictingShiftId: b.id,
              staffId,
              description: `${a.staffName} is double-booked`,
              severity: 'CRITICAL',
              suggestedResolution: 'Remove one of the overlapping shifts',
            });
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Generate staffing recommendations
 */
function generateRecommendations(
  summaries: DailyCapacitySummary[],
  historicalData?: HistoricalDemandData[]
): StaffingRecommendation[] {
  const recommendations: StaffingRecommendation[] = [];

  for (const summary of summaries) {
    // Get historical average for this day of week
    const dayOfWeek = summary.date.getDay();
    const historicalAvg = historicalData
      ? historicalData
          .filter((h) => h.dayOfWeek === dayOfWeek)
          .reduce((sum, h, _, arr) => sum + h.appointments / arr.length, 0)
      : null;

    if (summary.level === 'UNDERUTILIZED' && summary.staffCount > 1) {
      recommendations.push({
        date: summary.date,
        shiftType: 'ALL',
        currentStaff: summary.staffCount,
        recommendedStaff: Math.max(1, summary.staffCount - 1),
        role: 'DENTAL_ASSISTANT',
        priority: 'LOW',
        reason: `Utilization at ${summary.utilization}% - consider reducing support staff`,
      });
    }

    if (summary.level === 'CRITICAL' || summary.level === 'OVERBOOKED') {
      recommendations.push({
        date: summary.date,
        shiftType: 'ALL',
        currentStaff: summary.staffCount,
        recommendedStaff: summary.staffCount + 1,
        role: 'DENTIST',
        priority: summary.level === 'OVERBOOKED' ? 'URGENT' : 'HIGH',
        reason: `Utilization at ${summary.utilization}% - add staff to handle demand`,
      });
    }

    // Check against historical data
    if (historicalAvg && summary.totalSlots < historicalAvg * 0.8) {
      recommendations.push({
        date: summary.date,
        shiftType: 'ALL',
        currentStaff: summary.staffCount,
        recommendedStaff: summary.staffCount + 1,
        role: 'DENTIST',
        priority: 'MEDIUM',
        reason: `Historical demand (${Math.round(historicalAvg)} appts) exceeds current capacity (${summary.totalSlots} slots)`,
      });
    }
  }

  return recommendations;
}

/**
 * Generate demand forecasts
 */
function generateForecasts(
  startDate: Date,
  endDate: Date,
  historicalData?: HistoricalDemandData[]
): DemandForecast[] {
  const forecasts: DemandForecast[] = [];

  if (!historicalData || historicalData.length === 0) {
    // No historical data - return empty forecasts
    return forecasts;
  }

  // Calculate averages by day of week
  const dayAverages = new Map<number, { total: number; count: number }>();
  for (const data of historicalData) {
    const existing = dayAverages.get(data.dayOfWeek) ?? { total: 0, count: 0 };
    existing.total += data.appointments;
    existing.count++;
    dayAverages.set(data.dayOfWeek, existing);
  }

  // Calculate trend
  const recentData = historicalData.slice(-30);
  const olderData = historicalData.slice(-60, -30);
  const recentAvg = recentData.reduce((sum, d) => sum + d.appointments, 0) / recentData.length;
  const olderAvg =
    olderData.length > 0
      ? olderData.reduce((sum, d) => sum + d.appointments, 0) / olderData.length
      : recentAvg;
  const trend: DemandForecast['trend'] =
    recentAvg > olderAvg * 1.1
      ? 'INCREASING'
      : recentAvg < olderAvg * 0.9
        ? 'DECREASING'
        : 'STABLE';

  // Generate forecasts for each day in range
  const current = new Date(startDate);
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const dayStats = dayAverages.get(dayOfWeek);

    if (dayStats && dayStats.count > 0) {
      const avgDemand = dayStats.total / dayStats.count;
      // Apply trend adjustment
      const trendMultiplier = trend === 'INCREASING' ? 1.05 : trend === 'DECREASING' ? 0.95 : 1;
      const predictedDemand = Math.round(avgDemand * trendMultiplier);

      forecasts.push({
        date: new Date(current),
        predictedDemand,
        confidence: Math.min(0.9, 0.5 + dayStats.count * 0.05), // Higher confidence with more data
        basedOn: `${dayStats.count} historical data points`,
        trend,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return forecasts;
}
