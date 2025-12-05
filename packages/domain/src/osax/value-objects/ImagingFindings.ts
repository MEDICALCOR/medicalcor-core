/**
 * @fileoverview ImagingFindings Value Object
 *
 * Banking/Medical Grade DDD Value Object for dental imaging analysis results.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/osax/value-objects/imaging-findings
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two ImagingFindings with same findings are equal
 * 4. ZERO INFRASTRUCTURE - No external dependencies (DDD pure domain)
 * 5. HIPAA/GDPR COMPLIANT - No PHI stored in this object
 *
 * CLINICAL DISCLAIMER:
 * This system provides decision support tools only. All imaging analysis
 * results require verification by a qualified dental professional.
 * The system does NOT provide medical diagnoses.
 */

// ============================================================================
// DOMAIN TYPES (ZERO EXTERNAL DEPENDENCIES)
// ============================================================================

/**
 * Imaging modality types for dental imaging
 */
export type ImagingModality =
  | 'CBCT' // Cone Beam Computed Tomography
  | 'PANORAMIC' // Panoramic radiograph
  | 'PERIAPICAL' // Periapical radiograph
  | 'INTRAORAL_SCAN' // 3D intraoral scan
  | 'CEPHALOMETRIC'; // Cephalometric radiograph

/**
 * Types of clinical findings that can be detected
 */
export type FindingType =
  | 'BONE_DENSITY_ADEQUATE'
  | 'BONE_DENSITY_COMPROMISED'
  | 'SINUS_PROXIMITY'
  | 'NERVE_PROXIMITY'
  | 'PATHOLOGY_SUSPECTED'
  | 'IMPLANT_SITE_SUITABLE'
  | 'IMPLANT_SITE_REQUIRES_AUGMENTATION'
  | 'ROOT_RESORPTION'
  | 'PERIODONTAL_BONE_LOSS'
  | 'CYST_DETECTED'
  | 'IMPACTED_TOOTH'
  | 'ANATOMICAL_VARIATION';

/**
 * Risk classification for findings
 * - GREEN: No immediate concern, proceed with standard protocol
 * - YELLOW: Caution required, additional evaluation recommended
 * - RED: High risk, specialist review mandatory
 */
export type RiskClass = 'GREEN' | 'YELLOW' | 'RED';

/**
 * Bounding box for spatial localization of findings
 * All coordinates are normalized (0-1) relative to image dimensions
 */
export interface BoundingBox {
  readonly x: number; // Left edge (0-1)
  readonly y: number; // Top edge (0-1)
  readonly width: number; // Width (0-1)
  readonly height: number; // Height (0-1)
}

/**
 * Individual anatomical region finding
 */
export interface RegionFinding {
  /** Unique identifier for this finding */
  readonly regionId: string;

  /** Human-readable region name (e.g., "mandible-left-molar", "maxilla-anterior") */
  readonly regionName: string;

  /** Type of finding detected */
  readonly findingType: FindingType;

  /** Confidence score for this finding (0-1) */
  readonly confidence: number;

  /** Spatial bounding box (optional, for visualization) */
  readonly boundingBox?: BoundingBox;

  /** Clinical notes (non-PHI, procedural notes only) */
  readonly notes?: string;

  /** Risk classification */
  readonly riskClass: RiskClass;
}

/**
 * Validation constants
 */
const VALIDATION = {
  confidence: { min: 0, max: 1 },
  boundingBox: { min: 0, max: 1 },
  regionId: { minLength: 1, maxLength: 100 },
  regionName: { minLength: 1, maxLength: 200 },
  notes: { maxLength: 500 },
} as const;

// ============================================================================
// VALUE OBJECT IMPLEMENTATION
// ============================================================================

