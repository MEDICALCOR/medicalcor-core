/**
 * @fileoverview OsaxImagingService - Application Service for Imaging Analysis
 *
 * Orchestrates the imaging analysis workflow using hexagonal architecture ports.
 * This service coordinates between storage, AI analysis, and event publishing.
 *
 * @module core/services/osax/osax-imaging-service
 *
 * DESIGN PRINCIPLES:
 * 1. ORCHESTRATION ONLY - No business logic, delegates to domain
 * 2. PORT INJECTION - All infrastructure via constructor injection
 * 3. EVENT EMISSION - All state changes produce domain events
 * 4. SECURITY FIRST - Never log PHI or raw imaging data
 *
 * CLINICAL DISCLAIMER:
 * This system provides decision support tools only. All imaging analysis
 * results require verification by a qualified dental professional.
 */

import type {
  ImagingModelPort,
  ImagingAnalysisInput,
  PatientAgeGroup,
} from '../../ports/osax/ImagingModelPort.js';
import type { StoragePort } from '../../ports/osax/StoragePort.js';
import {
  ImagingFindings,
  type ImagingModality,
} from '@medicalcor/domain/osax/value-objects/ImagingFindings.js';
import type { EventPublisher } from '@medicalcor/application/ports/secondary/messaging/EventPublisher.js';

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * OsaxImagingService - Application service for imaging analysis orchestration
 *
 * This service orchestrates the complete imaging analysis workflow:
 * 1. Retrieve signed URL for secure image access
 * 2. Call AI imaging model via port
 * 3. Build ImagingFindings value object
 * 4. Emit osax.imaging.screened event
 *
 * @example
 * ```typescript
 * const service = new OsaxImagingService(
 *   imagingPort,
 *   storagePort,
 *   eventPublisher
 * );
 *
 * const findings = await service.analyzeImaging({
 *   caseId: 'case-123',
 *   imagePath: 'imaging/cbct/patient-456.dcm',
 *   modality: 'CBCT',
 * });
 *
 * console.log(findings.getClinicalSummary());
 * ```
 */
export class OsaxImagingService {
  constructor(
    private readonly imagingPort: ImagingModelPort,
    private readonly storagePort: StoragePort,
    private readonly eventPublisher: EventPublisher
  ) {}

  /**
   * Analyze imaging for a case
   *
   * SECURITY: Never log PHI or raw imaging data
   * TODO: Add OpenTelemetry span: osax.imaging.analyze
   *
   * @param input - Analysis request input
   * @returns ImagingFindings value object with analysis results
   */
  public async analyzeImaging(input: AnalyzeImagingInput): Promise<ImagingFindings> {
    // SECURITY: never log PHI or raw imaging data
    // Only log case ID and modality for tracing

    // 1. Validate input
    this.validateInput(input);

    // 2. Get signed URL for secure image access (short TTL)
    // TODO: Add OpenTelemetry span: osax.storage.signUrl
    const signedUrl = await this.storagePort.getSignedUrl(
      input.imagePath,
      300 // 5 minutes TTL
    );

    // 3. Build analysis input for AI model
    const analysisInput: ImagingAnalysisInput = {
      imageRef: signedUrl,
      modality: input.modality,
      patientAgeGroup: input.patientAgeGroup,
      analysisScope: input.analysisScope,
      correlationId: input.correlationId,
    };

    // 4. Call imaging model port for analysis
    // TODO: Add OpenTelemetry span: osax.imaging.model.call
    const regionFindings = await this.imagingPort.analyzeImaging(analysisInput);

    // 5. Build ImagingFindings value object
    const modelHealth = await this.imagingPort.healthCheck();
    const findings = ImagingFindings.create({
      findings: regionFindings,
      modality: input.modality,
      algorithmVersion: modelHealth.modelVersion ?? 'unknown',
      analyzedAt: new Date(),
    });

    // 6. Emit domain event
    await this.emitImagingScreenedEvent(input.caseId, findings, input.correlationId);

    return findings;
  }

  /**
   * Check if imaging analysis is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const [imagingHealth, storageHealth] = await Promise.all([
        this.imagingPort.healthCheck(),
        this.storagePort.healthCheck(),
      ]);
      return imagingHealth.available && storageHealth.available;
    } catch {
      return false;
    }
  }

  /**
   * Get supported imaging modalities
   */
  public getSupportedModalities(): ImagingModality[] {
    return this.imagingPort.getSupportedModalities();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Validate analysis input
   */
  private validateInput(input: AnalyzeImagingInput): void {
    if (!input.caseId || typeof input.caseId !== 'string') {
      throw new ImagingServiceError('INVALID_INPUT', 'caseId is required');
    }

    if (!input.imagePath || typeof input.imagePath !== 'string') {
      throw new ImagingServiceError('INVALID_INPUT', 'imagePath is required');
    }

    const validModalities: ImagingModality[] = [
      'CBCT',
      'PANORAMIC',
      'PERIAPICAL',
      'INTRAORAL_SCAN',
      'CEPHALOMETRIC',
    ];
    if (!validModalities.includes(input.modality)) {
      throw new ImagingServiceError('INVALID_INPUT', `Invalid modality: ${input.modality}`);
    }
  }

  /**
   * Emit osax.imaging.screened domain event
   *
   * SECURITY: Event payload contains only aggregate metrics, not detailed findings or PHI
   */
  private async emitImagingScreenedEvent(
    caseId: string,
    findings: ImagingFindings,
    correlationId?: string
  ): Promise<void> {
    const event = {
      eventType: 'osax.imaging.screened',
      aggregateId: caseId,
      aggregateType: 'OsaxCase',
      aggregateVersion: 1,
      eventData: {
        caseId,
        modality: findings.modality,
        findingsCount: findings.findings.length,
        overallConfidence: findings.overallConfidence,
        hasHighRiskFindings: findings.hasHighRiskFindings(),
        requiresReview: findings.requiresSpecialistReview(),
        highestRiskClass: findings.getHighestRiskClass(),
        analyzedAt: findings.analyzedAt.toISOString(),
        algorithmVersion: findings.algorithmVersion,
        // SECURITY: No raw findings or PHI in event
      },
      correlationId: correlationId ?? caseId,
      causationId: null,
      actorId: 'system:osax-imaging-service',
      occurredAt: new Date(),
    };

    await this.eventPublisher.publish(event);
  }
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for imaging analysis request
 */
export interface AnalyzeImagingInput {
  /**
   * Associated case ID
   */
  readonly caseId: string;

  /**
   * Storage path to the imaging file
   */
  readonly imagePath: string;

  /**
   * Imaging modality type
   */
  readonly modality: ImagingModality;

  /**
   * Patient age group for adjusted analysis
   */
  readonly patientAgeGroup?: PatientAgeGroup;

  /**
   * Specific regions to analyze
   */
  readonly analysisScope?: readonly string[];

  /**
   * Correlation ID for distributed tracing
   */
  readonly correlationId?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for imaging service
 */
export type ImagingServiceErrorCode =
  | 'INVALID_INPUT'
  | 'STORAGE_ERROR'
  | 'ANALYSIS_ERROR'
  | 'EVENT_PUBLISH_ERROR';

/**
 * Error thrown by imaging service
 */
export class ImagingServiceError extends Error {
  public readonly code: ImagingServiceErrorCode;

  constructor(code: ImagingServiceErrorCode, message: string) {
    super(message);
    this.name = 'ImagingServiceError';
    this.code = code;
    Object.setPrototypeOf(this, ImagingServiceError.prototype);
  }
}
