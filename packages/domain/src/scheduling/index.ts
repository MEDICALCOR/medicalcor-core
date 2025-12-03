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
