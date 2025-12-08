/**
 * Breach Notification Repository Interface
 *
 * HEXAGONAL ARCHITECTURE:
 * - This is a PORT (interface) in the domain layer
 * - Implementations (adapters) live in the infrastructure layer
 * - Domain doesn't know about persistence details
 *
 * @module domain/breach-notification/breach-repository
 */

import type {
  DataBreach,
  BreachStatus,
  BreachSeverity,
  AffectedSubject,
  BreachMeasure,
  AuthorityNotification,
} from '@medicalcor/types';

/**
 * Query options for finding breaches
 */
export interface BreachQueryOptions {
  /** Filter by clinic ID */
  clinicId?: string;
  /** Filter by status */
  status?: BreachStatus | BreachStatus[];
  /** Filter by severity */
  severity?: BreachSeverity | BreachSeverity[];
  /** Filter breaches detected after this date */
  detectedAfter?: string;
  /** Filter breaches detected before this date */
  detectedBefore?: string;
  /** Include only breaches requiring authority notification */
  authorityNotificationRequired?: boolean;
  /** Include only breaches requiring subject notification */
  subjectNotificationRequired?: boolean;
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
  /** Sort field */
  sortBy?: 'detectedAt' | 'severity' | 'status' | 'updatedAt';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
}

/**
 * Result of a query operation
 */
export interface BreachQueryResult {
  breaches: DataBreach[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Repository interface for breach persistence
 */
export interface BreachRepository {
  /**
   * Save a new breach record
   */
  save(breach: DataBreach): Promise<DataBreach>;

  /**
   * Update an existing breach record
   */
  update(breach: DataBreach): Promise<DataBreach>;

  /**
   * Find a breach by ID
   */
  findById(id: string): Promise<DataBreach | null>;

  /**
   * Find a breach by correlation ID
   */
  findByCorrelationId(correlationId: string): Promise<DataBreach | null>;

  /**
   * Find breaches matching query options
   */
  find(options: BreachQueryOptions): Promise<BreachQueryResult>;

  /**
   * Find breaches approaching the 72-hour authority notification deadline
   */
  findApproachingDeadline(hoursRemaining: number): Promise<DataBreach[]>;

  /**
   * Find breaches with pending subject notifications
   */
  findPendingSubjectNotifications(): Promise<DataBreach[]>;

  /**
   * Update breach status
   */
  updateStatus(id: string, status: BreachStatus, updatedBy: string): Promise<DataBreach>;

  /**
   * Add an affected subject to a breach
   */
  addAffectedSubject(breachId: string, subject: AffectedSubject): Promise<void>;

  /**
   * Update affected subject notification status
   */
  updateSubjectNotification(
    breachId: string,
    contactId: string,
    notified: boolean,
    notifiedAt: string,
    channel: string
  ): Promise<void>;

  /**
   * Add a measure taken to address the breach
   */
  addMeasure(breachId: string, measure: BreachMeasure): Promise<void>;

  /**
   * Record authority notification
   */
  recordAuthorityNotification(breachId: string, notification: AuthorityNotification): Promise<void>;

  /**
   * Get breach statistics for a clinic
   */
  getStats(clinicId: string): Promise<{
    total: number;
    byStatus: Record<BreachStatus, number>;
    bySeverity: Record<BreachSeverity, number>;
    pendingAuthorityNotification: number;
    pendingSubjectNotification: number;
  }>;
}
