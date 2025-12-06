import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateOsaxCaseUseCase } from '../use-cases/osax/CreateOsaxCase/CreateOsaxCaseUseCase.js';
import { SecurityContext, Permission, SecurityPrincipalType } from '../security/SecurityContext.js';
import { isOk, isErr } from '../shared/Result.js';
import type {
  OsaxCaseRepository,
  OsaxCaseEntity,
} from '../ports/secondary/persistence/OsaxCaseRepository.js';
import type { EventPublisher, DomainEvent } from '../ports/secondary/messaging/EventPublisher.js';
import type { AuditService, AuditEntry } from '../ports/secondary/external/AuditService.js';

/**
 * Tests for CreateOsaxCaseUseCase
 *
 * Covers:
 * - Permission checking (RBAC)
 * - Input validation
 * - Duplicate case detection
 * - Case creation flow
 * - Event publishing
 * - Audit logging
 * - Error handling
 */

// Mock implementations
function createMockRepository(overrides: Partial<OsaxCaseRepository> = {}): OsaxCaseRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findBySubjectId: vi.fn().mockResolvedValue([]),
    findByCaseNumber: vi.fn().mockResolvedValue(null),
    getNextSequenceNumber: vi.fn().mockResolvedValue(1),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockEventPublisher(overrides: Partial<EventPublisher> = {}): EventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishBatch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockAuditService(overrides: Partial<AuditService> = {}): AuditService {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createSecurityContext(
  permissions: Permission[],
  organizationId = 'org-123'
): SecurityContext {
  return SecurityContext.create(
    {
      id: 'user-123',
      type: SecurityPrincipalType.USER,
      roles: ['DOCTOR'],
      permissions,
      organizationId,
      displayName: 'Dr. Test',
      email: 'test@example.com',
      metadata: {
        mfaVerified: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Test/1.0',
      },
    },
    'corr-123'
  );
}

describe('CreateOsaxCaseUseCase', () => {
  let useCase: CreateOsaxCaseUseCase;
  let repository: OsaxCaseRepository;
  let eventPublisher: EventPublisher;
  let auditService: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockRepository();
    eventPublisher = createMockEventPublisher();
    auditService = createMockAuditService();
    useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);
  });

  describe('Permission Checking', () => {
    it('should create case when user has OSAX_CASE_CREATE permission', async () => {
      const context = createSecurityContext([Permission.OSAX_CASE_CREATE]);
      const request = { subjectId: 'patient-123', subjectType: 'patient' as const };

      const result = await useCase.createCase(request, context);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.caseId).toBeDefined();
        expect(result.value.caseNumber).toMatch(/^OSAX-\d{4}-\d{5}$/);
      }
    });

    it('should deny access when user lacks OSAX_CASE_CREATE permission', async () => {
      const context = createSecurityContext([Permission.OSAX_CASE_READ]); // No create permission
      const request = { subjectId: 'patient-123', subjectType: 'patient' as const };

      const result = await useCase.createCase(request, context);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('security.permission_denied');
      }
    });

    it('should deny access when user has no permissions', async () => {
      const context = createSecurityContext([]);
      const request = { subjectId: 'patient-123', subjectType: 'patient' as const };

      const result = await useCase.createCase(request, context);

      expect(isErr(result)).toBe(true);
    });
  });

  describe('Input Validation', () => {
    const validContext = () => createSecurityContext([Permission.OSAX_CASE_CREATE]);

    it('should reject empty subjectId', async () => {
      const result = await useCase.createCase(
        { subjectId: '', subjectType: 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('validation.failed');
      }
    });

    it('should reject whitespace-only subjectId', async () => {
      const result = await useCase.createCase(
        { subjectId: '   ', subjectType: 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
    });

    it('should reject subjectId longer than 100 characters', async () => {
      const result = await useCase.createCase(
        { subjectId: 'a'.repeat(101), subjectType: 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.details?.fieldErrors).toBeDefined();
      }
    });

    it('should reject invalid subjectType', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'invalid' as 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
    });

    it('should accept valid "patient" subjectType', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
    });

    it('should accept valid "lead" subjectType', async () => {
      const result = await useCase.createCase(
        { subjectId: 'lead-123', subjectType: 'lead' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
    });

    it('should reject notes longer than 10000 characters', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient', notes: 'x'.repeat(10001) },
        validContext()
      );

      expect(isErr(result)).toBe(true);
    });

    it('should accept notes up to 10000 characters', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient', notes: 'x'.repeat(10000) },
        validContext()
      );

      expect(isOk(result)).toBe(true);
    });

    it('should reject invalid priority', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient', priority: 'SUPER_URGENT' as 'URGENT' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
    });

    it('should accept valid priorities', async () => {
      const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

      for (const priority of priorities) {
        const result = await useCase.createCase(
          { subjectId: `patient-${priority}`, subjectType: 'patient', priority },
          validContext()
        );
        expect(isOk(result)).toBe(true);
      }
    });

    it('should reject more than 20 tags', async () => {
      const result = await useCase.createCase(
        {
          subjectId: 'patient-123',
          subjectType: 'patient',
          tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
        },
        validContext()
      );

      expect(isErr(result)).toBe(true);
    });

    it('should reject tags longer than 50 characters', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient', tags: ['a'.repeat(51)] },
        validContext()
      );

      expect(isErr(result)).toBe(true);
    });
  });

  describe('Duplicate Detection', () => {
    const validContext = () => createSecurityContext([Permission.OSAX_CASE_CREATE]);

    it('should reject creation when active case exists for subject', async () => {
      const existingCase: OsaxCaseEntity = {
        id: 'existing-case-id',
        caseNumber: 'OSAX-2025-00001',
        subjectId: 'patient-123',
        subjectType: 'patient',
        status: 'PENDING_STUDY',
        priority: 'NORMAL',
        tags: [],
        scoreHistory: [],
        physicianReviews: [],
        reviewStatus: 'PENDING',
        treatmentHistory: [],
        followUps: [],
        consentStatus: 'PENDING',
        version: 1,
        isDeleted: false,
        organizationId: 'org-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository = createMockRepository({
        findBySubjectId: vi.fn().mockResolvedValue([existingCase]),
      });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('osax.duplicate_case');
        expect(result.error.details?.existingCaseId).toBe('existing-case-id');
      }
    });

    it('should allow creation when only closed cases exist', async () => {
      const closedCase: OsaxCaseEntity = {
        id: 'closed-case-id',
        caseNumber: 'OSAX-2025-00001',
        subjectId: 'patient-123',
        subjectType: 'patient',
        status: 'CLOSED',
        priority: 'NORMAL',
        tags: [],
        scoreHistory: [],
        physicianReviews: [],
        reviewStatus: 'PENDING',
        treatmentHistory: [],
        followUps: [],
        consentStatus: 'PENDING',
        version: 1,
        isDeleted: false,
        organizationId: 'org-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository = createMockRepository({
        findBySubjectId: vi.fn().mockResolvedValue([closedCase]),
      });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
    });

    it('should allow creation when only deleted cases exist', async () => {
      const deletedCase: OsaxCaseEntity = {
        id: 'deleted-case-id',
        caseNumber: 'OSAX-2025-00001',
        subjectId: 'patient-123',
        subjectType: 'patient',
        status: 'PENDING_STUDY',
        priority: 'NORMAL',
        tags: [],
        scoreHistory: [],
        physicianReviews: [],
        reviewStatus: 'PENDING',
        treatmentHistory: [],
        followUps: [],
        consentStatus: 'PENDING',
        version: 1,
        isDeleted: true, // Deleted
        organizationId: 'org-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository = createMockRepository({
        findBySubjectId: vi.fn().mockResolvedValue([deletedCase]),
      });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
    });
  });

  describe('Case Creation', () => {
    const validContext = () => createSecurityContext([Permission.OSAX_CASE_CREATE]);

    it('should generate correct case number format', async () => {
      repository = createMockRepository({
        getNextSequenceNumber: vi.fn().mockResolvedValue(42),
      });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const year = new Date().getFullYear();
        expect(result.value.caseNumber).toBe(`OSAX-${year}-00042`);
      }
    });

    it('should set initial status to PENDING_STUDY', async () => {
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.status).toBe('PENDING_STUDY');
      }
    });

    it('should use default priority when not specified', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      repository = createMockRepository({ save: saveFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(saveFn).toHaveBeenCalledWith(expect.objectContaining({ priority: 'NORMAL' }));
    });

    it('should set organizationId from security context', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      repository = createMockRepository({ save: saveFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const context = createSecurityContext([Permission.OSAX_CASE_CREATE], 'my-org-456');
      await useCase.createCase({ subjectId: 'patient-123', subjectType: 'patient' }, context);

      expect(saveFn).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'my-org-456' })
      );
    });
  });

  describe('Event Publishing', () => {
    const validContext = () => createSecurityContext([Permission.OSAX_CASE_CREATE]);

    it('should publish osax.case.created event after successful creation', async () => {
      const publishFn = vi.fn().mockResolvedValue(undefined);
      eventPublisher = createMockEventPublisher({ publish: publishFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
      expect(publishFn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'osax.case.created',
          aggregateType: 'OsaxCase',
        })
      );
    });

    it('should include correct event data', async () => {
      const publishFn = vi.fn().mockResolvedValue(undefined);
      eventPublisher = createMockEventPublisher({ publish: publishFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient', priority: 'URGENT' },
        validContext()
      );

      const publishedEvent = publishFn.mock.calls[0]?.[0] as DomainEvent;
      expect(publishedEvent.eventData).toMatchObject({
        subjectId: 'patient-123',
        subjectType: 'patient',
        priority: 'URGENT',
        createdBy: 'user-123',
      });
    });

    it('should include correlation ID in event', async () => {
      const publishFn = vi.fn().mockResolvedValue(undefined);
      eventPublisher = createMockEventPublisher({ publish: publishFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      const publishedEvent = publishFn.mock.calls[0]?.[0] as DomainEvent;
      expect(publishedEvent.correlationId).toBe('corr-123');
    });
  });

  describe('Audit Logging', () => {
    const validContext = () => createSecurityContext([Permission.OSAX_CASE_CREATE]);

    it('should record audit entry on successful creation', async () => {
      const recordFn = vi.fn().mockResolvedValue(undefined);
      auditService = createMockAuditService({ record: recordFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(recordFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resourceType: 'OsaxCase',
          result: 'SUCCESS',
        })
      );
    });

    it('should record audit entry on validation failure', async () => {
      const recordFn = vi.fn().mockResolvedValue(undefined);
      auditService = createMockAuditService({ record: recordFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      await useCase.createCase({ subjectId: '', subjectType: 'patient' }, validContext());

      expect(recordFn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          result: 'FAILURE',
        })
      );
    });

    it('should record audit entry on duplicate detection', async () => {
      const existingCase: OsaxCaseEntity = {
        id: 'existing-id',
        caseNumber: 'OSAX-2025-00001',
        subjectId: 'patient-123',
        subjectType: 'patient',
        status: 'PENDING_STUDY',
        priority: 'NORMAL',
        tags: [],
        scoreHistory: [],
        physicianReviews: [],
        reviewStatus: 'PENDING',
        treatmentHistory: [],
        followUps: [],
        consentStatus: 'PENDING',
        version: 1,
        isDeleted: false,
        organizationId: 'org-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const recordFn = vi.fn().mockResolvedValue(undefined);
      repository = createMockRepository({
        findBySubjectId: vi.fn().mockResolvedValue([existingCase]),
      });
      auditService = createMockAuditService({ record: recordFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(recordFn).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'FAILURE',
          details: expect.objectContaining({
            reason: 'duplicate_case',
          }),
        })
      );
    });

    it('should continue operation if audit recording fails', async () => {
      const recordFn = vi.fn().mockRejectedValue(new Error('Audit service down'));
      auditService = createMockAuditService({ record: recordFn });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      // Should not throw despite audit failure
      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isOk(result)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    const validContext = () => createSecurityContext([Permission.OSAX_CASE_CREATE]);

    it('should wrap repository errors in DomainError', async () => {
      repository = createMockRepository({
        save: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('osax.create_case_failed');
      }
    });

    it('should include correlation ID in error', async () => {
      repository = createMockRepository({
        save: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);

      const result = await useCase.createCase(
        { subjectId: 'patient-123', subjectType: 'patient' },
        validContext()
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.correlationId).toBe('corr-123');
      }
    });
  });
});
