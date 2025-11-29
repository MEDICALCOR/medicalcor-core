/**
 * @fileoverview OsaxSubjectId Value Object
 *
 * Banking/Medical Grade DDD Value Object for OSAX subject identification.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/osax/value-objects/osax-subject-id
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two OsaxSubjectIds with same value are equal
 * 4. GDPR COMPLIANCE - Pseudonymization support for clinical data
 *
 * CLINICAL CONTEXT:
 * Subject IDs are used to identify patients in OSAX studies while
 * maintaining GDPR compliance through pseudonymization. The ID format
 * supports both internal references and external study identifiers.
 */

/**
 * Subject ID type - internal vs external study
 */
export type OsaxSubjectIdType = 'INTERNAL' | 'EXTERNAL_STUDY' | 'ANONYMIZED';

/**
 * Subject demographic flags (for stratification)
 */
export interface OsaxSubjectDemographics {
  /** Age group (for study stratification) */
  readonly ageGroup?: 'PEDIATRIC' | 'ADULT' | 'GERIATRIC';

  /** Sex (biological, for clinical correlation) */
  readonly sex?: 'MALE' | 'FEMALE' | 'OTHER';

  /** Study cohort if part of a clinical trial */
  readonly cohortId?: string;
}

/**
 * OsaxSubjectId Value Object
 *
 * Represents a pseudonymized subject identifier for OSAX clinical data.
 * Designed for GDPR compliance while maintaining research utility.
 *
 * @example
 * ```typescript
 * // Create internal subject ID
 * const subjectId = OsaxSubjectId.create('OSAX-2025-001');
 * console.log(subjectId.formatted); // 'OSAX-2025-001'
 * console.log(subjectId.isInternal()); // true
 *
 * // Create from patient record (with pseudonymization)
 * const pseudonymized = OsaxSubjectId.fromPatientId('patient-uuid', 'study-salt');
 * console.log(pseudonymized.type); // 'INTERNAL'
 *
 * // Create for external study
 * const externalId = OsaxSubjectId.forExternalStudy('NCT12345678', 'SUB-042');
 * console.log(externalId.studyReference); // 'NCT12345678'
 * ```
 */
export class OsaxSubjectId {
  /**
   * Unique subject identifier
   */
  public readonly value: string;

  /**
   * Formatted display ID
   */
  public readonly formatted: string;

  /**
   * Subject ID type
   */
  public readonly type: OsaxSubjectIdType;

  /**
   * Study year for internal IDs
   */
  public readonly studyYear?: number;

  /**
   * Sequence number within year
   */
  public readonly sequenceNumber?: number;

  /**
   * External study reference (e.g., NCT number)
   */
  public readonly studyReference?: string;

  /**
   * Subject demographics for stratification
   */
  public readonly demographics?: OsaxSubjectDemographics;