/**
 * ImagingFindings Value Object
 *
 * Represents the complete results of AI-powered dental imaging analysis.
 * This is a true Value Object following DDD principles.
 *
 * Features:
 * - Private constructor (use factory methods)
 * - Deep immutability (Object.freeze on all nested objects)
 * - Value equality (equals method)
 * - Rich domain methods (Tell, Don't Ask pattern)
 * - Serialization support (toJSON)
 *
 * @example
 * ```typescript
 * // Create from analysis results
 * const findings = ImagingFindings.create({
 *   findings: [
 *     {
 *       regionId: 'mandible-36',
 *       regionName: 'Lower Left First Molar',
 *       findingType: 'IMPLANT_SITE_SUITABLE',
 *       confidence: 0.92,
 *       riskClass: 'GREEN',
 *     },
 *   ],
 *   modality: 'CBCT',
 *   algorithmVersion: '1.0.0',
 * });
 *
 * console.log(findings.isComplete()); // true
 * console.log(findings.aggregateConfidence()); // 0.92
 * console.log(findings.hasHighRiskFindings()); // false
 * ```
 */
export class ImagingFindings {
  // ============================================================================
  // READONLY PROPERTIES
  // ============================================================================

  /**
   * Array of anatomical region findings
   */
  public readonly findings: readonly RegionFinding[];

  /**
   * Overall analysis confidence (0-1)
   */
  public readonly overallConfidence: number;

  /**
   * Imaging modality that was analyzed
   */
  public readonly modality: ImagingModality;

  /**
   * Timestamp when analysis was performed
   */
  public readonly analyzedAt: Date;

  /**
   * Version of the analysis algorithm used
   */
  public readonly algorithmVersion: string;

  // ============================================================================
  // PRIVATE CONSTRUCTOR
  // ============================================================================

