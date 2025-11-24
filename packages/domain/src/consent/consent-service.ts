/**
 * GDPR Consent Service
 * Manages patient consent for data processing and communications
 * Provides audit trail for compliance
 *
 * IMPORTANT: Use with a persistent repository (PostgresConsentRepository)
 * for GDPR compliance. The in-memory repository is only for development/testing.
 */

import { createLogger, type Logger } from '@medicalcor/core';
import type { ConsentRepository } from './consent-repository.js';
import { InMemoryConsentRepository } from './consent-repository.js';
import { PostgresConsentRepository } from './postgres-consent-repository.js';

export type ConsentType =
  | 'data_processing' // General data processing consent
  | 'marketing_whatsapp' // WhatsApp marketing messages
  | 'marketing_email' // Email marketing
  | 'marketing_sms' // SMS marketing
  | 'appointment_reminders' // Appointment reminder notifications
  | 'treatment_updates' // Treatment-related communications
  | 'third_party_sharing'; // Sharing data with partners

export type ConsentStatus = 'granted' | 'denied' | 'withdrawn' | 'pending';

export interface ConsentRecord {
  id: string;
  contactId: string; // HubSpot contact ID
  phone: string; // Normalized phone number
  consentType: ConsentType;
  status: ConsentStatus;
  version: number; // Consent version (for policy updates)
  grantedAt: string | null; // ISO timestamp
  withdrawnAt: string | null;
  expiresAt: string | null; // Optional expiration
  source: ConsentSource;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentSource {
  channel: 'whatsapp' | 'web' | 'phone' | 'in_person' | 'email';
  method: 'explicit' | 'implicit' | 'double_opt_in';
  evidenceUrl: string | null; // Link to recorded evidence
  witnessedBy: string | null; // Staff member if in-person
}

export interface ConsentAuditEntry {
  id: string;
  consentId: string;
  action: 'created' | 'granted' | 'denied' | 'withdrawn' | 'expired' | 'updated';
  previousStatus: ConsentStatus | null;
  newStatus: ConsentStatus;
  performedBy: string; // 'system' or user ID
  reason: string | null;
  ipAddress: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ConsentRequest {
  contactId: string;
  phone: string;
  consentType: ConsentType;
  status: ConsentStatus;
  source: ConsentSource;
  ipAddress?: string;
  userAgent?: string;
  expiresInDays?: number;
  metadata?: Record<string, unknown>;
}

export interface ConsentQuery {
  contactId?: string;
  phone?: string;
  consentType?: ConsentType;
  status?: ConsentStatus;
}

export interface ConsentConfig {
  defaultExpirationDays: number;
  requiredForProcessing: ConsentType[];
  currentPolicyVersion: number;
}

const DEFAULT_CONFIG: ConsentConfig = {
  defaultExpirationDays: 365 * 2, // 2 years
  requiredForProcessing: ['data_processing'],
  currentPolicyVersion: 1,
};

export interface ConsentServiceOptions {
  config?: Partial<ConsentConfig>;
  repository?: ConsentRepository;
}

export class ConsentService {
  private config: ConsentConfig;
  private repository: ConsentRepository;
  private logger: Logger;

  constructor(options?: ConsentServiceOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
    this.logger = createLogger({ name: 'consent-service' });

    // CRITICAL SECURITY CHECK: In production, a persistent repository is REQUIRED
    // Using in-memory storage for GDPR consent data is a compliance violation
    const isProduction = process.env.NODE_ENV === 'production';

    if (!options?.repository) {
      if (isProduction) {
        // FAIL FAST in production - this is a critical configuration error
        // GDPR consent data MUST be persisted to survive restarts
        const errorMessage =
          'CRITICAL: ConsentService requires a persistent repository in production. ' +
          'In-memory storage would cause GDPR compliance violations as consent records ' +
          'would be lost on restart. Please configure PostgresConsentRepository.';
        this.logger.fatal(errorMessage);
        throw new Error(errorMessage);
      }

      // Only allow in-memory for development/testing
      this.logger.warn(
        'ConsentService initialized with in-memory repository. ' +
          'This is NOT suitable for production - consent data will be lost on restart!'
      );
      this.repository = new InMemoryConsentRepository();
    } else {
      this.repository = options.repository;
    }
  }

