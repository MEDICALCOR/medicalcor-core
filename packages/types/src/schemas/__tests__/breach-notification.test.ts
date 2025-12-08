/**
 * @fileoverview Tests for GDPR Breach Notification Schemas
 *
 * Tests for breach notification types, schemas, and helper functions.
 * Critical for GDPR compliance - validates correct breach assessment and notification logic.
 *
 * Covers:
 * - Schema validation (severity, data categories, status)
 * - Breach payload validation
 * - Severity assessment algorithm
 * - Authority notification requirements
 * - Subject notification requirements
 * - Deadline calculation
 */

import { describe, it, expect } from 'vitest';
import {
  // Schemas
  BreachSeveritySchema,
  BreachDataCategorySchema,
  BreachNatureSchema,
  BreachStatusSchema,
  BreachNotificationChannelSchema,
  DataBreachSchema,
  ReportBreachPayloadSchema,
  BreachNotificationWorkflowPayloadSchema,
  // Helper functions
  calculateHoursUntilDeadline,
  requiresAuthorityNotification,
  requiresSubjectNotification,
  assessBreachSeverity,
  // Types
  type BreachSeverity,
  type BreachDataCategory,
  type BreachNature,
} from '../breach-notification.js';

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe('BreachSeveritySchema', () => {
  it('should accept valid severity levels', () => {
    expect(BreachSeveritySchema.parse('low')).toBe('low');
    expect(BreachSeveritySchema.parse('medium')).toBe('medium');
    expect(BreachSeveritySchema.parse('high')).toBe('high');
    expect(BreachSeveritySchema.parse('critical')).toBe('critical');
  });

  it('should reject invalid severity levels', () => {
    expect(() => BreachSeveritySchema.parse('unknown')).toThrow();
    expect(() => BreachSeveritySchema.parse('')).toThrow();
    expect(() => BreachSeveritySchema.parse(null)).toThrow();
  });
});

describe('BreachDataCategorySchema', () => {
  it('should accept valid data categories', () => {
    expect(BreachDataCategorySchema.parse('personal_data')).toBe('personal_data');
    expect(BreachDataCategorySchema.parse('health_data')).toBe('health_data');
    expect(BreachDataCategorySchema.parse('financial_data')).toBe('financial_data');
    expect(BreachDataCategorySchema.parse('biometric_data')).toBe('biometric_data');
    expect(BreachDataCategorySchema.parse('genetic_data')).toBe('genetic_data');
    expect(BreachDataCategorySchema.parse('location_data')).toBe('location_data');
    expect(BreachDataCategorySchema.parse('identification_data')).toBe('identification_data');
  });

  it('should reject invalid data categories', () => {
    expect(() => BreachDataCategorySchema.parse('other')).toThrow();
    expect(() => BreachDataCategorySchema.parse('medical')).toThrow();
  });
});

describe('BreachNatureSchema', () => {
  it('should accept valid breach natures', () => {
    expect(BreachNatureSchema.parse('confidentiality')).toBe('confidentiality');
    expect(BreachNatureSchema.parse('integrity')).toBe('integrity');
    expect(BreachNatureSchema.parse('availability')).toBe('availability');
  });

  it('should reject invalid breach natures', () => {
    expect(() => BreachNatureSchema.parse('security')).toThrow();
    expect(() => BreachNatureSchema.parse('unauthorized')).toThrow();
  });
});

describe('BreachStatusSchema', () => {
  it('should accept all valid statuses', () => {
    const statuses = [
      'detected',
      'investigating',
      'assessed',
      'notifying_authority',
      'notifying_subjects',
      'mitigating',
      'resolved',
      'closed',
    ];

    for (const status of statuses) {
      expect(BreachStatusSchema.parse(status)).toBe(status);
    }
  });
});

describe('BreachNotificationChannelSchema', () => {
  it('should accept all valid channels', () => {
    const channels = ['email', 'whatsapp', 'sms', 'letter', 'phone', 'in_app'];

    for (const channel of channels) {
      expect(BreachNotificationChannelSchema.parse(channel)).toBe(channel);
    }
  });
});

// ============================================================================
// PAYLOAD VALIDATION TESTS
// ============================================================================

