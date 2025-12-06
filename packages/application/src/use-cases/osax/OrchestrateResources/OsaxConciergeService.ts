/**
 * @fileoverview OsaxConciergeService - Application Service for Resource Orchestration
 *
 * Orchestrates the resource management workflow using hexagonal architecture ports.
 * Implements the "War Room" resource orchestration pattern for surgical planning.
 *
 * @module core/services/osax/osax-concierge-service
 *
 * DESIGN PRINCIPLES:
 * 1. ORCHESTRATION ONLY - No business logic, delegates to domain
 * 2. PORT INJECTION - All infrastructure via constructor injection
 * 3. EVENT EMISSION - All state changes produce domain events
 * 4. DDD COMPLIANT - Business rules in domain, orchestration here
 *
 * BUSINESS RULE:
 * IF riskClass == GREEN AND probability >= 0.65
 *   THEN soft-hold resources
 */

import type {
  ResourceSchedulerPort,
  SoftHoldOptions,
  AvailabilityResult,
  DateRange,
} from '@medicalcor/core/ports/osax/ResourceSchedulerPort.js';
import type {
  ResourceBlock,
  ResourceType,
  ImagingFindings,
  FinancialPrediction,
} from '@medicalcor/domain/osax';
import type { EventPublisher } from '../../../ports/secondary/messaging/EventPublisher.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum probability threshold for automatic resource soft-hold
 */
const PROBABILITY_THRESHOLD = 0.65;

/**
 * Risk class required for automatic resource soft-hold
 */
const REQUIRED_RISK_CLASS = 'GREEN';

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * OsaxConciergeService - Application service for resource orchestration
 *
 * This service implements the "War Room" resource orchestration pattern:
 * - Evaluates case eligibility based on imaging and financial analysis
 * - Soft-holds surgical resources for eligible cases
 * - Manages resource lifecycle (hold, confirm, release)
 *
 * @example
 * ```typescript
 * const service = new OsaxConciergeService(resourcePort, eventPublisher);
 *
 * const blocks = await service.orchestrateResources({
 *   caseId: 'case-123',
 *   imagingFindings: findings,
 *   financialPrediction: prediction,
 *   requiredResources: ['OR_TIME', 'SURGICAL_KIT', 'SPECIALIST'],
 *   durationMinutes: 90,
 * });
 *
 * console.log(`Soft-held ${blocks.length} resources`);
 * ```
 */
export class OsaxConciergeService {
  constructor(
    private readonly resourcePort: ResourceSchedulerPort,
    private readonly eventPublisher: EventPublisher
  ) {}

  /**
   * Orchestrate resources based on case assessment
   *
   * Business Rule:
   * IF riskClass == GREEN AND probability >= 0.65
   *   THEN soft-hold resources
   *
   * TODO: Add OpenTelemetry span: osax.concierge.orchestrate
   *
   * @param input - Orchestration request input
   * @returns Array of created resource blocks (empty if not eligible)
   */
  public async orchestrateResources(input: OrchestrateResourcesInput): Promise<ResourceBlock[]> {
    // 1. Validate input
    this.validateInput(input);

    // 2. Check eligibility based on business rules
    const eligibility = this.evaluateEligibility(input.imagingFindings, input.financialPrediction);

    if (!eligibility.eligible) {
      // Not eligible for auto-hold, return empty array
      return [];
    }

    // 3. Soft-hold resources via port
    // TODO: Add OpenTelemetry span: osax.resources.softHold
    const blocks = await this.resourcePort.softHoldResources(
      input.caseId,
      input.requiredResources,
      input.durationMinutes,
      input.options
    );

    // 4. Emit domain event
    await this.emitResourcesSoftHeldEvent(input.caseId, blocks, input.correlationId);

    return blocks;
  }

