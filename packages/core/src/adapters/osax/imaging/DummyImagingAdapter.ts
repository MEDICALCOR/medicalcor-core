/**
 * @fileoverview DummyImagingAdapter - Stub Adapter for Development/Testing
 *
 * Returns mock imaging analysis findings for development and testing.
 * Not for production use.
 *
 * @module core/adapters/osax/imaging/dummy-imaging-adapter
 *
 * TODO: Integrate with AI Gateway (OpenAI Vision / Google Cloud Vision / Ultralytics)
 */

import type {
  ImagingModelPort,
  ImagingAnalysisInput,
  ImagingModelHealth,
} from '../../../ports/osax/ImagingModelPort.js';
import type {
  RegionFinding,
  ImagingModality,
} from '@medicalcor/domain/osax/value-objects/ImagingFindings.js';

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * DummyImagingAdapter - Stub adapter for development/testing
 *
 * Returns mock imaging analysis findings. Use for:
 * - Local development without AI API access
 * - Unit testing service layer
 * - Integration testing without external dependencies
 *
 * @example
 * ```typescript
 * const adapter = new DummyImagingAdapter();
 * const findings = await adapter.analyzeImaging({
 *   imageRef: 'mock://test-image.dcm',
 *   modality: 'CBCT',
 * });
 * // Returns deterministic mock findings
 * ```
 *
 * TODO: Integrate with AI Gateway (OpenAI Vision / Google Cloud Vision / Ultralytics)
 */
export class DummyImagingAdapter implements ImagingModelPort {
  public readonly portName = 'imaging-model' as const;
  public readonly portType = 'outbound' as const;

  /**
   * Simulated latency in milliseconds
   */
  private readonly simulatedLatencyMs: number;

  /**
   * Default risk class for mock findings
   */
  private readonly defaultRiskClass: 'GREEN' | 'YELLOW' | 'RED';

  constructor(options?: DummyImagingAdapterOptions) {
    this.simulatedLatencyMs = options?.simulatedLatencyMs ?? 100;
    this.defaultRiskClass = options?.defaultRiskClass ?? 'GREEN';
  }

  /**
   * Return mock imaging analysis findings
   *
   * SECURITY: Never log PHI or raw imaging data
   * This is a stub - actual implementation should call AI Gateway
   *
   * TODO: Integrate with AI Gateway (OpenAI Vision / Google Cloud Vision / Ultralytics)
   */
  public async analyzeImaging(input: ImagingAnalysisInput): Promise<RegionFinding[]> {
    // Simulate API latency
    await this.delay(this.simulatedLatencyMs);

    // SECURITY: never log PHI or raw imaging data
    // Generate deterministic mock findings based on modality
    return this.generateMockFindings(input.modality);
  }

  /**
   * Return mock health check
   */
  public async healthCheck(): Promise<ImagingModelHealth> {
    await this.delay(10);

    return {
      available: true,
      latencyMs: this.simulatedLatencyMs,
      modelVersion: 'dummy-v1.0.0',
      lastSuccessAt: new Date().toISOString(),
      details: {
        type: 'stub',
        note: 'This is a development stub adapter',
      },
    };
  }

  /**
   * Return supported modalities
   */
  public getSupportedModalities(): ImagingModality[] {
    return ['CBCT', 'PANORAMIC', 'PERIAPICAL', 'INTRAORAL_SCAN', 'CEPHALOMETRIC'];
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate mock findings based on modality
   */
  private generateMockFindings(modality: ImagingModality): RegionFinding[] {
    const findingsByModality: Record<ImagingModality, RegionFinding[]> = {
      CBCT: [
        {
          regionId: 'mandible-36',
          regionName: 'Lower Left First Molar Area',
          findingType: 'IMPLANT_SITE_SUITABLE',
          confidence: 0.92,
          riskClass: this.defaultRiskClass,
          notes: 'Adequate bone density observed',
          boundingBox: { x: 0.3, y: 0.5, width: 0.1, height: 0.15 },
        },
        {
          regionId: 'mandible-canal',
          regionName: 'Inferior Alveolar Canal',
          findingType: 'NERVE_PROXIMITY',
          confidence: 0.88,
          riskClass: 'YELLOW',
          notes: 'Canal proximity requires attention during planning',
        },
      ],
      PANORAMIC: [
        {
          regionId: 'pan-overview',
          regionName: 'Full Arch Overview',
          findingType: 'BONE_DENSITY_ADEQUATE',
          confidence: 0.85,
          riskClass: this.defaultRiskClass,
        },
        {
          regionId: 'sinus-r',
          regionName: 'Right Maxillary Sinus',
          findingType: 'SINUS_PROXIMITY',
          confidence: 0.78,
          riskClass: 'YELLOW',
        },
      ],
      PERIAPICAL: [
        {
          regionId: 'periap-focus',
          regionName: 'Periapical Region',
          findingType: 'BONE_DENSITY_ADEQUATE',
          confidence: 0.9,
          riskClass: this.defaultRiskClass,
        },
      ],
      INTRAORAL_SCAN: [
        {
          regionId: 'ios-arch',
          regionName: 'Scanned Arch',
          findingType: 'IMPLANT_SITE_SUITABLE',
          confidence: 0.87,
          riskClass: this.defaultRiskClass,
        },
      ],
      CEPHALOMETRIC: [
        {
          regionId: 'ceph-profile',
          regionName: 'Facial Profile Analysis',
          findingType: 'ANATOMICAL_VARIATION',
          confidence: 0.82,
          riskClass: this.defaultRiskClass,
        },
      ],
    };

    return findingsByModality[modality] || [];
  }

  /**
   * Promise-based delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Options for DummyImagingAdapter
 */
export interface DummyImagingAdapterOptions {
  /**
   * Simulated API latency in milliseconds
   */
  readonly simulatedLatencyMs?: number;

  /**
   * Default risk class for generated findings
   */
  readonly defaultRiskClass?: 'GREEN' | 'YELLOW' | 'RED';
}
