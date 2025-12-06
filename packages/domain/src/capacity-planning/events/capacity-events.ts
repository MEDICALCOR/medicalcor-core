/**
 * @fileoverview Capacity Planning Domain Events
 *
 * Domain events for capacity planning and shift scheduling.
 * These events support event sourcing and cross-context communication.
 *
 * @module domain/capacity-planning/events
 */

import type { CapacityLevel } from '../../shared-kernel/value-objects/capacity-score.js';
import type { StaffRole, ShiftConflictType } from '../entities/staff-shift.js';

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * All capacity planning event types
 */
export type CapacityEventType =
  // Shift lifecycle events
  | 'shift.created'
  | 'shift.updated'
  | 'shift.cancelled'
  | 'shift.confirmed'
  | 'shift.completed'
  | 'shift.started'
  // Capacity events
  | 'capacity.calculated'
  | 'capacity.critical'
  | 'capacity.overbooked'
  | 'capacity.underutilized'
  | 'capacity.optimized'
  // Conflict events
  | 'conflict.detected'
  | 'conflict.resolved'
  // Plan events
  | 'plan.created'
  | 'plan.updated'
  | 'plan.approved'
  // Staffing events
  | 'staffing.recommendation'
  | 'staffing.gap_detected'
  | 'staffing.adjusted'
  // Forecast events
  | 'forecast.generated'
  | 'forecast.anomaly_detected';

/**
 * Base interface for all capacity planning domain events
 */
export interface CapacityDomainEvent {
  readonly id: string;
  readonly type: CapacityEventType;
  readonly aggregateId: string;
  readonly aggregateType: 'shift' | 'capacity-plan' | 'staff-schedule';
  readonly correlationId: string;
  readonly causationId?: string;
  readonly timestamp: string;
  readonly version: number;
  readonly metadata: EventMetadata;
  readonly payload: Record<string, unknown>;
}

/**
 * Event metadata
 */
export interface EventMetadata {
  readonly clinicId: string;
  readonly userId?: string;
  readonly source: 'system' | 'user' | 'api' | 'scheduler';
  readonly environment?: string;
}

// ============================================================================
// SHIFT EVENTS
// ============================================================================

/**
 * Shift created event payload
 */
export interface ShiftCreatedPayload extends Record<string, unknown> {
  readonly shiftId: string;
  readonly clinicId: string;
  readonly staffId: string;
  readonly staffName: string;
  readonly staffRole: StaffRole;
  readonly startTime: string;
  readonly endTime: string;
  readonly maxAppointments: number;
}

/**
 * Shift created event
 */
export interface ShiftCreatedEvent extends CapacityDomainEvent {
  readonly type: 'shift.created';
  readonly aggregateType: 'shift';
  readonly payload: ShiftCreatedPayload;
}

/**
 * Shift updated event payload
 */
export interface ShiftUpdatedPayload extends Record<string, unknown> {
  readonly shiftId: string;
  readonly changes: {
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }[];
}

/**
 * Shift updated event
 */
export interface ShiftUpdatedEvent extends CapacityDomainEvent {
  readonly type: 'shift.updated';
  readonly aggregateType: 'shift';
  readonly payload: ShiftUpdatedPayload;
}

/**
 * Shift cancelled event payload
 */
export interface ShiftCancelledPayload extends Record<string, unknown> {
  readonly shiftId: string;
  readonly staffId: string;
  readonly reason: string;
  readonly cancelledBy: string;
}

/**
 * Shift cancelled event
 */
export interface ShiftCancelledEvent extends CapacityDomainEvent {
  readonly type: 'shift.cancelled';
  readonly aggregateType: 'shift';
  readonly payload: ShiftCancelledPayload;
}

// ============================================================================
// CAPACITY EVENTS
// ============================================================================

/**
 * Capacity calculated event payload
 */
export interface CapacityCalculatedPayload extends Record<string, unknown> {
  readonly planId: string;
  readonly clinicId: string;
  readonly date: string;
  readonly utilizationPercent: number;
  readonly level: CapacityLevel;
  readonly totalSlots: number;
  readonly bookedSlots: number;
  readonly staffCount: number;
}

/**
 * Capacity calculated event
 */
export interface CapacityCalculatedEvent extends CapacityDomainEvent {
  readonly type: 'capacity.calculated';
  readonly aggregateType: 'capacity-plan';
  readonly payload: CapacityCalculatedPayload;
}

/**
 * Critical capacity event payload
 */
export interface CapacityCriticalPayload extends Record<string, unknown> {
  readonly planId: string;
  readonly clinicId: string;
  readonly date: string;
  readonly utilizationPercent: number;
  readonly affectedShifts: string[];
  readonly recommendedAction: string;
}

