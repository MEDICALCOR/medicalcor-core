/**
 * @fileoverview Appointment Repository Port Interface (Secondary Port)
 *
 * Defines the interface for appointment data persistence with full lifecycle
 * management and GDPR/HIPAA compliance capabilities.
 *
 * @module application/ports/secondary/persistence/AppointmentRepository
 *
 * ## Hexagonal Architecture
 *
 * This is a **SECONDARY PORT** (driven port) that defines what the
 * application needs from the infrastructure layer for appointment data access.
 *
 * ## Key Features
 *
 * - Full appointment lifecycle management
 * - Event sourcing support
 * - Consent verification (GDPR/HIPAA mandatory)
 * - Availability checking and conflict prevention
 * - Provider scheduling integration
 * - HubSpot CRM sync support
 */

import type {
  AppointmentAggregateRoot,
  AppointmentDomainEvent,
  AppointmentStatus,
  AppointmentRecord,
} from '@medicalcor/domain';

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Repository error codes
 */
export type AppointmentRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'CONSENT_REQUIRED'
  | 'SLOT_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONNECTION_ERROR'
  | 'UNKNOWN';

/**
 * Repository error
 */
export interface AppointmentRepositoryError {
  code: AppointmentRepositoryErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Repository result type (discriminated union)
 */
export type AppointmentRepositoryResult<T> =
  | { success: true; data: T }
  | { success: false; error: AppointmentRepositoryError };

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Appointment query specification
 */
export interface AppointmentSpecification {
  /** Filter by patient ID */
  patientId?: string;
  /** Filter by clinic ID */
  clinicId?: string;
  /** Filter by provider ID */
  providerId?: string;
  /** Filter by status(es) */
  status?: AppointmentStatus | AppointmentStatus[];
  /** Filter by date range (start) */
  scheduledAfter?: Date;
  /** Filter by date range (end) */
  scheduledBefore?: Date;
  /** Filter by procedure type */
  procedureType?: string;
  /** Filter by HubSpot contact ID */
  hubspotContactId?: string;
  /** Include cancelled appointments */
  includeCancelled?: boolean;
  /** Include no-shows */
  includeNoShows?: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Page number (1-based) */
  page: number;
  /** Page size */
  pageSize: number;
  /** Sort field */
  sortBy?: 'scheduledFor' | 'createdAt' | 'updatedAt';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// =============================================================================
// AVAILABILITY TYPES
// =============================================================================

/**
 * Time slot availability
 */
export interface TimeSlotAvailability {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  providerId?: string;
  providerName?: string;
  procedureTypes: string[];
  available: boolean;
  remainingCapacity: number;
}

/**
 * Availability query parameters
 */
export interface AvailabilityQuery {
  clinicId: string;
  procedureType?: string;
  providerId?: string;
  startDate: Date;
  endDate: Date;
  duration?: number;
  limit?: number;
}

// =============================================================================
// CONFLICT TYPES
// =============================================================================

/**
 * Conflict detection result
 */
export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingAppointments: AppointmentRecord[];
  conflictType?: 'PATIENT_OVERLAP' | 'PROVIDER_OVERLAP' | 'SLOT_FULL';
}

// =============================================================================
// STATISTICS TYPES
// =============================================================================

/**
 * Appointment statistics for a period
 */
export interface AppointmentStatistics {
  period: { start: Date; end: Date };
  totalScheduled: number;
  totalConfirmed: number;
  totalCompleted: number;
  totalCancelled: number;
  totalNoShows: number;
  totalRescheduled: number;
  confirmationRate: number;
  completionRate: number;
  noShowRate: number;
  cancellationRate: number;
  averageDuration: number;
  byProcedureType: Record<string, number>;
  byProvider: Record<string, number>;
}

// =============================================================================
// APPOINTMENT REPOSITORY PORT INTERFACE
// =============================================================================

/**
 * Appointment Repository Port Interface
 *
 * Defines the contract for appointment data persistence with comprehensive
 * lifecycle management and compliance capabilities.
 *
 * @example
 * ```typescript
 * // Save a new appointment
 * const result = await appointmentRepository.save(appointmentAggregate);
 *
 * // Find appointments for a patient
 * const appointments = await appointmentRepository.findByPatient(patientId);
 *
 * // Check availability
 * const slots = await appointmentRepository.getAvailableSlots({
 *   clinicId: 'clinic-123',
 *   startDate: new Date(),
 *   endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
 * });
 * ```
 */
export interface IAppointmentRepository {
  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Save an appointment aggregate
   *
   * Persists the appointment and all uncommitted domain events.
   * Verifies consent before saving (GDPR/HIPAA mandatory).
   *
   * @param appointment - Appointment aggregate to save
   * @returns Result with saved appointment or error
   */
  save(
    appointment: AppointmentAggregateRoot
  ): Promise<AppointmentRepositoryResult<AppointmentRecord>>;

