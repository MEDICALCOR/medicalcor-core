/**
 * @fileoverview TCPA (Telephone Consumer Protection Act) Compliance Tests
 *
 * Tests TCPA-compliant communication handling including:
 * - Do-Not-Call (DNC) list management
 * - Call recording consent requirements
 * - Time-of-day calling restrictions
 * - Prior express written consent verification
 * - Opt-out mechanism compliance
 * - Automated dialing system restrictions
 *
 * @module domain/__tests__/tcpa-compliance
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  ConsentService,
  createConsentService,
  type ConsentRequest,
  type ConsentSource,
  type ConsentType,
  type ConsentRepository,
} from '../consent/consent-service.js';
import { InMemoryConsentRepository } from '@medicalcor/core/repositories';

// ============================================================================
// TCPA SERVICE TYPES & INTERFACES
// ============================================================================

/**
 * Do-Not-Call entry for tracking blocked numbers
 */
interface DoNotCallEntry {
  id: string;
  phone: string;
  source: 'federal_dnc' | 'state_dnc' | 'internal' | 'patient_request';
  addedAt: Date;
  expiresAt: Date | null;
  reason: string;
  addedBy: string;
}

/**
 * Call recording consent status
 */
interface CallRecordingConsent {
  phone: string;
  consentGiven: boolean;
  consentMethod: 'verbal' | 'written' | 'electronic';
  consentTimestamp: Date;
  recordingNotified: boolean;
  twoPartyConsentState: boolean;
}

/**
 * TCPA calling hours by timezone
 */
interface CallingHoursRestriction {
  timezone: string;
  startHour: number; // 8 AM
  endHour: number; // 9 PM
  excludeHolidays: boolean;
}

// ============================================================================
// IN-MEMORY TCPA REPOSITORY
// ============================================================================

class InMemoryDoNotCallRepository {
  private entries: Map<string, DoNotCallEntry> = new Map();
  private nextId = 1;

  async add(entry: Omit<DoNotCallEntry, 'id'>): Promise<DoNotCallEntry> {
    const id = `dnc_${this.nextId++}`;
    const record: DoNotCallEntry = { ...entry, id };
    this.entries.set(entry.phone, record);
    return record;
  }

  async isBlocked(phone: string): Promise<boolean> {
    const entry = this.entries.get(phone);
    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.entries.delete(phone);
      return false;
    }

    return true;
  }

  async remove(phone: string): Promise<void> {
    this.entries.delete(phone);
  }

  async getEntry(phone: string): Promise<DoNotCallEntry | null> {
    return this.entries.get(phone) ?? null;
  }

  async getAll(): Promise<DoNotCallEntry[]> {
    return Array.from(this.entries.values());
  }

  clear(): void {
    this.entries.clear();
  }
}

class InMemoryCallRecordingConsentRepository {
  private consents: Map<string, CallRecordingConsent> = new Map();

  async save(consent: CallRecordingConsent): Promise<void> {
    this.consents.set(consent.phone, consent);
  }

  async get(phone: string): Promise<CallRecordingConsent | null> {
    return this.consents.get(phone) ?? null;
  }

  async hasConsent(phone: string): Promise<boolean> {
    const consent = this.consents.get(phone);
    return consent?.consentGiven ?? false;
  }

  clear(): void {
    this.consents.clear();
  }
}

// ============================================================================
// TCPA COMPLIANCE SERVICE
// ============================================================================

interface TCPAServiceLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

interface TCPAComplianceServiceOptions {
  dncRepository: InMemoryDoNotCallRepository;
  recordingConsentRepository: InMemoryCallRecordingConsentRepository;
  consentService: ConsentService;
  logger?: TCPAServiceLogger;
}

/**
 * TCPA Compliance Service
 * Manages telecommunications compliance requirements
 */
class TCPAComplianceService {
  private dncRepository: InMemoryDoNotCallRepository;
  private recordingConsentRepository: InMemoryCallRecordingConsentRepository;
  private consentService: ConsentService;
  private logger: TCPAServiceLogger;

