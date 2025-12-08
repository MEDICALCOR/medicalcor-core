/**
 * Consent Repository Interface (Port)
 *
 * Defines the contract for consent data persistence.
 * This is a PORT in hexagonal architecture - implementations (adapters)
 * are provided by the infrastructure layer (@medicalcor/core/repositories).
 *
 * GDPR Compliance: All consent records must be persistently stored with audit trail.
 *
 * Available Adapters (in @medicalcor/core/repositories):
 * - PostgresConsentRepository: Production-grade PostgreSQL implementation
 * - InMemoryConsentRepository: Test/development implementation
 *
 * @module domain/consent/consent-repository
 */

import type {
  ConsentRecord,
  ConsentAuditEntry,
  ConsentType,
  ConsentStatus,
} from './consent-service.js';

/**
 * Consent Repository Interface (Port)
 *
 * Implement this interface to provide consent persistence.
 *
 * @example
 * ```typescript
 * import { createConsentService } from '@medicalcor/domain/consent';
 * import { PostgresConsentRepository } from '@medicalcor/core/repositories';
 *
 * const repository = new PostgresConsentRepository({ pool: pgPool });
 * const consentService = createConsentService({ repository });
 * ```
 */
export interface ConsentRepository {
  /**
   * Save or update a consent record
   */
  save(consent: ConsentRecord): Promise<ConsentRecord>;

  /**
   * Atomically upsert a consent record and return whether it was created or updated
   * SECURITY: Use this method to prevent race conditions between concurrent consent updates
   */
  upsert(consent: ConsentRecord): Promise<{ record: ConsentRecord; wasCreated: boolean }>;

  /**
   * Find consent by contact ID and type
   */
  findByContactAndType(contactId: string, consentType: ConsentType): Promise<ConsentRecord | null>;

  /**
   * Find consent by phone number and type (optional - not all implementations support this)
   */
  findByPhoneAndType?(phone: string, consentType: ConsentType): Promise<ConsentRecord | null>;

  /**
   * Find all consents for a contact
   */
  findByContact(contactId: string): Promise<ConsentRecord[]>;

  /**
   * Delete consent record (for GDPR erasure)
   */
  delete(consentId: string): Promise<void>;

  /**
   * Delete all consents for a contact (GDPR erasure)
   */
  deleteByContact(contactId: string): Promise<number>;

  /**
   * Find consents expiring within days
   */
  findExpiringSoon(withinDays: number): Promise<ConsentRecord[]>;

  /**
   * Find consents by status
   */
  findByStatus(status: ConsentStatus): Promise<ConsentRecord[]>;

  /**
   * Append audit entry
   */
  appendAuditEntry(entry: ConsentAuditEntry): Promise<void>;

  /**
   * Get audit trail for a consent
   */
  getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]>;

  /**
   * Get audit trail for a contact
   */
  getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]>;
}
