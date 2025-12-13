/**
 * @fileoverview Tests for GDPR Breach Notification Service
 *
 * Tests for breach reporting, assessment, and notification workflows.
 * Critical for GDPR compliance - validates correct breach handling logic.
 *
 * Covers:
 * - Breach reporting and record creation
 * - Severity assessment
 * - DPO notification
 * - Authority notification tracking
 * - Subject notification handling
 * - Measure recording
 * - Breach resolution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BreachNotificationService,
  createBreachNotificationService,
  type BreachLogger,
  type BreachEventEmitter,
  type BreachNotificationServiceOptions,
} from '../breach-notification-service.js';
import type { BreachRepository, BreachQueryResult } from '../breach-repository.js';
import type {
  DataBreach,
  BreachStatus,
  BreachSeverity,
  AffectedSubject,
  BreachMeasure,
  AuthorityNotification,
  ReportBreachPayload,
} from '@medicalcor/types';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockRepository(): BreachRepository & { _data: Map<string, DataBreach> } {
  const data = new Map<string, DataBreach>();

  return {
    _data: data,

    save: vi.fn(async (breach: DataBreach) => {
      data.set(breach.id, breach);
      return breach;
    }),

    update: vi.fn(async (breach: DataBreach) => {
      data.set(breach.id, breach);
      return breach;
    }),

    findById: vi.fn(async (id: string) => {
      return data.get(id) ?? null;
    }),

    findByCorrelationId: vi.fn(async (correlationId: string) => {
      for (const breach of data.values()) {
        if (breach.correlationId === correlationId) {
          return breach;
        }
      }
      return null;
    }),

    find: vi.fn(async (_options): Promise<BreachQueryResult> => {
      const breaches = Array.from(data.values());
      return {
        breaches,
        total: breaches.length,
        offset: 0,
        limit: 100,
      };
    }),

    findApproachingDeadline: vi.fn(async (_hoursRemaining: number) => {
      return [];
    }),

    findPendingSubjectNotifications: vi.fn(async () => {
      return [];
    }),

    updateStatus: vi.fn(async (id: string, status: BreachStatus, updatedBy: string) => {
      const breach = data.get(id);
      if (!breach) {
        throw new Error(`Breach not found: ${id}`);
      }
      const updated = { ...breach, status, updatedBy, updatedAt: new Date().toISOString() };
      data.set(id, updated);
      return updated;
    }),

    addAffectedSubject: vi.fn(async (breachId: string, subject: AffectedSubject) => {
      const breach = data.get(breachId);
      if (breach) {
        breach.affectedSubjects = [...(breach.affectedSubjects ?? []), subject];
        data.set(breachId, breach);
      }
    }),

    updateSubjectNotification: vi.fn(
      async (
        breachId: string,
        contactId: string,
        notified: boolean,
        notifiedAt: string,
        channel: string
      ) => {
        const breach = data.get(breachId);
        if (breach?.affectedSubjects) {
          const subject = breach.affectedSubjects.find((s) => s.contactId === contactId);
          if (subject) {
            subject.notified = notified;
            subject.notifiedAt = notifiedAt;
            subject.notificationChannel = channel as
              | 'email'
              | 'whatsapp'
              | 'sms'
              | 'letter'
              | 'phone'
              | 'in_app';
          }
          data.set(breachId, breach);
        }
      }
    ),

    addMeasure: vi.fn(async (breachId: string, measure: BreachMeasure) => {
      const breach = data.get(breachId);
      if (breach) {
        breach.measuresTaken = [...(breach.measuresTaken ?? []), measure];
        data.set(breachId, breach);
      }
    }),

    recordAuthorityNotification: vi.fn(
      async (breachId: string, notification: AuthorityNotification) => {
        const breach = data.get(breachId);
        if (breach) {
          breach.authorityNotification = notification;
          data.set(breachId, breach);
        }
      }
    ),

    getStats: vi.fn(async (_clinicId: string) => ({
      total: data.size,
      byStatus: {} as Record<BreachStatus, number>,
      bySeverity: {} as Record<BreachSeverity, number>,
      pendingAuthorityNotification: 0,
      pendingSubjectNotification: 0,
    })),
  };
}

function createMockLogger(): BreachLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

function createMockEventEmitter(): BreachEventEmitter {
  return {
    emit: vi.fn(async () => {}),
  };
}

function createTestService(overrides: Partial<BreachNotificationServiceOptions> = {}) {
  const repository = createMockRepository();
  const logger = createMockLogger();
  const eventEmitter = createMockEventEmitter();

  const service = createBreachNotificationService({
    repository,
    logger,
    eventEmitter,
    ...overrides,
  });

  return { service, repository, logger, eventEmitter };
}

// ============================================================================
// BREACH REPORTING TESTS
// ============================================================================

describe('BreachNotificationService', () => {
  describe('reportBreach', () => {
    it('should create a breach record with assessed severity', async () => {
      const { service, repository } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Security monitoring',
        description: 'Unauthorized access to patient records',
        nature: ['confidentiality'],
        dataCategories: ['health_data'],
        estimatedAffectedCount: 100,
      };

      const result = await service.reportBreach(payload);

      expect(result.breach.id).toMatch(/^brch_/);
      expect(result.breach.clinicId).toBe('clinic-456');
      expect(result.breach.status).toBe('detected');
      expect(result.assessedSeverity).toBe('high');
      expect(result.authorityNotificationRequired).toBe(true);
      expect(result.subjectNotificationRequired).toBe(true);
      expect(result.hoursUntilDeadline).toBeGreaterThan(71);

      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('should include affected contact IDs as subjects', async () => {
      const { service } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Audit',
        description: 'Data exposure',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 3,
        affectedContactIds: ['contact-1', 'contact-2', 'contact-3'],
      };

      const result = await service.reportBreach(payload);

      expect(result.breach.affectedSubjects).toHaveLength(3);
      expect(result.breach.affectedSubjects?.[0].contactId).toBe('contact-1');
      expect(result.breach.affectedSubjects?.[0].notified).toBe(false);
    });

    it('should emit breach detected event', async () => {
      const { service, eventEmitter } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Automated',
        description: 'Test breach',
        nature: ['availability'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 10,
      };

      await service.reportBreach(payload);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'breach.detected',
          correlationId: 'corr-123',
        })
      );
    });

    it('should assess consequences based on data categories', async () => {
      const { service } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Manual review',
        description: 'Financial data exposed',
        nature: ['confidentiality'],
        dataCategories: ['financial_data', 'identification_data'],
        estimatedAffectedCount: 50,
      };

      const result = await service.reportBreach(payload);

      expect(result.breach.potentialConsequences).toContain(
        'Risk of financial fraud or identity theft'
      );
      expect(result.breach.potentialConsequences).toContain('Identity theft risk');
    });
  });

  describe('updateAssessment', () => {
    it('should update breach with new assessment', async () => {
      const { service, repository } = createTestService();

      // First create a breach
      const payload: ReportBreachPayload = {
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Automated',
        description: 'Initial breach',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 10,
      };

      const { breach } = await service.reportBreach(payload);

      // Update assessment
      const updatedBreach = await service.updateAssessment(
        breach.id,
        {
          severity: 'critical',
          affectedCount: 500,
          highRiskToSubjects: true,
          potentialConsequences: ['Severe impact on patients'],
          rootCause: 'SQL injection vulnerability',
        },
        'security@clinic.com'
      );

      expect(updatedBreach.severity).toBe('critical');
      expect(updatedBreach.affectedCount).toBe(500);
      expect(updatedBreach.rootCause).toBe('SQL injection vulnerability');
      expect(updatedBreach.status).toBe('assessed');
      expect(repository.update).toHaveBeenCalled();
    });

    it('should throw if breach not found', async () => {
      const { service } = createTestService();

      await expect(
        service.updateAssessment(
          'non-existent-id',
          {
            severity: 'high',
            affectedCount: 100,
            highRiskToSubjects: true,
            potentialConsequences: [],
          },
          'admin'
        )
      ).rejects.toThrow('Breach not found');
    });
  });

  describe('notifyDPO', () => {
    it('should mark DPO as notified', async () => {
      const { service, repository } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 5,
      });

      await service.notifyDPO(breach.id);

      const updatedBreach = await service.getBreach(breach.id);
      expect(updatedBreach?.dpoNotified).toBe(true);
      expect(updatedBreach?.dpoNotifiedAt).toBeDefined();
    });
  });

  describe('notifyAuthority', () => {
    it('should record authority notification', async () => {
      const { service, repository, eventEmitter } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test',
        nature: ['confidentiality'],
        dataCategories: ['health_data'],
        estimatedAffectedCount: 100,
      });

      const result = await service.notifyAuthority(
        breach.id,
        'ANSPDCP',
        'REF-2024-001',
        'DPO Contact',
        'Initial notification'
      );

      expect(result.authority).toBe('ANSPDCP');
      expect(result.withinDeadline).toBe(true);
      expect(result.hoursFromDetection).toBeLessThan(1);

      expect(repository.recordAuthorityNotification).toHaveBeenCalledWith(
        breach.id,
        expect.objectContaining({
          authority: 'ANSPDCP',
          referenceNumber: 'REF-2024-001',
        })
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'breach.authority_notified',
        })
      );
    });
  });

  describe('notifySubject', () => {
    it('should mark subject as notified', async () => {
      const { service, repository, eventEmitter } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 1,
        affectedContactIds: ['contact-1'],
      });

      const result = await service.notifySubject(breach.id, 'contact-1', 'email');

      expect(result.success).toBe(true);
      expect(result.contactId).toBe('contact-1');
      expect(result.channel).toBe('email');

      expect(repository.updateSubjectNotification).toHaveBeenCalledWith(
        breach.id,
        'contact-1',
        true,
        expect.any(String),
        'email'
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'breach.subject_notified',
        })
      );
    });
  });

  describe('addMeasure', () => {
    it('should add a measure to the breach', async () => {
      const { service, repository, logger } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 10,
      });

      await service.addMeasure(
        breach.id,
        'Revoked all access tokens',
        'remediation',
        'security@clinic.com'
      );

      expect(repository.addMeasure).toHaveBeenCalledWith(
        breach.id,
        expect.objectContaining({
          description: 'Revoked all access tokens',
          type: 'remediation',
          implementedBy: 'security@clinic.com',
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ breachId: breach.id, measureType: 'remediation' }),
        'Breach measure recorded'
      );
    });
  });

  describe('resolveBreach', () => {
    it('should mark breach as resolved', async () => {
      const { service, repository, eventEmitter } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-123',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test',
        nature: ['availability'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 5,
      });

      const resolved = await service.resolveBreach(breach.id, 'manager@clinic.com');

      expect(resolved.status).toBe('resolved');
      expect(resolved.updatedBy).toBe('manager@clinic.com');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'breach.resolved',
        })
      );
    });
  });

  describe('findBreaches', () => {
    it('should return breaches from repository', async () => {
      const { service, repository } = createTestService();

      await service.reportBreach({
        correlationId: 'corr-1',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Breach 1',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 10,
      });

      await service.reportBreach({
        correlationId: 'corr-2',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Breach 2',
        nature: ['integrity'],
        dataCategories: ['health_data'],
        estimatedAffectedCount: 20,
      });

      const result = await service.findBreaches({ clinicId: 'clinic-456' });

      expect(result.breaches.length).toBeGreaterThanOrEqual(2);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('should return service configuration', () => {
      const { service } = createTestService({
        config: {
          defaultAuthority: 'CUSTOM_DPA',
          dpoEmail: 'dpo@test.com',
        },
      });

      const config = service.getConfig();

      expect(config.defaultAuthority).toBe('CUSTOM_DPA');
      expect(config.dpoEmail).toBe('dpo@test.com');
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createBreachNotificationService', () => {
  it('should create service with provided options', () => {
    const repository = createMockRepository();
    const logger = createMockLogger();
    const eventEmitter = createMockEventEmitter();

    const service = createBreachNotificationService({
      repository,
      logger,
      eventEmitter,
      config: {
        defaultAuthority: 'TEST_DPA',
        dpoEmail: 'test@example.com',
        deadlineWarningHours: 24,
      },
    });

    expect(service).toBeInstanceOf(BreachNotificationService);

    const config = service.getConfig();
    expect(config.defaultAuthority).toBe('TEST_DPA');
    expect(config.dpoEmail).toBe('test@example.com');
    expect(config.deadlineWarningHours).toBe(24);
  });

  it('should use default config when not provided', () => {
    const repository = createMockRepository();

    const service = createBreachNotificationService({ repository });

    const config = service.getConfig();
    expect(config.defaultAuthority).toBe('ANSPDCP');
    expect(config.deadlineWarningHours).toBe(48);
  });
});

// ============================================================================
// ADDITIONAL BRANCH COVERAGE TESTS
// ============================================================================

describe('BreachNotificationService - Additional Branch Coverage', () => {
  describe('assessConsequences - Special Data Categories', () => {
    it('should assess consequences for biometric data breach', async () => {
      const { service } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-bio',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Security scan',
        description: 'Biometric data exposed',
        nature: ['confidentiality'],
        dataCategories: ['biometric_data'],
        estimatedAffectedCount: 50,
      };

      const result = await service.reportBreach(payload);

      expect(result.breach.potentialConsequences).toContain(
        'Permanent exposure of unchangeable identifiers'
      );
    });

    it('should assess consequences for genetic data breach', async () => {
      const { service } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-gen',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Audit',
        description: 'Genetic data exposed',
        nature: ['confidentiality'],
        dataCategories: ['genetic_data'],
        estimatedAffectedCount: 25,
      };

      const result = await service.reportBreach(payload);

      expect(result.breach.potentialConsequences).toContain(
        'Permanent exposure of genetic information'
      );
      expect(result.breach.potentialConsequences).toContain(
        'Potential discrimination based on genetic data'
      );
    });

    it('should assess generic consequences for unknown data category', async () => {
      const { service } = createTestService();

      // Using an empty data categories array to trigger fallback
      const payload: ReportBreachPayload = {
        correlationId: 'corr-unknown',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Manual',
        description: 'Unknown data type breach',
        nature: ['availability'],
        dataCategories: [] as unknown as ReportBreachPayload['dataCategories'],
        estimatedAffectedCount: 10,
      };

      const result = await service.reportBreach(payload);

      expect(result.breach.potentialConsequences).toContain('General privacy impact');
    });
  });

  describe('getBreachesApproachingDeadline', () => {
    it('should return breaches approaching deadline', async () => {
      const { service, repository } = createTestService();

      const mockBreaches: DataBreach[] = [
        {
          id: 'brch_approaching',
          correlationId: 'corr-1',
          clinicId: 'clinic-456',
          detectedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
          detectedBy: 'admin',
          detectionMethod: 'Alert',
          nature: ['confidentiality'],
          dataCategories: ['personal_data'],
          severity: 'high',
          status: 'detected',
          description: 'Test breach',
          affectedCount: 100,
          highRiskToSubjects: true,
          dpoNotified: false,
          authorityNotificationRequired: true,
          subjectNotificationRequired: true,
          subjectsNotifiedCount: 0,
          measuresTaken: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: 'admin',
        },
      ];

      repository.findApproachingDeadline = vi.fn().mockResolvedValue(mockBreaches);

      const result = await service.getBreachesApproachingDeadline();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('brch_approaching');
      expect(repository.findApproachingDeadline).toHaveBeenCalledWith(48); // default deadlineWarningHours
    });
  });

  describe('getBreachesPendingSubjectNotification', () => {
    it('should return breaches pending subject notification', async () => {
      const { service, repository } = createTestService();

      const mockBreaches: DataBreach[] = [
        {
          id: 'brch_pending',
          correlationId: 'corr-2',
          clinicId: 'clinic-456',
          detectedAt: new Date().toISOString(),
          detectedBy: 'admin',
          detectionMethod: 'Alert',
          nature: ['confidentiality'],
          dataCategories: ['health_data'],
          severity: 'critical',
          status: 'notifying_authority',
          description: 'Critical breach',
          affectedCount: 500,
          highRiskToSubjects: true,
          dpoNotified: true,
          authorityNotificationRequired: true,
          subjectNotificationRequired: true,
          subjectsNotifiedCount: 0,
          affectedSubjects: [
            { contactId: 'contact-1', dataCategories: ['health_data'], notified: false },
          ],
          measuresTaken: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: 'admin',
        },
      ];

      repository.findPendingSubjectNotifications = vi.fn().mockResolvedValue(mockBreaches);

      const result = await service.getBreachesPendingSubjectNotification();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('brch_pending');
      expect(repository.findPendingSubjectNotifications).toHaveBeenCalled();
    });
  });

  describe('notifySubject - Error Handling', () => {
    it('should handle notification failure gracefully', async () => {
      const { service, repository, eventEmitter } = createTestService();

      // Create a breach first
      const { breach } = await service.reportBreach({
        correlationId: 'corr-err',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test breach',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 1,
        affectedContactIds: ['contact-error'],
      });

      // Mock updateSubjectNotification to throw
      repository.updateSubjectNotification = vi
        .fn()
        .mockRejectedValue(new Error('Notification failed'));

      const result = await service.notifySubject(breach.id, 'contact-error', 'email');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notification failed');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'breach.subject_notified',
          payload: expect.objectContaining({
            success: false,
            errorReason: 'Notification failed',
          }),
        })
      );
    });

    it('should handle non-Error exceptions in notification', async () => {
      const { service, repository } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-non-err',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test breach',
        nature: ['confidentiality'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 1,
        affectedContactIds: ['contact-non-error'],
      });

      // Mock updateSubjectNotification to throw non-Error
      repository.updateSubjectNotification = vi.fn().mockRejectedValue('String error');

      const result = await service.notifySubject(breach.id, 'contact-non-error', 'sms');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('notifySubject - Status Update', () => {
    it('should update status to notifying_subjects when coming from notifying_authority', async () => {
      const { service, repository } = createTestService();

      // Create a breach
      const { breach } = await service.reportBreach({
        correlationId: 'corr-status',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test breach',
        nature: ['confidentiality'],
        dataCategories: ['health_data'],
        estimatedAffectedCount: 1,
        affectedContactIds: ['contact-status'],
      });

      // Manually update status to notifying_authority
      const updatedBreach = { ...breach, status: 'notifying_authority' as const };
      repository._data.set(breach.id, updatedBreach);

      const result = await service.notifySubject(breach.id, 'contact-status', 'whatsapp');

      expect(result.success).toBe(true);

      // Verify update was called
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'notifying_subjects',
        })
      );
    });

    it('should keep current status when not notifying_authority', async () => {
      const { service, repository } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-keep-status',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test breach',
        nature: ['availability'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 1,
        affectedContactIds: ['contact-keep'],
      });

      // Breach status is 'detected', not 'notifying_authority'
      const result = await service.notifySubject(breach.id, 'contact-keep', 'phone');

      expect(result.success).toBe(true);

      // Verify status was kept as detected
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'detected',
        })
      );
    });
  });

  describe('notifyDPO - Error Handling', () => {
    it('should throw error when breach not found for DPO notification', async () => {
      const { service } = createTestService();

      await expect(service.notifyDPO('nonexistent-breach')).rejects.toThrow(
        'Breach not found: nonexistent-breach'
      );
    });
  });

  describe('notifyAuthority - Late Notification Warning', () => {
    it('should log warning when notification exceeds 72-hour deadline', async () => {
      const { service, logger } = createTestService();

      // Create a breach detected 80 hours ago
      const detectedAt = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-late',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Late notification test',
        nature: ['confidentiality'],
        dataCategories: ['health_data'],
        estimatedAffectedCount: 100,
        detectedAt: detectedAt,
      };

      const { breach } = await service.reportBreach(payload);

      const result = await service.notifyAuthority(
        breach.id,
        'ANSPDCP',
        'REF-LATE-001',
        'DPO Contact'
      );

      expect(result.withinDeadline).toBe(false);
      expect(result.hoursFromDetection).toBeGreaterThan(72);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ breachId: breach.id }),
        'Authority notification exceeded 72-hour deadline'
      );
    });

    it('should throw error when breach not found for authority notification', async () => {
      const { service } = createTestService();

      await expect(service.notifyAuthority('nonexistent-breach', 'ANSPDCP')).rejects.toThrow(
        'Breach not found: nonexistent-breach'
      );
    });
  });

  describe('resolveBreach - Error Handling', () => {
    it('should throw error when breach not found for resolution', async () => {
      const { service } = createTestService();

      await expect(service.resolveBreach('nonexistent-breach', 'resolver')).rejects.toThrow(
        'Breach not found: nonexistent-breach'
      );
    });
  });

  describe('getBreach', () => {
    it('should return null for non-existent breach', async () => {
      const { service } = createTestService();

      const result = await service.getBreach('nonexistent-breach');

      expect(result).toBeNull();
    });

    it('should return breach when found', async () => {
      const { service } = createTestService();

      const { breach } = await service.reportBreach({
        correlationId: 'corr-get',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Alert',
        description: 'Test',
        nature: ['integrity'],
        dataCategories: ['personal_data'],
        estimatedAffectedCount: 5,
      });

      const result = await service.getBreach(breach.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(breach.id);
    });
  });

  describe('Multiple Data Category Consequences', () => {
    it('should combine consequences for multiple data categories', async () => {
      const { service } = createTestService();

      const payload: ReportBreachPayload = {
        correlationId: 'corr-multi',
        clinicId: 'clinic-456',
        reportedBy: 'admin@clinic.com',
        detectionMethod: 'Security audit',
        description: 'Multi-category breach',
        nature: ['confidentiality', 'integrity'],
        dataCategories: ['health_data', 'financial_data', 'identification_data', 'personal_data'],
        estimatedAffectedCount: 200,
      };

      const result = await service.reportBreach(payload);

      const consequences = result.breach.potentialConsequences;

      // Health data consequences
      expect(consequences).toContain('Potential disclosure of sensitive medical information');
      expect(consequences).toContain('Possible impact on medical treatment decisions');

      // Financial data consequences
      expect(consequences).toContain('Risk of financial fraud or identity theft');
      expect(consequences).toContain('Potential unauthorized transactions');

      // Identification data consequences
      expect(consequences).toContain('Identity theft risk');
      expect(consequences).toContain('Potential for fraudulent account creation');

      // Personal data consequences
      expect(consequences).toContain('Loss of privacy');
      expect(consequences).toContain('Potential for targeted phishing or social engineering');
    });
  });
});