  /**
   * Record or update consent
   * @returns Promise resolving to the consent record
   */
  async recordConsent(request: ConsentRequest): Promise<ConsentRecord> {
    const {
      contactId,
      phone,
      consentType,
      status,
      source,
      ipAddress,
      userAgent,
      expiresInDays,
      metadata,
    } = request;

    const existing = await this.repository.findByContactAndType(contactId, consentType);
    const previousStatus = existing?.status ?? null;

    const now = new Date().toISOString();
    const expirationDays = expiresInDays ?? this.config.defaultExpirationDays;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const consent: ConsentRecord = {
      id: existing?.id ?? this.generateId(),
      contactId,
      phone,
      consentType,
      status,
      version: this.config.currentPolicyVersion,
      grantedAt: status === 'granted' ? now : (existing?.grantedAt ?? null),
      withdrawnAt: status === 'withdrawn' ? now : null,
      expiresAt: status === 'granted' ? expiresAt.toISOString() : null,
      source,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      metadata: metadata ?? {},
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // Persist to repository
    await this.repository.save(consent);

    // Create audit entry
    await this.createAuditEntry({
      consentId: consent.id,
      action: existing ? (status === 'withdrawn' ? 'withdrawn' : 'updated') : 'created',
      previousStatus,
      newStatus: status,
      performedBy: 'system',
      reason: null,
      ipAddress: ipAddress ?? null,
      metadata: { source },
    });

    this.logger.info(
      { contactId, consentType, status, action: existing ? 'updated' : 'created' },
      'Consent recorded'
    );

    return consent;
  }

  /**
   * Grant consent (convenience method)
   */
  async grantConsent(
    contactId: string,
    phone: string,
    consentType: ConsentType,
    source: ConsentSource,
    options?: { ipAddress?: string; userAgent?: string; metadata?: Record<string, unknown> }
  ): Promise<ConsentRecord> {
    return this.recordConsent({
      contactId,
      phone,
      consentType,
      status: 'granted',
      source,
      ...(options?.ipAddress && { ipAddress: options.ipAddress }),
      ...(options?.userAgent && { userAgent: options.userAgent }),
      ...(options?.metadata && { metadata: options.metadata }),
    });
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(
    contactId: string,
    consentType: ConsentType,
    reason?: string,
    performedBy = 'patient'
  ): Promise<ConsentRecord> {
    const existing = await this.repository.findByContactAndType(contactId, consentType);

    if (!existing) {
      throw new Error(`Consent record not found for ${contactId}:${consentType}`);
    }

    const previousStatus = existing.status;
    existing.status = 'withdrawn';
    existing.withdrawnAt = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();

    await this.repository.save(existing);

    await this.createAuditEntry({
      consentId: existing.id,
      action: 'withdrawn',
      previousStatus,
      newStatus: 'withdrawn',
      performedBy,
      reason: reason ?? null,
      ipAddress: null,
      metadata: {},
    });

    this.logger.info({ contactId, consentType, reason }, 'Consent withdrawn');

    return existing;
  }

  /**
   * Check if consent is valid
   */
  async hasValidConsent(contactId: string, consentType: ConsentType): Promise<boolean> {
    const consent = await this.repository.findByContactAndType(contactId, consentType);

    if (!consent) return false;
    if (consent.status !== 'granted') return false;

    // Check expiration
    if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
      // Auto-expire
      await this.expireConsent(consent);
      return false;
    }

    // Check policy version
    if (consent.version < this.config.currentPolicyVersion) {
      // Consent needs renewal for new policy
      return false;
    }

    return true;
  }

  /**
   * Check if all required consents are granted
   */
  async hasRequiredConsents(
    contactId: string
  ): Promise<{ valid: boolean; missing: ConsentType[] }> {
    const missing: ConsentType[] = [];

    for (const consentType of this.config.requiredForProcessing) {
      const hasConsent = await this.hasValidConsent(contactId, consentType);
      if (!hasConsent) {
        missing.push(consentType);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get consent status for a contact
   */
  async getConsent(contactId: string, consentType: ConsentType): Promise<ConsentRecord | null> {
    return this.repository.findByContactAndType(contactId, consentType);
  }

  /**
   * Get all consents for a contact
   */
  async getConsentsForContact(contactId: string): Promise<ConsentRecord[]> {
    return this.repository.findByContact(contactId);
  }

  /**
   * Get audit trail for a consent
   */
  async getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]> {
    return this.repository.getAuditTrail(consentId);
  }

  /**
   * Get audit trail for a contact
   */
  async getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    return this.repository.getContactAuditTrail(contactId);
  }

  /**
   * Export consent data for GDPR data portability request
   */
  async exportConsentData(contactId: string): Promise<{
    consents: ConsentRecord[];
    auditTrail: ConsentAuditEntry[];
    exportedAt: string;
  }> {
    const consents = await this.getConsentsForContact(contactId);
    const auditTrail = await this.getContactAuditTrail(contactId);

    return {
      consents,
      auditTrail,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Delete all consent data for GDPR erasure request
   */
  async eraseConsentData(contactId: string, performedBy: string, reason: string): Promise<void> {
    const consents = await this.getConsentsForContact(contactId);

    for (const consent of consents) {
      // Create final audit entry before deletion
      await this.createAuditEntry({
        consentId: consent.id,
        action: 'withdrawn',
        previousStatus: consent.status,
        newStatus: 'withdrawn',
        performedBy,
        reason: `GDPR erasure: ${reason}`,
        ipAddress: null,
        metadata: { erasureRequest: true },
      });
    }

    await this.repository.deleteByContact(contactId);

    this.logger.info({ contactId, erasedCount: consents.length }, 'Consent data erased');
  }

  /**
   * Parse consent from WhatsApp message
   */
  parseConsentFromMessage(
    message: string
  ): { granted: boolean; consentTypes: ConsentType[] } | null {
    const normalizedMessage = message.toLowerCase().trim();

    // Check for explicit consent keywords
    const consentPatterns = [
      { pattern: /\b(da|yes|accept|accepto?|sunt de acord|agree)\b/i, granted: true },
      { pattern: /\b(nu|no|reject|refuz|nu sunt de acord|disagree|stop)\b/i, granted: false },
    ];

    for (const { pattern, granted } of consentPatterns) {
      if (pattern.test(normalizedMessage)) {
        // Default to marketing WhatsApp consent for chat interactions
        return {
          granted,
          consentTypes: ['marketing_whatsapp', 'appointment_reminders'],
        };
      }
    }

    return null;
  }

  /**
   * Generate consent request message
   */
  generateConsentMessage(language: 'ro' | 'en' | 'de' = 'ro'): string {
    const messages = {
      ro: `🔒 Pentru a continua, avem nevoie de acordul dumneavoastră pentru procesarea datelor personale și trimiterea de notificări despre programări.

Răspundeți cu "DA" pentru a accepta sau "NU" pentru a refuza.

Puteți retrage acordul oricând răspunzând cu "STOP".`,
      en: `🔒 To continue, we need your consent for processing personal data and sending appointment notifications.

Reply "YES" to accept or "NO" to decline.

You can withdraw consent at any time by replying "STOP".`,
      de: `🔒 Um fortzufahren, benötigen wir Ihre Zustimmung zur Verarbeitung personenbezogener Daten und zum Versand von Terminbenachrichtigungen.

Antworten Sie mit "JA" um zu akzeptieren oder "NEIN" um abzulehnen.

Sie können Ihre Zustimmung jederzeit widerrufen, indem Sie "STOP" antworten.`,
    } as const;

    return messages[language];
  }

  /**
   * Expire a consent record
   */
  private async expireConsent(consent: ConsentRecord): Promise<void> {
    const previousStatus = consent.status;

    consent.status = 'withdrawn';
    consent.withdrawnAt = new Date().toISOString();
    consent.updatedAt = new Date().toISOString();

    await this.repository.save(consent);

    await this.createAuditEntry({
      consentId: consent.id,
      action: 'expired',
      previousStatus,
      newStatus: 'withdrawn',
      performedBy: 'system',
      reason: 'Consent expired',
      ipAddress: null,
      metadata: { expiresAt: consent.expiresAt },
    });
  }

  /**
   * Create audit log entry
   */
  private async createAuditEntry(
    entry: Omit<ConsentAuditEntry, 'id' | 'timestamp'>
  ): Promise<void> {
    const auditEntry: ConsentAuditEntry = {
      id: this.generateId(),
      ...entry,
      timestamp: new Date().toISOString(),
    };

    await this.repository.appendAuditEntry(auditEntry);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `cns_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Create a consent service instance
 * @param options - Configuration and repository options
 * @returns ConsentService instance
 *
 * @example
 * // Production with PostgreSQL
 * const repository = new PostgresConsentRepository(db);
 * const service = createConsentService({ repository });
 *
 * @example
 * // Development with in-memory (not for production!)
 * const service = createConsentService();
 */
export function createConsentService(options?: ConsentServiceOptions): ConsentService {
  return new ConsentService(options);
}

/**
 * Database client interface for PostgresConsentRepository
 */
export interface ConsentDatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Create a consent service with PostgreSQL persistence
 * This is the recommended way to create a consent service for production use.
 *
 * @param db - Database client (from createDatabaseClient())
 * @param config - Optional consent configuration overrides
 * @returns ConsentService with PostgreSQL persistence
 *
 * @example
 * ```typescript
 * import { createDatabaseClient } from '@medicalcor/core';
 * import { createPersistentConsentService } from '@medicalcor/domain';
 *
 * const db = createDatabaseClient();
 * const consentService = createPersistentConsentService(db);
 *
 * // Check if user has valid consent
 * const hasConsent = await consentService.hasValidConsent(contactId, 'data_processing');
 * ```
 */
export function createPersistentConsentService(
  db: ConsentDatabaseClient,
  config?: Partial<ConsentConfig>
): ConsentService {
  // Use PostgresConsentRepository with the provided database client
  const repository = new PostgresConsentRepository(db);

  const options: ConsentServiceOptions = { repository };
  if (config) {
    options.config = config;
  }

  return new ConsentService(options);
}