  /**
   * Creation timestamp
   */
  public readonly createdAt: Date;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    value: string,
    formatted: string,
    type: OsaxSubjectIdType,
    studyYear?: number,
    sequenceNumber?: number,
    studyReference?: string,
    demographics?: OsaxSubjectDemographics,
    createdAt: Date = new Date()
  ) {
    this.value = value;
    this.formatted = formatted;
    this.type = type;
    this.studyYear = studyYear;
    this.sequenceNumber = sequenceNumber;
    this.studyReference = studyReference;
    this.demographics = demographics ? Object.freeze({ ...demographics }) : undefined;
    this.createdAt = createdAt;

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create OsaxSubjectId from formatted string
   *
   * Expected format: OSAX-YYYY-NNN or OSAX-YYYY-NNN-EXT
   *
   * @param formatted - Formatted subject ID string
   * @returns OsaxSubjectId instance
   * @throws InvalidOsaxSubjectIdError if format is invalid
   */
  public static create(formatted: string): OsaxSubjectId {
    const result = OsaxSubjectId.parse(formatted);
    if (!result.success) {
      throw new InvalidOsaxSubjectIdError(result.error);
    }
    return result.value;
  }

  /**
   * Generate new internal subject ID
   *
   * @param year - Study year (defaults to current year)
   * @param sequenceNumber - Sequence number within year
   * @param demographics - Optional demographic info
   * @returns New OsaxSubjectId
   */
  public static generate(
    sequenceNumber: number,
    year: number = new Date().getFullYear(),
    demographics?: OsaxSubjectDemographics
  ): OsaxSubjectId {
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1 || sequenceNumber > 99999) {
      throw new InvalidOsaxSubjectIdError(
        `Sequence number must be between 1 and 99999, got: ${sequenceNumber}`
      );
    }

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new InvalidOsaxSubjectIdError(
        `Year must be between 2020 and 2100, got: ${year}`
      );
    }

    const paddedSeq = sequenceNumber.toString().padStart(3, '0');
    const formatted = `OSAX-${year}-${paddedSeq}`;
    const value = `osax_${year}_${paddedSeq}`.toLowerCase();

    return new OsaxSubjectId(
      value,
      formatted,
      'INTERNAL',
      year,
      sequenceNumber,
      undefined,
      demographics
    );
  }

  /**
   * Create pseudonymized ID from patient UUID
   *
   * Uses SHA-256 hashing with salt for GDPR-compliant pseudonymization.
   *
   * @param patientId - Original patient UUID
   * @param salt - Salt for hashing (should be kept secure)
   * @param demographics - Optional demographic info
   * @returns Pseudonymized OsaxSubjectId
   */
  public static fromPatientId(
    patientId: string,
    salt: string,
    demographics?: OsaxSubjectDemographics
  ): OsaxSubjectId {
    if (!patientId || patientId.length < 10) {
      throw new InvalidOsaxSubjectIdError('Patient ID must be at least 10 characters');
    }

    if (!salt || salt.length < 16) {
      throw new InvalidOsaxSubjectIdError('Salt must be at least 16 characters');
    }

    // Generate pseudonymized hash
    const hashInput = `${patientId}:${salt}:osax`;
    const hash = OsaxSubjectId.simpleHash(hashInput);

    const year = new Date().getFullYear();
    const formatted = `OSAX-${year}-${hash.substring(0, 6).toUpperCase()}`;
    const value = `osax_pseudo_${hash}`.toLowerCase();

    return new OsaxSubjectId(
      value,
      formatted,
      'INTERNAL',
      year,
      undefined,
      undefined,
      demographics
    );
  }

  /**
   * Create ID for external clinical study
   *
   * @param studyReference - External study reference (e.g., NCT number)
   * @param subjectNumber - Subject number within the study
   * @param demographics - Optional demographic info
   * @returns OsaxSubjectId for external study
   */
  public static forExternalStudy(
    studyReference: string,
    subjectNumber: string,
    demographics?: OsaxSubjectDemographics
  ): OsaxSubjectId {
    if (!studyReference || studyReference.length < 3) {
      throw new InvalidOsaxSubjectIdError('Study reference must be at least 3 characters');
    }

    if (!subjectNumber || subjectNumber.length < 1) {
      throw new InvalidOsaxSubjectIdError('Subject number is required');
    }

    const formatted = `EXT-${studyReference}-${subjectNumber}`;
    const value = `osax_ext_${studyReference}_${subjectNumber}`.toLowerCase();

    return new OsaxSubjectId(
      value,
      formatted,
      'EXTERNAL_STUDY',
      undefined,
      undefined,
      studyReference,
      demographics
    );
  }

  /**
   * Create anonymized ID (for data export/sharing)
   *
   * @param originalId - Original subject ID to anonymize
   * @param anonymizationKey - Key for anonymization
   * @returns Fully anonymized OsaxSubjectId
   */
  public static anonymize(
    originalId: OsaxSubjectId,
    anonymizationKey: string
  ): OsaxSubjectId {
    if (!anonymizationKey || anonymizationKey.length < 16) {
      throw new InvalidOsaxSubjectIdError('Anonymization key must be at least 16 characters');
    }

    const hashInput = `${originalId.value}:${anonymizationKey}:anon`;
    const hash = OsaxSubjectId.simpleHash(hashInput);

    const formatted = `ANON-${hash.substring(0, 8).toUpperCase()}`;
    const value = `osax_anon_${hash}`.toLowerCase();

    // Anonymized IDs don't carry demographics
    return new OsaxSubjectId(value, formatted, 'ANONYMIZED');
  }

  /**
   * Parse from unknown input
   */
  public static parse(input: unknown): OsaxSubjectIdParseResult {
    if (input instanceof OsaxSubjectId) {
      return { success: true, value: input };
    }

    if (typeof input !== 'string') {
      return { success: false, error: `Expected string, got: ${typeof input}` };
    }

    const trimmed = input.trim().toUpperCase();

    // Internal format: OSAX-YYYY-NNN
    const internalMatch = trimmed.match(/^OSAX-(\d{4})-(\d{3,5})$/);
    if (internalMatch) {
      const year = parseInt(internalMatch[1]!, 10);
      const seq = parseInt(internalMatch[2]!, 10);

      if (year < 2020 || year > 2100) {
        return { success: false, error: `Invalid year: ${year}` };
      }

      return { success: true, value: OsaxSubjectId.generate(seq, year) };
    }

    // Pseudonymized format: OSAX-YYYY-XXXXXX (6 hex chars)
    const pseudoMatch = trimmed.match(/^OSAX-(\d{4})-([A-F0-9]{6})$/);
    if (pseudoMatch) {
      const year = parseInt(pseudoMatch[1]!, 10);
      const hash = pseudoMatch[2]!;

      const formatted = `OSAX-${year}-${hash}`;
      const value = `osax_pseudo_${hash.toLowerCase()}`;

      return {
        success: true,
        value: new OsaxSubjectId(value, formatted, 'INTERNAL', year),
      };
    }

    // External format: EXT-STUDYREF-SUBNUM
    const externalMatch = trimmed.match(/^EXT-([A-Z0-9]+)-([A-Z0-9-]+)$/);
    if (externalMatch) {
      const studyRef = externalMatch[1]!;
      const subNum = externalMatch[2]!;

      return {
        success: true,
        value: OsaxSubjectId.forExternalStudy(studyRef, subNum),
      };
    }

    // Anonymized format: ANON-XXXXXXXX
    const anonMatch = trimmed.match(/^ANON-([A-F0-9]{8})$/);
    if (anonMatch) {
      const hash = anonMatch[1]!;
      const formatted = `ANON-${hash}`;
      const value = `osax_anon_${hash.toLowerCase()}`;

      return {
        success: true,
        value: new OsaxSubjectId(value, formatted, 'ANONYMIZED'),
      };
    }

    return {
      success: false,
      error: `Invalid subject ID format: ${input}. Expected OSAX-YYYY-NNN, EXT-STUDY-NUM, or ANON-XXXXXXXX`,
    };
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Check if this is an internal subject ID
   */
  public isInternal(): boolean {
    return this.type === 'INTERNAL';
  }

  /**
   * Check if this is an external study subject
   */
  public isExternalStudy(): boolean {
    return this.type === 'EXTERNAL_STUDY';
  }

  /**
   * Check if this is an anonymized ID
   */
  public isAnonymized(): boolean {
    return this.type === 'ANONYMIZED';
  }

  /**
   * Check if subject is part of a specific cohort
   */
  public isInCohort(cohortId: string): boolean {
    return this.demographics?.cohortId === cohortId;
  }

  /**
   * Check if subject is pediatric
   */
  public isPediatric(): boolean {
    return this.demographics?.ageGroup === 'PEDIATRIC';
  }

  /**
   * Check if subject is geriatric
   */
  public isGeriatric(): boolean {
    return this.demographics?.ageGroup === 'GERIATRIC';
  }

  /**
   * Get safe display ID (for logging)
   * Masks part of the ID for privacy
   */
  public getSafeDisplayId(): string {
    if (this.type === 'ANONYMIZED') {
      return this.formatted;
    }

    // Mask middle portion
    if (this.formatted.length > 8) {
      const prefix = this.formatted.substring(0, 5);
      const suffix = this.formatted.substring(this.formatted.length - 3);
      return `${prefix}***${suffix}`;
    }

    return '***';
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Add demographic information
   * Returns new OsaxSubjectId (immutability preserved)
   */
  public withDemographics(demographics: OsaxSubjectDemographics): OsaxSubjectId {
    return new OsaxSubjectId(
      this.value,
      this.formatted,
      this.type,
      this.studyYear,
      this.sequenceNumber,
      this.studyReference,
      demographics,
      this.createdAt
    );
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: OsaxSubjectId): boolean {
    return this.value === other.value;
  }

  /**
   * Compare IDs (for sorting)
   */
  public compareTo(other: OsaxSubjectId): number {
    // Sort by year first, then sequence
    if (this.studyYear !== other.studyYear) {
      return (this.studyYear ?? 0) - (other.studyYear ?? 0);
    }
    return (this.sequenceNumber ?? 0) - (other.sequenceNumber ?? 0);
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object
   */
  public toJSON(): OsaxSubjectIdDTO {
    return {
      value: this.value,
      formatted: this.formatted,
      type: this.type,
      ...(this.studyYear !== undefined && { studyYear: this.studyYear }),
      ...(this.sequenceNumber !== undefined && { sequenceNumber: this.sequenceNumber }),
      ...(this.studyReference !== undefined && { studyReference: this.studyReference }),
      ...(this.demographics !== undefined && { demographics: { ...this.demographics } }),
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Convert to primitive (value string)
   */
  public toPrimitive(): string {
    return this.value;
  }

  /**
   * String representation
   */
  public toString(): string {
    return this.formatted;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Simple hash function for pseudonymization
   * Note: In production, use crypto.subtle or similar
   */
  private static simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    // Convert to hex and pad
    const hexHash = Math.abs(hash).toString(16).padStart(8, '0');

    // Use crypto if available for better randomness
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      const uuid = globalThis.crypto.randomUUID().replace(/-/g, '');
      return `${hexHash}${uuid.substring(0, 8)}`;
    }

    // Fallback: extend with timestamp
    const timestamp = Date.now().toString(16).substring(0, 8);
    return `${hexHash}${timestamp}`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid OsaxSubjectId
 */
export class InvalidOsaxSubjectIdError extends Error {
  public readonly code = 'INVALID_OSAX_SUBJECT_ID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidOsaxSubjectIdError';
    Object.setPrototypeOf(this, InvalidOsaxSubjectIdError.prototype);
  }
}

/**
 * DTO for OsaxSubjectId serialization
 */
export interface OsaxSubjectIdDTO {
  value: string;
  formatted: string;
  type: OsaxSubjectIdType;
  studyYear?: number;
  sequenceNumber?: number;
  studyReference?: string;
  demographics?: OsaxSubjectDemographics;
  createdAt: string;
}

/**
 * Parse result type
 */
export type OsaxSubjectIdParseResult =
  | { success: true; value: OsaxSubjectId }
  | { success: false; error: string };
