/**
 * @fileoverview Create OSAX Case Use Case
 *
 * Application use case for creating new OSAX cases.
 * Implements the primary port interface with full security,
 * validation, and audit support.
 *
 * @module application/use-cases/osax/CreateOsaxCase
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '@medicalcor/core';
import type {
  OsaxCaseService,
  CreateCaseRequest,
  CreateCaseResponse,
} from '../../../ports/primary/OsaxCaseService.js';
import type {
  OsaxCaseRepository,
  OsaxCaseEntity,
} from '../../../ports/secondary/persistence/OsaxCaseRepository.js';
import type {
  EventPublisher,
  DomainEvent,
} from '../../../ports/secondary/messaging/EventPublisher.js';
import type { AuditService } from '../../../ports/secondary/external/AuditService.js';
import { SecurityContext, Permission } from '../../../security/SecurityContext.js';
import { Result, Ok, Err, isErr } from '../../../shared/Result.js';
import { DomainError, ErrorSeverity } from '../../../shared/DomainError.js';

const logger = createLogger({ name: 'create-osax-case-use-case' });

/**
 * CreateOsaxCaseUseCase
 *
 * Orchestrates the creation of new OSAX cases with:
 * - Permission checking
 * - Input validation
 * - Duplicate detection
 * - Event publishing
 * - Audit logging
 *
 * @example
 * ```typescript
 * const useCase = new CreateOsaxCaseUseCase(repository, eventPublisher, auditService);
 * const result = await useCase.createCase(
 *   { subjectId: 'SUB-001', subjectType: 'patient' },
 *   securityContext
 * );
 * ```
 */
export class CreateOsaxCaseUseCase implements Pick<OsaxCaseService, 'createCase'> {
  constructor(
    private readonly repository: OsaxCaseRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly auditService: AuditService
  ) {}

  /**
   * Create a new OSAX case
   *
   * @param request - Case creation request
   * @param context - Security context
   * @returns Result with created case details or error
   */
  async createCase(
    request: CreateCaseRequest,
    context: SecurityContext
  ): Promise<Result<CreateCaseResponse>> {
    const correlationId = context.correlationId;

    try {
      // 1. Security check
      context.requirePermission(Permission.OSAX_CASE_CREATE);

      // 2. Validate request
      const validationResult = this.validateRequest(request);
      if (isErr(validationResult)) {
        await this.recordAudit(context, 'CREATE', 'UNKNOWN', 'FAILURE', {
          error: validationResult.error.message,
          request,
        });
        return validationResult;
      }

      // 3. Check for duplicate cases
      const existingCases = await this.repository.findBySubjectId(request.subjectId);
      const activeCases = existingCases.filter(c => !c.isDeleted && c.status !== 'CLOSED' && c.status !== 'CANCELLED');

      if (activeCases.length > 0) {
        const error = new DomainError(
          'osax.duplicate_case',
          `Active case already exists for subject ${request.subjectId}`,
          {
            subjectId: request.subjectId,
            existingCaseId: activeCases[0]!.id,
            existingCaseNumber: activeCases[0]!.caseNumber,
          },
          ErrorSeverity.MEDIUM,
          correlationId
        );

        await this.recordAudit(context, 'CREATE', activeCases[0]!.id, 'FAILURE', {
          reason: 'duplicate_case',
          existingCaseId: activeCases[0]!.id,
        });

        return Err(error);
      }

      // 4. Generate case identifiers
      const caseId = randomUUID();
      const year = new Date().getFullYear();
      const sequenceNumber = await this.repository.getNextSequenceNumber(year);
      const caseNumber = this.generateCaseNumber(year, sequenceNumber);

      // 5. Create case entity
      const now = new Date();
      const entity: OsaxCaseEntity = {
        id: caseId,
        caseNumber,
        subjectId: request.subjectId,
        subjectType: request.subjectType,
        status: 'PENDING_STUDY',
        priority: request.priority ?? 'NORMAL',
        tags: request.tags ?? [],
        notes: request.notes,
        scoreHistory: [],
        physicianReviews: [],
        reviewStatus: 'PENDING',
        treatmentHistory: [],
        followUps: [],
        consentStatus: 'PENDING',
        version: 1,
        isDeleted: false,
        organizationId: context.principal.organizationId,
        createdAt: now,
        updatedAt: now,
      };

      // 6. Save entity
      await this.repository.save(entity);

      // 7. Publish domain event
      const event: DomainEvent = {
        eventType: 'osax.case.created',
        aggregateId: caseId,
        aggregateType: 'OsaxCase',
        aggregateVersion: 1,
        eventData: {
          caseId,
          caseNumber,
          subjectId: request.subjectId,
          subjectType: request.subjectType,
          priority: entity.priority,
          createdBy: context.principal.id,
          organizationId: context.principal.organizationId,
        },
        correlationId,
        causationId: null,
        actorId: context.principal.id,
        occurredAt: now,
      };

      await this.eventPublisher.publish(event);

      // 8. Record audit
      await this.recordAudit(context, 'CREATE', caseId, 'SUCCESS', {
        caseNumber,
        subjectId: request.subjectId,
        subjectType: request.subjectType,
      });

      // 9. Return success response
      return Ok({
        caseId,
        caseNumber,
        status: entity.status,
        createdAt: entity.createdAt,
      });

    } catch (error: unknown) {
      // Handle and audit unexpected errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.recordAudit(context, 'CREATE', 'UNKNOWN', 'FAILURE', {
        error: errorMessage,
        request,
      });

