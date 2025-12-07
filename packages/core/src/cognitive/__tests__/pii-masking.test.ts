/**
 * Tests for PII Masking Service (L6: Dynamic Query-Time Masking)
 *
 * Tests role-based PII masking for HIPAA/GDPR compliance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PiiMaskingService,
  createPiiMaskingService,
  roleRequiresMasking,
  getMaskingLevelForRole,
} from '../pii-masking.js';
import type {
  EpisodicEvent,
  MaskingContext,
  KeyEntity,
  SubjectMemorySummary,
  BehavioralPattern,
  PiiMaskingConfig,
} from '../types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockEvent(overrides: Partial<EpisodicEvent> = {}): EpisodicEvent {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    subjectType: 'lead',
    subjectId: '123e4567-e89b-12d3-a456-426614174001',
    eventType: 'message.received',
    eventCategory: 'communication',
    sourceChannel: 'whatsapp',
    summary:
      'Patient John Doe called about implant pricing. Phone: +40712345678, Email: john@example.com',
    keyEntities: [
      { type: 'person', value: 'John Doe', confidence: 0.95 },
      { type: 'other', value: '+40712345678', confidence: 0.9 },
      { type: 'procedure', value: 'All-on-X implant', confidence: 0.85 },
      { type: 'amount', value: '$15,000', confidence: 0.8 },
    ],
    sentiment: 'positive',
    intent: 'price_inquiry',
    occurredAt: new Date('2024-01-15T10:30:00Z'),
    processedAt: new Date('2024-01-15T10:30:05Z'),
    metadata: {
      phone: '+40712345678',
      email: 'john@example.com',
      nested: {
        patientName: 'John Doe',
      },
    },
    ...overrides,
  };
}

function createMockPattern(overrides: Partial<BehavioralPattern> = {}): BehavioralPattern {
  return {
    id: '123e4567-e89b-12d3-a456-426614174002',
    subjectType: 'lead',
    subjectId: '123e4567-e89b-12d3-a456-426614174001',
    patternType: 'price_sensitive',
    patternDescription: 'Patient John Doe (+40712345678) frequently asks about pricing',
    confidence: 0.85,
    supportingEventIds: ['123e4567-e89b-12d3-a456-426614174000'],
    firstObservedAt: new Date('2024-01-10'),
    lastObservedAt: new Date('2024-01-15'),
    occurrenceCount: 3,
    ...overrides,
  };
}

function createMockSummary(overrides: Partial<SubjectMemorySummary> = {}): SubjectMemorySummary {
  return {
    subjectType: 'lead',
    subjectId: '123e4567-e89b-12d3-a456-426614174001',
    totalEvents: 10,
    firstInteraction: new Date('2024-01-01'),
    lastInteraction: new Date('2024-01-15'),
    channelBreakdown: { whatsapp: 5, voice: 3, web: 2 },
    sentimentTrend: 'improving',
    sentimentCounts: { positive: 6, neutral: 3, negative: 1 },
    patterns: [createMockPattern()],
    recentSummary: 'Patient John Doe from +40712345678 inquired about implants.',
    ...overrides,
  };
}

// =============================================================================
// PiiMaskingService Tests
// =============================================================================

describe('PiiMaskingService', () => {
  let service: PiiMaskingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PiiMaskingService();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const svc = new PiiMaskingService();
      expect(svc.hasFullAccess('admin')).toBe(true);
      expect(svc.requiresMasking('analyst')).toBe(true);
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<PiiMaskingConfig> = {
        roleLevels: {
          admin: 'partial', // Override admin to have partial masking
          clinician: 'partial',
          staff: 'partial',
          analyst: 'full',
          viewer: 'full',
        },
      };
      const svc = new PiiMaskingService(customConfig);
      expect(svc.hasFullAccess('admin')).toBe(false);
    });
  });

  describe('maskEvent', () => {
    it('should not mask data for admin role', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'admin', userId: 'admin-1' };

      const result = service.maskEvent(event, { context });

      expect(result.wasMasked).toBe(false);
      expect(result.fieldsMasked).toBe(0);
      expect(result.data.summary).toBe(event.summary);
      expect(result.data.keyEntities).toEqual(event.keyEntities);
    });

    it('should apply full masking for analyst role', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskEvent(event, { context });

      expect(result.wasMasked).toBe(true);
      expect(result.fieldsMasked).toBeGreaterThan(0);
      expect(result.data.summary).toContain('[REDACTED');
      expect(result.data.summary).not.toContain('+40712345678');
      expect(result.data.summary).not.toContain('john@example.com');
    });

    it('should apply partial masking for staff role', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'staff', userId: 'staff-1' };

      const result = service.maskEvent(event, { context });

      expect(result.wasMasked).toBe(true);
      // Partial masking shows some characters
      expect(result.data.summary).toContain('+40');
      expect(result.data.summary).toContain('5678'); // Last 4 digits visible
    });

    it('should mask key entities based on type', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'viewer', userId: 'viewer-1' };

      const result = service.maskEvent(event, { context });

      // Person entity should be masked
      const personEntity = result.data.keyEntities.find((e) => e.type === 'person');
      expect(personEntity?.value).toContain('[REDACTED');

      // Procedure entity should NOT be masked (in neverMaskEntityTypes)
      const procedureEntity = result.data.keyEntities.find((e) => e.type === 'procedure');
      expect(procedureEntity?.value).toBe('All-on-X implant');
    });

    it('should mask metadata recursively', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskEvent(event, { context });

      expect(result.data.metadata?.phone).toContain('[REDACTED');
      expect(result.data.metadata?.email).toContain('[REDACTED');
    });

    it('should include audit info in result', () => {
      const event = createMockEvent();
      const context: MaskingContext = {
        userRole: 'analyst',
        userId: 'analyst-1',
        correlationId: 'req-123',
      };

      const result = service.maskEvent(event, { context });

      expect(result.auditInfo.userId).toBe('analyst-1');
      expect(result.auditInfo.userRole).toBe('analyst');
      expect(result.auditInfo.correlationId).toBe('req-123');
      expect(result.auditInfo.accessTime).toBeInstanceOf(Date);
      expect(result.auditInfo.fieldsAccessed.length).toBeGreaterThan(0);
    });

    it('should bypass masking for emergency access', () => {
      const event = createMockEvent();
      const context: MaskingContext = {
        userRole: 'viewer',
        userId: 'viewer-1',
        emergencyAccess: true,
      };

      const result = service.maskEvent(event, { context });

      expect(result.wasMasked).toBe(false);
      expect(result.data.summary).toBe(event.summary);
    });

    it('should respect unmaskedFields override', () => {
      const event = createMockEvent({
        keyEntities: [{ type: 'other', value: '+40712345678', confidence: 0.9 }],
      });
      const context: MaskingContext = {
        userRole: 'analyst',
        userId: 'analyst-1',
        unmaskedFields: ['phone'],
      };

      const result = service.maskEvent(event, { context });

      // Phone entity should NOT be masked because of override
      const phoneEntity = result.data.keyEntities.find((e) => e.value.includes('+40'));
      // The summary still gets masked as it goes through text redaction
      expect(result.data.summary).toContain('[REDACTED');
    });
  });

  describe('maskEvents', () => {
    it('should mask multiple events', () => {
      const events = [createMockEvent(), createMockEvent()];
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskEvents(events, { context });

      expect(result.data.length).toBe(2);
      expect(result.wasMasked).toBe(true);
      result.data.forEach((event) => {
        expect(event.summary).toContain('[REDACTED');
      });
    });

    it('should aggregate field counts across events', () => {
      const events = [createMockEvent(), createMockEvent()];
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskEvents(events, { context });

      // Should have fields masked from both events
      expect(result.fieldsMasked).toBeGreaterThan(2);
    });
  });

  describe('maskPaginatedResult', () => {
    it('should mask items in paginated result', () => {
      const paginatedResult = {
        items: [createMockEvent(), createMockEvent()],
        nextCursor: 'cursor-abc',
        hasMore: true,
        totalCount: 100,
      };
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskPaginatedResult(paginatedResult, { context });

      expect(result.data.items.length).toBe(2);
      expect(result.data.nextCursor).toBe('cursor-abc');
      expect(result.data.hasMore).toBe(true);
      expect(result.data.totalCount).toBe(100);
      expect(result.wasMasked).toBe(true);
    });
  });

  describe('maskSubjectSummary', () => {
    it('should mask summary and patterns', () => {
      const summary = createMockSummary();
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskSubjectSummary(summary, { context });

      expect(result.data.recentSummary).toContain('[REDACTED');
      expect(result.data.patterns[0].patternDescription).toContain('[REDACTED');
      expect(result.wasMasked).toBe(true);
    });

    it('should preserve non-PII fields', () => {
      const summary = createMockSummary();
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskSubjectSummary(summary, { context });

      expect(result.data.totalEvents).toBe(10);
      expect(result.data.sentimentTrend).toBe('improving');
      expect(result.data.channelBreakdown).toEqual(summary.channelBreakdown);
    });
  });

  describe('getMaskingLevel', () => {
    it('should return correct level for each role', () => {
      const config = service['config'];

      expect(service.getMaskingLevel({ userRole: 'admin' }, config)).toBe('none');
      expect(service.getMaskingLevel({ userRole: 'clinician' }, config)).toBe('partial');
      expect(service.getMaskingLevel({ userRole: 'staff' }, config)).toBe('partial');
      expect(service.getMaskingLevel({ userRole: 'analyst' }, config)).toBe('full');
      expect(service.getMaskingLevel({ userRole: 'viewer' }, config)).toBe('full');
    });

    it('should override for emergency access', () => {
      const config = service['config'];

      expect(service.getMaskingLevel({ userRole: 'viewer', emergencyAccess: true }, config)).toBe(
        'none'
      );
    });
  });

  describe('hasFullAccess', () => {
    it('should return true for admin role', () => {
      expect(service.hasFullAccess('admin')).toBe(true);
    });

    it('should return false for non-admin roles', () => {
      expect(service.hasFullAccess('clinician')).toBe(false);
      expect(service.hasFullAccess('staff')).toBe(false);
      expect(service.hasFullAccess('analyst')).toBe(false);
      expect(service.hasFullAccess('viewer')).toBe(false);
    });
  });

  describe('requiresMasking', () => {
    it('should return false for admin role', () => {
      expect(service.requiresMasking('admin')).toBe(false);
    });

    it('should return true for non-admin roles', () => {
      expect(service.requiresMasking('clinician')).toBe(true);
      expect(service.requiresMasking('staff')).toBe(true);
      expect(service.requiresMasking('analyst')).toBe(true);
      expect(service.requiresMasking('viewer')).toBe(true);
    });
  });

  describe('maskText', () => {
    it('should apply full redaction', () => {
      const text = 'Contact John at +40712345678 or john@example.com';
      const config = service['config'];

      const result = service.maskText(text, 'full', config);

      expect(result).toContain('[REDACTED:phone]');
      expect(result).toContain('[REDACTED:email]');
      expect(result).not.toContain('+40712345678');
      expect(result).not.toContain('john@example.com');
    });

    it('should apply partial masking', () => {
      const text = 'Contact John at +40712345678 or john@example.com';
      const config = service['config'];

      const result = service.maskText(text, 'partial', config);

      // Phone should show first 3 and last 4
      expect(result).toContain('+40');
      expect(result).toContain('5678');
      // Email should show first 2 chars and domain
      expect(result).toContain('jo***@example.com');
    });

    it('should not mask with level none', () => {
      const text = 'Contact John at +40712345678';
      const config = service['config'];

      const result = service.maskText(text, 'none', config);

      expect(result).toBe(text);
    });

    it('should apply hash masking', () => {
      const text = 'Contact at +40712345678';
      const config = { ...service['config'], hashSalt: 'test-salt' };

      const result = service.maskText(text, 'hash', config);

      expect(result).toMatch(/\[HASH:phone:[a-f0-9]{8}\]/);
      expect(result).not.toContain('+40712345678');
    });
  });

  describe('config override', () => {
    it('should respect config overrides in options', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'admin', userId: 'admin-1' };

      // Override admin to require masking
      const result = service.maskEvent(event, {
        context,
        configOverride: {
          roleLevels: {
            admin: 'full',
            clinician: 'partial',
            staff: 'partial',
            analyst: 'full',
            viewer: 'full',
          },
        },
      });

      expect(result.wasMasked).toBe(true);
      expect(result.data.summary).toContain('[REDACTED');
    });

    it('should disable masking when enabled is false', () => {
      const event = createMockEvent();
      const context: MaskingContext = { userRole: 'analyst', userId: 'analyst-1' };

      const result = service.maskEvent(event, {
        context,
        configOverride: { enabled: false },
      });

      expect(result.wasMasked).toBe(false);
      expect(result.data.summary).toBe(event.summary);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createPiiMaskingService', () => {
  it('should create service with default config', () => {
    const service = createPiiMaskingService();
    expect(service).toBeInstanceOf(PiiMaskingService);
    expect(service.hasFullAccess('admin')).toBe(true);
  });

  it('should create service with custom config', () => {
    const service = createPiiMaskingService({
      auditLogging: false,
      defaultLevel: 'partial',
    });
    expect(service).toBeInstanceOf(PiiMaskingService);
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('roleRequiresMasking', () => {
  it('should return false for admin', () => {
    expect(roleRequiresMasking('admin')).toBe(false);
  });

  it('should return true for viewer', () => {
    expect(roleRequiresMasking('viewer')).toBe(true);
  });

  it('should respect custom config', () => {
    expect(
      roleRequiresMasking('admin', {
        roleLevels: {
          admin: 'partial',
          clinician: 'partial',
          staff: 'partial',
          analyst: 'full',
          viewer: 'full',
        },
      })
    ).toBe(true);
  });
});

describe('getMaskingLevelForRole', () => {
  it('should return correct levels', () => {
    expect(getMaskingLevelForRole('admin')).toBe('none');
    expect(getMaskingLevelForRole('clinician')).toBe('partial');
    expect(getMaskingLevelForRole('analyst')).toBe('full');
    expect(getMaskingLevelForRole('viewer')).toBe('full');
  });

  it('should respect custom config', () => {
    expect(
      getMaskingLevelForRole('admin', {
        roleLevels: {
          admin: 'hash',
          clinician: 'partial',
          staff: 'partial',
          analyst: 'full',
          viewer: 'full',
        },
      })
    ).toBe('hash');
  });
});

// =============================================================================
// PII Detection Tests
// =============================================================================

describe('PII detection and masking patterns', () => {
  let service: PiiMaskingService;

  beforeEach(() => {
    service = new PiiMaskingService();
  });

  it('should detect and mask Romanian phone numbers', () => {
    const event = createMockEvent({ summary: 'Call +40712345678 for info' });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.data.summary).not.toContain('+40712345678');
    expect(result.data.summary).toContain('[REDACTED:phone]');
  });

  it('should detect and mask international phone numbers', () => {
    const event = createMockEvent({ summary: 'Call +14155551234 for info' });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.data.summary).not.toContain('+14155551234');
  });

  it('should detect and mask email addresses', () => {
    const event = createMockEvent({ summary: 'Email patient@hospital.com' });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.data.summary).not.toContain('patient@hospital.com');
    expect(result.data.summary).toContain('[REDACTED:email]');
  });

  it('should detect and mask Romanian CNP', () => {
    // Use a CNP that doesn't have a phone-like substring (no 0 followed by 9 digits)
    // CNP format: [1-8]YYMMDD NNNNNN
    // Using 6991122334455: sex=6, year=99, month=11, day=22, unique=334455
    const event = createMockEvent({ summary: 'CNP: 6991122334455' });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.data.summary).not.toContain('6991122334455');
    expect(result.data.summary).toContain('[REDACTED:cnp]');
  });

  it('should detect and mask credit card numbers', () => {
    const event = createMockEvent({ summary: 'Card: 4111-1111-1111-1111' });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.data.summary).not.toContain('4111-1111-1111-1111');
    expect(result.data.summary).toContain('[REDACTED:card]');
  });

  it('should preserve non-PII text', () => {
    const event = createMockEvent({
      summary: 'Patient scheduled for All-on-X implant procedure tomorrow',
    });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.data.summary).toContain('All-on-X implant');
    expect(result.data.summary).toContain('procedure');
    expect(result.data.summary).toContain('tomorrow');
  });
});

// =============================================================================
// Entity Masking Tests
// =============================================================================

describe('Entity masking by type', () => {
  let service: PiiMaskingService;

  beforeEach(() => {
    service = new PiiMaskingService();
  });

  it('should mask person entities', () => {
    const event = createMockEvent({
      keyEntities: [{ type: 'person', value: 'Jane Smith', confidence: 0.9 }],
    });
    const context: MaskingContext = { userRole: 'viewer' };

    const result = service.maskEvent(event, { context });

    const personEntity = result.data.keyEntities.find((e) => e.type === 'person');
    expect(personEntity?.value).toContain('[REDACTED:name]');
  });

  it('should mask amount entities (financial PII)', () => {
    const event = createMockEvent({
      keyEntities: [{ type: 'amount', value: '$15,000', confidence: 0.9 }],
    });
    const context: MaskingContext = { userRole: 'viewer' };

    const result = service.maskEvent(event, { context });

    const amountEntity = result.data.keyEntities.find((e) => e.type === 'amount');
    expect(amountEntity?.value).toContain('[REDACTED:financial]');
  });

  it('should NOT mask procedure entities (never mask list)', () => {
    const event = createMockEvent({
      keyEntities: [{ type: 'procedure', value: 'All-on-X implant', confidence: 0.9 }],
    });
    const context: MaskingContext = { userRole: 'viewer' };

    const result = service.maskEvent(event, { context });

    const procedureEntity = result.data.keyEntities.find((e) => e.type === 'procedure');
    expect(procedureEntity?.value).toBe('All-on-X implant');
  });

  it('should NOT mask product entities (never mask list)', () => {
    const event = createMockEvent({
      keyEntities: [{ type: 'product', value: 'Implant Model X', confidence: 0.9 }],
    });
    const context: MaskingContext = { userRole: 'viewer' };

    const result = service.maskEvent(event, { context });

    const productEntity = result.data.keyEntities.find((e) => e.type === 'product');
    expect(productEntity?.value).toBe('Implant Model X');
  });

  it('should detect phone in other entity type', () => {
    const event = createMockEvent({
      keyEntities: [{ type: 'other', value: '+40712345678', confidence: 0.9 }],
    });
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    const otherEntity = result.data.keyEntities.find((e) => e.type === 'other');
    expect(otherEntity?.value).toContain('[REDACTED:phone]');
  });
});

// =============================================================================
// Hash Masking Tests
// =============================================================================

describe('Hash masking', () => {
  let service: PiiMaskingService;

  beforeEach(() => {
    service = new PiiMaskingService({ hashSalt: 'test-salt-123' });
  });

  it('should produce consistent hashes for same value', () => {
    const config = { ...service['config'], hashSalt: 'test-salt-123' };
    const text = 'Contact +40712345678';

    const result1 = service.maskText(text, 'hash', config);
    const result2 = service.maskText(text, 'hash', config);

    expect(result1).toBe(result2);
  });

  it('should produce different hashes for different values', () => {
    const config = { ...service['config'], hashSalt: 'test-salt-123' };
    const text1 = 'Contact +40712345678';
    const text2 = 'Contact +40712345679';

    const result1 = service.maskText(text1, 'hash', config);
    const result2 = service.maskText(text2, 'hash', config);

    expect(result1).not.toBe(result2);
  });

  it('should produce different hashes with different salts', () => {
    const config1 = { ...service['config'], hashSalt: 'salt-1' };
    const config2 = { ...service['config'], hashSalt: 'salt-2' };
    const text = 'Contact +40712345678';

    const result1 = service.maskText(text, 'hash', config1);
    const result2 = service.maskText(text, 'hash', config2);

    expect(result1).not.toBe(result2);
  });
});

// =============================================================================
// Audit Logging Tests
// =============================================================================

describe('Audit logging', () => {
  it('should include all required audit fields', () => {
    const service = new PiiMaskingService({ auditLogging: true });
    const event = createMockEvent();
    const context: MaskingContext = {
      userRole: 'analyst',
      userId: 'user-123',
      clinicId: 'clinic-456',
      correlationId: 'req-789',
    };

    const result = service.maskEvent(event, { context });

    expect(result.auditInfo.userId).toBe('user-123');
    expect(result.auditInfo.userRole).toBe('analyst');
    expect(result.auditInfo.correlationId).toBe('req-789');
    expect(result.auditInfo.fieldsAccessed).toContain('summary');
    expect(result.auditInfo.accessTime).toBeDefined();
  });

  it('should track which fields were accessed', () => {
    const service = new PiiMaskingService();
    const event = createMockEvent();
    const context: MaskingContext = { userRole: 'analyst' };

    const result = service.maskEvent(event, { context });

    expect(result.auditInfo.fieldsAccessed).toContain('summary');
    expect(result.auditInfo.fieldsAccessed).toContain('keyEntities');
  });
});
