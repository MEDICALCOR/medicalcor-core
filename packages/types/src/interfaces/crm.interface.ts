/**
 * CRM Universal Interface
 *
 * Abstracts CRM operations to support multiple providers:
 * - HubSpot (current)
 * - Zoho CRM
 * - Salesforce
 * - Pipedrive
 * - Monday.com CRM
 * - Freshsales
 *
 * Usage:
 * ```typescript
 * const crm = CRMFactory.getProvider();
 * const contact = await crm.syncContact({ phone: '+40712345678', name: 'Ion' });
 * await crm.logActivity(contact.id, 'WhatsApp message received');
 * ```
 */

import type {
  IBaseAdapter,
  IPaginationParams,
  IPaginatedResponse,
  IWebhookVerification,
} from './base.interface.js';

/**
 * Supported CRM providers
 */
export type CRMProvider = 'hubspot' | 'zoho' | 'salesforce' | 'pipedrive' | 'freshsales';

// =============================================================================
// Contact Types
// =============================================================================

/**
 * Contact lifecycle stage (normalized)
 */
export type ContactLifecycleStage =
  | 'subscriber'
  | 'lead'
  | 'marketing_qualified'
  | 'sales_qualified'
  | 'opportunity'
  | 'customer'
  | 'evangelist'
  | 'other';

/**
 * Lead status
 */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'nurturing'
  | 'unqualified'
  | 'converted'
  | 'closed';

/**
 * Contact properties (normalized across CRMs)
 */
export interface IContactProperties {
  /** Email address */
  email?: string | undefined;

  /** Phone number (E.164 format preferred) */
  phone?: string | undefined;

  /** First name */
  firstName?: string | undefined;

  /** Last name */
  lastName?: string | undefined;

  /** Full name (computed or stored) */
  fullName?: string | undefined;

  /** Company/Organization */
  company?: string | undefined;

  /** Job title */
  jobTitle?: string | undefined;

  /** Lifecycle stage */
  lifecycleStage?: ContactLifecycleStage | undefined;

  /** Lead status */
  leadStatus?: LeadStatus | undefined;

  /** Lead score (1-100) */
  leadScore?: number | undefined;

  /** Lead source */
  leadSource?: string | undefined;

  /** Preferred language */
  language?: string | undefined;

  /** Custom properties */
  customProperties?: Record<string, string | number | boolean> | undefined;
}

/**
 * Contact record
 */
export interface IContact {
  /** CRM contact ID */
  id: string;

  /** Provider-specific ID */
  providerContactId: string;

  /** Contact properties */
  properties: IContactProperties;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;

  /** Associated deal/opportunity IDs */
  dealIds?: string[] | undefined;

  /** Provider-specific data */
  providerData?: Record<string, unknown> | undefined;
}

/**
 * Contact search filters
 */
export interface IContactSearchFilters {
  /** Search by email */
  email?: string | undefined;

  /** Search by phone */
  phone?: string | undefined;

  /** Search by name (partial match) */
  name?: string | undefined;

  /** Filter by lifecycle stage */
  lifecycleStage?: ContactLifecycleStage | undefined;

  /** Filter by lead status */
  leadStatus?: LeadStatus | undefined;

  /** Filter by lead score range */
  leadScoreMin?: number | undefined;
  leadScoreMax?: number | undefined;

  /** Filter by custom property */
  customProperty?:
    | {
        name: string;
        operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains';
        value: string | number | boolean;
      }
    | undefined;

  /** Created after date */
  createdAfter?: Date | undefined;

  /** Created before date */
  createdBefore?: Date | undefined;
}

/**
 * Contact sync/upsert input
 */
export interface IContactSyncInput {
  /** Phone number (primary identifier for medical) */
  phone: string;

  /** Email (secondary identifier) */
  email?: string | undefined;

  /** Name */
  name?: string | undefined;

  /** Additional properties to set */
  properties?: Record<string, string> | undefined;
}

// =============================================================================
// Activity/Timeline Types
// =============================================================================

/**
 * Activity types
 */
export type ActivityType =
  | 'note'
  | 'email'
  | 'call'
  | 'meeting'
  | 'task'
  | 'message'
  | 'payment'
  | 'appointment';

/**
 * Activity direction
 */
export type ActivityDirection = 'inbound' | 'outbound';

/**
 * Activity/Timeline entry
 */
export interface IActivity {
  /** Activity ID */
  id: string;

  /** Activity type */
  type: ActivityType;

  /** Direction */
  direction?: ActivityDirection | undefined;

  /** Subject/Title */
  subject?: string | undefined;

  /** Body/Content */
  body: string;

  /** Communication channel */
  channel?: 'whatsapp' | 'voice' | 'email' | 'web' | 'sms' | undefined;

  /** Associated contact ID */
  contactId: string;

  /** External reference ID (e.g., call SID) */
  externalId?: string | undefined;

  /** Timestamp */
  timestamp: Date;

