/**
 * PII Masking Service - Dynamic Query-Time Masking for Cognitive Memory
 *
 * L6: Implements role-based PII masking for non-admin users querying
 * episodic memory. Ensures HIPAA/GDPR compliance by masking sensitive
 * data at query time based on user role and context.
 *
 * HIPAA Minimum Necessary Rule: Users should only access the minimum PHI
 * needed for their job function.
 *
 * GDPR Data Minimization: Personal data should be adequate, relevant, and
 * limited to what is necessary.
 */

import { createHash } from 'crypto';
import { createLogger } from '../logger.js';
import { maskEmail, maskName, maskPhone, redactString, PII_PATTERNS } from '../logger/redaction.js';
import {
  DEFAULT_PII_MASKING_CONFIG,
  type BehavioralPattern,
  type EpisodicEvent,
  type KeyEntity,
  type MaskingContext,
  type MaskingLevel,
  type MaskingResult,
  type PaginatedResult,
  type PiiFieldType,
  type PiiMaskingConfig,
  type QueryMaskingOptions,
  type SubjectMemorySummary,
  type UserRole,
} from './types.js';

const logger = createLogger({ name: 'cognitive-pii-masking' });

// =============================================================================
// Entity Type to PII Field Type Mapping
// =============================================================================

/**
 * Maps cognitive entity types to PII field types for masking decisions
 */
const ENTITY_TYPE_TO_PII_FIELD: Record<string, PiiFieldType> = {
  person: 'name',
  location: 'address',
  amount: 'financial',
  date: 'date_of_birth',
  procedure: 'medical_record',
  product: 'other',
  other: 'other',
};

/**
 * Patterns to detect PII type in entity values
 */
const PII_DETECTION_PATTERNS: { type: PiiFieldType; pattern: RegExp }[] = [
  { type: 'phone', pattern: PII_PATTERNS.romanianPhone },
  { type: 'phone', pattern: PII_PATTERNS.internationalPhone },
  { type: 'email', pattern: PII_PATTERNS.email },
  { type: 'ssn', pattern: PII_PATTERNS.cnp },
  { type: 'ssn', pattern: PII_PATTERNS.ssn },
  { type: 'date_of_birth', pattern: PII_PATTERNS.dateOfBirth },
  { type: 'financial', pattern: PII_PATTERNS.creditCard },
  { type: 'financial', pattern: PII_PATTERNS.iban },
];

// =============================================================================
// PII Masking Service
// =============================================================================

export class PiiMaskingService {
  private config: PiiMaskingConfig;

  constructor(config: Partial<PiiMaskingConfig> = {}) {
    this.config = { ...DEFAULT_PII_MASKING_CONFIG, ...config };
  }

  // ===========================================================================
  // Public API - Main Masking Methods
  // ===========================================================================

  /**
   * Mask PII in an episodic event based on user role
   */
  maskEvent(event: EpisodicEvent, options: QueryMaskingOptions): MaskingResult<EpisodicEvent> {
    const config = this.getMergedConfig(options.configOverride);
    const level = this.getMaskingLevel(options.context, config);
    const fieldsAccessed: string[] = [];
    let fieldsMasked = 0;

    if (!config.enabled || level === 'none') {
      return this.createResult(event, 0, false, options.context, fieldsAccessed);
    }

    // Deep clone to avoid mutating original
    const masked: EpisodicEvent = {
      ...event,
      summary: event.summary,
      keyEntities: [...event.keyEntities],
      metadata: event.metadata ? { ...event.metadata } : undefined,
    };

    // Mask summary text
    const originalSummary = masked.summary;
    masked.summary = this.maskText(masked.summary, level, config);
    if (masked.summary !== originalSummary) {
      fieldsMasked++;
      fieldsAccessed.push('summary');
    }

    // Mask key entities
    const { entities, maskedCount } = this.maskEntities(
      masked.keyEntities,
      level,
      config,
      options.context
    );
    masked.keyEntities = entities;
    fieldsMasked += maskedCount;
    if (maskedCount > 0) {
      fieldsAccessed.push('keyEntities');
    }

    // Mask metadata if present
    if (masked.metadata) {
      const { data, wasMasked } = this.maskMetadata(masked.metadata, level, config);
      masked.metadata = data;
      if (wasMasked) {
        fieldsMasked++;
        fieldsAccessed.push('metadata');
      }
    }

    // Log audit if enabled
    if (config.auditLogging) {
      this.logAudit(options.context, event.id, fieldsAccessed, level);
    }

    return this.createResult(
      masked,
      fieldsMasked,
      fieldsMasked > 0,
      options.context,
      fieldsAccessed
    );
  }

