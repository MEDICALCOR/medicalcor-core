/**
 * Consent Repository Interface - State-of-the-Art Repository Pattern
 *
 * Defines the contract for consent data persistence with:
 * - Generic repository interface for domain entities
 * - Type-safe query operations
 * - GDPR compliance requirements built-in
 *
 * GDPR Compliance: All consent records must be persistently stored with audit trail
 *
 * @module domain/consent
 */

import type { ConsentType, ConsentStatus } from '../types.js';
import type { ConsentRecord, ConsentAuditEntry } from './consent-service.js';

// ============================================================================
// REPOSITORY INTERFACE - Generic repository pattern
// ============================================================================

/**
 * ConsentRepository - Data access contract for consent management
 *
 * Implementations must ensure:
 * 1. ACID compliance for all write operations
 * 2. Audit trail integrity
 * 3. Data isolation between contacts
 *
 * @example
 * ```typescript
 * // PostgreSQL implementation for production
 * const repo: ConsentRepository = new PostgresConsentRepository(db);
 *
 * // In-memory implementation for testing
 * const repo: ConsentRepository = new InMemoryConsentRepository();
 * ```
 */
export interface ConsentRepository {
  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Save or update a consent record
   *
   * If record with same contactId+consentType exists, it should be updated.
   * Otherwise, a new record should be created.
   */
  save(consent: ConsentRecord): Promise<ConsentRecord>;

  /**
   * Find consent by contact ID and consent type
   *
   * @returns The consent record if found, null otherwise
   */
  findByContactAndType(contactId: string, consentType: ConsentType): Promise<ConsentRecord | null>;

  /**
   * Find all consents for a contact
   *
   * @returns Array of consent records, empty if none found
   */
  findByContact(contactId: string): Promise<ConsentRecord[]>;

  // ==========================================================================
  // GDPR Erasure Operations
  // ==========================================================================

  /**
   * Delete a consent record by ID
   *
   * Used for GDPR right to erasure.
   */
  delete(consentId: string): Promise<void>;

  /**
   * Delete all consents for a contact
   *
   * Used for GDPR right to erasure (full data deletion).
   *
   * @returns Number of records deleted
   */
  deleteByContact(contactId: string): Promise<number>;

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Find consents expiring within specified days
   *
   * Useful for proactive consent renewal notifications.
   */
  findExpiringSoon(withinDays: number): Promise<ConsentRecord[]>;

  /**
   * Find all consents by status
   */
  findByStatus(status: ConsentStatus): Promise<ConsentRecord[]>;

  // ==========================================================================
  // Audit Operations
  // ==========================================================================

  /**
   * Append an audit entry
   *
   * Audit entries are immutable and append-only.
   */
  appendAuditEntry(entry: ConsentAuditEntry): Promise<void>;

  /**
   * Get audit trail for a specific consent record
   *
   * @returns Array of audit entries, ordered by timestamp descending
   */
  getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]>;

  /**
   * Get complete audit trail for a contact
   *
   * Includes all audit entries for all consents belonging to the contact.
   *
   * @returns Array of audit entries, ordered by timestamp descending
   */
  getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]>;
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION - For development/testing only
// ============================================================================

/**
 * InMemoryConsentRepository - Development/testing implementation
 *
 * ⚠️ WARNING: Not suitable for production!
 * - Data is lost on restart
 * - No ACID guarantees
 * - No persistence
 *
 * Use PostgresConsentRepository for production deployments.
 *
 * @example
 * ```typescript
 * // Testing
 * const repo = new InMemoryConsentRepository();
 * const service = new ConsentService({ repository: repo });
 *
 * // After tests, data is automatically cleaned up
 * ```
 */
/* eslint-disable @typescript-eslint/require-await -- In-memory impl uses sync ops behind async interface */
export class InMemoryConsentRepository implements ConsentRepository {
  /**
   * Consent storage - keyed by contactId:consentType
   */
  private readonly consents = new Map<string, ConsentRecord>();

  /**
   * Audit log - append-only array
   */
  private readonly auditLog: ConsentAuditEntry[] = [];

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Generate composite key for consent lookup
   */
  private getKey(contactId: string, consentType: ConsentType): string {
    return `${contactId}:${consentType}`;
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  async save(consent: ConsentRecord): Promise<ConsentRecord> {
    const key = this.getKey(consent.contactId, consent.consentType);
    this.consents.set(key, consent);
    return consent;
  }

  async findByContactAndType(
    contactId: string,
    consentType: ConsentType
  ): Promise<ConsentRecord | null> {
    const key = this.getKey(contactId, consentType);
    return this.consents.get(key) ?? null;
  }

  async findByContact(contactId: string): Promise<ConsentRecord[]> {
    const results: ConsentRecord[] = [];
    for (const consent of this.consents.values()) {
      if (consent.contactId === contactId) {
        results.push(consent);
      }
    }
    return results;
  }

  // ==========================================================================
  // GDPR Erasure Operations
  // ==========================================================================

  async delete(consentId: string): Promise<void> {
    for (const [key, consent] of this.consents.entries()) {
      if (consent.id === consentId) {
        this.consents.delete(key);
        break;
      }
    }
  }

  async deleteByContact(contactId: string): Promise<number> {
    let count = 0;
    for (const [key, consent] of this.consents.entries()) {
      if (consent.contactId === contactId) {
        this.consents.delete(key);
        count++;
      }
    }
    return count;
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async findExpiringSoon(withinDays: number): Promise<ConsentRecord[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + withinDays);

    const results: ConsentRecord[] = [];
    for (const consent of this.consents.values()) {
      if (
        consent.status === 'granted' &&
        consent.expiresAt &&
        new Date(consent.expiresAt) <= futureDate
      ) {
        results.push(consent);
      }
    }
    return results;
  }

  async findByStatus(status: ConsentStatus): Promise<ConsentRecord[]> {
    const results: ConsentRecord[] = [];
    for (const consent of this.consents.values()) {
      if (consent.status === status) {
        results.push(consent);
      }
    }
    return results;
  }

  // ==========================================================================
  // Audit Operations
  // ==========================================================================

  async appendAuditEntry(entry: ConsentAuditEntry): Promise<void> {
    this.auditLog.push(entry);
  }

  async getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]> {
    return this.auditLog.filter((e) => e.consentId === consentId);
  }

  async getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    const consents = await this.findByContact(contactId);
    const consentIds = new Set(consents.map((c) => c.id));
    return this.auditLog.filter((e) => consentIds.has(e.consentId));
  }

  // ==========================================================================
  // Testing Utilities
  // ==========================================================================

  /**
   * Clear all data - useful for test cleanup
   */
  clear(): void {
    this.consents.clear();
    this.auditLog.length = 0;
  }

  /**
   * Get total count of consents - useful for assertions
   */
  get size(): number {
    return this.consents.size;
  }

  /**
   * Get total count of audit entries - useful for assertions
   */
  get auditSize(): number {
    return this.auditLog.length;
  }
}
/* eslint-enable @typescript-eslint/require-await */
