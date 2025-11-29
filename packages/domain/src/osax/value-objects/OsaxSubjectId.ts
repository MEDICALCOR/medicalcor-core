/**
 * @fileoverview OsaxSubjectId Value Object
 *
 * Value Object pentru identificarea subiectului unui caz OSAX.
 * Poate fi fie Lead (pre-consult), fie Patient (post-consult).
 *
 * @module domain/osax/value-objects/OsaxSubjectId
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two OsaxSubjectIds with same type+id are equal
 * 4. TYPE SAFETY - Discriminated union for lead vs patient
 */

import { type Result, ok, err, DomainError } from '../../shared/types.js';

/**
 * Subject type discriminator for OSAX cases
 * - 'lead': Pre-consult subject (potential patient)
 * - 'patient': Post-consult subject (confirmed patient)
 */
export type OsaxSubjectType = 'lead' | 'patient';

/**
 * OsaxSubjectId Value Object
 *
 * Represents the subject of an OSAX case, which can be either a Lead
 * (pre-consultation) or a Patient (post-consultation).
 *
 * This is a true Value Object following DDD principles:
 * - Immutable (all properties readonly, Object.freeze applied)
 * - Self-validating (returns Result on invalid input)
 * - Equality by value (equals method)
 * - Business logic encapsulated (type discrimination)
 *
 * @example
 * ```typescript
 * // Create from lead
 * const leadResult = OsaxSubjectId.createFromLead('lead-123');
 * if (leadResult.success) {
 *   console.log(leadResult.value.isLead()); // true
 *   console.log(leadResult.value.toString()); // 'lead:lead-123'
 * }
 *
 * // Create from patient
 * const patientResult = OsaxSubjectId.createFromPatient('patient-456');
 * if (patientResult.success) {
 *   console.log(patientResult.value.isPatient()); // true
 * }
 *
 * // Reconstitute from database
 * const restored = OsaxSubjectId.reconstitute('lead', 'lead-123');
 * ```
 */
export class OsaxSubjectId {
  /**
   * The type of subject (lead or patient)
   */
  public readonly type: OsaxSubjectType;

  /**
   * The unique identifier for the subject
   */
  public readonly id: string;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(type: OsaxSubjectType, id: string) {
    this.type = type;
    this.id = id;

    // Freeze to ensure immutability
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create OsaxSubjectId from a Lead ID
   *
   * @param leadId - The lead identifier
   * @returns Result containing OsaxSubjectId or DomainError
   */
  static createFromLead(leadId: string): Result<OsaxSubjectId, DomainError> {
    if (!leadId || leadId.trim().length === 0) {
      return err(new DomainError('VALIDATION_ERROR', 'Lead ID cannot be empty', { leadId }));
    }
    return ok(new OsaxSubjectId('lead', leadId.trim()));
  }

  /**
   * Create OsaxSubjectId from a Patient ID
   *
   * @param patientId - The patient identifier
   * @returns Result containing OsaxSubjectId or DomainError
   */
  static createFromPatient(patientId: string): Result<OsaxSubjectId, DomainError> {
    if (!patientId || patientId.trim().length === 0) {
      return err(new DomainError('VALIDATION_ERROR', 'Patient ID cannot be empty', { patientId }));
    }
    return ok(new OsaxSubjectId('patient', patientId.trim()));
  }

  /**
   * Reconstitute from database/serialized data
   *
   * Use this method when hydrating from persistence layer.
   * Assumes data has already been validated.
   *
   * @param type - The subject type
   * @param id - The subject identifier
   * @returns OsaxSubjectId instance
   */
  static reconstitute(type: OsaxSubjectType, id: string): OsaxSubjectId {
    return new OsaxSubjectId(type, id);
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Check if this subject is a Lead (pre-consult)
   */
  isLead(): boolean {
    return this.type === 'lead';
  }

  /**
   * Check if this subject is a Patient (post-consult)
   */
  isPatient(): boolean {
    return this.type === 'patient';
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   *
   * Two OsaxSubjectIds are equal if they have the same type and id.
   *
   * @param other - The other OsaxSubjectId to compare
   * @returns True if equal by value
   */
  equals(other: OsaxSubjectId): boolean {
    return this.type === other.type && this.id === other.id;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to string representation
   *
   * Format: `{type}:{id}`
   *
   * @example
   * ```typescript
   * const subject = OsaxSubjectId.reconstitute('lead', '123');
   * console.log(subject.toString()); // 'lead:123'
   * ```
   */
  toString(): string {
    return `${this.type}:${this.id}`;
  }

  /**
   * Convert to plain object (for JSON serialization)
   */
  toJSON(): { type: OsaxSubjectType; id: string } {
    return {
      type: this.type,
      id: this.id,
    };
  }
}
