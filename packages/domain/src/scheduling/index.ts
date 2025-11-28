/**
 * Scheduling Module - Appointment Management
 *
 * Provides transaction-safe appointment scheduling with:
 * - GDPR/HIPAA compliant consent verification
 * - Row-level locking to prevent race conditions
 * - Secure confirmation code generation
 * - Result types for explicit error handling
 *
 * @module domain/scheduling
 */

export {
  SchedulingService,
  createSchedulingService,
  ConsentRequiredError,
  type SchedulingConfig,
  type TimeSlot,
  type BookingRequest,
  type BookingResult,
  type Appointment,
  type AvailableSlotsOptions,
} from './scheduling-service.js';