/**
 * Critical capacity event
 */
export interface CapacityCriticalEvent extends CapacityDomainEvent {
  readonly type: 'capacity.critical';
  readonly aggregateType: 'capacity-plan';
  readonly payload: CapacityCriticalPayload;
}

/**
 * Overbooked capacity event payload
 */
export interface CapacityOverbookedPayload extends Record<string, unknown> {
  readonly planId: string;
  readonly clinicId: string;
  readonly date: string;
  readonly utilizationPercent: number;
  readonly overbookedBy: number;
  readonly urgentAction: string;
}

/**
 * Overbooked capacity event
 */
export interface CapacityOverbookedEvent extends CapacityDomainEvent {
  readonly type: 'capacity.overbooked';
  readonly aggregateType: 'capacity-plan';
  readonly payload: CapacityOverbookedPayload;
}

// ============================================================================
// CONFLICT EVENTS
// ============================================================================

/**
 * Conflict detected event payload
 */
export interface ConflictDetectedPayload extends Record<string, unknown> {
  readonly conflictType: ShiftConflictType;
  readonly shiftId: string;
  readonly conflictingShiftId?: string;
  readonly staffId: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly description: string;
  readonly suggestedResolution: string;
}

/**
 * Conflict detected event
 */
export interface ConflictDetectedEvent extends CapacityDomainEvent {
  readonly type: 'conflict.detected';
  readonly aggregateType: 'shift';
  readonly payload: ConflictDetectedPayload;
}

/**
 * Conflict resolved event payload
 */
export interface ConflictResolvedPayload extends Record<string, unknown> {
  readonly conflictType: ShiftConflictType;
  readonly shiftId: string;
  readonly resolution: string;
  readonly resolvedBy: string;
}

/**
 * Conflict resolved event
 */
export interface ConflictResolvedEvent extends CapacityDomainEvent {
  readonly type: 'conflict.resolved';
  readonly aggregateType: 'shift';
  readonly payload: ConflictResolvedPayload;
}

// ============================================================================
// PLAN EVENTS
// ============================================================================

/**
 * Plan created event payload
 */
export interface PlanCreatedPayload extends Record<string, unknown> {
  readonly planId: string;
  readonly clinicId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly period: 'DAY' | 'WEEK' | 'MONTH';
  readonly shiftCount: number;
  readonly conflictCount: number;
}

/**
 * Plan created event
 */
export interface PlanCreatedEvent extends CapacityDomainEvent {
  readonly type: 'plan.created';
  readonly aggregateType: 'capacity-plan';
  readonly payload: PlanCreatedPayload;
}

// ============================================================================
// STAFFING EVENTS
// ============================================================================

/**
 * Staffing recommendation event payload
 */
export interface StaffingRecommendationPayload extends Record<string, unknown> {
  readonly clinicId: string;
  readonly date: string;
  readonly currentStaff: number;
  readonly recommendedStaff: number;
  readonly role: StaffRole;
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  readonly reason: string;
}

/**
 * Staffing recommendation event
 */
export interface StaffingRecommendationEvent extends CapacityDomainEvent {
  readonly type: 'staffing.recommendation';
  readonly aggregateType: 'capacity-plan';
  readonly payload: StaffingRecommendationPayload;
}

/**
 * Staffing gap detected event payload
 */
export interface StaffingGapDetectedPayload extends Record<string, unknown> {
  readonly clinicId: string;
  readonly date: string;
  readonly role: StaffRole;
  readonly required: number;
  readonly scheduled: number;
  readonly gap: number;
}

/**
 * Staffing gap detected event
 */
export interface StaffingGapDetectedEvent extends CapacityDomainEvent {
  readonly type: 'staffing.gap_detected';
  readonly aggregateType: 'capacity-plan';
  readonly payload: StaffingGapDetectedPayload;
}

// ============================================================================
// FORECAST EVENTS
// ============================================================================

/**
 * Forecast generated event payload
 */
export interface ForecastGeneratedPayload extends Record<string, unknown> {
  readonly clinicId: string;
  readonly date: string;
  readonly predictedDemand: number;
  readonly confidence: number;
  readonly trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  readonly basedOn: string;
}

/**
 * Forecast generated event
 */
export interface ForecastGeneratedEvent extends CapacityDomainEvent {
  readonly type: 'forecast.generated';
  readonly aggregateType: 'capacity-plan';
  readonly payload: ForecastGeneratedPayload;
}

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `evt_${timestamp}_${random}`;
}

/**
 * Create base event properties
 */
