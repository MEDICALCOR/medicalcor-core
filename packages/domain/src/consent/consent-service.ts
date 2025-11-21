/**
 * GDPR Consent Service
 * Manages patient consent for data processing and communications
 * Provides audit trail for compliance
 */

import { createLogger, type Logger } from '@medicalcor/core';

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

export class ConsentService {
  private config: ConsentConfig;
  private consents = new Map<string, ConsentRecord>();
  private auditLog: ConsentAuditEntry[] = [];
  private logger: Logger;

  constructor(config?: Partial<ConsentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger({ name: 'consent-service' });
  }

  /**
   * Record or update consent
   */
  recordConsent(request: ConsentRequest): ConsentRecord {
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

    const existingKey = this.getConsentKey(contactId, consentType);
    const existing = this.consents.get(existingKey);
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

    this.consents.set(existingKey, consent);

    // Create audit entry
    this.createAuditEntry({
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
  grantConsent(
    contactId: string,
    phone: string,
    consentType: ConsentType,
    source: ConsentSource,
    options?: { ipAddress?: string; userAgent?: string; metadata?: Record<string, unknown> }
  ): ConsentRecord {
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
  withdrawConsent(
    contactId: string,
    consentType: ConsentType,
    reason?: string,
    performedBy = 'patient'
  ): ConsentRecord {
    const key = this.getConsentKey(contactId, consentType);
    const existing = this.consents.get(key);

    if (!existing) {
      throw new Error(`Consent record not found for ${contactId}:${consentType}`);
    }

    const previousStatus = existing.status;
    existing.status = 'withdrawn';
    existing.withdrawnAt = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();

    this.consents.set(key, existing);

    this.createAuditEntry({
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
  hasValidConsent(contactId: string, consentType: ConsentType): boolean {
    const key = this.getConsentKey(contactId, consentType);
    const consent = this.consents.get(key);

    if (!consent) return false;
    if (consent.status !== 'granted') return false;

    // Check expiration
    if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
      // Auto-expire
      this.expireConsent(consent);
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
  hasRequiredConsents(contactId: string): { valid: boolean; missing: ConsentType[] } {
    const missing: ConsentType[] = [];

    for (const consentType of this.config.requiredForProcessing) {
      const hasConsent = this.hasValidConsent(contactId, consentType);
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
  getConsent(contactId: string, consentType: ConsentType): ConsentRecord | null {
    const key = this.getConsentKey(contactId, consentType);
    return this.consents.get(key) ?? null;
  }

  /**
   * Get all consents for a contact
   */
  getConsentsForContact(contactId: string): ConsentRecord[] {
    const results: ConsentRecord[] = [];

    for (const consent of this.consents.values()) {
      if (consent.contactId === contactId) {
        results.push(consent);
      }
    }

    return results;
  }

  /**
   * Get audit trail for a consent
   */
  getAuditTrail(consentId: string): ConsentAuditEntry[] {
    return this.auditLog.filter((entry) => entry.consentId === consentId);
  }

  /**
   * Get audit trail for a contact
   */
  getContactAuditTrail(contactId: string): ConsentAuditEntry[] {
    const consents = this.getConsentsForContact(contactId);
    const consentIds = new Set(consents.map((c) => c.id));

    return this.auditLog.filter((entry) => consentIds.has(entry.consentId));
  }

  /**
   * Export consent data for GDPR data portability request
   */
  exportConsentData(contactId: string): {
    consents: ConsentRecord[];
    auditTrail: ConsentAuditEntry[];
    exportedAt: string;
  } {
    const consents = this.getConsentsForContact(contactId);
    const auditTrail = this.getContactAuditTrail(contactId);

    return {
      consents,
      auditTrail,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Delete all consent data for GDPR erasure request
   */
  eraseConsentData(contactId: string, performedBy: string, reason: string): void {
    const consents = this.getConsentsForContact(contactId);

    for (const consent of consents) {
      const key = this.getConsentKey(contactId, consent.consentType);

      // Create final audit entry before deletion
      this.createAuditEntry({
        consentId: consent.id,
        action: 'withdrawn',
        previousStatus: consent.status,
        newStatus: 'withdrawn',
        performedBy,
        reason: `GDPR erasure: ${reason}`,
        ipAddress: null,
        metadata: { erasureRequest: true },
      });

      this.consents.delete(key);
    }

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
  private expireConsent(consent: ConsentRecord): void {
    const key = this.getConsentKey(consent.contactId, consent.consentType);
    const previousStatus = consent.status;

    consent.status = 'withdrawn';
    consent.withdrawnAt = new Date().toISOString();
    consent.updatedAt = new Date().toISOString();

    this.consents.set(key, consent);

    this.createAuditEntry({
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
  private createAuditEntry(entry: Omit<ConsentAuditEntry, 'id' | 'timestamp'>): void {
    const auditEntry: ConsentAuditEntry = {
      id: this.generateId(),
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.auditLog.push(auditEntry);
  }

  /**
   * Generate consent key for storage
   */
  private getConsentKey(contactId: string, consentType: ConsentType): string {
    return `${contactId}:${consentType}`;
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
 */
export function createConsentService(config?: Partial<ConsentConfig>): ConsentService {
  return new ConsentService(config);
}
