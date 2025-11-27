/**
 * Scheduling Universal Interface
 *
 * Abstracts appointment scheduling to support multiple providers:
 * - Custom internal scheduling service (current)
 * - Cal.com
 * - Calendly
 * - Acuity Scheduling
 * - SimplyBook.me
 * - Setmore
 *
 * Usage:
 * ```typescript
 * const scheduler = SchedulingFactory.getProvider();
 * const slots = await scheduler.getAvailableSlots({ date: '2024-01-15', serviceId: 'implant-consultation' });
 * const appointment = await scheduler.bookAppointment({ slotId: 'slot-123', patientPhone: '+40712345678' });
 * ```
 */

import type { IBaseAdapter, IPaginationParams, IPaginatedResponse } from './base.interface.js';

/**
 * Supported scheduling providers
 */
export type SchedulingProvider =
  | 'internal'
  | 'cal_com'
  | 'calendly'
  | 'acuity'
  | 'simplybook'
  | 'setmore';

// =============================================================================
// Service/Procedure Types
// =============================================================================

/**
 * Service/Procedure available for booking
 */
export interface IService {
  /** Service ID */
  id: string;

  /** Service name */
  name: string;

  /** Description */
  description?: string;

  /** Duration in minutes */
  durationMinutes: number;

  /** Price (in smallest currency unit) */
  price?: number;

  /** Currency */
  currency?: string;

  /** Category */
  category?: string;

  /** Whether service is active */
  active: boolean;

  /** Buffer time before appointment */
  bufferBeforeMinutes?: number;

  /** Buffer time after appointment */
  bufferAfterMinutes?: number;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Provider/Staff Types
// =============================================================================

/**
 * Provider/Staff member who performs services
 */
export interface IStaffMember {
  /** Staff ID */
  id: string;

  /** Name */
  name: string;

  /** Title/Role */
  title?: string;

  /** Email */
  email?: string;

  /** Phone */
  phone?: string;

  /** Services this staff member can perform */
  serviceIds?: string[];

  /** Whether staff is active */
  active: boolean;

  /** Avatar URL */
  avatarUrl?: string;
}

// =============================================================================
// Location Types
// =============================================================================

/**
 * Location where services are performed
 */
export interface ILocation {
  /** Location ID */
  id: string;

  /** Location name */
  name: string;

  /** Address */
  address?: string;

  /** City */
  city?: string;

  /** Country */
  country?: string;

  /** Timezone */
  timezone: string;

  /** Phone */
  phone?: string;

  /** Whether location is active */
  active: boolean;
}

// =============================================================================
// Time Slot Types
// =============================================================================

/**
 * Available time slot
 */
export interface ITimeSlot {
  /** Slot ID (for booking) */
  id: string;

  /** Start time */
  startTime: Date;

  /** End time */
  endTime: Date;

  /** Duration in minutes */
  durationMinutes: number;

  /** Service ID */
  serviceId?: string;

  /** Staff member ID */
  staffId?: string;

  /** Location ID */
  locationId?: string;

  /** Whether slot is available */
  available: boolean;

  /** Price (if varies by slot) */
  price?: number;
}

/**
 * Options for getting available slots
 */
export interface IGetSlotsOptions {
  /** Date to check (YYYY-MM-DD) */
  date?: string;

  /** Start date for range */
  startDate?: string;

  /** End date for range */
  endDate?: string;

  /** Service ID to filter by */
  serviceId?: string;

  /** Staff member ID to filter by */
  staffId?: string;

  /** Location ID to filter by */
  locationId?: string;

  /** Timezone for results */
  timezone?: string;
}

// =============================================================================
// Appointment Types
// =============================================================================

/**
 * Appointment status
 */
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'completed'
  | 'rescheduled';

/**
 * Appointment record
 */
export interface IAppointment {
  /** Appointment ID */
  id: string;

  /** Provider-specific ID */
  providerAppointmentId?: string;