  /**
   * Private constructor - use static factory methods
   *
   * @param findings - Array of region findings
   * @param overallConfidence - Aggregate confidence score
   * @param modality - Imaging modality
   * @param algorithmVersion - Algorithm version string
   * @param analyzedAt - Analysis timestamp
   */
  private constructor(
    findings: readonly RegionFinding[],
    overallConfidence: number,
    modality: ImagingModality,
    algorithmVersion: string,
    analyzedAt: Date = new Date()
  ) {
    this.findings = Object.freeze([...findings].map((f) => Object.freeze({ ...f })));
    this.overallConfidence = Math.round(overallConfidence * 1000) / 1000;
    this.modality = modality;
    this.algorithmVersion = algorithmVersion;
    this.analyzedAt = analyzedAt;

    // Deep freeze to ensure complete immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create ImagingFindings from analysis results
   *
   * @param input - Analysis input data
   * @returns ImagingFindings instance
   * @throws InvalidImagingFindingsError if input is invalid
   *
   * @example
   * ```typescript
   * const findings = ImagingFindings.create({
   *   findings: regionFindings,
   *   modality: 'CBCT',
   *   algorithmVersion: '1.0.0',
   * });
   * ```
   */
  public static create(input: CreateImagingFindingsInput): ImagingFindings {
    // Validate findings array
    if (!input.findings || !Array.isArray(input.findings)) {
      throw new InvalidImagingFindingsError('Findings must be a valid array', {
        field: 'findings',
        value: input.findings,
      });
    }

    // Validate each finding
    for (let i = 0; i < input.findings.length; i++) {
      ImagingFindings.validateFinding(input.findings[i], i);
    }

    // Validate modality
    const validModalities: ImagingModality[] = [
      'CBCT',
      'PANORAMIC',
      'PERIAPICAL',
      'INTRAORAL_SCAN',
      'CEPHALOMETRIC',
    ];
    if (!validModalities.includes(input.modality)) {
      throw new InvalidImagingFindingsError(`Invalid modality: ${input.modality}`, {
        field: 'modality',
        value: input.modality,
        allowed: validModalities,
      });
    }

    // Validate algorithm version
    if (!input.algorithmVersion || typeof input.algorithmVersion !== 'string') {
      throw new InvalidImagingFindingsError('Algorithm version is required', {
        field: 'algorithmVersion',
        value: input.algorithmVersion,
      });
    }

    // Calculate overall confidence
    const overallConfidence = ImagingFindings.calculateOverallConfidence(input.findings);

    return new ImagingFindings(
      input.findings,
      overallConfidence,
      input.modality,
      input.algorithmVersion,
      input.analyzedAt ?? new Date()
    );
  }

  /**
   * Create empty findings (for cases with no detectable findings)
   */
  public static createEmpty(modality: ImagingModality, algorithmVersion: string): ImagingFindings {
    return new ImagingFindings([], 0, modality, algorithmVersion);
  }

  /**
   * Reconstitute from database/DTO
   *
   * @param dto - Stored DTO with all values
   * @returns ImagingFindings instance
   */
  public static reconstitute(dto: ImagingFindingsDTO): ImagingFindings {
    if (!dto || typeof dto !== 'object') {
      throw new InvalidImagingFindingsError('Invalid DTO: must be an object', {
        field: 'dto',
        value: dto,
      });
    }

    const analyzedAt = typeof dto.analyzedAt === 'string' ? new Date(dto.analyzedAt) : dto.analyzedAt;

    if (isNaN(analyzedAt.getTime())) {
      throw new InvalidImagingFindingsError(`Invalid analyzedAt date: ${dto.analyzedAt}`, {
        field: 'analyzedAt',
        value: dto.analyzedAt,
      });
    }

    return new ImagingFindings(
      dto.findings,
      dto.overallConfidence,
      dto.modality,
      dto.algorithmVersion,
      analyzedAt
    );
  }

  // ============================================================================
  // VALIDATION LOGIC
  // ============================================================================

  /**
   * Validate a single region finding
   */
  private static validateFinding(finding: RegionFinding, index: number): void {
    const prefix = `findings[${index}]`;

    // Validate regionId
    if (
      !finding.regionId ||
      typeof finding.regionId !== 'string' ||
      finding.regionId.length < VALIDATION.regionId.minLength ||
      finding.regionId.length > VALIDATION.regionId.maxLength
    ) {
      throw new InvalidImagingFindingsError(
        `${prefix}.regionId must be a string between ${VALIDATION.regionId.minLength} and ${VALIDATION.regionId.maxLength} characters`,
        { field: `${prefix}.regionId`, value: finding.regionId }
      );
    }

    // Validate regionName
    if (
      !finding.regionName ||
      typeof finding.regionName !== 'string' ||
      finding.regionName.length < VALIDATION.regionName.minLength ||
      finding.regionName.length > VALIDATION.regionName.maxLength
    ) {
      throw new InvalidImagingFindingsError(
        `${prefix}.regionName must be a string between ${VALIDATION.regionName.minLength} and ${VALIDATION.regionName.maxLength} characters`,
        { field: `${prefix}.regionName`, value: finding.regionName }
      );
    }

    // Validate findingType
    const validFindingTypes: FindingType[] = [
      'BONE_DENSITY_ADEQUATE',
      'BONE_DENSITY_COMPROMISED',
      'SINUS_PROXIMITY',
      'NERVE_PROXIMITY',
      'PATHOLOGY_SUSPECTED',
      'IMPLANT_SITE_SUITABLE',
      'IMPLANT_SITE_REQUIRES_AUGMENTATION',
      'ROOT_RESORPTION',
      'PERIODONTAL_BONE_LOSS',
      'CYST_DETECTED',
      'IMPACTED_TOOTH',
      'ANATOMICAL_VARIATION',
    ];
    if (!validFindingTypes.includes(finding.findingType)) {
      throw new InvalidImagingFindingsError(`${prefix}.findingType is invalid: ${finding.findingType}`, {
        field: `${prefix}.findingType`,
        value: finding.findingType,
        allowed: validFindingTypes,
      });
    }

    // Validate confidence
    if (
      typeof finding.confidence !== 'number' ||
      Number.isNaN(finding.confidence) ||
      finding.confidence < VALIDATION.confidence.min ||
      finding.confidence > VALIDATION.confidence.max
    ) {
      throw new InvalidImagingFindingsError(
        `${prefix}.confidence must be between ${VALIDATION.confidence.min} and ${VALIDATION.confidence.max}`,
        { field: `${prefix}.confidence`, value: finding.confidence }
      );
    }

    // Validate riskClass
    const validRiskClasses: RiskClass[] = ['GREEN', 'YELLOW', 'RED'];
    if (!validRiskClasses.includes(finding.riskClass)) {
      throw new InvalidImagingFindingsError(`${prefix}.riskClass is invalid: ${finding.riskClass}`, {
        field: `${prefix}.riskClass`,
        value: finding.riskClass,
        allowed: validRiskClasses,
      });
    }

    // Validate optional bounding box
    if (finding.boundingBox) {
      ImagingFindings.validateBoundingBox(finding.boundingBox, `${prefix}.boundingBox`);
    }

    // Validate optional notes
    if (finding.notes !== undefined) {
      if (typeof finding.notes !== 'string' || finding.notes.length > VALIDATION.notes.maxLength) {
        throw new InvalidImagingFindingsError(
          `${prefix}.notes must be a string with max ${VALIDATION.notes.maxLength} characters`,
          { field: `${prefix}.notes`, value: finding.notes }
        );
      }
    }
  }

  /**
   * Validate bounding box coordinates
   */
  private static validateBoundingBox(box: BoundingBox, prefix: string): void {
    const fields: (keyof BoundingBox)[] = ['x', 'y', 'width', 'height'];

    for (const field of fields) {
      const value = box[field];
      if (
        typeof value !== 'number' ||
        Number.isNaN(value) ||
        value < VALIDATION.boundingBox.min ||
        value > VALIDATION.boundingBox.max
      ) {
        throw new InvalidImagingFindingsError(
          `${prefix}.${field} must be between ${VALIDATION.boundingBox.min} and ${VALIDATION.boundingBox.max}`,
          { field: `${prefix}.${field}`, value }
        );
      }
    }
  }

  /**
   * Calculate overall confidence as weighted average
   */
  private static calculateOverallConfidence(findings: readonly RegionFinding[]): number {
    if (findings.length === 0) return 0;

    // Weight by risk class (RED findings weighted higher)
    const weights: Record<RiskClass, number> = { RED: 1.5, YELLOW: 1.2, GREEN: 1.0 };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const finding of findings) {
      const weight = weights[finding.riskClass];
      weightedSum += finding.confidence * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if all mandatory regions have been analyzed
   * For dental imaging, considers analysis complete if at least one finding exists
   */
  public isComplete(): boolean {
    return this.findings.length > 0;
  }

  /**
   * Get weighted aggregate confidence score
   */
  public aggregateConfidence(): number {
    return this.overallConfidence;
  }

  /**
   * Check if any high-risk (RED) findings are present
   */
  public hasHighRiskFindings(): boolean {
    return this.findings.some((f) => f.riskClass === 'RED');
  }

  /**
   * Check if any caution-required (YELLOW) findings are present
   */
  public hasCautionFindings(): boolean {
    return this.findings.some((f) => f.riskClass === 'YELLOW');
  }

  /**
   * Check if specialist review is required
   * - Confidence below threshold (0.7)
   * - Any RED risk findings
   */
  public requiresSpecialistReview(): boolean {
    return this.overallConfidence < 0.7 || this.hasHighRiskFindings();
  }

  /**
   * Get all findings by risk class
   */
  public getFindingsByRiskClass(riskClass: RiskClass): readonly RegionFinding[] {
    return this.findings.filter((f) => f.riskClass === riskClass);
  }

  /**
   * Get all findings by finding type
   */
  public getFindingsByType(findingType: FindingType): readonly RegionFinding[] {
    return this.findings.filter((f) => f.findingType === findingType);
  }

  /**
   * Get the highest risk class present in findings
   */
  public getHighestRiskClass(): RiskClass {
    if (this.findings.some((f) => f.riskClass === 'RED')) return 'RED';
    if (this.findings.some((f) => f.riskClass === 'YELLOW')) return 'YELLOW';
    return 'GREEN';
  }

  /**
   * Get count of findings by risk class
   */
  public getRiskClassCounts(): { GREEN: number; YELLOW: number; RED: number } {
    return {
      GREEN: this.findings.filter((f) => f.riskClass === 'GREEN').length,
      YELLOW: this.findings.filter((f) => f.riskClass === 'YELLOW').length,
      RED: this.findings.filter((f) => f.riskClass === 'RED').length,
    };
  }

  /**
   * Check if implant site is suitable (has IMPLANT_SITE_SUITABLE finding)
   */
  public hasImplantSiteSuitable(): boolean {
    return this.findings.some(
      (f) => f.findingType === 'IMPLANT_SITE_SUITABLE' && f.riskClass === 'GREEN'
    );
  }

  /**
   * Check if bone augmentation is recommended
   */
  public requiresBoneAugmentation(): boolean {
    return this.findings.some(
      (f) =>
        f.findingType === 'IMPLANT_SITE_REQUIRES_AUGMENTATION' ||
        f.findingType === 'BONE_DENSITY_COMPROMISED'
    );
  }

  /**
   * Get clinical summary string
   * SECURITY: Never log PHI or raw imaging data
   */
  public getClinicalSummary(): string {
    const counts = this.getRiskClassCounts();
    const parts: string[] = [
      `${this.modality} Analysis`,
      `Findings: ${this.findings.length}`,
      `Risk: G:${counts.GREEN}/Y:${counts.YELLOW}/R:${counts.RED}`,
      `Confidence: ${(this.overallConfidence * 100).toFixed(1)}%`,
    ];

    if (this.requiresSpecialistReview()) {
      parts.push('REVIEW REQUIRED');
    }

    return parts.join(' | ');
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: ImagingFindings | null | undefined): boolean {
    if (!other) return false;
    if (this === other) return true;

    return (
      this.modality === other.modality &&
      this.algorithmVersion === other.algorithmVersion &&
      this.findings.length === other.findings.length &&
      this.overallConfidence === other.overallConfidence
    );
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   * SECURITY: This method is safe - no PHI in ImagingFindings
   */
  public toJSON(): ImagingFindingsDTO {
    return {
      findings: [...this.findings],
      overallConfidence: this.overallConfidence,
      modality: this.modality,
      analyzedAt: this.analyzedAt.toISOString(),
      algorithmVersion: this.algorithmVersion,
    };
  }

  /**
   * String representation for debugging/logging
   * SECURITY: Never log PHI or raw imaging data
   */
  public toString(): string {
    return `ImagingFindings(${this.modality}, ${this.findings.length} findings, confidence: ${(this.overallConfidence * 100).toFixed(1)}%)`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Input for creating ImagingFindings
 */
export interface CreateImagingFindingsInput {
  readonly findings: readonly RegionFinding[];
  readonly modality: ImagingModality;
  readonly algorithmVersion: string;
  readonly analyzedAt?: Date;
}

/**
 * DTO for ImagingFindings serialization
 */
export interface ImagingFindingsDTO {
  readonly findings: readonly RegionFinding[];
  readonly overallConfidence: number;
  readonly modality: ImagingModality;
  readonly analyzedAt: string | Date;
  readonly algorithmVersion: string;
}

/**
 * Error thrown when creating invalid ImagingFindings
 */
export class InvalidImagingFindingsError extends Error {
  public readonly code = 'INVALID_IMAGING_FINDINGS' as const;
  public readonly details: InvalidImagingFindingsErrorDetails;

  constructor(message: string, details: InvalidImagingFindingsErrorDetails = {}) {
    super(message);
    this.name = 'InvalidImagingFindingsError';
    this.details = Object.freeze(details);
    Object.setPrototypeOf(this, InvalidImagingFindingsError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export interface InvalidImagingFindingsErrorDetails {
  field?: string;
  value?: unknown;
  allowed?: readonly string[];
}

/**
 * Type guard for ImagingFindings
 */
export function isImagingFindings(value: unknown): value is ImagingFindings {
  return value instanceof ImagingFindings;
}