  /** Duration in seconds (for calls) */
  duration?: number | undefined;

  /** Outcome/Status */
  outcome?: string | undefined;

  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Activity creation input
 */
export interface ICreateActivityInput {
  /** Contact to associate with */
  contactId: string;

  /** Activity type */
  type: ActivityType;

  /** Subject */
  subject?: string | undefined;

  /** Body/Content */
  body: string;

  /** Direction */
  direction?: ActivityDirection | undefined;

  /** Channel */
  channel?: 'whatsapp' | 'voice' | 'email' | 'web' | 'sms' | undefined;

  /** External ID */
  externalId?: string | undefined;

  /** Duration (for calls) */
  duration?: number | undefined;

  /** Custom metadata */
  metadata?: Record<string, unknown> | undefined;
}

// =============================================================================
// Task Types
// =============================================================================

/**
 * Task priority
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Task status
 */
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'deferred' | 'cancelled';

/**
 * Task record
 */
export interface ITask {
  /** Task ID */
  id: string;

  /** Subject/Title */
  subject: string;

  /** Body/Description */
  body?: string | undefined;

  /** Priority */
  priority: TaskPriority;

  /** Status */
  status: TaskStatus;

  /** Due date */
  dueDate?: Date | undefined;

  /** Associated contact ID */
  contactId?: string | undefined;

  /** Assigned owner/user ID */
  ownerId?: string | undefined;

  /** Created timestamp */
  createdAt: Date;

  /** Completed timestamp */
  completedAt?: Date | undefined;
}

/**
 * Task creation input
 */
export interface ICreateTaskInput {
  /** Contact to associate with */
  contactId: string;

  /** Subject */
  subject: string;

  /** Body */
  body?: string | undefined;

  /** Priority */
  priority?: TaskPriority | undefined;

  /** Due date */
  dueDate?: Date | undefined;

  /** Owner ID */
  ownerId?: string | undefined;
}

// =============================================================================
// Deal/Opportunity Types
// =============================================================================

/**
 * Deal stage (normalized)
 */
export type DealStage =
  | 'qualification'
  | 'needs_analysis'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

/**
 * Deal record
 */
export interface IDeal {
  /** Deal ID */
  id: string;

  /** Deal name */
  name: string;

  /** Deal stage */
  stage: DealStage;

  /** Amount */
  amount?: number | undefined;

  /** Currency */
  currency?: string | undefined;

  /** Close date */
  closeDate?: Date | undefined;

  /** Associated contact ID */
  contactId?: string | undefined;

  /** Owner ID */
  ownerId?: string | undefined;

  /** Pipeline ID */
  pipelineId?: string | undefined;

  /** Created timestamp */
  createdAt: Date;

  /** Custom properties */
  properties?: Record<string, string | number | boolean> | undefined;
}

// =============================================================================
// Retention/Loyalty Types (Medical CRM specific)
// =============================================================================

/**
 * Churn risk level
 * Note: Values match existing HubSpot schema for backwards compatibility
 * - SCAZUT = low
 * - MEDIU = medium
 * - RIDICAT = high
 * - FOARTE_RIDICAT = critical
 */
export type ChurnRisk = 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT';

/**
 * NPS category
 */
export type NPSCategory = 'promoter' | 'passive' | 'detractor';

/**
 * Loyalty segment
 */
export type LoyaltySegment = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

/**
 * Retention metrics
 */
export interface IRetentionMetrics {
  /** Retention score 0-100 */
  retentionScore?: number | undefined;

  /** Churn risk level */
  churnRisk?: ChurnRisk | undefined;

  /** Days since last activity */
  daysInactive?: number | undefined;

  /** NPS score 0-10 */
  npsScore?: number | undefined;

  /** NPS category */
  npsCategory?: NPSCategory | undefined;

  /** NPS feedback */
  npsFeedback?: string | undefined;

  /** Loyalty segment */
  loyaltySegment?: LoyaltySegment | undefined;

  /** Lifetime value */
  lifetimeValue?: number | undefined;

  /** Number of cancelled appointments */
  cancelledAppointments?: number | undefined;

  /** Follow-up priority */
  followUpPriority?: 'low' | 'medium' | 'high' | 'urgent' | undefined;
}

// =============================================================================
// Webhook Types
// =============================================================================

/**
 * CRM webhook event types
 */
export type CRMWebhookEventType =
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'deal.created'
  | 'deal.updated'
  | 'deal.stage_changed'
  | 'task.created'
  | 'task.completed';

/**
 * Normalized CRM webhook payload
 */
export interface ICRMWebhookPayload {
  /** Event type */
  eventType: CRMWebhookEventType;

  /** Event ID */
  eventId: string;

  /** Object type */
  objectType: 'contact' | 'deal' | 'task';

  /** Object ID */
  objectId: string;

  /** Changed properties (for updates) */
  changedProperties?: string[] | undefined;

  /** Object data */
  data?: IContact | IDeal | ITask | undefined;

  /** Raw provider payload */
  rawPayload: unknown;