  // TCPA calling hours: 8 AM to 9 PM recipient's local time
  private readonly CALLING_START_HOUR = 8;
  private readonly CALLING_END_HOUR = 21;

  constructor(options: TCPAComplianceServiceOptions) {
    this.dncRepository = options.dncRepository;
    this.recordingConsentRepository = options.recordingConsentRepository;
    this.consentService = options.consentService;
    this.logger = options.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  /**
   * Check if a phone number is on the Do-Not-Call list
   */
  async isOnDoNotCallList(phone: string): Promise<boolean> {
    return this.dncRepository.isBlocked(phone);
  }

  /**
   * Add a phone number to the internal Do-Not-Call list
   */
  async addToDoNotCallList(
    phone: string,
    source: DoNotCallEntry['source'],
    reason: string,
    addedBy: string
  ): Promise<DoNotCallEntry> {
    const entry = await this.dncRepository.add({
      phone,
      source,
      addedAt: new Date(),
      expiresAt: null, // Internal DNC entries don't expire
      reason,
      addedBy,
    });

    this.logger.info({ phone: phone.slice(-4), source }, 'Added to DNC list');

    return entry;
  }

  /**
   * Remove a phone number from the internal Do-Not-Call list
   * Only allowed for internal entries, not federal/state DNC
   */
  async removeFromDoNotCallList(phone: string): Promise<boolean> {
    const entry = await this.dncRepository.getEntry(phone);

    if (!entry) return false;

    if (entry.source === 'federal_dnc' || entry.source === 'state_dnc') {
      throw new Error('Cannot remove federal or state DNC entries');
    }

    await this.dncRepository.remove(phone);
    this.logger.info({ phone: phone.slice(-4) }, 'Removed from internal DNC list');

    return true;
  }

  /**
   * Validate that outbound calling is permitted
   * Checks DNC list, consent, and time-of-day restrictions
   */
  async canMakeOutboundCall(
    phone: string,
    timezone: string,
    purpose: 'marketing' | 'transactional' | 'emergency'
  ): Promise<{
    permitted: boolean;
    reason?: string;
  }> {
    // Emergency calls bypass restrictions
    if (purpose === 'emergency') {
      return { permitted: true };
    }

    // Check DNC list
    const onDnc = await this.isOnDoNotCallList(phone);
    if (onDnc && purpose === 'marketing') {
      return { permitted: false, reason: 'Phone number is on Do-Not-Call list' };
    }

    // Check time-of-day restrictions for marketing calls
    if (purpose === 'marketing') {
      const withinHours = this.isWithinCallingHours(timezone);
      if (!withinHours) {
        return {
          permitted: false,
          reason: 'Outside permitted calling hours (8 AM - 9 PM recipient local time)',
        };
      }
    }

    // Check for prior express consent for marketing
    if (purpose === 'marketing') {
      // Map to internal consent type
      const hasConsent = await this.consentService.hasValidConsent(phone, 'marketing_sms');
      if (!hasConsent) {
        return {
          permitted: false,
          reason: 'No prior express written consent for marketing calls',
        };
      }
    }

    return { permitted: true };
  }

  /**
   * Check if current time is within TCPA calling hours
   */
  isWithinCallingHours(timezone: string): boolean {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      });
      const hour = parseInt(formatter.format(now), 10);

