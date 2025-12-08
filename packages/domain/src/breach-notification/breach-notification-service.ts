/**
 * GDPR Breach Notification Service
 *
 * Manages data breach detection, assessment, and notification workflows
 * in compliance with GDPR Articles 33 and 34.
 *
 * IMPORTANT: Use with a persistent repository for production.
 * The in-memory repository is only for development/testing.
 *
 * HEXAGONAL ARCHITECTURE:
 * - This is a DOMAIN SERVICE (pure business logic)
 * - Dependencies (logger, repository) are injected via constructor
 * - No framework/infrastructure imports allowed
 *
 * @module domain/breach-notification/breach-notification-service
 */

import { generatePrefixedId, generateUUID } from '../shared-kernel/utils/uuid.js';
import type {
  BreachRepository,
  BreachQueryOptions,
  BreachQueryResult,
} from './breach-repository.js';
import type {
  DataBreach,
  BreachSeverity,
  BreachDataCategory,
  BreachNotificationChannel,
  AffectedSubject,
  BreachMeasure,
  AuthorityNotification,
  ReportBreachPayload,
  BreachDetectedEvent,
  BreachAssessedEvent,
  BreachAuthorityNotifiedEvent,
  BreachSubjectNotifiedEvent,
  BreachResolvedEvent,
} from '@medicalcor/types';
import {
  assessBreachSeverity,
  requiresAuthorityNotification,
  requiresSubjectNotification,
  calculateHoursUntilDeadline,
} from '@medicalcor/types';

/**
 * Logger interface for dependency injection
 */
export interface BreachLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  fatal(msg: string): void;
}

/**
 * No-op logger for when no logger is provided
 */
const noopLogger: BreachLogger = {
  info: () => {
    /* intentionally empty */
  },
  warn: () => {
    /* intentionally empty */
  },
  error: () => {
    /* intentionally empty */
  },
  fatal: () => {
    /* intentionally empty */
  },
};

/**
 * Event emitter interface for domain events
 */
export interface BreachEventEmitter {
  emit(
    event:
      | BreachDetectedEvent
      | BreachAssessedEvent
      | BreachAuthorityNotifiedEvent
      | BreachSubjectNotifiedEvent
      | BreachResolvedEvent
  ): Promise<void>;
}

/**
 * No-op event emitter
 */
const noopEventEmitter: BreachEventEmitter = {
  emit: async () => {
    /* intentionally empty */
  },
};

/**
 * Configuration for breach notification service
 */
export interface BreachNotificationConfig {
  /** Default supervisory authority (e.g., 'ANSPDCP' for Romania) */
  defaultAuthority: string;
  /** DPO email for notifications */
  dpoEmail: string;
  /** DPO phone for urgent notifications */
  dpoPhone?: string;
  /** Hours before deadline to send warnings (default 48) */
  deadlineWarningHours: number;
  /** Channels to use for subject notifications (in priority order) */
  subjectNotificationChannels: BreachNotificationChannel[];
  /** Whether to auto-notify subjects for high-risk breaches */
  autoNotifySubjectsForHighRisk: boolean;
}

const DEFAULT_CONFIG: BreachNotificationConfig = {
  defaultAuthority: 'ANSPDCP',
  dpoEmail: 'dpo@clinic.example',
  deadlineWarningHours: 48,
  subjectNotificationChannels: ['email', 'whatsapp'],
  autoNotifySubjectsForHighRisk: false,
};

/**
 * Options for creating the breach notification service
 */
export interface BreachNotificationServiceOptions {
  /**
   * Breach repository for persistence (REQUIRED)
   */
  repository: BreachRepository;
  /**
   * Configuration overrides
   */
  config?: Partial<BreachNotificationConfig>;
  /**
   * Logger instance
   */
  logger?: BreachLogger;
  /**
   * Event emitter for domain events
   */
  eventEmitter?: BreachEventEmitter;
}

/**
 * Result of reporting a breach
 */
export interface ReportBreachResult {
  breach: DataBreach;
  assessedSeverity: BreachSeverity;
  authorityNotificationRequired: boolean;
  subjectNotificationRequired: boolean;
  hoursUntilDeadline: number;
}

/**
 * Result of notifying a subject
 */
export interface NotifySubjectResult {
  success: boolean;
  contactId: string;
  channel: BreachNotificationChannel;
  error?: string;
}

/**
 * Result of notifying authority
 */