  /**
   * Mask PII in an array of episodic events
   */
  maskEvents(
    events: EpisodicEvent[],
    options: QueryMaskingOptions
  ): MaskingResult<EpisodicEvent[]> {
    const results = events.map((event) => this.maskEvent(event, options));
    const totalMasked = results.reduce((sum, r) => sum + r.fieldsMasked, 0);
    const allFieldsAccessed = Array.from(
      new Set(results.flatMap((r) => r.auditInfo.fieldsAccessed))
    );
    const maskedEvents = results.map((r) => r.data);

    return this.createResult(
      maskedEvents,
      totalMasked,
      totalMasked > 0,
      options.context,
      allFieldsAccessed
    );
  }

  /**
   * Mask PII in a paginated result
   */
  maskPaginatedResult(
    result: PaginatedResult<EpisodicEvent>,
    options: QueryMaskingOptions
  ): MaskingResult<PaginatedResult<EpisodicEvent>> {
    const maskedItems = this.maskEvents(result.items, options);

    return this.createResult(
      {
        items: maskedItems.data,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        totalCount: result.totalCount,
      },
      maskedItems.fieldsMasked,
      maskedItems.wasMasked,
      options.context,
      maskedItems.auditInfo.fieldsAccessed
    );
  }

  /**
   * Mask PII in a subject memory summary
   */
  maskSubjectSummary(
    summary: SubjectMemorySummary,
    options: QueryMaskingOptions
  ): MaskingResult<SubjectMemorySummary> {
    const config = this.getMergedConfig(options.configOverride);
    const level = this.getMaskingLevel(options.context, config);
    const fieldsAccessed: string[] = [];
    let fieldsMasked = 0;

    if (!config.enabled || level === 'none') {
      return this.createResult(summary, 0, false, options.context, fieldsAccessed);
    }

    const masked: SubjectMemorySummary = {
      ...summary,
      patterns: [...summary.patterns],
      recentSummary: summary.recentSummary,
    };

    // Mask recent summary text
    const originalSummary = masked.recentSummary;
    masked.recentSummary = this.maskText(masked.recentSummary, level, config);
    if (masked.recentSummary !== originalSummary) {
      fieldsMasked++;
      fieldsAccessed.push('recentSummary');
    }

    // Mask patterns
    masked.patterns = summary.patterns.map((pattern) => {
      const maskedPattern = this.maskBehavioralPattern(pattern, level, config);
      if (maskedPattern.patternDescription !== pattern.patternDescription) {
        fieldsMasked++;
        if (!fieldsAccessed.includes('patterns')) {
          fieldsAccessed.push('patterns');
        }
      }
      return maskedPattern;
    });

    if (config.auditLogging) {
      this.logAudit(options.context, summary.subjectId, fieldsAccessed, level);
    }

    return this.createResult(
      masked,
      fieldsMasked,
      fieldsMasked > 0,
      options.context,
      fieldsAccessed
    );
  }

  /**
   * Mask PII in a behavioral pattern
   */
  maskBehavioralPattern(
    pattern: BehavioralPattern,
    level: MaskingLevel,
    config: PiiMaskingConfig
  ): BehavioralPattern {
    return {
      ...pattern,
      patternDescription: this.maskText(pattern.patternDescription, level, config),
      metadata: pattern.metadata
        ? this.maskMetadata(pattern.metadata, level, config).data
        : undefined,
    };
  }

  // ===========================================================================
  // Masking Level Determination
  // ===========================================================================

  /**
   * Determine masking level based on context and config
   */
  getMaskingLevel(context: MaskingContext, config: PiiMaskingConfig): MaskingLevel {
    // Emergency access bypasses normal rules (audit still applies)
    if (context.emergencyAccess) {
      logger.warn(
        { userId: context.userId, correlationId: context.correlationId },
        'Emergency PII access (break-the-glass)'
      );
      return 'none';
    }

    // Role-based level - roleLevels is a complete Record<UserRole, MaskingLevel>
    return config.roleLevels[context.userRole];
  }

  /**
   * Check if a role has full PII access
   */
  hasFullAccess(role: UserRole): boolean {
    return this.config.roleLevels[role] === 'none';
  }

  /**
   * Check if a role requires masking
   */
  requiresMasking(role: UserRole): boolean {
    const level = this.config.roleLevels[role];
    return level !== 'none';
  }

  // ===========================================================================
  // Text Masking
  // ===========================================================================

  /**
   * Mask PII in a text string based on masking level
   */
  maskText(text: string, level: MaskingLevel, config: PiiMaskingConfig): string {
    switch (level) {
      case 'none':
        return text;
      case 'full':
        // Use the logger redaction for complete masking
        return redactString(text);
      case 'partial':
        // Apply partial masking for each PII type
        return this.applyPartialMasking(text);
      case 'hash':
        // Replace each PII match with its hash
        return this.applyHashMasking(text, config.hashSalt ?? 'default-salt');
    }
  }