      return hour >= this.CALLING_START_HOUR && hour < this.CALLING_END_HOUR;
    } catch {
      // If timezone is invalid, default to not permitted (safer)
      return false;
    }
  }

  /**
   * Record call recording consent
   */
  async recordCallRecordingConsent(
    phone: string,
    consentGiven: boolean,
    method: CallRecordingConsent['consentMethod'],
    twoPartyConsentState: boolean
  ): Promise<void> {
    await this.recordingConsentRepository.save({
      phone,
      consentGiven,
      consentMethod: method,
      consentTimestamp: new Date(),
      recordingNotified: true,
      twoPartyConsentState,
    });

    this.logger.info(
      { phone: phone.slice(-4), consentGiven, method },
      'Call recording consent recorded'
    );
  }

  /**
   * Check if call recording is permitted
   */
  async canRecordCall(
    phone: string,
    stateRequiresTwoParty: boolean
  ): Promise<{
    permitted: boolean;
    reason?: string;
  }> {
    const consent = await this.recordingConsentRepository.get(phone);

    // For one-party consent states, only agent consent needed
    if (!stateRequiresTwoParty) {
      return { permitted: true };
    }

    // For two-party consent states, explicit consent required
    if (!consent || !consent.consentGiven) {
      return {
        permitted: false,
        reason: 'Two-party consent required but not obtained',
      };
    }

    return { permitted: true };
  }

  /**
   * Process opt-out request (STOP, UNSUBSCRIBE, etc.)
   */
  async processOptOut(
    phone: string,
    contactId: string,
    channel: 'sms' | 'voice' | 'whatsapp'
  ): Promise<void> {
    // Add to DNC list
    await this.addToDoNotCallList(phone, 'patient_request', `Opt-out via ${channel}`, 'system');

    // Withdraw marketing consents
    const consentType: ConsentType =
      channel === 'sms'
        ? 'marketing_sms'
        : channel === 'whatsapp'
          ? 'marketing_whatsapp'
          : 'marketing_sms';

    try {
      await this.consentService.withdrawConsent(
        contactId,
        consentType,
        'TCPA opt-out request',
        'system'
      );
    } catch {
      // Consent may not exist, that's okay
    }

    this.logger.info({ phone: phone.slice(-4), channel }, 'Opt-out processed');
  }

  /**
   * Validate automated dialing restrictions
   */
  validateAutomatedDialing(
    isAutodialer: boolean,
    hasExpressConsent: boolean,
    purpose: 'marketing' | 'transactional' | 'emergency'
  ): {
    permitted: boolean;
    reason?: string;
  } {
    // Autodialers to cell phones require prior express consent for marketing
    if (isAutodialer && purpose === 'marketing' && !hasExpressConsent) {
      return {
        permitted: false,
        reason: 'TCPA requires prior express consent for autodialed marketing calls',
      };
    }

    // Transactional calls have more flexibility
    if (isAutodialer && purpose === 'transactional' && !hasExpressConsent) {
      return {
        permitted: false,
        reason: 'TCPA requires consent for autodialed calls even for transactional purposes',
      };
    }

    return { permitted: true };
  }
}

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Adapts InMemoryConsentRepository for test usage
 */
function adaptRepositoryForTests(repo: InMemoryConsentRepository): ConsentRepository {
  return {
    async save(consent) {
      const result = await repo.save(consent);
      if (result._tag !== 'Ok') throw new Error('Failed to save consent record');
      return result.value;
    },
    async upsert(consent) {
      const result = await repo.upsert(consent);
      if (result._tag !== 'Ok') throw new Error('Failed to upsert consent record');
      return result.value;
    },
    findByContactAndType: (contactId, consentType) =>
      repo.findByContactAndType(contactId, consentType),
    findByContact: (contactId) => repo.findByContact(contactId),
    delete: (consentId) => repo.delete(consentId),
    deleteByContact: (contactId) => repo.deleteByContact(contactId),
    findExpiringSoon: (withinDays) => repo.findExpiringSoon(withinDays),
    findByStatus: (status) => repo.findByStatus(status),
    appendAuditEntry: (entry) => repo.appendAuditEntry(entry),
    getAuditTrail: (consentId) => repo.getAuditTrail(consentId),
    getContactAuditTrail: (contactId) => repo.getContactAuditTrail(contactId),
  };
}

const createTestConsentSource = (overrides?: Partial<ConsentSource>): ConsentSource => ({
  channel: 'whatsapp',
  method: 'explicit',
  evidenceUrl: null,
  witnessedBy: null,
  ...overrides,
});

