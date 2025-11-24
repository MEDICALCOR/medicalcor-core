/**
 * Consent Repository Interface
 * Defines the contract for consent data persistence
 * GDPR Compliance: All consent records must be persistently stored with audit trail
 */

import type {
  ConsentRecord,
  ConsentAuditEntry,
  ConsentType,
  ConsentStatus,
} from './consent-service.js';

export interface ConsentRepository {
  /**
   * Save or update a consent record
   */
  save(consent: ConsentRecord): Promise<ConsentRecord>;

  /**
   * Find consent by contact ID and type
   */
  findByContactAndType(
    contactId: string,
    consentType: ConsentType
  ): Promise<ConsentRecord | null>;

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

/**
 * In-memory implementation for development/testing
 * WARNING: Not suitable for production - data is lost on restart
 */
export class InMemoryConsentRepository implements ConsentRepository {
  private consents = new Map<string, ConsentRecord>();
  private auditLog: ConsentAuditEntry[] = [];

  private getKey(contactId: string, consentType: ConsentType): string {
    return `${contactId}:${consentType}`;
  }

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
}