  /**
   * Apply partial masking to text (show first/last characters)
   */
  private applyPartialMasking(text: string): string {
    let result = text;

    // Mask phone numbers partially
    result = result.replace(PII_PATTERNS.romanianPhone, (match) => maskPhone(match));
    result = result.replace(PII_PATTERNS.internationalPhone, (match) => maskPhone(match));

    // Mask emails partially
    result = result.replace(PII_PATTERNS.email, (match) => maskEmail(match));

    // For other patterns, use full redaction (partial not applicable)
    result = result.replace(PII_PATTERNS.cnp, '[REDACTED:cnp]');
    result = result.replace(PII_PATTERNS.ssn, '[REDACTED:ssn]');
    result = result.replace(PII_PATTERNS.creditCard, '[REDACTED:card]');
    result = result.replace(PII_PATTERNS.iban, '[REDACTED:iban]');

    return result;
  }

  /**
   * Apply hash masking to text (consistent hash for deduplication)
   */
  private applyHashMasking(text: string, salt: string): string {
    let result = text;

    // Replace each PII pattern with its hash
    for (const { type, pattern } of PII_DETECTION_PATTERNS) {
      result = result.replace(pattern, (match) => {
        const hash = this.createHash(match, salt);
        return `[HASH:${type}:${hash.slice(0, 8)}]`;
      });
    }

    return result;
  }

  /**
   * Create a consistent hash for a value
   */
  private createHash(value: string, salt: string): string {
    return createHash('sha256').update(`${salt}:${value}`).digest('hex');
  }

  // ===========================================================================
  // Entity Masking
  // ===========================================================================

  /**
   * Mask key entities based on their type and content
   */
  private maskEntities(
    entities: KeyEntity[],
    level: MaskingLevel,
    config: PiiMaskingConfig,
    context: MaskingContext
  ): { entities: KeyEntity[]; maskedCount: number } {
    let maskedCount = 0;

    const masked = entities.map((entity) => {
      // Determine PII field type from entity type
      const piiType = this.detectPiiType(entity);

      // Check if this field type should never be masked
      if (config.neverMaskEntityTypes.includes(entity.type)) {
        return entity;
      }

      // Check if user has override for this field
      if (context.unmaskedFields?.includes(piiType)) {
        return entity;
      }

      // Check if this type always requires masking
      const alwaysMask = config.alwaysMaskEntityTypes.includes(piiType);

      // Apply masking if needed
      if (level !== 'none' || alwaysMask) {
        const maskedEntity = this.maskEntity(entity, level, config);
        if (maskedEntity.value !== entity.value) {
          maskedCount++;
        }
        return maskedEntity;
      }

      return entity;
    });

    return { entities: masked, maskedCount };
  }

  /**
   * Mask a single entity
   */
  private maskEntity(entity: KeyEntity, level: MaskingLevel, config: PiiMaskingConfig): KeyEntity {
    const piiType = this.detectPiiType(entity);
    let maskedValue: string;

    switch (level) {
      case 'none':
        maskedValue = entity.value;
        break;

      case 'partial':
        maskedValue = this.applyPartialEntityMasking(entity.value, piiType);
        break;

      case 'full':
        maskedValue = `[REDACTED:${piiType}]`;
        break;

      case 'hash':
        maskedValue = `[HASH:${piiType}:${this.createHash(entity.value, config.hashSalt ?? 'default-salt').slice(0, 8)}]`;
        break;

      default:
        maskedValue = `[REDACTED:${piiType}]`;
    }

    return {
      ...entity,
      value: maskedValue,
    };
  }

  /**
   * Apply partial masking to entity value based on PII type
   */
  private applyPartialEntityMasking(value: string, piiType: PiiFieldType): string {
    switch (piiType) {
      case 'phone':
        return maskPhone(value);
      case 'email':
        return maskEmail(value);
      case 'name':
        return maskName(value);
      case 'address': {
        // Show first word (street number) and mask rest
        const words = value.split(' ');
        if (words.length > 1) {
          return `${words[0]} ${'*'.repeat(10)}`;
        }
        return '*'.repeat(value.length);
      }
      case 'date_of_birth':
      case 'ssn':
      case 'medical_record':
      case 'financial':
      case 'other': {
        // For other types, show first 2 and last 2 characters
        if (value.length <= 4) {
          return '*'.repeat(value.length);
        }
        return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
      }
    }
  }

