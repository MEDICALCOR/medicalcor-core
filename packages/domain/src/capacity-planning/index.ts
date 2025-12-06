/**
 * @fileoverview Capacity Planning Domain Module
 *
 * M12: Shift Scheduling with Capacity Planning
 *
 * This module provides comprehensive capacity planning capabilities for
 * dental clinics, including shift scheduling, conflict detection,
 * staffing recommendations, and demand forecasting.
 *
 * @module domain/capacity-planning
 *
 * ## Features
 *
 * - **Shift Management**: Create, update, and manage staff shifts
 * - **Capacity Analysis**: Calculate utilization and capacity levels
 * - **Conflict Detection**: Identify scheduling conflicts (overlap, overtime, etc.)
 * - **Staffing Recommendations**: Get AI-assisted staffing suggestions
 * - **Demand Forecasting**: Predict future demand based on historical data
 * - **Optimization Suggestions**: Get recommendations for schedule optimization
 *
 * ## Architecture
 *
 * Follows DDD and Hexagonal Architecture principles:
 * - Value Objects: CapacityScore (immutable, self-validating)
 * - Entities: StaffShift, CapacityPlan
 * - Repository Ports: ICapacityPlanningRepository
 * - Domain Services: CapacityPlanningPolicy
 * - Use Cases: PlanCapacityUseCase
 * - Domain Events: Shift, Capacity, Conflict events
 *
 * @example
 * ```typescript
 * import {
 *   createCapacityPlanningService,
 *   createStaffShift,
 *   CapacityScore,
 * } from '@medicalcor/domain';
 *
 * // Create service
 * const service = createCapacityPlanningService();
 *
 * // Create a shift
 * const result = service.createShift({
 *   clinicId: 'clinic-123',
 *   staffId: 'staff-456',
 *   staffName: 'Dr. Maria Popescu',
 *   staffRole: 'DENTIST',
 *   shiftType: 'MORNING',
 *   startTime: new Date('2024-01-15T08:00:00'),
 *   endTime: new Date('2024-01-15T14:00:00'),
 * });
 *
 * // Analyze weekly capacity
 * const overview = service.getWeeklyOverview(shifts);
 * console.log(`Utilization: ${overview.averageUtilization}%`);
 *
 * // Detect conflicts
 * const conflicts = service.detectConflicts(shifts);
 * if (conflicts.hasCritical) {
 *   console.warn('Critical conflicts detected:', conflicts.summary);
 * }
 * ```
 */

// ============================================================================
// VALUE OBJECTS (from shared kernel)
// ============================================================================

export {
  CapacityScore,
  InvalidCapacityScoreError,
  type CapacityLevel,
  type StaffingRecommendation as CapacityStaffingRecommendation,
  type BookingStatus,
  type CapacityScoreDTO,
  type CapacityScoreParseResult,
} from '../shared-kernel/value-objects/capacity-score.js';

// ============================================================================
// ENTITIES
// ============================================================================

export {
  // Staff Shift
  createStaffShift,
  updateShiftBookings,
  updateShiftStatus,
  getShiftWorkingHours,
  shiftsOverlap,
  isShiftOnDate,
  getShiftDayOfWeek,
  type StaffShift,
  type ShiftType,
  type ShiftStatus,
  type StaffRole,
  type ShiftConflictType,
  type CreateStaffShiftInput,
  type ShiftConflict,
  type ShiftValidationResult,
  type ShiftValidationError,
} from './entities/staff-shift.js';

export {
  // Capacity Plan
  createCapacityPlan,
  updateCapacityPlanShifts,
  getCapacityForDate,
  getCriticalDates,
  getUnderutilizedDates,
  getUrgentRecommendations,
  hasCriticalIssues,
  type CapacityPlan,
  type PlanPeriod,
  type StaffingRecommendation,
  type DailyCapacitySummary,
  type DemandForecast,
  type CreateCapacityPlanInput,
  type HistoricalDemandData,
} from './entities/capacity-plan.js';

// ============================================================================
// REPOSITORIES (PORT INTERFACES)
// ============================================================================

export {
  type ICapacityPlanningRepository,
  type CapacityRepositoryResult,
  type CapacityRepositoryError,
  type CapacityRepositoryErrorCode,
  type ShiftSpecification,
  type PlanSpecification,
  type PaginationOptions,
  type PaginatedResult,
  type CreateShiftInput,
  type UpdateShiftInput,
  type CreateCapacityPlanInput as RepositoryCreatePlanInput,
  type RecordDemandInput,
  notFoundError,
  duplicateError,
  validationError,
  constraintViolationError,
  connectionError,
} from './repositories/capacity-planning-repository.js';

// ============================================================================
// DOMAIN SERVICES
// ============================================================================

export {
  CapacityPlanningPolicy,
  createCapacityPlanningPolicy,
  DEFAULT_CAPACITY_CONFIG,
  type CapacityPlanningConfig,
  type ConflictDetectionResult,
  type StaffingAnalysisResult,
  type StaffingGap,
  type OptimizationSuggestion,
} from './services/capacity-planning-policy.js';

// ============================================================================
// USE CASES
// ============================================================================

export {
  PlanCapacityUseCase,
  createPlanCapacityUseCase,
  type PlanCapacityInput,
  type PlanCapacityOutput,
  type PlanCapacityResult,
  type PlanCapacityError,
  type PlanCapacityErrorCode,
} from './use-cases/plan-capacity.js';

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

export {
  // Event Types
  type CapacityEventType,
  type CapacityDomainEvent,
  type EventMetadata,
  // Shift Events
  type ShiftCreatedEvent,
  type ShiftCreatedPayload,
  type ShiftUpdatedEvent,
  type ShiftUpdatedPayload,
  type ShiftCancelledEvent,
  type ShiftCancelledPayload,
  // Capacity Events
  type CapacityCalculatedEvent,
  type CapacityCalculatedPayload,
  type CapacityCriticalEvent,
  type CapacityCriticalPayload,
  type CapacityOverbookedEvent,
  type CapacityOverbookedPayload,
  // Conflict Events
  type ConflictDetectedEvent,
  type ConflictDetectedPayload,
  type ConflictResolvedEvent,
  type ConflictResolvedPayload,
  // Plan Events
  type PlanCreatedEvent,
  type PlanCreatedPayload,
  // Staffing Events
  type StaffingRecommendationEvent,
  type StaffingRecommendationPayload,
  type StaffingGapDetectedEvent,
  type StaffingGapDetectedPayload,
  // Forecast Events
  type ForecastGeneratedEvent,
  type ForecastGeneratedPayload,
  // Event Factories
  createShiftCreatedEvent,
  createShiftCancelledEvent,
  createCapacityCalculatedEvent,
  createCapacityCriticalEvent,
  createConflictDetectedEvent,
  createPlanCreatedEvent,
  createStaffingRecommendationEvent,
  createStaffingGapDetectedEvent,
  createForecastGeneratedEvent,
} from './events/capacity-events.js';

// ============================================================================
// SERVICE FACADE
// ============================================================================

export {
  CapacityPlanningService,
  createCapacityPlanningService,
  type CapacityPlanningServiceConfig,
  type CreateShiftResult,
  type CapacityAnalysisResult,
  type WeeklyCapacityOverview,
} from './capacity-planning-service.js';