  /** Service booked */
  service: IService;

  /** Staff member */
  staff?: IStaffMember;

  /** Location */
  location?: ILocation;

  /** Start time */
  startTime: Date;

  /** End time */
  endTime: Date;

  /** Duration in minutes */
  durationMinutes: number;

  /** Status */
  status: AppointmentStatus;

  /** Patient information */
  patient: {
    phone: string;
    name?: string;
    email?: string;
  };

  /** Notes */
  notes?: string;

  /** Confirmation code */
  confirmationCode?: string;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;

  /** Cancelled timestamp */
  cancelledAt?: Date;

  /** Cancellation reason */
  cancellationReason?: string;

  /** CRM contact ID if linked */
  crmContactId?: string;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Appointment booking input
 */
export interface IBookAppointmentInput {
  /** Time slot ID to book */
  slotId?: string;

  /** Or specify exact time */
  startTime?: Date;

  /** Service ID */
  serviceId: string;

  /** Staff ID (optional) */
  staffId?: string;

  /** Location ID (optional) */
  locationId?: string;

  /** Patient phone (E.164) */
  patientPhone: string;

  /** Patient name */
  patientName?: string;

  /** Patient email */
  patientEmail?: string;

  /** Notes */
  notes?: string;

  /** Send confirmation */
  sendConfirmation?: boolean;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Appointment reschedule input
 */
export interface IRescheduleAppointmentInput {
  /** Appointment ID */
  appointmentId: string;

  /** New slot ID */
  newSlotId?: string;

  /** Or new start time */
  newStartTime?: Date;

  /** Reason for reschedule */
  reason?: string;

  /** Send notification */
  sendNotification?: boolean;
}

/**
 * Appointment cancellation input
 */
export interface ICancelAppointmentInput {
  /** Appointment ID */
  appointmentId: string;

  /** Cancellation reason */
  reason?: string;

  /** Send notification */
  sendNotification?: boolean;

  /** Cancelled by */
  cancelledBy?: 'patient' | 'clinic' | 'system';
}

// =============================================================================
// Reminder Types
// =============================================================================

/**
 * Reminder types
 */
export type ReminderType = 'email' | 'sms' | 'whatsapp' | 'voice';

/**
 * Reminder configuration
 */
export interface IReminderConfig {
  /** Reminder type */
  type: ReminderType;

  /** Minutes before appointment */
  minutesBefore: number;

  /** Template ID */
  templateId?: string;

  /** Custom message */
  message?: string;

  /** Whether reminder is enabled */
  enabled: boolean;
}

/**
 * Reminder record
 */
export interface IReminder {
  /** Reminder ID */
  id: string;

  /** Appointment ID */
  appointmentId: string;

  /** Type */
  type: ReminderType;

  /** Scheduled time */
  scheduledAt: Date;

  /** Sent time */
  sentAt?: Date;

  /** Status */
  status: 'pending' | 'sent' | 'failed' | 'cancelled';

  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Webhook Types
// =============================================================================

/**
 * Scheduling webhook event types
 */
export type SchedulingWebhookEventType =
  | 'appointment.created'
  | 'appointment.confirmed'
  | 'appointment.cancelled'
  | 'appointment.rescheduled'
  | 'appointment.completed'
  | 'appointment.no_show'
  | 'reminder.sent';

/**
 * Normalized scheduling webhook payload
 */
export interface ISchedulingWebhookPayload {
  /** Event type */
  eventType: SchedulingWebhookEventType;

  /** Event ID */
  eventId: string;

  /** Appointment data */
  appointment?: IAppointment;

  /** Reminder data (for reminder events) */
  reminder?: IReminder;

  /** Raw provider payload */
  rawPayload: unknown;

  /** Event timestamp */
  timestamp: Date;
}

// =============================================================================
// Universal Scheduling Interface
// =============================================================================

/**
 * Universal Scheduling Provider Interface
 *
 * All scheduling providers must implement this interface to be
 * compatible with the MedicalCor platform.
 */
export interface ISchedulingProvider extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: SchedulingProvider;

