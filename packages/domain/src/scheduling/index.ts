export {
  // Domain Error
  ConsentRequiredError,
  // Domain Types
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