describe('ReportBreachPayloadSchema', () => {
  const validPayload = {
    correlationId: 'corr-123',
    clinicId: 'clinic-456',
    reportedBy: 'admin@clinic.com',
    detectionMethod: 'Security monitoring alert',
    description: 'Unauthorized access to patient records detected',
    nature: ['confidentiality'],
    dataCategories: ['health_data', 'personal_data'],
    estimatedAffectedCount: 150,
  };

  it('should accept valid report breach payload', () => {
    const result = ReportBreachPayloadSchema.parse(validPayload);

    expect(result.correlationId).toBe('corr-123');
    expect(result.clinicId).toBe('clinic-456');
    expect(result.nature).toEqual(['confidentiality']);
    expect(result.dataCategories).toEqual(['health_data', 'personal_data']);
    expect(result.estimatedAffectedCount).toBe(150);
  });

  it('should accept payload with optional fields', () => {
    const payloadWithOptionals = {
      ...validPayload,
      detectedAt: '2024-01-15T10:30:00Z',
      affectedContactIds: ['contact-1', 'contact-2'],
    };

    const result = ReportBreachPayloadSchema.parse(payloadWithOptionals);

    expect(result.detectedAt).toBe('2024-01-15T10:30:00Z');
    expect(result.affectedContactIds).toEqual(['contact-1', 'contact-2']);
  });

  it('should require at least one nature', () => {
    const invalidPayload = { ...validPayload, nature: [] };

    expect(() => ReportBreachPayloadSchema.parse(invalidPayload)).toThrow();
  });

  it('should require at least one data category', () => {
    const invalidPayload = { ...validPayload, dataCategories: [] };

    expect(() => ReportBreachPayloadSchema.parse(invalidPayload)).toThrow();
  });

  it('should reject negative affected count', () => {
    const invalidPayload = { ...validPayload, estimatedAffectedCount: -5 };

    expect(() => ReportBreachPayloadSchema.parse(invalidPayload)).toThrow();
  });
});

describe('BreachNotificationWorkflowPayloadSchema', () => {
  it('should accept valid workflow payload', () => {
    const payload = {
      breachId: 'brch_123456_abcd',
      correlationId: 'corr-789',
    };

    const result = BreachNotificationWorkflowPayloadSchema.parse(payload);

    expect(result.breachId).toBe('brch_123456_abcd');
    expect(result.correlationId).toBe('corr-789');
  });

  it('should require both fields', () => {
    expect(() => BreachNotificationWorkflowPayloadSchema.parse({ breachId: 'x' })).toThrow();
    expect(() => BreachNotificationWorkflowPayloadSchema.parse({ correlationId: 'y' })).toThrow();
    expect(() => BreachNotificationWorkflowPayloadSchema.parse({})).toThrow();
  });
});

// ============================================================================
// SEVERITY ASSESSMENT TESTS
// ============================================================================

describe('assessBreachSeverity', () => {
  it('should return critical for health data confidentiality breach with large impact', () => {
    const severity = assessBreachSeverity(['health_data'], ['confidentiality'], 500);

    expect(severity).toBe('critical');
  });

  it('should return high for health data confidentiality breach with small impact', () => {
    const severity = assessBreachSeverity(['health_data'], ['confidentiality'], 50);

    expect(severity).toBe('high');
  });

  it('should return high for genetic data breach regardless of nature', () => {
    const severity = assessBreachSeverity(['genetic_data'], ['availability'], 10);

    expect(severity).toBe('high');
  });

  it('should return high for biometric data breach', () => {
    const severity = assessBreachSeverity(['biometric_data'], ['integrity'], 20);

    expect(severity).toBe('high');
  });

  it('should return medium for financial data confidentiality breach', () => {
    const severity = assessBreachSeverity(['financial_data'], ['confidentiality'], 100);

    expect(severity).toBe('medium');
  });

  it('should return high for financial data breach with large scale', () => {
    const severity = assessBreachSeverity(['financial_data'], ['confidentiality'], 1000);

    expect(severity).toBe('high');
  });

  it('should return high for very large scale personal data breach', () => {
    const severity = assessBreachSeverity(['personal_data'], ['confidentiality'], 2000);

    expect(severity).toBe('high');
  });

  it('should return medium for moderate scale personal data breach', () => {
    const severity = assessBreachSeverity(['personal_data'], ['availability'], 500);

    expect(severity).toBe('medium');
  });

  it('should return low for small scale location data breach', () => {
    const severity = assessBreachSeverity(['location_data'], ['availability'], 25);

    expect(severity).toBe('low');
  });

  it('should escalate severity for combined special categories', () => {
    const severity = assessBreachSeverity(['health_data', 'genetic_data'], ['confidentiality'], 50);

    expect(severity).toBe('high');
  });
});

// ============================================================================
// NOTIFICATION REQUIREMENT TESTS
// ============================================================================

describe('requiresAuthorityNotification', () => {
  it('should require notification for critical severity', () => {
    expect(requiresAuthorityNotification('critical', false)).toBe(true);
    expect(requiresAuthorityNotification('critical', true)).toBe(true);
  });

  it('should require notification for high severity', () => {
    expect(requiresAuthorityNotification('high', false)).toBe(true);
    expect(requiresAuthorityNotification('high', true)).toBe(true);
  });

  it('should require notification when high risk to subjects', () => {
    expect(requiresAuthorityNotification('medium', true)).toBe(true);
    expect(requiresAuthorityNotification('low', true)).toBe(true);
  });

  it('should not require notification for low severity without high risk', () => {
    expect(requiresAuthorityNotification('low', false)).toBe(false);
  });

  it('should not require notification for medium severity without high risk', () => {
    expect(requiresAuthorityNotification('medium', false)).toBe(false);
  });
});

