export {
  // Appointment Aggregate Root
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
} from './Appointment.js';