  /**
   * Confirm soft-held resources with scheduled time
   *
   * @param caseId - Case identifier for event emission
   * @param blockIds - Resource block IDs to confirm
   * @param scheduledStart - Confirmed start time
   * @param correlationId - Optional correlation ID
   */
  public async confirmResources(
    caseId: string,
    blockIds: string[],
    scheduledStart: Date,
    correlationId?: string
  ): Promise<ResourceBlock[]> {
    // TODO: Add OpenTelemetry span: osax.resources.confirm
    const blocks = await this.resourcePort.confirmResources(blockIds, scheduledStart);

    // Emit confirmation event
    await this.emitResourcesConfirmedEvent(caseId, blocks, correlationId);

    return blocks;
  }

  /**
   * Release resources
   *
   * @param caseId - Case identifier for event emission
   * @param blockIds - Resource block IDs to release
   * @param reason - Optional reason for release
   * @param correlationId - Optional correlation ID
   */
  public async releaseResources(
    caseId: string,
    blockIds: string[],
    reason?: string,
    correlationId?: string
  ): Promise<void> {
    // TODO: Add OpenTelemetry span: osax.resources.release
    await this.resourcePort.releaseResources(blockIds, reason);

    // Emit release event
    await this.emitResourcesReleasedEvent(caseId, blockIds, reason, correlationId);
  }

  /**
   * Check resource availability for scheduling
   */
  public async checkAvailability(
    resources: ResourceType[],
    dateRange: DateRange
  ): Promise<AvailabilityResult> {
    return this.resourcePort.checkAvailability(resources, dateRange);
  }

  /**
   * Get active resource blocks for a case
   */
  public async getBlocksForCase(caseId: string): Promise<ResourceBlock[]> {
    return this.resourcePort.getBlocksForCase(caseId);
  }

