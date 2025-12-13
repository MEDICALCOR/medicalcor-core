/**
 * @fileoverview Repository Adapters (Infrastructure Layer)
 *
 * PostgreSQL and external service adapters implementing domain repository interfaces.
 *
 * This module exports concrete repository adapters that implement
 * the port interfaces defined in the application layer.
 *
 * ## Hexagonal Architecture
 *
 * Repositories here are **ADAPTERS** implementing domain **PORTS**:
 * - PostgresCaseRepository implements ICaseRepository (PostgreSQL)
 * - CalendarSchedulingAdapter implements ISchedulingRepository (external calendar)
 * - CaseRepository implements ICaseRepository (cohort analysis)
 * - PostgresReadModelRepository implements IReadModelRepository (CQRS read models)
 * - PostgresAgentPerformanceRepository implements IAgentPerformanceRepositoryPort
 * - PostgresWrapUpTimeRepository implements IWrapUpTimeRepository
 *
 * @module @medicalcor/infrastructure/repositories
 *
 * @example
 * ```typescript
 * import {
 *   PostgresCaseRepository,
 *   CalendarSchedulingAdapter,
 *   createCalendarSchedulingAdapter,
 *   CaseRepository,
 *   createCaseRepository,
 *   PostgresReadModelRepository,
 *   createPostgresReadModelRepository,
 *   ReadModelRefreshService,
 *   PostgresAgentPerformanceRepository,
 *   createAgentPerformanceRepository,
 *   PostgresWrapUpTimeRepository,
 *   createWrapUpTimeRepository,
 * } from '@medicalcor/infrastructure';
 * ```
 */

// =============================================================================
// CALENDAR SCHEDULING ADAPTER
// =============================================================================

// Calendar Scheduling Adapter (External Calendar Integration)
export {
  // Class and factory
  CalendarSchedulingAdapter,
  createCalendarSchedulingAdapter,
  // Error class
  ConsentRequiredError,
  // Configuration types
  type CalendarSchedulingAdapterConfig,
  type ConsentService,
  type ConsentCheckResult,
  // Domain interface types (for implementers)
  type ISchedulingRepository,
  type DomainTimeSlot,
  type BookingRequest,
  type BookingResult,
  type AppointmentDetails,
  type DomainGetAvailableSlotsOptions,
} from './CalendarSchedulingAdapter.js';

// =============================================================================
// CASE REPOSITORY ADAPTERS
// =============================================================================

export {
  // Class and factory
  CaseRepository,
  createCaseRepository,
  // Configuration types
  type CaseRepositoryConfig,
} from './CaseRepository.js';

export {
  // Class and factory
  PostgresCaseRepository,
  createPostgresCaseRepository,
  // Configuration types
  type PostgresCaseRepositoryConfig,
} from './PostgresCaseRepository.js';

// =============================================================================
// CQRS READ MODEL REPOSITORY
// =============================================================================

export {
  // Class and factory
  PostgresReadModelRepository,
  createPostgresReadModelRepository,
  // Configuration types
  type PostgresReadModelRepositoryConfig,
} from './PostgresReadModelRepository.js';

// =============================================================================
// READ MODEL REFRESH SERVICE
// =============================================================================

export {
  // Class and factory
  ReadModelRefreshService,
  createReadModelRefreshService,
  // Configuration types
  type ReadModelRefreshServiceConfig,
  // Stats and monitoring types
  type RefreshStats,
  type RefreshSchedule,
} from './ReadModelRefreshService.js';

// =============================================================================
// AGENT PERFORMANCE REPOSITORY (M7)
// =============================================================================

export {
  // Class and factory
  PostgresAgentPerformanceRepository,
  createAgentPerformanceRepository,
} from './PostgresAgentPerformanceRepository.js';

// =============================================================================
// WRAP-UP TIME REPOSITORY (M8)
// =============================================================================

export {
  // Class and factory
  PostgresWrapUpTimeRepository,
  createWrapUpTimeRepository,
} from './PostgresWrapUpTimeRepository.js';

// =============================================================================
// DATA CLASSIFICATION REPOSITORY (L6)
// =============================================================================

export {
  // Class and factory
  PostgresDataClassificationRepository,
  createDataClassificationRepository,
  // Configuration types
  type PostgresDataClassificationRepositoryConfig,
} from './PostgresDataClassificationRepository.js';

// =============================================================================
// DENTAL LAB CASE REPOSITORY
// =============================================================================

export {
  // Class and factory
  PostgresLabCaseRepository,
  createPostgresLabCaseRepository,
  // Configuration types
  type PostgresLabCaseRepositoryConfig,
} from './PostgresLabCaseRepository.js';

// =============================================================================
// REVENUE SNAPSHOT REPOSITORY
// =============================================================================

export {
  // Class and factory
  PostgresRevenueSnapshotRepository,
  createPostgresRevenueSnapshotRepository,
  // Configuration types
  type PostgresRevenueSnapshotRepositoryConfig,
} from './PostgresRevenueSnapshotRepository.js';

// =============================================================================
// ORCHESTRATION REPOSITORY (Multi-Agent)
// =============================================================================

export {
  // Class and factory
  InMemoryOrchestrationRepository,
  createInMemoryOrchestrationRepository,
} from './InMemoryOrchestrationRepository.js';