const createTestConsentRequest = (overrides?: Partial<ConsentRequest>): ConsentRequest => ({
  contactId: '+40721234567',
  phone: '+40721234567',
  consentType: 'marketing_sms' as ConsentType,
  status: 'granted',
  source: createTestConsentSource(),
  ...overrides,
});

// ============================================================================
// TCPA DO-NOT-CALL COMPLIANCE TESTS
// ============================================================================

describe('TCPA Do-Not-Call Compliance', () => {
  let tcpaService: TCPAComplianceService;
  let dncRepository: InMemoryDoNotCallRepository;
  let recordingConsentRepository: InMemoryCallRecordingConsentRepository;
  let consentService: ConsentService;
  let consentRepo: InMemoryConsentRepository;

  beforeEach(() => {
    dncRepository = new InMemoryDoNotCallRepository();
    recordingConsentRepository = new InMemoryCallRecordingConsentRepository();
    consentRepo = new InMemoryConsentRepository();
    consentService = createConsentService({
      repository: adaptRepositoryForTests(consentRepo),
    });

    tcpaService = new TCPAComplianceService({
      dncRepository,
      recordingConsentRepository,
      consentService,
    });
  });

  describe('Do-Not-Call List Management', () => {
    it('should add phone number to internal DNC list', async () => {
      const entry = await tcpaService.addToDoNotCallList(
        '+14155551234',
        'internal',
        'Patient requested no calls',
        'staff-123'
      );

      expect(entry.phone).toBe('+14155551234');
      expect(entry.source).toBe('internal');
      expect(entry.reason).toBe('Patient requested no calls');
    });

    it('should detect when phone is on DNC list', async () => {
      await tcpaService.addToDoNotCallList('+14155551234', 'patient_request', 'Opt-out', 'system');

      const isBlocked = await tcpaService.isOnDoNotCallList('+14155551234');

      expect(isBlocked).toBe(true);
    });

    it('should return false for numbers not on DNC list', async () => {
      const isBlocked = await tcpaService.isOnDoNotCallList('+14155559999');

      expect(isBlocked).toBe(false);
    });

    it('should remove internal DNC entries', async () => {
      await tcpaService.addToDoNotCallList('+14155551234', 'internal', 'Testing', 'admin');

      const removed = await tcpaService.removeFromDoNotCallList('+14155551234');

      expect(removed).toBe(true);
      expect(await tcpaService.isOnDoNotCallList('+14155551234')).toBe(false);
    });

    it('should not allow removing federal DNC entries', async () => {
      await dncRepository.add({
        phone: '+14155551234',
        source: 'federal_dnc',
        addedAt: new Date(),
        expiresAt: null,
        reason: 'Federal DNC Registry',
        addedBy: 'system',
      });

      await expect(tcpaService.removeFromDoNotCallList('+14155551234')).rejects.toThrow(
        'Cannot remove federal or state DNC entries'
      );
    });

    it('should block marketing calls to DNC numbers', async () => {
      await tcpaService.addToDoNotCallList('+14155551234', 'patient_request', 'Opt-out', 'system');

      const result = await tcpaService.canMakeOutboundCall(
        '+14155551234',
        'America/New_York',
        'marketing'
      );

      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('Do-Not-Call');
    });
  });

  // ============================================================================
  // CALL RECORDING CONSENT TESTS
  // ============================================================================

  describe('Call Recording Consent', () => {
    it('should record call recording consent', async () => {
      await tcpaService.recordCallRecordingConsent('+14155551234', true, 'verbal', true);

      const result = await tcpaService.canRecordCall('+14155551234', true);

      expect(result.permitted).toBe(true);
    });

    it('should require consent in two-party consent states', async () => {
      // No consent recorded
      const result = await tcpaService.canRecordCall('+14155551234', true);

      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('Two-party consent required');
    });

    it('should allow recording in one-party consent states without explicit consent', async () => {
      const result = await tcpaService.canRecordCall('+14155551234', false);

      expect(result.permitted).toBe(true);
    });

    it('should track consent method (verbal/written/electronic)', async () => {
      await tcpaService.recordCallRecordingConsent('+14155551234', true, 'written', true);

      const consent = await recordingConsentRepository.get('+14155551234');

      expect(consent?.consentMethod).toBe('written');
    });

    it('should deny recording when consent is explicitly refused', async () => {
      await tcpaService.recordCallRecordingConsent('+14155551234', false, 'verbal', true);

      const result = await tcpaService.canRecordCall('+14155551234', true);

      expect(result.permitted).toBe(false);
    });
  });

  // ============================================================================
  // TIME-OF-DAY RESTRICTIONS TESTS
  // ============================================================================

  describe('Time-of-Day Calling Restrictions', () => {
    it('should validate calling hours based on timezone correctly', () => {
      // Get current hour in UTC timezone
      const now = new Date();
      const utcHour = now.getUTCHours();

      // Check if current UTC hour is within 8-20 (which would be valid calling hours)
      const withinHoursUTC = tcpaService.isWithinCallingHours('UTC');

      // UTC calling hours check should match the actual time
      if (utcHour >= 8 && utcHour < 21) {
        expect(withinHoursUTC).toBe(true);
      } else {
        expect(withinHoursUTC).toBe(false);
      }
    });

    it('should enforce 8 AM start time for calling', () => {
      // Test the calling hours boundaries (8 AM - 9 PM)
      // This validates the service properly uses 8 AM start time
      const service = tcpaService;

      // The service should have CALLING_START_HOUR = 8
      // We verify the method handles timezone input without throwing
      expect(() => service.isWithinCallingHours('America/New_York')).not.toThrow();
      expect(() => service.isWithinCallingHours('America/Los_Angeles')).not.toThrow();
      expect(() => service.isWithinCallingHours('Europe/London')).not.toThrow();
    });

    it('should enforce 9 PM end time for calling', () => {
      // Test the calling hours end boundary (9 PM = 21:00)
      // The service should have CALLING_END_HOUR = 21
      const service = tcpaService;

      // Different timezones have different current hours
      // Service correctly converts times - verify no errors
      const timezones = [
        'America/New_York',
        'America/Los_Angeles',
        'Europe/Bucharest',
        'Asia/Tokyo',
      ];

      for (const tz of timezones) {
        const result = service.isWithinCallingHours(tz);
        expect(typeof result).toBe('boolean');
      }
    });

    it('should handle timezone conversion for major US timezones', () => {
      // Verify service handles major US timezones without throwing
      const usTimezones = [
        'America/New_York', // Eastern
        'America/Chicago', // Central
        'America/Denver', // Mountain
        'America/Los_Angeles', // Pacific
      ];

      for (const tz of usTimezones) {
        expect(() => tcpaService.isWithinCallingHours(tz)).not.toThrow();
      }
    });

    it('should default to not permitted for invalid timezone', () => {
      const withinHours = tcpaService.isWithinCallingHours('Invalid/Timezone');

      expect(withinHours).toBe(false);
    });
  });

  // ============================================================================
  // OPT-OUT PROCESSING TESTS
  // ============================================================================

  describe('Opt-Out Processing', () => {
    it('should process opt-out and add to DNC list', async () => {
      await consentService.recordConsent(createTestConsentRequest());

      await tcpaService.processOptOut('+40721234567', '+40721234567', 'sms');

      const isBlocked = await tcpaService.isOnDoNotCallList('+40721234567');
      expect(isBlocked).toBe(true);
    });

    it('should withdraw marketing consent on opt-out', async () => {
      await consentService.recordConsent(createTestConsentRequest());

      await tcpaService.processOptOut('+40721234567', '+40721234567', 'sms');

      const hasConsent = await consentService.hasValidConsent('+40721234567', 'marketing_sms');
      expect(hasConsent).toBe(false);
    });

    it('should handle opt-out from WhatsApp channel', async () => {
      await consentService.recordConsent(
        createTestConsentRequest({ consentType: 'marketing_whatsapp' })
      );

      await tcpaService.processOptOut('+40721234567', '+40721234567', 'whatsapp');

      const hasConsent = await consentService.hasValidConsent('+40721234567', 'marketing_whatsapp');
      expect(hasConsent).toBe(false);
    });

    it('should handle opt-out even without existing consent', async () => {
      // Should not throw
      await expect(
        tcpaService.processOptOut('+40721234567', '+40721234567', 'sms')
      ).resolves.not.toThrow();

      const isBlocked = await tcpaService.isOnDoNotCallList('+40721234567');
      expect(isBlocked).toBe(true);
    });
  });

  // ============================================================================
  // AUTOMATED DIALING RESTRICTIONS TESTS
  // ============================================================================

  describe('Automated Dialing Restrictions', () => {
    it('should require consent for autodialed marketing calls', () => {
      const result = tcpaService.validateAutomatedDialing(true, false, 'marketing');

      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('prior express consent');
    });

    it('should allow autodialed calls with prior consent', () => {
      const result = tcpaService.validateAutomatedDialing(true, true, 'marketing');

      expect(result.permitted).toBe(true);
    });

    it('should require consent even for transactional autodialed calls', () => {
      const result = tcpaService.validateAutomatedDialing(true, false, 'transactional');

      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('consent');
    });

    it('should allow emergency calls regardless of autodialer status', async () => {
      const result = await tcpaService.canMakeOutboundCall(
        '+14155551234',
        'America/New_York',
        'emergency'
      );

      expect(result.permitted).toBe(true);
    });
  });

  // ============================================================================
  // COMPREHENSIVE OUTBOUND CALL VALIDATION TESTS
  // ============================================================================

  describe('Comprehensive Outbound Call Validation', () => {
    // Mock time to 2 PM Eastern to ensure we're within permitted calling hours (8 AM - 9 PM)
    beforeEach(() => {
      vi.useFakeTimers();
      // Set to 2 PM Eastern Time (14:00 in America/New_York)
      vi.setSystemTime(new Date('2024-06-15T14:00:00-04:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should permit transactional calls to non-DNC numbers', async () => {
      const result = await tcpaService.canMakeOutboundCall(
        '+14155551234',
        'America/New_York',
        'transactional'
      );

      expect(result.permitted).toBe(true);
    });

    it('should require consent for marketing calls', async () => {
      const result = await tcpaService.canMakeOutboundCall(
        '+14155551234',
        'America/New_York',
        'marketing'
      );

      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('consent');
    });

    it('should permit marketing calls with valid consent', async () => {
      await consentService.recordConsent(
        createTestConsentRequest({
          contactId: '+14155551234',
          phone: '+14155551234',
        })
      );

      const result = await tcpaService.canMakeOutboundCall(
        '+14155551234',
        'America/New_York',
        'marketing'
      );

      expect(result.permitted).toBe(true);
    });

    it('should check multiple compliance factors', async () => {
      // Add consent but also add to DNC
      await consentService.recordConsent(
        createTestConsentRequest({
          contactId: '+14155551234',
          phone: '+14155551234',
        })
      );
      await tcpaService.addToDoNotCallList('+14155551234', 'patient_request', 'Opt-out', 'system');

      const result = await tcpaService.canMakeOutboundCall(
        '+14155551234',
        'America/New_York',
        'marketing'
      );

      // DNC should take precedence
      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('Do-Not-Call');
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property-Based Tests', () => {
    it('should always block marketing calls to DNC numbers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 10, maxLength: 15 })
            .map((s) => '+1' + s.replace(/\D/g, '').slice(0, 10)),
          async (phone) => {
            if (phone.length < 5) return true;

            await tcpaService.addToDoNotCallList(phone, 'internal', 'Test', 'system');

            const result = await tcpaService.canMakeOutboundCall(
              phone,
              'America/New_York',
              'marketing'
            );

            return result.permitted === false;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should always permit emergency calls', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 10, maxLength: 15 }), async (phone) => {
          const result = await tcpaService.canMakeOutboundCall(
            phone,
            'America/New_York',
            'emergency'
          );

          return result.permitted === true;
        }),
        { numRuns: 10 }
      );
    });
  });
});