  /**
   * Check if resource orchestration is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const health = await this.resourcePort.healthCheck();
      return health.available;
    } catch {
      return false;
    }
  }

  /**
   * Evaluate eligibility for automatic resource soft-hold
   *
   * Business Rule:
   * - Imaging risk class must be GREEN
   * - Financial probability must be >= 0.65
   *
   * @param findings - Imaging analysis findings
   * @param prediction - Financial prediction
   * @returns Eligibility result with reason
   */
  public evaluateEligibility(
    findings: ImagingFindings,
    prediction: FinancialPrediction
  ): EligibilityResult {
    const reasons: string[] = [];

    // Check imaging risk class
    const riskClass = findings.getHighestRiskClass();
    const isRiskClassEligible = riskClass === REQUIRED_RISK_CLASS;

    if (!isRiskClassEligible) {
      reasons.push(`Risk class is ${riskClass}, requires ${REQUIRED_RISK_CLASS}`);
    }

    // Check financial probability
    const isProbabilityEligible = prediction.probability >= PROBABILITY_THRESHOLD;

    if (!isProbabilityEligible) {
      reasons.push(
        `Probability is ${(prediction.probability * 100).toFixed(1)}%, requires >= ${PROBABILITY_THRESHOLD * 100}%`
      );
    }

    const eligible = isRiskClassEligible && isProbabilityEligible;

    return {
      eligible,
      riskClass,
      probability: prediction.probability,
      reasons: reasons.length > 0 ? reasons : undefined,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Validate orchestration input
   */
  private validateInput(input: OrchestrateResourcesInput): void {
    if (!input.caseId || typeof input.caseId !== 'string') {
      throw new ConciergeServiceError('INVALID_INPUT', 'caseId is required');
    }

    // imagingFindings and financialPrediction are required by TypeScript interface
    // No runtime check needed as the compiler enforces these

    if (!Array.isArray(input.requiredResources) || input.requiredResources.length === 0) {
      throw new ConciergeServiceError(
        'INVALID_INPUT',
        'requiredResources must be a non-empty array'
      );
    }

    if (
      typeof input.durationMinutes !== 'number' ||
      input.durationMinutes <= 0 ||
      input.durationMinutes > 480
    ) {
      throw new ConciergeServiceError('INVALID_INPUT', 'durationMinutes must be between 1 and 480');
    }
  }

  /**
   * Emit osax.case.resources_soft_held domain event
   */
  private async emitResourcesSoftHeldEvent(
    caseId: string,
    blocks: ResourceBlock[],
    correlationId?: string
  ): Promise<void> {
    const event = {
      eventType: 'osax.case.resources_soft_held',
      aggregateId: caseId,
      aggregateType: 'OsaxCase',
      aggregateVersion: 1,
      eventData: {
        caseId,
        resourceBlocks: blocks.map((b) => ({
          blockId: b.id,
          resourceType: b.resourceType,
          durationMinutes: b.durationMinutes,
          expiresAt: b.expiresAt.toISOString(),
        })),
        totalDurationMinutes: blocks.reduce((sum, b) => Math.max(sum, b.durationMinutes), 0),
        createdAt: new Date().toISOString(),
      },
      correlationId: correlationId ?? caseId,
      causationId: null,
      actorId: 'system:osax-concierge-service',
      occurredAt: new Date(),
    };

    await this.eventPublisher.publish(event);
  }

  /**
   * Emit osax.case.resources_confirmed domain event
   */
  private async emitResourcesConfirmedEvent(
    caseId: string,
    blocks: ResourceBlock[],
    correlationId?: string
  ): Promise<void> {
    const event = {
      eventType: 'osax.case.resources_confirmed',
      aggregateId: caseId,
      aggregateType: 'OsaxCase',
      aggregateVersion: 1,
      eventData: {
        caseId,
        resourceBlocks: blocks.map((b) => ({
          blockId: b.id,
          resourceType: b.resourceType,
          scheduledStart: b.scheduledStart?.toISOString(),
          durationMinutes: b.durationMinutes,
        })),
        confirmedAt: new Date().toISOString(),
      },
      correlationId: correlationId ?? caseId,
      causationId: null,
      actorId: 'system:osax-concierge-service',
      occurredAt: new Date(),
    };

    await this.eventPublisher.publish(event);
  }

  /**
   * Emit osax.case.resources_released domain event
   */
  private async emitResourcesReleasedEvent(
    caseId: string,
    blockIds: string[],
    reason?: string,
    correlationId?: string
  ): Promise<void> {
    const event = {
      eventType: 'osax.case.resources_released',
      aggregateId: caseId,
      aggregateType: 'OsaxCase',
      aggregateVersion: 1,
      eventData: {
        caseId,
        blockIds,
        reason,
        releasedAt: new Date().toISOString(),
      },
      correlationId: correlationId ?? caseId,
      causationId: null,
      actorId: 'system:osax-concierge-service',
      occurredAt: new Date(),
    };

    await this.eventPublisher.publish(event);
  }
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for resource orchestration request
 */
export interface OrchestrateResourcesInput {
  /**
   * Associated case ID
   */
  readonly caseId: string;

  /**
   * Imaging analysis findings
   */
  readonly imagingFindings: ImagingFindings;

  /**
   * Financial prediction
   */
  readonly financialPrediction: FinancialPrediction;

  /**
   * Resources to soft-hold
   */
  readonly requiredResources: ResourceType[];

  /**
   * Requested procedure duration in minutes
   */
  readonly durationMinutes: number;

  /**
   * Optional scheduling preferences
   */
  readonly options?: SoftHoldOptions;

  /**
   * Correlation ID for distributed tracing
   */
  readonly correlationId?: string;
}

/**
 * Eligibility evaluation result
 */
export interface EligibilityResult {
  /**
   * Whether case is eligible for automatic resource soft-hold
   */
  readonly eligible: boolean;

  /**
   * Imaging risk class
   */
  readonly riskClass: string;

  /**
   * Financial probability
   */
  readonly probability: number;

  /**
   * Reasons for ineligibility (if not eligible)
   */
  readonly reasons?: readonly string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for concierge service
 */
export type ConciergeServiceErrorCode =
  | 'INVALID_INPUT'
  | 'SCHEDULING_ERROR'
  | 'EVENT_PUBLISH_ERROR';

/**
 * Error thrown by concierge service
 */
export class ConciergeServiceError extends Error {
  public readonly code: ConciergeServiceErrorCode;

  constructor(code: ConciergeServiceErrorCode, message: string) {
    super(message);
    this.name = 'ConciergeServiceError';
    this.code = code;
    Object.setPrototypeOf(this, ConciergeServiceError.prototype);
  }
}