export interface NotifyAuthorityResult {
  breach: DataBreach;
  authority: string;
  withinDeadline: boolean;
  hoursFromDetection: number;
}

/**
 * GDPR Breach Notification Service
 */
export class BreachNotificationService {
  private config: BreachNotificationConfig;
  private repository: BreachRepository;
  private logger: BreachLogger;
  private eventEmitter: BreachEventEmitter;

  constructor(options: BreachNotificationServiceOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.repository = options.repository;
    this.logger = options.logger ?? noopLogger;
    this.eventEmitter = options.eventEmitter ?? noopEventEmitter;
  }

  /**
   * Report a new data breach
   * Creates a breach record and performs initial assessment
   */
  async reportBreach(payload: ReportBreachPayload): Promise<ReportBreachResult> {
    const now = new Date().toISOString();
    const detectedAt = payload.detectedAt ?? now;

    // Assess severity based on data categories and estimated impact
    const severity = assessBreachSeverity(
      payload.dataCategories,
      payload.nature,
      payload.estimatedAffectedCount
    );

    // Determine notification requirements
    const highRiskToSubjects = severity === 'critical' || severity === 'high';
    const authorityNotificationRequired = requiresAuthorityNotification(
      severity,
      highRiskToSubjects
    );
    const subjectNotificationRequired = requiresSubjectNotification(severity, highRiskToSubjects);

    // Build affected subjects list if contact IDs provided
    const affectedSubjects: AffectedSubject[] = (payload.affectedContactIds ?? []).map(
      (contactId) => ({
        contactId,
        dataCategories: payload.dataCategories,
        notified: false,
      })
    );

    // Create breach record
    const breach: DataBreach = {
      id: this.generateId(),
      correlationId: payload.correlationId,
      clinicId: payload.clinicId,
      detectedAt,
      detectedBy: payload.reportedBy,
      detectionMethod: payload.detectionMethod,
      nature: payload.nature,
      dataCategories: payload.dataCategories,
      severity,
      status: 'detected',
      description: payload.description,
      affectedCount: payload.estimatedAffectedCount,
      affectedSubjects: affectedSubjects.length > 0 ? affectedSubjects : undefined,
      potentialConsequences: this.assessConsequences(payload.dataCategories),
      highRiskToSubjects,
      dpoNotified: false,
      authorityNotificationRequired,
      subjectNotificationRequired,
      subjectsNotifiedCount: 0,
      measuresTaken: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: payload.reportedBy,
    };

    // Save to repository
    const savedBreach = await this.repository.save(breach);

    // Emit breach detected event
    await this.eventEmitter.emit({
      id: generateUUID(),
      type: 'breach.detected',
      timestamp: now,
      correlationId: payload.correlationId,
      breachId: savedBreach.id,
      clinicId: payload.clinicId,
      payload: {
        severity,
        dataCategories: payload.dataCategories,
        estimatedAffectedCount: payload.estimatedAffectedCount,
        detectedBy: payload.reportedBy,
      },
    });

    this.logger.info(
      {
        breachId: savedBreach.id,
        severity,
        authorityNotificationRequired,
        subjectNotificationRequired,
        affectedCount: payload.estimatedAffectedCount,
      },
      'Data breach reported'
    );

    const hoursUntilDeadline = calculateHoursUntilDeadline(detectedAt);

    return {
      breach: savedBreach,
      assessedSeverity: severity,
      authorityNotificationRequired,
      subjectNotificationRequired,
      hoursUntilDeadline,
    };
  }

  /**
   * Update breach assessment after investigation
   */
  async updateAssessment(
    breachId: string,
    assessment: {
      severity: BreachSeverity;
      affectedCount: number;
      highRiskToSubjects: boolean;
      potentialConsequences: string[];
      rootCause?: string;
      internalNotes?: string;
    },
    assessedBy: string
  ): Promise<DataBreach> {
    const breach = await this.repository.findById(breachId);
    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    const now = new Date().toISOString();
    const authorityNotificationRequired = requiresAuthorityNotification(
      assessment.severity,
      assessment.highRiskToSubjects
    );
    const subjectNotificationRequired = requiresSubjectNotification(
      assessment.severity,
      assessment.highRiskToSubjects
    );

    const updatedBreach: DataBreach = {
      ...breach,
      severity: assessment.severity,
      affectedCount: assessment.affectedCount,
      highRiskToSubjects: assessment.highRiskToSubjects,
      potentialConsequences: assessment.potentialConsequences,
      rootCause: assessment.rootCause,
      internalNotes: assessment.internalNotes,
      authorityNotificationRequired,
      subjectNotificationRequired,
      status: 'assessed',
      updatedAt: now,
      updatedBy: assessedBy,
    };

    const savedBreach = await this.repository.update(updatedBreach);

    // Emit assessed event
    await this.eventEmitter.emit({
      id: generateUUID(),
      type: 'breach.assessed',
      timestamp: now,
      correlationId: breach.correlationId,
      breachId,
      clinicId: breach.clinicId,
      payload: {
        severity: assessment.severity,
        highRiskToSubjects: assessment.highRiskToSubjects,
        authorityNotificationRequired,
        subjectNotificationRequired,
        affectedCount: assessment.affectedCount,
      },
    });

    this.logger.info(
      { breachId, severity: assessment.severity, assessedBy },
      'Breach assessment updated'
    );

    return savedBreach;
  }