  // =========================================================================
  // Service Operations
  // =========================================================================

  /**
   * List available services
   */
  listServices(): Promise<IService[]>;

  /**
   * Get service by ID
   */
  getService(serviceId: string): Promise<IService>;

  // =========================================================================
  // Staff Operations
  // =========================================================================

  /**
   * List staff members
   */
  listStaff(serviceId?: string): Promise<IStaffMember[]>;

  /**
   * Get staff member by ID
   */
  getStaff(staffId: string): Promise<IStaffMember>;

  // =========================================================================
  // Location Operations
  // =========================================================================

  /**
   * List locations
   */
  listLocations(): Promise<ILocation[]>;

  /**
   * Get location by ID
   */
  getLocation(locationId: string): Promise<ILocation>;

  // =========================================================================
  // Availability Operations
  // =========================================================================

  /**
   * Get available time slots
   */
  getAvailableSlots(options: IGetSlotsOptions): Promise<ITimeSlot[]>;

  /**
   * Check if a specific time is available
   */
  checkAvailability(options: {
    startTime: Date;
    serviceId: string;
    staffId?: string;
    locationId?: string;
  }): Promise<boolean>;

  // =========================================================================
  // Appointment Operations
  // =========================================================================

  /**
   * Book an appointment
   */
  bookAppointment(input: IBookAppointmentInput): Promise<IAppointment>;

  /**
   * Get appointment by ID
   */
  getAppointment(appointmentId: string): Promise<IAppointment>;

  /**
   * Get appointment by confirmation code
   */
  getAppointmentByConfirmationCode(code: string): Promise<IAppointment | null>;

  /**
   * List appointments
   */
  listAppointments(options?: {
    patientPhone?: string;
    patientEmail?: string;
    status?: AppointmentStatus;
    startDate?: Date;
    endDate?: Date;
    serviceId?: string;
    staffId?: string;
    pagination?: IPaginationParams;
  }): Promise<IPaginatedResponse<IAppointment>>;

  /**
   * Confirm appointment
   */
  confirmAppointment(appointmentId: string): Promise<IAppointment>;

  /**
   * Reschedule appointment
   */
  rescheduleAppointment(input: IRescheduleAppointmentInput): Promise<IAppointment>;

  /**
   * Cancel appointment
   */
  cancelAppointment(input: ICancelAppointmentInput): Promise<IAppointment>;

  /**
   * Mark appointment as completed
   */
  completeAppointment(appointmentId: string, notes?: string): Promise<IAppointment>;

  /**
   * Mark appointment as no-show
   */
  markNoShow(appointmentId: string): Promise<IAppointment>;

  // =========================================================================
  // Reminder Operations
  // =========================================================================

  /**
   * Get reminders for appointment
   */
  getReminders(appointmentId: string): Promise<IReminder[]>;

  /**
   * Schedule a reminder
   */
  scheduleReminder(appointmentId: string, config: IReminderConfig): Promise<IReminder>;

  /**
   * Cancel a reminder
   */
  cancelReminder(reminderId: string): Promise<void>;

  // =========================================================================
  // Webhook Operations
  // =========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhook(
    payload: string,
    signature: string
  ): { valid: boolean; payload?: unknown; error?: string };

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(payload: unknown): ISchedulingWebhookPayload | null;
}

/**
 * Scheduling Provider Factory configuration
 */
export interface ISchedulingProviderConfig {
  /** Provider to use */
  provider: SchedulingProvider;

  /** API key */
  apiKey?: string;

  /** Base URL */
  baseUrl?: string;

  /** Account ID */
  accountId?: string;

  /** Default timezone */
  defaultTimezone?: string;

  /** Request timeout in ms */
  timeoutMs?: number;

  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}
