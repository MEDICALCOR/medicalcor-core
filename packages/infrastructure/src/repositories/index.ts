/**
 * @fileoverview Repository Adapters (Infrastructure Layer)
 *
 * This module exports concrete repository adapters that implement
 * the port interfaces defined in the domain layer.
 *
 * ## Hexagonal Architecture
 *
 * Repositories here are **ADAPTERS** implementing domain **PORTS**:
 * - CalendarSchedulingAdapter implements ISchedulingRepository (external calendar)
 *
 * @module @medicalcor/infrastructure/repositories
 *
 * @example
 * ```typescript
 * import {
 *   CalendarSchedulingAdapter,
 *   createCalendarSchedulingAdapter,
 * } from '@medicalcor/infrastructure';
 * ```
 */

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