  /**
   * Find appointment by ID
   *
   * @param id - Appointment ID
   * @returns Result with appointment aggregate or not found error
   */
  findById(id: string): Promise<AppointmentRepositoryResult<AppointmentAggregateRoot>>;

  /**
   * Find appointment record by ID (without aggregate reconstitution)
   *
   * @param id - Appointment ID
   * @returns Result with appointment record or not found error
   */
  findRecordById(id: string): Promise<AppointmentRepositoryResult<AppointmentRecord>>;

  /**
   * Delete an appointment
   *
   * Soft delete - marks as deleted but retains for audit.
   *
   * @param id - Appointment ID
   * @returns Result indicating success or error
   */
  delete(id: string): Promise<AppointmentRepositoryResult<void>>;

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * Find appointments by specification
   *
   * @param spec - Query specification
   * @param pagination - Optional pagination options
   * @returns Paginated list of appointments
   */
  findBySpec(
    spec: AppointmentSpecification,
    pagination?: PaginationOptions
  ): Promise<AppointmentRepositoryResult<PaginatedResult<AppointmentRecord>>>;

  /**
   * Find all appointments for a patient
   *
   * @param patientId - Patient ID
   * @param options - Optional filters
   * @returns List of appointments
   */
  findByPatient(
    patientId: string,
    options?: {
      includeCancelled?: boolean;
      includeNoShows?: boolean;
      limit?: number;
    }
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  /**
   * Find upcoming appointments for a patient
   *
   * @param patientId - Patient ID
   * @param limit - Maximum number to return
   * @returns List of upcoming appointments
   */
  findUpcomingByPatient(
    patientId: string,
    limit?: number
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  /**
   * Find appointments for a clinic on a specific date
   *
   * @param clinicId - Clinic ID
   * @param date - Target date
   * @returns List of appointments for that day
   */
  findByClinicAndDate(
    clinicId: string,
    date: Date
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  /**
   * Find appointments for a provider on a specific date
   *
   * @param providerId - Provider ID
   * @param date - Target date
   * @returns List of appointments for that provider
   */
  findByProviderAndDate(
    providerId: string,
    date: Date
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  /**
   * Find appointments by HubSpot contact ID
   *
   * @param hubspotContactId - HubSpot contact ID
   * @returns List of appointments
   */
  findByHubspotContact(
    hubspotContactId: string
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  // ===========================================================================
  // AVAILABILITY OPERATIONS
  // ===========================================================================

  /**
   * Get available time slots
   *
   * @param query - Availability query parameters
   * @returns List of available time slots
   */
  getAvailableSlots(
    query: AvailabilityQuery
  ): Promise<AppointmentRepositoryResult<TimeSlotAvailability[]>>;

  /**
   * Check if a specific slot is available
   *
   * @param slotId - Time slot ID
   * @returns Boolean indicating availability
   */
  isSlotAvailable(slotId: string): Promise<AppointmentRepositoryResult<boolean>>;

  /**
   * Check for scheduling conflicts
   *
   * @param patientId - Patient ID
   * @param providerId - Optional provider ID
   * @param scheduledFor - Proposed appointment time
   * @param duration - Appointment duration in minutes
   * @param excludeAppointmentId - Optional appointment ID to exclude (for rescheduling)
   * @returns Conflict check result
   */
  checkConflicts(
    patientId: string,
    providerId: string | undefined,
    scheduledFor: Date,
    duration: number,
    excludeAppointmentId?: string
  ): Promise<AppointmentRepositoryResult<ConflictCheckResult>>;

  // ===========================================================================
  // EVENT SOURCING OPERATIONS
  // ===========================================================================

  /**
   * Get domain events for an appointment
   *
   * @param appointmentId - Appointment ID
   * @param fromVersion - Optional starting version
   * @returns List of domain events
   */
  getEvents(
    appointmentId: string,
    fromVersion?: number
  ): Promise<AppointmentRepositoryResult<AppointmentDomainEvent[]>>;

  /**
   * Append domain events for an appointment
   *
   * @param appointmentId - Appointment ID
   * @param events - Events to append
   * @param expectedVersion - Expected current version (optimistic locking)
   * @returns Result indicating success or error
   */
  appendEvents(
    appointmentId: string,
    events: AppointmentDomainEvent[],
    expectedVersion: number
  ): Promise<AppointmentRepositoryResult<void>>;

  // ===========================================================================
  // STATISTICS OPERATIONS
  // ===========================================================================

  /**
   * Get appointment statistics for a clinic
   *
   * @param clinicId - Clinic ID
   * @param startDate - Period start
   * @param endDate - Period end
   * @returns Appointment statistics
   */
  getStatistics(
    clinicId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AppointmentRepositoryResult<AppointmentStatistics>>;

  /**
   * Get no-show rate for a patient
   *
   * @param patientId - Patient ID
   * @returns No-show rate (0-1)
   */
  getPatientNoShowRate(patientId: string): Promise<AppointmentRepositoryResult<number>>;

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Find appointments needing reminders
   *
   * @param reminderHoursAhead - Hours before appointment to send reminder
   * @returns List of appointments needing reminders
   */
  findNeedingReminders(
    reminderHoursAhead: number
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  /**
   * Find confirmed appointments past their scheduled time (potential no-shows)
   *
   * @param gracePeriodMinutes - Minutes after scheduled time before marking as late
   * @returns List of appointments that may be no-shows
   */
  findPotentialNoShows(
    gracePeriodMinutes: number
  ): Promise<AppointmentRepositoryResult<AppointmentRecord[]>>;

  /**
   * Count appointments by status for a clinic
   *
   * @param clinicId - Clinic ID
   * @param date - Target date
   * @returns Status counts
   */
  countByStatus(
    clinicId: string,
    date: Date
  ): Promise<AppointmentRepositoryResult<Record<AppointmentStatus, number>>>;
}

// =============================================================================
// ERROR FACTORY FUNCTIONS
// =============================================================================

export function notFoundError(appointmentId: string): AppointmentRepositoryError {
  return {
    code: 'NOT_FOUND',
    message: `Appointment not found: ${appointmentId}`,
    details: { appointmentId },
  };
}

export function duplicateError(appointmentId: string): AppointmentRepositoryError {
  return {
    code: 'DUPLICATE',
    message: `Appointment already exists: ${appointmentId}`,
    details: { appointmentId },
  };
}

export function validationError(
  message: string,
  details?: Record<string, unknown>
): AppointmentRepositoryError {
  return {
    code: 'VALIDATION_ERROR',
    message,
    details,
  };
}

export function conflictError(conflictingIds: string[]): AppointmentRepositoryError {
  return {
    code: 'CONFLICT',
    message: 'Scheduling conflict detected',
    details: { conflictingAppointmentIds: conflictingIds },
  };
}

export function consentRequiredError(
  patientId: string,
  missingConsents: string[]
): AppointmentRepositoryError {
  return {
    code: 'CONSENT_REQUIRED',
    message: 'Patient consent required for scheduling',
    details: { patientId, missingConsents },
  };
}

export function slotUnavailableError(slotId: string): AppointmentRepositoryError {
  return {
    code: 'SLOT_UNAVAILABLE',
    message: `Time slot is no longer available: ${slotId}`,
    details: { slotId },
  };
}

export function connectionError(message: string): AppointmentRepositoryError {
  return {
    code: 'CONNECTION_ERROR',
    message,
  };
}
