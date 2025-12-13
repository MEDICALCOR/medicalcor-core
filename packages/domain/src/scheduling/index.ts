/**
 * @fileoverview Scheduling Domain Module
 *
 * Provides patient scheduling capabilities with GDPR/HIPAA compliance.
 * Implements DDD patterns with Aggregate Roots, Factories, and Domain Events.
 *
 * @module @medicalcor/domain/scheduling
 *
 * ## Key Components
 *
 * ### Appointment Aggregate Root
 * Rich domain entity managing the complete appointment lifecycle:
 * - Status machine (REQUESTED → CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED)
 * - Domain events for audit trail and event sourcing
 * - Business rules enforcement (consent verification, reschedule limits)
 *
 * ### Factory Pattern
 * AppointmentFactory for creating and reconstituting appointments:
 * - Fresh creation with validation
 * - Event-sourced reconstitution
 * - Snapshot restoration
 * - Database hydration
 *
 * ### Port Interface (Hexagonal Architecture)
 * ISchedulingRepository defines what the domain needs from infrastructure.
 * Adapters (PostgreSQL, in-memory) implement this interface.
 *
 * @example
 * ```typescript
 * import {
 *   AppointmentAggregateRoot,
 *   appointmentFactory,
 *   type AppointmentStatus,
 * } from '@medicalcor/domain/scheduling';
 *
 * // Create a new appointment
 * const appointment = appointmentFactory.create({
 *   id: 'apt-123',
 *   patientId: 'patient-456',
 *   clinicId: 'clinic-789',
 *   procedureType: 'consultation',
 *   scheduledFor: new Date(),
 *   duration: 30,
 * });
 *
 * // Confirm the appointment
 * appointment.confirm({ confirmedBy: 'staff-001' });
 *
 * // Get domain events for persistence
 * const events = appointment.getUncommittedEvents();
 * ```
 */

// ============================================================================
// APPOINTMENT AGGREGATE ROOT (DDD Pattern)
// ============================================================================

export {
  // Aggregate Root
  AppointmentAggregateRoot,
  // State & Event Types
  type AppointmentAggregateState,
  type AppointmentDomainEvent,
  type ReminderRecord,
  // Status Types
  type AppointmentStatus,
  type CancellationReason,
  type ActionInitiator,
  // Input Types
  type CreateAppointmentParams,
  type ConfirmAppointmentParams,
  type CancelAppointmentParams,
  type RescheduleAppointmentParams,
  type CompleteAppointmentParams,
  // Errors
  AppointmentError,
  AppointmentClosedError,
  AppointmentAlreadyConfirmedError,
  AppointmentAlreadyCancelledError,
  InvalidAppointmentStatusTransitionError,
  MaxReschedulesExceededError,
} from './entities/index.js';

// ============================================================================
// APPOINTMENT FACTORY (Creation & Reconstitution)
// ============================================================================

export {
  // Factory
  AppointmentFactory,
  appointmentFactory,
  // Snapshot Types
  type AppointmentAggregateSnapshot,
  type AppointmentSnapshotState,
  type SerializedReminderRecord,
  // Database Record Type
  type AppointmentRecord,
} from './factories/index.js';

// ============================================================================
// PORT INTERFACE & LEGACY TYPES (Hexagonal Architecture)
// ============================================================================

export {
  // Domain Error
  ConsentRequiredError,
  // Domain Types (Value Objects)
  type TimeSlot,
  type BookingRequest,
  type BookingResult,
  type AppointmentDetails,
  type GetAvailableSlotsOptions,
  type SchedulingConfig,
  // Port Interface (Hexagonal Architecture)
  type ISchedulingRepository,
  // Legacy compatibility (deprecated)
  SchedulingService,
} from './scheduling-service.js';

// ============================================================================
// INFRASTRUCTURE ADAPTER
// ============================================================================
// The PostgresSchedulingRepository implementation is available in the core package.
// Import directly from @medicalcor/core/repositories:
//
// import {
//   PostgresSchedulingRepository,
//   createPostgresSchedulingRepository,
//   type PostgresSchedulingConfig,
// } from '@medicalcor/core/repositories';
//
// This separation follows Hexagonal Architecture - domain defines ports,
// infrastructure (core) provides adapters.