      // Re-throw domain errors
      if (error instanceof DomainError) {
        return Err(error);
      }

      // Wrap unexpected errors
      return Err(
        new DomainError(
          'osax.create_case_failed',
          `Failed to create case: ${errorMessage}`,
          { originalError: errorMessage },
          ErrorSeverity.HIGH,
          correlationId
        )
      );
    }
  }

  /**
   * Validate the create case request
   */
  private validateRequest(request: CreateCaseRequest): Result<void> {
    const errors: Record<string, string[]> = {};

    // Validate subject ID
    if (!request.subjectId || request.subjectId.trim().length === 0) {
      errors['subjectId'] = ['Subject ID is required'];
    } else if (request.subjectId.length > 100) {
      errors['subjectId'] = ['Subject ID must be 100 characters or less'];
    }

    // Validate subject type
    if (!request.subjectType) {
      errors['subjectType'] = ['Subject type is required'];
    } else if (!['lead', 'patient'].includes(request.subjectType)) {
      errors['subjectType'] = ['Subject type must be "lead" or "patient"'];
    }

    // Validate notes (if provided)
    if (request.notes && request.notes.length > 10000) {
      errors['notes'] = ['Notes must be 10000 characters or less'];
    }

    // Validate priority (if provided)
    if (request.priority && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(request.priority)) {
      errors['priority'] = ['Priority must be LOW, NORMAL, HIGH, or URGENT'];
    }

    // Validate tags (if provided)
    if (request.tags) {
      if (!Array.isArray(request.tags)) {
        errors['tags'] = ['Tags must be an array'];
      } else if (request.tags.length > 20) {
        errors['tags'] = ['Maximum 20 tags allowed'];
      } else {
        const invalidTags = request.tags.filter(t => typeof t !== 'string' || t.length > 50);
        if (invalidTags.length > 0) {
          errors['tags'] = ['Each tag must be a string of 50 characters or less'];
        }
      }
    }

    // Return validation result
    if (Object.keys(errors).length > 0) {
      return Err(
        DomainError.validation('Validation failed', errors)
      );
    }

    return Ok(undefined);
  }

  /**
   * Generate a human-readable case number
   */
  private generateCaseNumber(year: number, sequence: number): string {
    const paddedSeq = sequence.toString().padStart(5, '0');
    return `OSAX-${year}-${paddedSeq}`;
  }

  /**
   * Record an audit entry
   */
  private async recordAudit(
    context: SecurityContext,
    action: string,
    resourceId: string,
    result: 'SUCCESS' | 'FAILURE' | 'DENIED',
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      const auditEntry = context.createAuditEntry(
        action,
        'OsaxCase',
        resourceId,
        result,
        details
      );
      await this.auditService.record(auditEntry);
    } catch (error) {
      // Log but don't fail the operation if audit recording fails
      logger.error({ error, action, resourceId }, 'Failed to record audit entry');
    }
  }
}