  /**
   * Notify DPO about the breach
   */
  async notifyDPO(breachId: string): Promise<void> {
    const breach = await this.repository.findById(breachId);
    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    const now = new Date().toISOString();

    // Mark DPO as notified
    const updatedBreach: DataBreach = {
      ...breach,
      dpoNotified: true,
      dpoNotifiedAt: now,
      updatedAt: now,
      updatedBy: 'system',
    };

    await this.repository.update(updatedBreach);

    this.logger.info({ breachId, dpoEmail: this.config.dpoEmail }, 'DPO notified of breach');
  }

  /**
   * Record notification to supervisory authority
   */
  async notifyAuthority(
    breachId: string,
    authority: string,
    referenceNumber?: string,
    contactPerson?: string,
    notes?: string
  ): Promise<NotifyAuthorityResult> {
    const breach = await this.repository.findById(breachId);
    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    const now = new Date().toISOString();
    const hoursFromDetection = Math.floor(
      (new Date(now).getTime() - new Date(breach.detectedAt).getTime()) / (60 * 60 * 1000)
    );
    const withinDeadline = hoursFromDetection <= 72;

    const notification: AuthorityNotification = {
      authority,
      notifiedAt: now,
      referenceNumber,
      contactPerson,
      notes,
    };

    await this.repository.recordAuthorityNotification(breachId, notification);

    const updatedBreach: DataBreach = {
      ...breach,
      authorityNotification: notification,
      status: 'notifying_authority',
      updatedAt: now,
      updatedBy: 'system',
    };

    const savedBreach = await this.repository.update(updatedBreach);

    // Emit authority notified event
    await this.eventEmitter.emit({
      id: generateUUID(),
      type: 'breach.authority_notified',
      timestamp: now,
      correlationId: breach.correlationId,
      breachId,
      clinicId: breach.clinicId,
      payload: {
        authority,
        notifiedAt: now,
        referenceNumber,
        withinDeadline,
        hoursFromDetection,
      },
    });

    if (!withinDeadline) {
      this.logger.warn(
        { breachId, hoursFromDetection },
        'Authority notification exceeded 72-hour deadline'
      );
    } else {
      this.logger.info({ breachId, authority, hoursFromDetection }, 'Authority notified of breach');
    }

    return {
      breach: savedBreach,
      authority,
      withinDeadline,
      hoursFromDetection,
    };
  }

  /**
   * Notify an affected subject about the breach
   */
  async notifySubject(
    breachId: string,
    contactId: string,
    channel: BreachNotificationChannel
  ): Promise<NotifySubjectResult> {
    const breach = await this.repository.findById(breachId);
    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    const now = new Date().toISOString();

    try {
      // Update subject notification status
      await this.repository.updateSubjectNotification(breachId, contactId, true, now, channel);

      // Update breach subject count
      const updatedBreach: DataBreach = {
        ...breach,
        subjectsNotifiedCount: breach.subjectsNotifiedCount + 1,
        status: breach.status === 'notifying_authority' ? 'notifying_subjects' : breach.status,
        updatedAt: now,
        updatedBy: 'system',
      };
      await this.repository.update(updatedBreach);

      // Emit subject notified event
      await this.eventEmitter.emit({
        id: generateUUID(),
        type: 'breach.subject_notified',
        timestamp: now,
        correlationId: breach.correlationId,
        breachId,
        clinicId: breach.clinicId,
        payload: {
          contactId,
          channel,
          success: true,
        },
      });

      this.logger.info({ breachId, contactId, channel }, 'Subject notified of breach');

      return { success: true, contactId, channel };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Emit failed notification event
      await this.eventEmitter.emit({
        id: generateUUID(),
        type: 'breach.subject_notified',
        timestamp: now,
        correlationId: breach.correlationId,
        breachId,
        clinicId: breach.clinicId,
        payload: {
          contactId,
          channel,
          success: false,
          errorReason: errorMessage,
        },
      });

      this.logger.error(
        { breachId, contactId, channel, error: errorMessage },
        'Failed to notify subject of breach'
      );

      return { success: false, contactId, channel, error: errorMessage };
    }
  }