  /** Event timestamp */
  timestamp: Date;
}

// =============================================================================
// Universal CRM Interface
// =============================================================================

/**
 * Universal CRM Provider Interface
 *
 * All CRM providers must implement this interface to be
 * compatible with the MedicalCor platform.
 */
export interface ICRMProvider extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: CRMProvider;

  // =========================================================================
  // Contact Operations
  // =========================================================================

  /**
   * Sync contact (upsert by phone)
   * Creates if not exists, updates if exists
   */
  syncContact(input: IContactSyncInput): Promise<IContact>;

  /**
   * Get contact by ID
   */
  getContact(contactId: string): Promise<IContact>;

  /**
   * Get contact by phone number
   */
  getContactByPhone(phone: string): Promise<IContact | null>;

  /**
   * Get contact by email
   */
  getContactByEmail(email: string): Promise<IContact | null>;

  /**
   * Search contacts
   */
  searchContacts(
    filters: IContactSearchFilters,
    pagination?: IPaginationParams
  ): Promise<IPaginatedResponse<IContact>>;

  /**
   * Update contact properties
   */
  updateContact(contactId: string, properties: Partial<IContactProperties>): Promise<IContact>;

  /**
   * Delete contact
   */
  deleteContact(contactId: string): Promise<void>;

  // =========================================================================
  // Activity/Timeline Operations
  // =========================================================================

  /**
   * Log activity to contact timeline
   */
  logActivity(input: ICreateActivityInput): Promise<IActivity>;

  /**
   * Log message to timeline (convenience method)
   */
  logMessage(
    contactId: string,
    message: string,
    direction: ActivityDirection,
    channel: 'whatsapp' | 'voice' | 'email' | 'web' | 'sms'
  ): Promise<IActivity>;

  /**
   * Log call to timeline
   */
  logCall(input: {
    contactId: string;
    callId: string;
    duration: number;
    transcript?: string;
    sentiment?: string;
  }): Promise<IActivity>;

  /**
   * Log payment to timeline
   */
  logPayment(input: {
    contactId: string;
    paymentId: string;
    amount: number;
    currency: string;
    status: string;
  }): Promise<IActivity>;

  /**
   * Get activities for contact
   */
  getActivities(
    contactId: string,
    pagination?: IPaginationParams
  ): Promise<IPaginatedResponse<IActivity>>;

  // =========================================================================
  // Task Operations
  // =========================================================================

  /**
   * Create a task
   */
  createTask(input: ICreateTaskInput): Promise<ITask>;

  /**
   * Get task by ID
   */
  getTask(taskId: string): Promise<ITask>;

  /**
   * Update task
   */
  updateTask(
    taskId: string,
    updates: Partial<Pick<ITask, 'subject' | 'body' | 'priority' | 'status' | 'dueDate'>>
  ): Promise<ITask>;

  /**
   * Complete task
   */
  completeTask(taskId: string): Promise<ITask>;

  /**
   * List tasks for contact
   */
  getTasksForContact(
    contactId: string,
    pagination?: IPaginationParams
  ): Promise<IPaginatedResponse<ITask>>;

  // =========================================================================
  // Retention/Loyalty Operations (Medical CRM specific)
  // =========================================================================

  /**
   * Update retention metrics for contact
   */
  updateRetentionMetrics(contactId: string, metrics: Partial<IRetentionMetrics>): Promise<IContact>;

  /**
   * Update NPS score
   */
  updateNPSScore(contactId: string, score: number, feedback?: string): Promise<IContact>;

  /**
   * Update loyalty segment
   */
  updateLoyaltySegment(contactId: string, segment: LoyaltySegment): Promise<IContact>;

  /**
   * Get contacts at risk of churn
   */
  getChurnRiskContacts(riskLevel?: ChurnRisk): Promise<IContact[]>;

  /**
   * Get NPS detractors for follow-up
   */
  getNPSDetractors(): Promise<IContact[]>;

  /**
   * Get contacts by loyalty segment
   */
  getContactsByLoyaltySegment(segment: LoyaltySegment): Promise<IContact[]>;

  /**
   * Record appointment cancellation
   */
  recordAppointmentCancellation(contactId: string): Promise<IContact>;

  /**
   * Record treatment completion
   */
  recordTreatmentCompletion(contactId: string, treatmentValue: number): Promise<IContact>;

  // =========================================================================
  // Webhook Operations
  // =========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): IWebhookVerification;

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(payload: unknown): ICRMWebhookPayload | null;
}

/**
 * CRM Provider Factory configuration
 */
export interface ICRMProviderConfig {
  /** Provider to use */
  provider: CRMProvider;

  /** Access token/API key */
  accessToken: string;

  /** Account/Portal ID */
  accountId?: string | undefined;

  /** Base URL (for self-hosted) */
  baseUrl?: string | undefined;

  /** Request timeout in ms */
  timeoutMs?: number | undefined;

  /** Retry configuration */
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}