function createBaseEvent(
  type: CapacityEventType,
  aggregateId: string,
  aggregateType: CapacityDomainEvent['aggregateType'],
  correlationId: string,
  metadata: EventMetadata
): Omit<CapacityDomainEvent, 'payload'> {
  return {
    id: generateEventId(),
    type,
    aggregateId,
    aggregateType,
    correlationId,
    timestamp: new Date().toISOString(),
    version: 1,
    metadata,
  };
}

/**
 * Create a shift created event
 */
export function createShiftCreatedEvent(
  shiftId: string,
  payload: ShiftCreatedPayload,
  correlationId: string,
  metadata: EventMetadata
): ShiftCreatedEvent {
  return {
    ...createBaseEvent('shift.created', shiftId, 'shift', correlationId, metadata),
    type: 'shift.created' as const,
    aggregateType: 'shift' as const,
    payload,
  };
}

/**
 * Create a shift cancelled event
 */
export function createShiftCancelledEvent(
  shiftId: string,
  payload: ShiftCancelledPayload,
  correlationId: string,
  metadata: EventMetadata
): ShiftCancelledEvent {
  return {
    ...createBaseEvent('shift.cancelled', shiftId, 'shift', correlationId, metadata),
    type: 'shift.cancelled' as const,
    aggregateType: 'shift' as const,
    payload,
  };
}

/**
 * Create a capacity calculated event
 */
export function createCapacityCalculatedEvent(
  planId: string,
  payload: CapacityCalculatedPayload,
  correlationId: string,
  metadata: EventMetadata
): CapacityCalculatedEvent {
  return {
    ...createBaseEvent('capacity.calculated', planId, 'capacity-plan', correlationId, metadata),
    type: 'capacity.calculated' as const,
    aggregateType: 'capacity-plan' as const,
    payload,
  };
}

/**
 * Create a capacity critical event
 */
export function createCapacityCriticalEvent(
  planId: string,
  payload: CapacityCriticalPayload,
  correlationId: string,
  metadata: EventMetadata
): CapacityCriticalEvent {
  return {
    ...createBaseEvent('capacity.critical', planId, 'capacity-plan', correlationId, metadata),
    type: 'capacity.critical' as const,
    aggregateType: 'capacity-plan' as const,
    payload,
  };
}

/**
 * Create a conflict detected event
 */
export function createConflictDetectedEvent(
  shiftId: string,
  payload: ConflictDetectedPayload,
  correlationId: string,
  metadata: EventMetadata
): ConflictDetectedEvent {
  return {
    ...createBaseEvent('conflict.detected', shiftId, 'shift', correlationId, metadata),
    type: 'conflict.detected' as const,
    aggregateType: 'shift' as const,
    payload,
  };
}

/**
 * Create a plan created event
 */
export function createPlanCreatedEvent(
  planId: string,
  payload: PlanCreatedPayload,
  correlationId: string,
  metadata: EventMetadata
): PlanCreatedEvent {
  return {
    ...createBaseEvent('plan.created', planId, 'capacity-plan', correlationId, metadata),
    type: 'plan.created' as const,
    aggregateType: 'capacity-plan' as const,
    payload,
  };
}

/**
 * Create a staffing recommendation event
 */
export function createStaffingRecommendationEvent(
  planId: string,
  payload: StaffingRecommendationPayload,
  correlationId: string,
  metadata: EventMetadata
): StaffingRecommendationEvent {
  return {
    ...createBaseEvent('staffing.recommendation', planId, 'capacity-plan', correlationId, metadata),
    type: 'staffing.recommendation' as const,
    aggregateType: 'capacity-plan' as const,
    payload,
  };
}

/**
 * Create a staffing gap detected event
 */
export function createStaffingGapDetectedEvent(
  planId: string,
  payload: StaffingGapDetectedPayload,
  correlationId: string,
  metadata: EventMetadata
): StaffingGapDetectedEvent {
  return {
    ...createBaseEvent('staffing.gap_detected', planId, 'capacity-plan', correlationId, metadata),
    type: 'staffing.gap_detected' as const,
    aggregateType: 'capacity-plan' as const,
    payload,
  };
}

/**
 * Create a forecast generated event
 */
export function createForecastGeneratedEvent(
  planId: string,
  payload: ForecastGeneratedPayload,
  correlationId: string,
  metadata: EventMetadata
): ForecastGeneratedEvent {
  return {
    ...createBaseEvent('forecast.generated', planId, 'capacity-plan', correlationId, metadata),
    type: 'forecast.generated' as const,
    aggregateType: 'capacity-plan' as const,
    payload,
  };
}