  /**
   * Add a measure taken to address the breach
   */
  async addMeasure(
    breachId: string,
    description: string,
    type: 'remediation' | 'preventive' | 'mitigation',
    implementedBy: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const measure: BreachMeasure = {
      description,
      implementedAt: now,
      implementedBy,
      type,
    };

    await this.repository.addMeasure(breachId, measure);

    this.logger.info({ breachId, measureType: type }, 'Breach measure recorded');
  }

  /**
   * Mark breach as resolved
   */
  async resolveBreach(breachId: string, resolvedBy: string): Promise<DataBreach> {
    const breach = await this.repository.findById(breachId);
    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    const now = new Date().toISOString();

    const updatedBreach: DataBreach = {
      ...breach,
      status: 'resolved',
      updatedAt: now,
      updatedBy: resolvedBy,
    };

    const savedBreach = await this.repository.update(updatedBreach);

    // Emit resolved event
    await this.eventEmitter.emit({
      id: generateUUID(),
      type: 'breach.resolved',
      timestamp: now,
      correlationId: breach.correlationId,
      breachId,
      clinicId: breach.clinicId,
      payload: {
        resolvedAt: now,
        resolvedBy,
        measuresTakenCount: breach.measuresTaken.length,
        subjectsNotified: breach.subjectsNotifiedCount,
        authorityNotified: !!breach.authorityNotification,
      },
    });

    this.logger.info({ breachId, resolvedBy }, 'Breach resolved');

    return savedBreach;
  }

  /**
   * Get breach by ID
   */
  async getBreach(breachId: string): Promise<DataBreach | null> {
    return this.repository.findById(breachId);
  }

  /**
   * Find breaches matching query
   */
  async findBreaches(options: BreachQueryOptions): Promise<BreachQueryResult> {
    return this.repository.find(options);
  }

  /**
   * Get breaches approaching 72-hour deadline
   */
  async getBreachesApproachingDeadline(): Promise<DataBreach[]> {
    return this.repository.findApproachingDeadline(this.config.deadlineWarningHours);
  }

  /**
   * Get breaches with pending subject notifications
   */
  async getBreachesPendingSubjectNotification(): Promise<DataBreach[]> {
    return this.repository.findPendingSubjectNotifications();
  }

  /**
   * Get configuration
   */
  getConfig(): BreachNotificationConfig {
    return { ...this.config };
  }

  /**
   * Assess potential consequences based on data categories
   */
  private assessConsequences(dataCategories: BreachDataCategory[]): string[] {
    const consequences: string[] = [];

    if (dataCategories.includes('health_data')) {
      consequences.push('Potential disclosure of sensitive medical information');
      consequences.push('Possible impact on medical treatment decisions');
    }

    if (dataCategories.includes('financial_data')) {
      consequences.push('Risk of financial fraud or identity theft');
      consequences.push('Potential unauthorized transactions');
    }

    if (dataCategories.includes('identification_data')) {
      consequences.push('Identity theft risk');
      consequences.push('Potential for fraudulent account creation');
    }

    if (dataCategories.includes('biometric_data')) {
      consequences.push('Permanent exposure of unchangeable identifiers');
    }

    if (dataCategories.includes('genetic_data')) {
      consequences.push('Permanent exposure of genetic information');
      consequences.push('Potential discrimination based on genetic data');
    }

    if (dataCategories.includes('personal_data')) {
      consequences.push('Loss of privacy');
      consequences.push('Potential for targeted phishing or social engineering');
    }

    return consequences.length > 0 ? consequences : ['General privacy impact'];
  }

  /**
   * Generate unique ID for breach records
   */
  private generateId(): string {
    return generatePrefixedId('brch');
  }
}

/**
 * Create a breach notification service instance
 */
export function createBreachNotificationService(
  options: BreachNotificationServiceOptions
): BreachNotificationService {
  return new BreachNotificationService(options);
}
