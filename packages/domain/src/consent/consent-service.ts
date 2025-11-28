/**
 * GDPR Consent Service - State-of-the-Art Implementation
 *
 * Manages patient consent for data processing and communications
 * with full GDPR compliance and audit trail capabilities.
 *
 * Architecture Highlights:
 * - Result types for explicit error handling (no exceptions)
 * - Branded types for compile-time safety
 * - Immutable data structures with readonly modifiers
 * - Functional composition patterns
 * - Repository pattern with dependency injection
 * - Exhaustive type checking with const assertions
 *
 * IMPORTANT: Use with a persistent repository (PostgresConsentRepository)
 * for GDPR compliance. The in-memory repository is only for development/testing.
 *
 * @module domain/consent
 */

import { randomUUID } from 'crypto';
import {
  type ConsentType,
  type ConsentStatus,
  type ConsentChannel,
  type ConsentMethod,
  type SupportedLanguage,
  type AuditAction,
  type AsyncDomainResult,
  Ok,
  Err,
  createDomainError,
  DOMAIN_ERROR_CODES,
} from '../types.js';

// Simple logger interface
interface Logger {
  info(data: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  fatal(msg: string): void;
}

function createLogger(_opts: { name: string }): Logger {
  return {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    info: () => {},
    warn: (msg: string) => console.warn(msg),
    fatal: (msg: string) => console.error(msg),
  };
}
import type { ConsentRepository } from './consent-repository.js';
import { InMemoryConsentRepository } from './consent-repository.js';
import { PostgresConsentRepository } from './postgres-consent-repository.js';

// ============================================================================
// INTERFACES - Immutable by default with readonly
// ============================================================================

/**
 * Consent source information - where and how consent was collected
 */
export interface ConsentSource {
  readonly channel: ConsentChannel;
  readonly method: ConsentMethod;
  readonly evidenceUrl: string | null;
  readonly witnessedBy: string | null;
}

/**
 * Core consent record - immutable domain entity
 */
export interface ConsentRecord {
  readonly id: string;
  readonly contactId: string;
  readonly phone: string;
  readonly consentType: ConsentType;
  readonly status: ConsentStatus;
  readonly version: number;
  readonly grantedAt: string | null;
  readonly withdrawnAt: string | null;
  readonly expiresAt: string | null;
  readonly source: ConsentSource;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Audit entry for consent changes - immutable audit trail
 */
export interface ConsentAuditEntry {
  readonly id: string;
  readonly consentId: string;
  readonly action: AuditAction;
  readonly previousStatus: ConsentStatus | null;
  readonly newStatus: ConsentStatus;
  readonly performedBy: string;
  readonly reason: string | null;
  readonly ipAddress: string | null;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Request to record consent
 */
export interface ConsentRequest {
  readonly contactId: string;
  readonly phone: string;
  readonly consentType: ConsentType;
  readonly status: ConsentStatus;
  readonly source: ConsentSource;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly expiresInDays?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Query parameters for consent lookup
 */
export interface ConsentQuery {
  readonly contactId?: string;
  readonly phone?: string;
  readonly consentType?: ConsentType;
  readonly status?: ConsentStatus;
}

/**
 * Service configuration - immutable
 */
export interface ConsentConfig {
  readonly defaultExpirationDays: number;
  readonly requiredForProcessing: readonly ConsentType[];
  readonly currentPolicyVersion: number;
}

/**
 * Service options for construction
 */
export interface ConsentServiceOptions {
  readonly config?: Partial<ConsentConfig>;
  readonly repository?: ConsentRepository;
}

/**
 * Parsed consent from message
 */
export interface ParsedConsent {
  readonly granted: boolean;
  readonly consentTypes: readonly ConsentType[];
}

/**
 * Consent validation result
 */
export interface ConsentValidation {
  readonly valid: boolean;
  readonly missing: readonly ConsentType[];
}

/**
 * Consent export data for GDPR portability
 */
export interface ConsentExport {
  readonly consents: readonly ConsentRecord[];
  readonly auditTrail: readonly ConsentAuditEntry[];
  readonly exportedAt: string;
}

// ============================================================================
// DEFAULT CONFIGURATION - Frozen for immutability
// ============================================================================

const DEFAULT_CONFIG: ConsentConfig = Object.freeze({
  defaultExpirationDays: 365 * 2, // 2 years
  requiredForProcessing: Object.freeze(['data_processing'] as const),
  currentPolicyVersion: 1,
});

// ============================================================================
// LOCALIZED MESSAGES - Template literal constants
// ============================================================================

const CONSENT_MESSAGES = Object.freeze({
  ro: `🔒 Pentru a continua, avem nevoie de acordul dumneavoastră pentru procesarea datelor personale și trimiterea de notificări despre programări.

Răspundeți cu "DA" pentru a accepta sau "NU" pentru a refuza.

Puteți retrage acordul oricând răspunzând cu "STOP".`,
  en: `🔒 To continue, we need your consent for processing personal data and sending appointment notifications.

Reply "YES" to accept or "NO" to decline.

You can withdraw consent at any time by replying "STOP".`,
  de: `🔒 Um fortzufahren, benötigen wir Ihre Zustimmung zur Verarbeitung personenbezogener Daten und zum Versand von Terminbenachrichtigungen.

Antworten Sie mit "JA" um zu akzeptieren oder "NEIN" um abzulehnen.

Sie können Ihre Zustimmung jederzeit widerrufen, indem Sie "STOP" antworten.`,
} as const);

// ============================================================================
// CONSENT PATTERNS - Type-safe regex matchers
// ============================================================================

const CONSENT_PATTERNS = Object.freeze([
  { pattern: /\b(da|yes|accept|accepto?|sunt de acord|agree)\b/i, granted: true },
  { pattern: /\b(nu|no|reject|refuz|nu sunt de acord|disagree|stop)\b/i, granted: false },
] as const);

const DEFAULT_CONSENT_TYPES: readonly ConsentType[] = Object.freeze([
  'marketing_whatsapp',
  'appointment_reminders',
]);

// ============================================================================
// CONSENT SERVICE - Main implementation
// ============================================================================

/**
 * ConsentService - GDPR-compliant consent management
 *
 * This service provides comprehensive consent management with:
 * - Full audit trail for compliance
 * - Policy versioning support
 * - Automatic expiration handling
 * - GDPR data export and erasure
 *
 * @example
 * ```typescript
 * // Production with PostgreSQL
 * const repository = new PostgresConsentRepository(db);
 * const service = new ConsentService({ repository });
 *
 * // Record consent with Result type
 * const result = await service.recordConsent({
 *   contactId: 'contact-123',
 *   phone: '+40721234567',
 *   consentType: 'data_processing',
 *   status: 'granted',
 *   source: { channel: 'whatsapp', method: 'explicit', evidenceUrl: null, witnessedBy: null }
 * });
 *
 * // Handle result explicitly
 * result.match({
 *   ok: (consent) => console.log('Consent recorded:', consent.id),
 *   err: (error) => console.error('Failed:', error.code, error.message)
 * });
 * ```
 */
export class ConsentService {
  private readonly config: ConsentConfig;
  private readonly repository: ConsentRepository;
  private readonly logger: Logger;