describe('requiresSubjectNotification', () => {
  it('should require notification for critical severity', () => {
    expect(requiresSubjectNotification('critical', false)).toBe(true);
    expect(requiresSubjectNotification('critical', true)).toBe(true);
  });

  it('should require notification when high risk to subjects', () => {
    expect(requiresSubjectNotification('high', true)).toBe(true);
    expect(requiresSubjectNotification('medium', true)).toBe(true);
    expect(requiresSubjectNotification('low', true)).toBe(true);
  });

  it('should not require notification for non-critical severity without high risk', () => {
    expect(requiresSubjectNotification('high', false)).toBe(false);
    expect(requiresSubjectNotification('medium', false)).toBe(false);
    expect(requiresSubjectNotification('low', false)).toBe(false);
  });
});

// ============================================================================
// DEADLINE CALCULATION TESTS
// ============================================================================

describe('calculateHoursUntilDeadline', () => {
  it('should return approximately 72 hours for just-detected breach', () => {
    const now = new Date();
    const hours = calculateHoursUntilDeadline(now.toISOString());

    // Allow for small timing differences
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);
  });

  it('should return reduced hours for older breach', () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hours = calculateHoursUntilDeadline(twentyFourHoursAgo.toISOString());

    expect(hours).toBeGreaterThan(47);
    expect(hours).toBeLessThanOrEqual(48);
  });

  it('should return 0 for breach past deadline', () => {
    const eightyHoursAgo = new Date(Date.now() - 80 * 60 * 60 * 1000);
    const hours = calculateHoursUntilDeadline(eightyHoursAgo.toISOString());

    expect(hours).toBe(0);
  });

  it('should return exactly 72 - elapsed hours', () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const hours = calculateHoursUntilDeadline(tenHoursAgo.toISOString());

    // Should be approximately 62 hours remaining
    expect(hours).toBeGreaterThan(61.9);
    expect(hours).toBeLessThanOrEqual(62.1);
  });
});

// ============================================================================
// DATA BREACH RECORD SCHEMA TESTS
// ============================================================================

describe('DataBreachSchema', () => {
  const validBreach = {
    id: 'brch_1234_abcd',
    correlationId: 'corr-123',
    clinicId: 'clinic-456',
    detectedAt: '2024-01-15T10:00:00Z',
    detectedBy: 'admin@clinic.com',
    detectionMethod: 'Automated monitoring',
    nature: ['confidentiality'],
    dataCategories: ['health_data'],
    severity: 'high',
    status: 'detected',
    description: 'Unauthorized access detected',
    affectedCount: 100,
    potentialConsequences: ['Disclosure of medical information'],
    highRiskToSubjects: true,
    dpoNotified: false,
    authorityNotificationRequired: true,
    subjectNotificationRequired: true,
    subjectsNotifiedCount: 0,
    measuresTaken: [],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    updatedBy: 'system',
  };

  it('should accept valid breach record', () => {
    const result = DataBreachSchema.parse(validBreach);

    expect(result.id).toBe('brch_1234_abcd');
    expect(result.severity).toBe('high');
    expect(result.status).toBe('detected');
    expect(result.highRiskToSubjects).toBe(true);
  });

  it('should accept breach with affected subjects', () => {
    const breachWithSubjects = {
      ...validBreach,
      affectedSubjects: [
        {
          contactId: 'contact-1',
          dataCategories: ['health_data'],
          notified: false,
        },
        {
          contactId: 'contact-2',
          phone: '+40123456789',
          email: 'patient@example.com',
          name: 'John Doe',
          dataCategories: ['health_data', 'financial_data'],
          notified: true,
          notifiedAt: '2024-01-15T12:00:00Z',
          notificationChannel: 'email',
        },
      ],
    };

    const result = DataBreachSchema.parse(breachWithSubjects);

    expect(result.affectedSubjects).toHaveLength(2);
    expect(result.affectedSubjects![1]!.notified).toBe(true);
    expect(result.affectedSubjects![1]!.notificationChannel).toBe('email');
  });

  it('should accept breach with authority notification', () => {
    const breachWithAuthority = {
      ...validBreach,
      authorityNotification: {
        authority: 'ANSPDCP',
        notifiedAt: '2024-01-16T08:00:00Z',
        referenceNumber: 'BRCH-2024-001',
        contactPerson: 'DPO Name',
        notes: 'Initial notification submitted',
      },
    };

    const result = DataBreachSchema.parse(breachWithAuthority);

    expect(result.authorityNotification?.authority).toBe('ANSPDCP');
    expect(result.authorityNotification?.referenceNumber).toBe('BRCH-2024-001');
  });

  it('should accept breach with measures taken', () => {
    const breachWithMeasures = {
      ...validBreach,
      measuresTaken: [
        {
          description: 'Revoked access credentials',
          implementedAt: '2024-01-15T10:30:00Z',
          implementedBy: 'security@clinic.com',
          type: 'remediation',
        },
        {
          description: 'Enhanced monitoring enabled',
          implementedAt: '2024-01-15T11:00:00Z',
          implementedBy: 'it@clinic.com',
          type: 'preventive',
        },
      ],
    };

    const result = DataBreachSchema.parse(breachWithMeasures);

    expect(result.measuresTaken).toHaveLength(2);
    expect(result.measuresTaken![0]!.type).toBe('remediation');
    expect(result.measuresTaken![1]!.type).toBe('preventive');
  });
});
