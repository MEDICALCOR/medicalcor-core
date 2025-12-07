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
 * Repositories here are **ADAPTERS** implementing application **PORTS**:
 * Repositories here are **ADAPTERS** implementing domain **PORTS**:
 * - PostgresCaseRepository implements ICaseRepository (PostgreSQL)
 * - CalendarSchedulingAdapter implements ISchedulingRepository (external calendar)
 * - CaseRepository implements ICaseRepository (cohort analysis)
 * - PostgresCaseRepository implements ICaseRepository (payments & LTV)
 * - PostgresReadModelRepository implements IReadModelRepository (CQRS read models)
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
 * } from '@medicalcor/infrastructure';
 * ```
 */

// =============================================================================
// CALENDAR SCHEDULING ADAPTER
// =============================================================================

// PostgreSQL Case Repository
export {
  PostgresCaseRepository,
  createPostgresCaseRepository,
  type PostgresCaseRepositoryConfig,
  type CaseRepositoryError,
} from './PostgresCaseRepository.js';

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
