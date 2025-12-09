/**
 * Data Classification Schema Tests
 * Comprehensive tests for HIPAA/GDPR data classification schemas and helpers
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DataSensitivityLevelSchema,
  ComplianceFrameworkSchema,
  DataCategorySchema,
  EncryptionRequirementSchema,
  RetentionCategorySchema,
  ColumnClassificationSchema,
  TableClassificationSchema,
  CreateTableClassificationSchema,
  UpdateTableClassificationSchema,
  ClassificationQueryFiltersSchema,
  ClassificationSummarySchema,
  ComplianceGapSchema,
  ClassificationComplianceReportSchema,
  DataClassificationRecordSchema,
  DEFAULT_PII_COLUMN_PATTERNS,
  DEFAULT_PHI_COLUMN_PATTERNS,
  SENSITIVITY_PRECEDENCE,
  getHighestSensitivity,
  isPiiColumnName,
  isPhiColumnName,
  getRequiredFrameworks,
} from '../data-classification.js';

describe('Data Classification Schemas', () => {
  describe('DataSensitivityLevelSchema', () => {
    it('should accept all valid sensitivity levels', () => {
      const validLevels = [
        'public',
        'internal',
        'confidential',
        'restricted_pii',
        'phi',
        'financial',
      ];
      validLevels.forEach((level) => {
        expect(DataSensitivityLevelSchema.safeParse(level).success).toBe(true);
      });
    });

    it('should reject invalid sensitivity levels', () => {
      expect(DataSensitivityLevelSchema.safeParse('secret').success).toBe(false);
      expect(DataSensitivityLevelSchema.safeParse('').success).toBe(false);
      expect(DataSensitivityLevelSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('ComplianceFrameworkSchema', () => {
    it('should accept all valid frameworks', () => {
      const frameworks = ['HIPAA', 'GDPR', 'CCPA', 'PCI_DSS', 'SOC2', 'ISO27001'];
      frameworks.forEach((framework) => {
        expect(ComplianceFrameworkSchema.safeParse(framework).success).toBe(true);
      });
    });

    it('should reject invalid frameworks', () => {
      expect(ComplianceFrameworkSchema.safeParse('FERPA').success).toBe(false);
      expect(ComplianceFrameworkSchema.safeParse('hipaa').success).toBe(false); // Case-sensitive
    });
  });

  describe('DataCategorySchema', () => {
    it('should accept all valid data categories', () => {
      const categories = [
        'personal',
        'contact',
        'demographic',
        'health',
        'financial',
        'behavioral',
        'authentication',
        'communication',
        'consent',
        'audit',
        'technical',
        'ai_generated',
      ];
      categories.forEach((category) => {
        expect(DataCategorySchema.safeParse(category).success).toBe(true);
      });
    });
  });

  describe('EncryptionRequirementSchema', () => {
    it('should accept all encryption levels', () => {
      const levels = ['none', 'recommended', 'required', 'field_level'];
      levels.forEach((level) => {
        expect(EncryptionRequirementSchema.safeParse(level).success).toBe(true);
      });
    });
  });

  describe('RetentionCategorySchema', () => {
    it('should accept all retention categories', () => {
      const categories = [
        'medical_records',
        'consent_records',
        'audit_logs',
        'marketing_leads',
        'communication_logs',
        'appointment_data',
        'financial_records',
        'session_data',
        'temporary',
      ];
      categories.forEach((category) => {
        expect(RetentionCategorySchema.safeParse(category).success).toBe(true);
      });
    });
  });

  describe('ColumnClassificationSchema', () => {
    it('should accept valid column classification', () => {
      const column = {
        columnName: 'email',
        sensitivityLevel: 'restricted_pii',
        isPii: true,
        isPhi: false,
        dataCategory: 'contact',
        isEncrypted: true,
        redactInLogs: true,
        description: 'Patient email address',
      };
      expect(ColumnClassificationSchema.safeParse(column).success).toBe(true);
    });

    it('should apply defaults', () => {
      const minColumn = {
        columnName: 'created_at',
        sensitivityLevel: 'internal',
        dataCategory: 'technical',
      };
      const result = ColumnClassificationSchema.parse(minColumn);
      expect(result.isPii).toBe(false);
      expect(result.isPhi).toBe(false);
      expect(result.isEncrypted).toBe(false);
      expect(result.redactInLogs).toBe(false);
    });

    it('should reject empty column name', () => {
      const invalid = {
        columnName: '',
        sensitivityLevel: 'internal',
        dataCategory: 'technical',
      };
      expect(ColumnClassificationSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept PII patterns array', () => {
      const column = {
        columnName: 'phone_number',
        sensitivityLevel: 'restricted_pii',
        isPii: true,
        dataCategory: 'contact',
        piiPatterns: ['^\\+40[0-9]{9}$', '^07[0-9]{8}$'],
      };
      expect(ColumnClassificationSchema.safeParse(column).success).toBe(true);
    });
  });

  describe('TableClassificationSchema', () => {
    it('should accept valid table classification', () => {
      const table = {
        tableName: 'patients',
        schemaName: 'public',
        sensitivityLevel: 'phi',
        containsPii: true,
        containsPhi: true,
        containsFinancial: false,
        complianceFrameworks: ['HIPAA', 'GDPR'],
        encryptionRequirement: 'field_level',
        retentionCategory: 'medical_records',
        rlsEnabled: true,
        softDeleteEnabled: true,
        columns: [
          {
            columnName: 'full_name',
            sensitivityLevel: 'restricted_pii',
            isPii: true,
            dataCategory: 'personal',
          },
        ],
        description: 'Patient records table',
      };
      expect(TableClassificationSchema.safeParse(table).success).toBe(true);
    });

    it('should apply defaults for optional fields', () => {
      const minTable = {
        tableName: 'logs',
        sensitivityLevel: 'internal',
        retentionCategory: 'audit_logs',
      };
      const result = TableClassificationSchema.parse(minTable);
      expect(result.schemaName).toBe('public');
      expect(result.containsPii).toBe(false);
      expect(result.containsPhi).toBe(false);
      expect(result.containsFinancial).toBe(false);
      expect(result.complianceFrameworks).toEqual([]);
      expect(result.encryptionRequirement).toBe('none');
      expect(result.rlsEnabled).toBe(false);
      expect(result.softDeleteEnabled).toBe(false);
      expect(result.columns).toEqual([]);
    });

    it('should accept review metadata', () => {
      const table = {
        tableName: 'billing',
        sensitivityLevel: 'financial',
        retentionCategory: 'financial_records',
        lastReviewedAt: new Date(),
        reviewedBy: 'security-team@medicalcor.com',
      };
      expect(TableClassificationSchema.safeParse(table).success).toBe(true);
    });
  });

  describe('CreateTableClassificationSchema', () => {
    it('should omit review fields', () => {
      const create = {
        tableName: 'new_table',
        sensitivityLevel: 'internal',
        retentionCategory: 'temporary',
      };
      expect(CreateTableClassificationSchema.safeParse(create).success).toBe(true);
    });
  });

  describe('UpdateTableClassificationSchema', () => {
    it('should require only tableName', () => {
      const update = {
        tableName: 'existing_table',
      };
      expect(UpdateTableClassificationSchema.safeParse(update).success).toBe(true);
    });

    it('should accept partial updates', () => {
      const update = {
        tableName: 'existing_table',
        sensitivityLevel: 'phi',
        containsPhi: true,
      };
      expect(UpdateTableClassificationSchema.safeParse(update).success).toBe(true);
    });
  });

  describe('ClassificationQueryFiltersSchema', () => {
    it('should accept empty filters', () => {
      expect(ClassificationQueryFiltersSchema.safeParse({}).success).toBe(true);
    });

    it('should accept all filter combinations', () => {
      const filters = {
        sensitivityLevel: 'phi',
        containsPii: true,
        containsPhi: true,
        complianceFramework: 'HIPAA',
        retentionCategory: 'medical_records',
        rlsEnabled: true,
        tableNameSearch: 'patient',
      };
      expect(ClassificationQueryFiltersSchema.safeParse(filters).success).toBe(true);
    });
  });

  describe('ClassificationSummarySchema', () => {
    it('should accept valid summary', () => {
      const summary = {
        totalTables: 50,
        tablesWithPii: 25,
        tablesWithPhi: 15,
        tablesWithFinancial: 10,
        tablesWithRls: 40,
        tablesWithEncryption: 20,
        bySensitivityLevel: {
          public: 5,
          internal: 15,
          confidential: 10,
          restricted_pii: 10,
          phi: 5,
          financial: 5,
        },
        byComplianceFramework: {
          HIPAA: 15,
          GDPR: 25,
          PCI_DSS: 10,
          SOC2: 50,
          CCPA: 20,
          ISO27001: 30,
        },
        byRetentionCategory: {
          medical_records: 10,
          consent_records: 5,
          audit_logs: 10,
          marketing_leads: 5,
          communication_logs: 5,
          appointment_data: 5,
          financial_records: 5,
          session_data: 3,
          temporary: 2,
        },
        lastUpdatedAt: new Date(),
      };
      expect(ClassificationSummarySchema.safeParse(summary).success).toBe(true);
    });
  });

  describe('ComplianceGapSchema', () => {
    it('should accept valid compliance gap', () => {
      const gap = {
        tableName: 'patients',
        gapType: 'missing_encryption',
        severity: 'critical',
        description: 'PHI data is not encrypted at rest',
        remediation: 'Enable field-level encryption for PHI columns',
        affectedFrameworks: ['HIPAA', 'GDPR'],
      };
      expect(ComplianceGapSchema.safeParse(gap).success).toBe(true);
    });

    it('should accept all gap types', () => {
      const gapTypes = [
        'missing_encryption',
        'missing_rls',
        'missing_soft_delete',
        'unclassified_pii',
        'missing_retention_policy',
        'stale_review',
        'missing_column_classification',
      ];
      gapTypes.forEach((gapType) => {
        const gap = {
          tableName: 'test',
          gapType,
          severity: 'medium',
          description: 'Test gap',
          remediation: 'Fix it',
          affectedFrameworks: [],
        };
        expect(ComplianceGapSchema.safeParse(gap).success).toBe(true);
      });
    });

    it('should accept all severity levels', () => {
      const severities = ['low', 'medium', 'high', 'critical'];
      severities.forEach((severity) => {
        const gap = {
          tableName: 'test',
          gapType: 'missing_rls',
          severity,
          description: 'Test',
          remediation: 'Fix',
          affectedFrameworks: [],
        };
        expect(ComplianceGapSchema.safeParse(gap).success).toBe(true);
      });
    });
  });

  describe('ClassificationComplianceReportSchema', () => {
    it('should accept valid compliance report', () => {
      const report = {
        generatedAt: new Date(),
        summary: {
          totalTables: 50,
          tablesWithPii: 25,
          tablesWithPhi: 15,
          tablesWithFinancial: 10,
          tablesWithRls: 40,
          tablesWithEncryption: 20,
          bySensitivityLevel: { public: 5, internal: 45 },
          byComplianceFramework: { HIPAA: 15, GDPR: 25 },
          byRetentionCategory: { medical_records: 10, audit_logs: 40 },
          lastUpdatedAt: new Date(),
        },
        gaps: [
          {
            tableName: 'old_data',
            gapType: 'stale_review',
            severity: 'low',
            description: 'Not reviewed in 90+ days',
            remediation: 'Schedule review',
            affectedFrameworks: ['SOC2'],
          },
        ],
        highRiskTables: ['patients', 'billing'],
        staleReviews: ['legacy_logs'],
        unclassifiedTables: ['temp_import'],
      };
      expect(ClassificationComplianceReportSchema.safeParse(report).success).toBe(true);
    });
  });

  describe('DataClassificationRecordSchema', () => {
    it('should accept valid database record', () => {
      const record = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tableName: 'patients',
        schemaName: 'public',
        sensitivityLevel: 'phi',
        containsPii: true,
        containsPhi: true,
        containsFinancial: false,
        complianceFrameworks: ['HIPAA', 'GDPR'],
        encryptionRequirement: 'field_level',
        retentionCategory: 'medical_records',
        rlsEnabled: true,
        softDeleteEnabled: true,
        columns: [],
        description: null,
        complianceNotes: null,
        lastReviewedAt: null,
        reviewedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(DataClassificationRecordSchema.safeParse(record).success).toBe(true);
    });
  });
});

describe('Data Classification Constants', () => {
  describe('DEFAULT_PII_COLUMN_PATTERNS', () => {
    it('should contain common PII patterns', () => {
      expect(DEFAULT_PII_COLUMN_PATTERNS).toContain('email');
      expect(DEFAULT_PII_COLUMN_PATTERNS).toContain('phone');
      expect(DEFAULT_PII_COLUMN_PATTERNS).toContain('full_name');
      expect(DEFAULT_PII_COLUMN_PATTERNS).toContain('address');
      expect(DEFAULT_PII_COLUMN_PATTERNS).toContain('ssn');
    });
  });

  describe('DEFAULT_PHI_COLUMN_PATTERNS', () => {
    it('should contain common PHI patterns', () => {
      expect(DEFAULT_PHI_COLUMN_PATTERNS).toContain('diagnosis');
      expect(DEFAULT_PHI_COLUMN_PATTERNS).toContain('treatment');
      expect(DEFAULT_PHI_COLUMN_PATTERNS).toContain('medication');
      expect(DEFAULT_PHI_COLUMN_PATTERNS).toContain('medical_history');
    });
  });

  describe('SENSITIVITY_PRECEDENCE', () => {
    it('should have correct precedence order', () => {
      expect(SENSITIVITY_PRECEDENCE.public).toBeLessThan(SENSITIVITY_PRECEDENCE.internal);
      expect(SENSITIVITY_PRECEDENCE.internal).toBeLessThan(SENSITIVITY_PRECEDENCE.confidential);
      expect(SENSITIVITY_PRECEDENCE.confidential).toBeLessThan(SENSITIVITY_PRECEDENCE.financial);
      expect(SENSITIVITY_PRECEDENCE.financial).toBeLessThan(SENSITIVITY_PRECEDENCE.restricted_pii);
      expect(SENSITIVITY_PRECEDENCE.restricted_pii).toBeLessThan(SENSITIVITY_PRECEDENCE.phi);
    });

    it('should have PHI as highest sensitivity', () => {
      const maxValue = Math.max(...Object.values(SENSITIVITY_PRECEDENCE));
      expect(SENSITIVITY_PRECEDENCE.phi).toBe(maxValue);
    });
  });
});

describe('Data Classification Helper Functions', () => {
  describe('getHighestSensitivity', () => {
    it('should return internal for empty array', () => {
      expect(getHighestSensitivity([])).toBe('internal');
    });

    it('should return the single level for single-element array', () => {
      expect(getHighestSensitivity(['public'])).toBe('public');
      expect(getHighestSensitivity(['phi'])).toBe('phi');
    });

    it('should return phi when it exists', () => {
      expect(getHighestSensitivity(['public', 'internal', 'phi'])).toBe('phi');
      expect(getHighestSensitivity(['phi', 'public'])).toBe('phi');
    });

    it('should return restricted_pii over financial', () => {
      expect(getHighestSensitivity(['financial', 'restricted_pii'])).toBe('restricted_pii');
    });

    it('should return confidential over internal', () => {
      expect(getHighestSensitivity(['internal', 'confidential', 'public'])).toBe('confidential');
    });

    it('should handle all levels correctly', () => {
      const allLevels: Array<
        'public' | 'internal' | 'confidential' | 'financial' | 'restricted_pii' | 'phi'
      > = ['public', 'internal', 'confidential', 'financial', 'restricted_pii', 'phi'];
      expect(getHighestSensitivity(allLevels)).toBe('phi');
    });

    it('should be idempotent (property-based)', () => {
      const levels: Array<
        'public' | 'internal' | 'confidential' | 'financial' | 'restricted_pii' | 'phi'
      > = ['public', 'internal', 'confidential', 'financial', 'restricted_pii', 'phi'];

      fc.assert(
        fc.property(fc.shuffledSubarray(levels, { minLength: 1 }), (subset) => {
          const result1 = getHighestSensitivity(subset);
          const result2 = getHighestSensitivity([...subset].reverse());
          return result1 === result2;
        })
      );
    });
  });

  describe('isPiiColumnName', () => {
    it('should detect standard PII column names', () => {
      expect(isPiiColumnName('email')).toBe(true);
      expect(isPiiColumnName('phone')).toBe(true);
      expect(isPiiColumnName('phone_number')).toBe(true);
      expect(isPiiColumnName('full_name')).toBe(true);
      expect(isPiiColumnName('first_name')).toBe(true);
      expect(isPiiColumnName('last_name')).toBe(true);
      expect(isPiiColumnName('address')).toBe(true);
      expect(isPiiColumnName('ip_address')).toBe(true);
      expect(isPiiColumnName('date_of_birth')).toBe(true);
      expect(isPiiColumnName('ssn')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isPiiColumnName('EMAIL')).toBe(true);
      expect(isPiiColumnName('Phone_Number')).toBe(true);
      expect(isPiiColumnName('FULL_NAME')).toBe(true);
    });

    it('should detect PII patterns within column names', () => {
      expect(isPiiColumnName('patient_email')).toBe(true);
      expect(isPiiColumnName('contact_phone_number')).toBe(true);
      expect(isPiiColumnName('billing_address')).toBe(true);
    });

    it('should not match non-PII columns', () => {
      expect(isPiiColumnName('created_at')).toBe(false);
      expect(isPiiColumnName('id')).toBe(false);
      expect(isPiiColumnName('status')).toBe(false);
      expect(isPiiColumnName('amount')).toBe(false);
    });
  });

  describe('isPhiColumnName', () => {
    it('should detect standard PHI column names', () => {
      expect(isPhiColumnName('diagnosis')).toBe(true);
      expect(isPhiColumnName('treatment')).toBe(true);
      expect(isPhiColumnName('medication')).toBe(true);
      expect(isPhiColumnName('allergy')).toBe(true);
      expect(isPhiColumnName('symptom')).toBe(true);
      expect(isPhiColumnName('medical_history')).toBe(true);
      expect(isPhiColumnName('procedure')).toBe(true);
      expect(isPhiColumnName('health_status')).toBe(true);
      expect(isPhiColumnName('insurance')).toBe(true);
      expect(isPhiColumnName('prescription')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isPhiColumnName('DIAGNOSIS')).toBe(true);
      expect(isPhiColumnName('Medical_History')).toBe(true);
      expect(isPhiColumnName('TREATMENT')).toBe(true);
    });

    it('should detect PHI patterns within column names', () => {
      expect(isPhiColumnName('patient_diagnosis')).toBe(true);
      expect(isPhiColumnName('current_medication')).toBe(true);
      expect(isPhiColumnName('dental_procedure')).toBe(true);
    });

    it('should not match non-PHI columns', () => {
      expect(isPhiColumnName('email')).toBe(false);
      expect(isPhiColumnName('phone')).toBe(false);
      expect(isPhiColumnName('created_at')).toBe(false);
    });
  });

  describe('getRequiredFrameworks', () => {
    it('should return SOC2 for minimal classification', () => {
      const frameworks = getRequiredFrameworks({
        containsPii: false,
        containsPhi: false,
        containsFinancial: false,
      });
      expect(frameworks).toContain('SOC2');
      expect(frameworks).toHaveLength(1);
    });

    it('should include GDPR and CCPA for PII', () => {
      const frameworks = getRequiredFrameworks({
        containsPii: true,
        containsPhi: false,
        containsFinancial: false,
      });
      expect(frameworks).toContain('GDPR');
      expect(frameworks).toContain('CCPA');
      expect(frameworks).toContain('SOC2');
    });

    it('should include HIPAA for PHI', () => {
      const frameworks = getRequiredFrameworks({
        containsPii: false,
        containsPhi: true,
        containsFinancial: false,
      });
      expect(frameworks).toContain('HIPAA');
      expect(frameworks).toContain('SOC2');
    });

    it('should include PCI_DSS for financial data', () => {
      const frameworks = getRequiredFrameworks({
        containsPii: false,
        containsPhi: false,
        containsFinancial: true,
      });
      expect(frameworks).toContain('PCI_DSS');
      expect(frameworks).toContain('SOC2');
    });

    it('should include all frameworks for combined data types', () => {
      const frameworks = getRequiredFrameworks({
        containsPii: true,
        containsPhi: true,
        containsFinancial: true,
      });
      expect(frameworks).toContain('GDPR');
      expect(frameworks).toContain('CCPA');
      expect(frameworks).toContain('HIPAA');
      expect(frameworks).toContain('PCI_DSS');
      expect(frameworks).toContain('SOC2');
    });

    it('should not have duplicate frameworks', () => {
      const frameworks = getRequiredFrameworks({
        containsPii: true,
        containsPhi: true,
        containsFinancial: true,
      });
      const unique = [...new Set(frameworks)];
      expect(frameworks.length).toBe(unique.length);
    });

    it('should always include SOC2 (property-based)', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (pii, phi, financial) => {
          const frameworks = getRequiredFrameworks({
            containsPii: pii,
            containsPhi: phi,
            containsFinancial: financial,
          });
          return frameworks.includes('SOC2');
        })
      );
    });
  });
});
