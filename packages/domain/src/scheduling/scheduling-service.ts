/**
 * @fileoverview Scheduling Domain - Types, Interfaces, and Port Definitions
 *
 * This module defines the domain types and port interface for scheduling operations.
 * The actual PostgreSQL implementation lives in @medicalcor/core (infrastructure layer).
 *
 * @module @medicalcor/domain/scheduling
 *
 * ## Hexagonal Architecture
 *
 * This is a **PORT** definition - it defines what the domain needs from infrastructure.
 * The **ADAPTER** (PostgresSchedulingRepository) lives in @medicalcor/core.
 *
 * @example
 * ```typescript
 * import { ISchedulingRepository, TimeSlot, BookingRequest } from '@medicalcor/domain';
 * import { PostgresSchedulingRepository } from '@medicalcor/core';
 *
 * // Dependency injection - infrastructure implements domain interface
 * const repository: ISchedulingRepository = new PostgresSchedulingRepository(config);
 * const slots = await repository.getAvailableSlots({ limit: 10 });
 * ```
 */

import type { ConsentService } from '../consent/consent-service.js';

// ============================================================================
// DOMAIN ERROR
// ============================================================================

/**
 * Error thrown when patient has not provided required consent
 */
export class ConsentRequiredError extends Error {
  public readonly code = 'CONSENT_REQUIRED';
  public readonly contactId: string;
  public readonly missingConsents: string[];

  constructor(contactId: string, missingConsents: string[]) {
    super(
      `Patient consent required before scheduling. Missing consents: ${missingConsents.join(', ')}`
    );
    this.name = 'ConsentRequiredError';
    this.contactId = contactId;
    this.missingConsents = missingConsents;
  }
}

// ============================================================================
// DOMAIN TYPES (Value Objects)
// ============================================================================

/**
 * Represents an available time slot for appointments
 */
export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  available: boolean;
  practitioner?: string;
  procedureTypes: string[];
}

/**
 * Request to book an appointment
 */
export interface BookingRequest {
  hubspotContactId: string;
  phone: string;
  patientName?: string;
  slotId: string;
  procedureType: string;
  notes?: string;
}

/**
 * Result of a booking attempt
 */
export type BookingResult =
  | { success: true; appointmentId: string; confirmationNumber: string }
  | { success: false; error: string };

/**
 * Appointment details returned from queries
 */
export interface AppointmentDetails {
  id: string;
  slot: {
    date: string;
    startTime: string;
    duration: number;
  };
  patientName?: string;
  procedureType: string;
  hubspotContactId: string;
  phone: string;
  createdAt: string;
}

/**
 * Options for fetching available slots
 */
export interface GetAvailableSlotsOptions {
  clinicId?: string;
  procedureType?: string;
  preferredDates?: string[];
  providerId?: string;
  serviceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

// ============================================================================
// PORT INTERFACE (Hexagonal Architecture)
// ============================================================================

/**
 * Configuration for scheduling repository implementations
 *
 * Note: Connection details like `connectionString` are infrastructure concerns
 * and should be passed to the concrete implementation, not the domain interface.
 *
 * SECURITY: ConsentService is REQUIRED for all implementations.
 * Patient consent verification is NON-NEGOTIABLE for GDPR/HIPAA compliance.
 */
export interface SchedulingConfig {
  timezone?: string;
  /**
   * Consent service for GDPR/HIPAA compliance (REQUIRED)
   *
   * All patient data operations MUST verify consent before proceeding.
   * This requirement is non-negotiable and cannot be bypassed.
   */
  consentService: ConsentService;
}

/**
 * Scheduling Repository Port (Hexagonal Architecture)
 *
 * This interface defines what the domain layer needs from the infrastructure
 * for scheduling operations. Concrete implementations (PostgreSQL, in-memory, etc.)
 * should implement this interface.
 *
 * @example
 * ```typescript
 * // In application layer (use case)
 * class BookAppointmentUseCase {
 *   constructor(private readonly schedulingRepo: ISchedulingRepository) {}
 *
 *   async execute(request: BookingRequest): Promise<BookingResult> {
 *     return this.schedulingRepo.bookAppointment(request);
 *   }
 * }
 * ```
 */
export interface ISchedulingRepository {
  /**
   * Get available slots from the scheduling system
   * @param options - Filter options (procedure type, dates, limit)
   * @returns Array of available time slots
   */
  getAvailableSlots(options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]>;

  /**
   * Book an appointment
   *
   * GDPR/HIPAA COMPLIANCE (MANDATORY):
   * - Implementations MUST verify patient consent before any booking operation
   * - Consent verification is NON-NEGOTIABLE and cannot be skipped
   * - Throws ConsentRequiredError if patient lacks required consent
   *
   * @param request - Booking request details
   * @returns Booking result with appointment ID and status
   * @throws {ConsentRequiredError} If required consent is not present (ALWAYS enforced)
   */
  bookAppointment(request: BookingRequest): Promise<BookingResult>;

  /**
   * Get upcoming appointments within a date range
   * @param startDate - Start of the date range
   * @param endDate - End of the date range
   * @returns Array of appointment details
   */
  getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]>;
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use ISchedulingRepository instead.
 * This class is provided for backwards compatibility during migration.
 * Import PostgresSchedulingRepository from @medicalcor/core for the actual implementation.
 */
export abstract class SchedulingService implements ISchedulingRepository {
  abstract getAvailableSlots(options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]>;
  abstract bookAppointment(request: BookingRequest): Promise<BookingResult>;
  abstract getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]>;
}
