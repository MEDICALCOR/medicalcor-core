/**
 * In-Memory Consent Repository
 *
 * Test/development adapter for consent persistence.
 * Implements the IConsentRepository port from the domain layer.
 *
 * WARNING: Not suitable for production - data is lost on restart.
 * For production, use PostgresConsentRepository.
 *
 * @module @medicalcor/core/repositories/InMemoryConsentRepository
 */

import type {
  ConsentRecord,
  ConsentAuditEntry,
  ConsentType,
  ConsentStatus,
  IConsentRepository,
} from './PostgresConsentRepository.js';
import { Ok, type Result } from '../types/result.js';
import type { RecordCreateError } from '../errors.js';

/**
 * In-memory implementation for development/testing
 *
 * Note: Methods are async to match the IConsentRepository interface,
 * but use synchronous operations internally for the in-memory store.
 *
 * This implementation fully implements the IConsentRepository port interface
 * with Result pattern for consistent error handling.
 *
 * @example
 * ```typescript
 * const repository = new InMemoryConsentRepository();
 * const consentService = createConsentService({
 *   repository,
 *   logger: console,
 * });
 * ```
 */
export class InMemoryConsentRepository implements IConsentRepository {
  private consents = new Map<string, ConsentRecord>();
  private auditLog: ConsentAuditEntry[] = [];

  private getKey(contactId: string, consentType: ConsentType): string {
    return `${contactId}:${consentType}`;
  }

  save(consent: ConsentRecord): Promise<Result<ConsentRecord, RecordCreateError>> {
    const key = this.getKey(consent.contactId, consent.consentType);
    this.consents.set(key, consent);
    return Promise.resolve(Ok(consent));
  }

  upsert(
    consent: ConsentRecord
  ): Promise<Result<{ record: ConsentRecord; wasCreated: boolean }, RecordCreateError>> {
    const key = this.getKey(consent.contactId, consent.consentType);
    const existing = this.consents.get(key);
    const wasCreated = !existing;

    // When updating, preserve the original ID
    const recordToSave = wasCreated
      ? consent
      : {
          ...consent,
          id: existing.id,
          createdAt: existing.createdAt,
        };

    this.consents.set(key, recordToSave);
    return Promise.resolve(Ok({ record: recordToSave, wasCreated }));
  }

  findByContactAndType(contactId: string, consentType: ConsentType): Promise<ConsentRecord | null> {
    const key = this.getKey(contactId, consentType);
    return Promise.resolve(this.consents.get(key) ?? null);
  }

  findByContact(contactId: string): Promise<ConsentRecord[]> {
    const results: ConsentRecord[] = [];
    for (const consent of this.consents.values()) {
      if (consent.contactId === contactId) {
        results.push(consent);
      }
    }
    return Promise.resolve(results);
  }

  delete(consentId: string): Promise<void> {
    for (const [key, consent] of this.consents.entries()) {
      if (consent.id === consentId) {
        this.consents.delete(key);
        break;
      }
    }
    return Promise.resolve();
  }

  deleteByContact(contactId: string): Promise<number> {
    let count = 0;
    for (const [key, consent] of this.consents.entries()) {
      if (consent.contactId === contactId) {
        this.consents.delete(key);
        count++;
      }
    }
    return Promise.resolve(count);
  }

  findExpiringSoon(withinDays: number): Promise<ConsentRecord[]> {
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
    return Promise.resolve(results);
  }

  findByStatus(status: ConsentStatus): Promise<ConsentRecord[]> {
    const results: ConsentRecord[] = [];
    for (const consent of this.consents.values()) {
      if (consent.status === status) {
        results.push(consent);
      }
    }
    return Promise.resolve(results);
  }

  appendAuditEntry(entry: ConsentAuditEntry): Promise<void> {
    this.auditLog.push(entry);
    return Promise.resolve();
  }

  getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]> {
    return Promise.resolve(this.auditLog.filter((e) => e.consentId === consentId));
  }

  getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    return this.findByContact(contactId).then((consents) => {
      const consentIds = new Set(consents.map((c) => c.id));
      return this.auditLog.filter((e) => consentIds.has(e.consentId));
    });
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.consents.clear();
    this.auditLog = [];
  }

  /**
   * Get the number of stored consents (useful for testing)
   */
  size(): number {
    return this.consents.size;
  }
}

/**
 * Factory function to create an in-memory consent repository
 */
export function createInMemoryConsentRepository(): InMemoryConsentRepository {
  return new InMemoryConsentRepository();
}
