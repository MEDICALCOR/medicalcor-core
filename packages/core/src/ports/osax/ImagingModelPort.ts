/**
 * @fileoverview ImagingModelPort - Outbound Port for AI Imaging Analysis
 *
 * Hexagonal Architecture SECONDARY PORT for dental imaging AI analysis.
 * This port abstracts away the AI model infrastructure (OpenAI Vision, Google Cloud Vision, etc.).
 *
 * @module core/ports/osax/imaging-model-port
 *
 * HEXAGONAL ARCHITECTURE:
 * - Port defined in Core layer
 * - Adapters implement this interface in Infrastructure layer
 * - Domain services depend on this port, not concrete implementations
 *
 * SECURITY:
 * - NEVER log PHI or raw imaging data
 * - Use signed URLs with short TTL for image access
 * - All imaging data encrypted in transit (TLS 1.3)
 */

import type { RegionFinding, ImagingModality } from '@medicalcor/domain/osax';

// ============================================================================
// PORT INTERFACE
// ============================================================================

/**
 * ImagingModelPort - Outbound port for AI-powered imaging analysis
 *
 * This interface defines how the application interacts with AI imaging
 * analysis services. Infrastructure adapters implement this for specific
 * AI providers (OpenAI Vision, Google Cloud Vision, Ultralytics, etc.).
 *
 * @example
 * ```typescript
 * // OpenAI Vision Adapter implementing this port
 * class OpenAIVisionAdapter implements ImagingModelPort {
 *   readonly portName = 'imaging-model';
 *   readonly portType = 'outbound';
 *
 *   async analyzeImaging(input: ImagingAnalysisInput): Promise<RegionFinding[]> {
 *     // SECURITY: never log PHI or raw imaging data
 *     const response = await this.openai.chat.completions.create({
 *       model: 'gpt-4-vision-preview',
 *       messages: [{ role: 'user', content: [...] }],
 *     });
 *     return this.parseFindings(response);
 *   }
 * }
 * ```
 */
export interface ImagingModelPort {
  /**
   * Port identifier
   */
  readonly portName: 'imaging-model';

  /**
   * Port type (outbound = driven)
   */
  readonly portType: 'outbound';

  /**
   * Analyze dental imaging and return findings
   *
   * @param input - Analysis input with image reference
   * @returns Array of anatomical region findings
   *
   * SECURITY: Never log PHI or raw imaging data
   * TODO: Add OpenTelemetry span: osax.imaging.analyze
   */
  analyzeImaging(input: ImagingAnalysisInput): Promise<RegionFinding[]>;

  /**
   * Check model availability and health
   *
   * @returns Health status with availability and latency
   */
  healthCheck(): Promise<ImagingModelHealth>;

  /**
   * Get supported modalities for this adapter
   *
   * @returns Array of supported imaging modalities
   */
  getSupportedModalities(): ImagingModality[];
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for imaging analysis
 */
export interface ImagingAnalysisInput {
  /**
   * Image reference (signed URL or storage path)
   * SECURITY: Never pass raw image data, always use references
   */
  readonly imageRef: string;

  /**
   * Imaging modality type
   */
  readonly modality: ImagingModality;

  /**
   * Patient age group for adjusted analysis thresholds
   */
  readonly patientAgeGroup?: PatientAgeGroup;

  /**
   * Specific regions to analyze (optional, defaults to all)
   */
  readonly analysisScope?: readonly string[];

  /**
   * Analysis detail level
   */
  readonly detailLevel?: AnalysisDetailLevel;

  /**
   * Request correlation ID for tracing
   */
  readonly correlationId?: string;
}

/**
 * Patient age groups for adjusted analysis thresholds
 */
export type PatientAgeGroup = 'PEDIATRIC' | 'ADULT' | 'GERIATRIC';

/**
 * Analysis detail levels
 */
export type AnalysisDetailLevel = 'SCREENING' | 'STANDARD' | 'DETAILED';

/**
 * Health check response
 */
export interface ImagingModelHealth {
  /**
   * Whether the model is available
   */
  readonly available: boolean;

  /**
   * Current latency in milliseconds
   */
  readonly latencyMs: number;

  /**
   * Model version identifier
   */
  readonly modelVersion?: string;

  /**
   * Last successful call timestamp
   */
  readonly lastSuccessAt?: string;

  /**
   * Additional health details
   */
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for imaging analysis failures
 */
export type ImagingAnalysisErrorCode =
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_IMAGE_FORMAT'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_MODALITY'
  | 'ANALYSIS_TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/**
 * Error thrown by imaging analysis
 */
export class ImagingAnalysisError extends Error {
  public readonly code: ImagingAnalysisErrorCode;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ImagingAnalysisErrorCode,
    message: string,
    retryable = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ImagingAnalysisError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    Object.setPrototypeOf(this, ImagingAnalysisError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for ImagingModelPort
 */
export function isImagingModelPort(value: unknown): value is ImagingModelPort {
  return (
    typeof value === 'object' &&
    value !== null &&
    'portName' in value &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (value as ImagingModelPort).portName === 'imaging-model' &&
    'analyzeImaging' in value &&
    typeof (value as ImagingModelPort).analyzeImaging === 'function'
  );
}
