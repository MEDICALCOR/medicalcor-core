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