  constructor(options?: ConsentServiceOptions) {
    this.config = Object.freeze({
      ...DEFAULT_CONFIG,
      ...options?.config,
      requiredForProcessing: Object.freeze(
        options?.config?.requiredForProcessing ?? DEFAULT_CONFIG.requiredForProcessing
      ),
    });
    this.logger = createLogger({ name: 'consent-service' });

    // CRITICAL SECURITY CHECK: In production, a persistent repository is REQUIRED
    const isProduction = process.env.NODE_ENV === 'production';

    if (!options?.repository) {
      if (isProduction) {
        const errorMessage =
          'CRITICAL: ConsentService requires a persistent repository in production. ' +
          'In-memory storage would cause GDPR compliance violations as consent records ' +
          'would be lost on restart. Please configure PostgresConsentRepository.';
        this.logger.fatal(errorMessage);
        throw new Error(errorMessage);
      }

      this.logger.warn(
        'ConsentService initialized with in-memory repository. ' +
          'This is NOT suitable for production - consent data will be lost on restart!'
      );
      this.repository = new InMemoryConsentRepository();
    } else {
      this.repository = options.repository;
    }
  }

  // ==========================================================================
  // CORE OPERATIONS - Result-based error handling
  // ==========================================================================

  /**
   * Record or update consent
   *
   * Uses Result type for explicit error handling - no exceptions thrown.
   *
   * @returns AsyncDomainResult containing the consent record or a typed error
   */
  async recordConsent(request: ConsentRequest): AsyncDomainResult<ConsentRecord> {
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

    try {
      const existing = await this.repository.findByContactAndType(contactId, consentType);
      const previousStatus = existing?.status ?? null;

      const now = new Date().toISOString();
      const expirationDays = expiresInDays ?? this.config.defaultExpirationDays;
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + expirationDays);

      // Create immutable consent record
      const consent: ConsentRecord = Object.freeze({
        id: existing?.id ?? this.generateId(),
        contactId,
        phone,
        consentType,
        status,
        version: this.config.currentPolicyVersion,
        grantedAt: status === 'granted' ? now : (existing?.grantedAt ?? null),
        withdrawnAt: status === 'withdrawn' ? now : null,
        expiresAt: status === 'granted' ? expiresDate.toISOString() : null,
        source: Object.freeze(source),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        metadata: Object.freeze(metadata ?? {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      await this.repository.save(consent);

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

      return Ok(consent);
    } catch (error) {
      return Err(
        createDomainError(DOMAIN_ERROR_CODES.DATABASE_ERROR, 'Failed to record consent', {
          cause: error,
          metadata: { contactId, consentType },
        })
      );
    }
  }

  /**
   * Grant consent (convenience method)
   *
   * @returns AsyncDomainResult with the granted consent record
   */
  async grantConsent(
    contactId: string,
    phone: string,
    consentType: ConsentType,
    source: ConsentSource,
    options?: {
      readonly ipAddress?: string;
      readonly userAgent?: string;
      readonly metadata?: Record<string, unknown>;
    }
  ): AsyncDomainResult<ConsentRecord> {
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
   *
   * @returns AsyncDomainResult with the withdrawn consent record
   */
  async withdrawConsent(
    contactId: string,
    consentType: ConsentType,
    reason?: string,
    performedBy = 'patient'
  ): AsyncDomainResult<ConsentRecord> {
    try {
      const existing = await this.repository.findByContactAndType(contactId, consentType);

      if (!existing) {
        return Err(
          createDomainError(
            DOMAIN_ERROR_CODES.CONSENT_NOT_FOUND,
            `Consent record not found for ${contactId}:${consentType}`
          )
        );
      }

      if (existing.status === 'withdrawn') {
        return Err(
          createDomainError(
            DOMAIN_ERROR_CODES.CONSENT_ALREADY_WITHDRAWN,
            'Consent already withdrawn'
          )
        );
      }

      const previousStatus = existing.status;
      const now = new Date().toISOString();

      // Create updated immutable record
      const updated: ConsentRecord = Object.freeze({
        ...existing,
        status: 'withdrawn' as const,
        withdrawnAt: now,
        updatedAt: now,
      });

      await this.repository.save(updated);

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

      return Ok(updated);
    } catch (error) {
      return Err(
        createDomainError(DOMAIN_ERROR_CODES.DATABASE_ERROR, 'Failed to withdraw consent', {
          cause: error,
        })
      );
    }
  }

  // ==========================================================================
  // VALIDATION OPERATIONS
  // ==========================================================================

  /**
   * Check if consent is valid (granted, not expired, current policy version)
   */
  async hasValidConsent(contactId: string, consentType: ConsentType): Promise<boolean> {
    const consent = await this.repository.findByContactAndType(contactId, consentType);

    if (!consent) return false;
    if (consent.status !== 'granted') return false;

    // Check expiration
    if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
      await this.expireConsent(consent);
      return false;
    }

    // Check policy version
    if (consent.version < this.config.currentPolicyVersion) {
      return false;
    }

    return true;
  }

  /**
   * Check if all required consents are granted
   *
   * @returns ConsentValidation with valid flag and list of missing consent types
   */
  async hasRequiredConsents(contactId: string): Promise<ConsentValidation> {
    const missing: ConsentType[] = [];

    for (const consentType of this.config.requiredForProcessing) {
      const hasConsent = await this.hasValidConsent(contactId, consentType);
      if (!hasConsent) {
        missing.push(consentType);
      }
    }

    return Object.freeze({
      valid: missing.length === 0,
      missing: Object.freeze(missing),
    });
  }

  // ==========================================================================
  // QUERY OPERATIONS
  // ==========================================================================

  /**
   * Get consent status for a contact
   */
  async getConsent(contactId: string, consentType: ConsentType): Promise<ConsentRecord | null> {
    return this.repository.findByContactAndType(contactId, consentType);
  }

  /**
   * Get all consents for a contact
   */
  async getConsentsForContact(contactId: string): Promise<readonly ConsentRecord[]> {
    const consents = await this.repository.findByContact(contactId);
    return Object.freeze(consents);
  }

  /**
   * Get audit trail for a consent
   */
  async getAuditTrail(consentId: string): Promise<readonly ConsentAuditEntry[]> {
    const entries = await this.repository.getAuditTrail(consentId);
    return Object.freeze(entries);
  }

  /**
   * Get audit trail for a contact
   */
  async getContactAuditTrail(contactId: string): Promise<readonly ConsentAuditEntry[]> {
    const entries = await this.repository.getContactAuditTrail(contactId);
    return Object.freeze(entries);
  }

  // ==========================================================================
  // GDPR OPERATIONS
  // ==========================================================================

  /**
   * Export consent data for GDPR data portability request
   */
  async exportConsentData(contactId: string): Promise<ConsentExport> {
    const consents = await this.getConsentsForContact(contactId);
    const auditTrail = await this.getContactAuditTrail(contactId);

    return Object.freeze({
      consents,
      auditTrail,
      exportedAt: new Date().toISOString(),
    });
  }

  /**
   * Delete all consent data for GDPR erasure request
   */
  async eraseConsentData(
    contactId: string,
    performedBy: string,
    reason: string
  ): AsyncDomainResult<{ erasedCount: number }> {
    try {
      const consents = await this.getConsentsForContact(contactId);

      for (const consent of consents) {
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

      const erasedCount = await this.repository.deleteByContact(contactId);

      this.logger.info({ contactId, erasedCount }, 'Consent data erased');

      return Ok(Object.freeze({ erasedCount }));
    } catch (error) {
      return Err(
        createDomainError(DOMAIN_ERROR_CODES.DATABASE_ERROR, 'Failed to erase consent data', {
          cause: error,
        })
      );
    }
  }

  // ==========================================================================
  // MESSAGE PARSING
  // ==========================================================================

  /**
   * Parse consent from WhatsApp message
   *
   * @returns ParsedConsent if consent keywords detected, null otherwise
   */
  parseConsentFromMessage(message: string): ParsedConsent | null {
    const normalizedMessage = message.toLowerCase().trim();

    for (const { pattern, granted } of CONSENT_PATTERNS) {
      if (pattern.test(normalizedMessage)) {
        return Object.freeze({
          granted,
          consentTypes: DEFAULT_CONSENT_TYPES,
        });
      }
    }

    return null;
  }

  /**
   * Generate consent request message in specified language
   */
  generateConsentMessage(language: SupportedLanguage = 'ro'): string {
    return CONSENT_MESSAGES[language];
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Expire a consent record
   */
  private async expireConsent(consent: ConsentRecord): Promise<void> {
    const previousStatus = consent.status;
    const now = new Date().toISOString();

    const expired: ConsentRecord = Object.freeze({
      ...consent,
      status: 'withdrawn' as const,
      withdrawnAt: now,
      updatedAt: now,
    });

    await this.repository.save(expired);

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
    const auditEntry: ConsentAuditEntry = Object.freeze({
      id: `aud_${Date.now()}_${randomUUID().slice(0, 8)}`,
      ...entry,
      timestamp: new Date().toISOString(),
    });

    await this.repository.appendAuditEntry(auditEntry);
  }

  /**
   * Generate unique consent ID
   * SECURITY: Uses cryptographically secure randomness
   */
  private generateId(): string {
    return `cns_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a consent service instance
 *
 * @example
 * ```typescript
 * // Production with PostgreSQL
 * const repository = new PostgresConsentRepository(db);
 * const service = createConsentService({ repository });
 *
 * // Development with in-memory (not for production!)
 * const service = createConsentService();
 * ```
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
 *
 * This is the recommended way to create a consent service for production use.
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
  const repository = new PostgresConsentRepository(db);

  const options: ConsentServiceOptions = config ? { repository, config } : { repository };

  return new ConsentService(options);
}

// ============================================================================
// LEGACY TYPE EXPORTS - Backwards compatibility
// ============================================================================

export type { ConsentType, ConsentStatus };