  /**
   * Detect PII type from entity type and value
   */
  private detectPiiType(entity: KeyEntity): PiiFieldType {
    // First check if entity type maps to a known PII type
    const mappedType = ENTITY_TYPE_TO_PII_FIELD[entity.type];
    if (mappedType && mappedType !== 'other') {
      return mappedType;
    }

    // Then check value against patterns
    for (const { type, pattern } of PII_DETECTION_PATTERNS) {
      if (pattern.test(entity.value)) {
        return type;
      }
    }

    return 'other';
  }

  // ===========================================================================
  // Metadata Masking
  // ===========================================================================

  /**
   * Mask PII in metadata object
   */
  private maskMetadata(
    metadata: Record<string, unknown>,
    level: MaskingLevel,
    config: PiiMaskingConfig
  ): { data: Record<string, unknown>; wasMasked: boolean } {
    if (level === 'none') {
      return { data: metadata, wasMasked: false };
    }

    let wasMasked = false;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        const masked = this.maskText(value, level, config);
        result[key] = masked;
        if (masked !== value) {
          wasMasked = true;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively mask nested objects
        const nested = this.maskMetadata(value as Record<string, unknown>, level, config);
        result[key] = nested.data;
        if (nested.wasMasked) {
          wasMasked = true;
        }
      } else {
        result[key] = value;
      }
    }

    return { data: result, wasMasked };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get merged config with overrides
   */
  private getMergedConfig(override?: Partial<PiiMaskingConfig>): PiiMaskingConfig {
    if (!override) {
      return this.config;
    }
    return {
      ...this.config,
      ...override,
      roleLevels: {
        ...this.config.roleLevels,
        ...override.roleLevels,
      },
      alwaysMaskEntityTypes: override.alwaysMaskEntityTypes ?? this.config.alwaysMaskEntityTypes,
      neverMaskEntityTypes: override.neverMaskEntityTypes ?? this.config.neverMaskEntityTypes,
    };
  }

  /**
   * Create a masking result with audit info
   */
  private createResult<T>(
    data: T,
    fieldsMasked: number,
    wasMasked: boolean,
    context: MaskingContext,
    fieldsAccessed: string[]
  ): MaskingResult<T> {
    return {
      data,
      fieldsMasked,
      wasMasked,
      auditInfo: {
        userId: context.userId,
        userRole: context.userRole,
        accessTime: new Date(),
        correlationId: context.correlationId,
        fieldsAccessed,
      },
    };
  }

  /**
   * Log PII access for audit compliance
   */
  private logAudit(
    context: MaskingContext,
    resourceId: string,
    fieldsAccessed: string[],
    level: MaskingLevel
  ): void {
    logger.info(
      {
        event: 'pii_access',
        userId: context.userId,
        userRole: context.userRole,
        clinicId: context.clinicId,
        resourceId,
        fieldsAccessed,
        maskingLevel: level,
        emergencyAccess: context.emergencyAccess ?? false,
        correlationId: context.correlationId,
      },
      'PII access logged for audit'
    );
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a PII masking service instance
 *
 * @param config - Optional configuration overrides
 * @returns Configured PiiMaskingService instance
 *
 * @example
 * ```typescript
 * const maskingService = createPiiMaskingService({
 *   auditLogging: true,
 *   roleLevels: {
 *     admin: 'none',
 *     clinician: 'partial',
 *     staff: 'partial',
 *     analyst: 'full',
 *     viewer: 'full',
 *   },
 * });
 *
 * // Mask events for a non-admin user
 * const result = maskingService.maskEvents(events, {
 *   context: { userRole: 'analyst', userId: 'user-123' },
 * });
 *
 * // Admin gets unmasked data
 * const adminResult = maskingService.maskEvents(events, {
 *   context: { userRole: 'admin', userId: 'admin-123' },
 * });
 * ```
 */
export function createPiiMaskingService(config?: Partial<PiiMaskingConfig>): PiiMaskingService {
  return new PiiMaskingService(config);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check if a user role requires PII masking
 *
 * @param role - User role to check
 * @param config - Optional config override
 * @returns true if the role requires masking
 */
export function roleRequiresMasking(
  role: UserRole,
  config: Partial<PiiMaskingConfig> = {}
): boolean {
  const mergedConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...config };
  // roleLevels is always complete after merging with defaults
  const level = mergedConfig.roleLevels[role];
  return level !== 'none';
}

/**
 * Get masking level for a role
 *
 * @param role - User role
 * @param config - Optional config override
 * @returns Masking level for the role
 */
export function getMaskingLevelForRole(
  role: UserRole,
  config: Partial<PiiMaskingConfig> = {}
): MaskingLevel {
  const mergedConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...config };
  // roleLevels is always complete after merging with defaults
  return mergedConfig.roleLevels[role];
}
