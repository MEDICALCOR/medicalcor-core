/**
 * Event Schema Registry
 *
 * Provides versioned schema management for domain events:
 * - Schema registration with version tracking
 * - Event payload validation against registered schemas
 * - Automatic upcasting (migration) from old versions to new
 * - Backward compatibility support for event consumers
 *
 * This prevents breaking changes from corrupting projections by:
 * 1. Validating events before storage
 * 2. Migrating old events when replaying
 * 3. Tracking schema evolution over time
 */

import { z, type ZodSchema } from 'zod';
import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Migration function to transform event payload from one version to the next
 */
export type EventMigrationFn<TFrom = unknown, TTo = unknown> = (payload: TFrom) => TTo;

/**
 * Registered schema version
 */
export interface EventSchemaVersion<T = unknown> {
  /** Version number (1, 2, 3, ...) */
  version: number;
  /** Zod schema for validation */
  schema: ZodSchema<T>;
  /** Migration function to transform from this version to the next */
  migrateTo?: EventMigrationFn;
  /** Human-readable description of this version */
  description?: string;
  /** When this version was registered */
  registeredAt: Date;
  /** Whether this version is deprecated */
  deprecated: boolean;
  /** Deprecation reason if deprecated */
  deprecationReason?: string;
}

/**
 * Schema registration options
 */
export interface RegisterSchemaOptions<T> {
  /** Version number */
  version: number;
  /** Zod schema for validation */
  schema: ZodSchema<T>;
  /** Migration function to next version */
  migrateTo?: EventMigrationFn;
  /** Description of changes in this version */
  description?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Parsed/transformed data if successful */
  data?: unknown;
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Whether migration was successful */
  success: boolean;
  /** Migrated payload */
  payload: unknown;
  /** Starting version */
  fromVersion: number;
  /** Ending version */
  toVersion: number;
  /** Versions traversed during migration */
  migrationPath: number[];
  /** Error if migration failed */
  error?: string;
}

// ============================================================================
// EVENT SCHEMA REGISTRY
// ============================================================================

export class EventSchemaRegistry {
  private schemas = new Map<string, EventSchemaVersion[]>();
  private logger: Logger;

  constructor() {
    this.logger = createLogger({ name: 'event-schema-registry' });
  }

  /**
   * Register a schema version for an event type
   *
   * @example
   * ```typescript
   * registry.register('LeadScored', {
   *   version: 1,
   *   schema: z.object({
   *     leadId: z.string().uuid(),
   *     score: z.number().int().min(1).max(5),
   *   }),
   * });
   *
   * registry.register('LeadScored', {
   *   version: 2,
   *   schema: z.object({
   *     leadId: z.string().uuid(),
   *     score: z.number().int().min(1).max(5),
   *     confidence: z.number().min(0).max(1),
   *   }),
   *   migrateTo: (v1) => ({ ...v1, confidence: 0.5 }),
   *   description: 'Added confidence score',
   * });
   * ```
   */
  register<T>(eventType: string, options: RegisterSchemaOptions<T>): void {
    const versions = this.schemas.get(eventType) ?? [];

    // Check for duplicate version
    if (versions.some((v) => v.version === options.version)) {
      throw new Error(
        `Schema version ${options.version} already registered for event type "${eventType}"`
      );
    }

    // Ensure versions are added in order
    if (versions.length > 0 && options.version !== versions[versions.length - 1]!.version + 1) {
      const lastVersion = versions[versions.length - 1]!.version;
      if (options.version <= lastVersion) {
        throw new Error(
          `Cannot register version ${options.version} after version ${lastVersion} for event type "${eventType}"`
        );
      }
      this.logger.warn(
        {
          eventType,
          registeredVersion: options.version,
          expectedVersion: lastVersion + 1,
        },
        'Skipping version numbers in event schema'
      );
    }

    const schemaVersion: EventSchemaVersion<T> = {
      version: options.version,
      schema: options.schema,
      migrateTo: options.migrateTo,
      description: options.description,
      registeredAt: new Date(),
      deprecated: false,
    };

    versions.push(schemaVersion);
    versions.sort((a, b) => a.version - b.version);
    this.schemas.set(eventType, versions);

    this.logger.debug({ eventType, version: options.version }, 'Registered event schema');
  }

  /**
   * Validate an event payload against a specific version
   */
  validate(eventType: string, version: number, payload: unknown): ValidationResult {
    const versions = this.schemas.get(eventType);

    // Unknown event types pass through (for backwards compatibility)
    if (!versions) {
      return { valid: true, data: payload };
    }

    const schemaVersion = versions.find((v) => v.version === version);
    if (!schemaVersion) {
      return {
        valid: false,
        error: `Unknown version ${version} for event type "${eventType}"`,
      };
    }

    const result = schemaVersion.schema.safeParse(payload);
    if (!result.success) {
      return {
        valid: false,
        error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }

    return { valid: true, data: result.data };
  }

  /**
   * Validate against the latest schema version
   */
  validateLatest(eventType: string, payload: unknown): ValidationResult {
    const latestVersion = this.getLatestVersion(eventType);
    return this.validate(eventType, latestVersion, payload);
  }

  /**
   * Migrate an event payload from one version to another
   *
   * @example
   * ```typescript
   * const result = registry.migrate('LeadScored', 1, 2, { leadId: '...', score: 5 });
   * // result.payload = { leadId: '...', score: 5, confidence: 0.5 }
   * ```
   */
  migrate(
    eventType: string,
    fromVersion: number,
    toVersion: number,
    payload: unknown
  ): MigrationResult {
    const versions = this.schemas.get(eventType);

    // No migrations needed for unknown event types
    if (!versions) {
      return {
        success: true,
        payload,
        fromVersion,
        toVersion,
        migrationPath: [],
      };
    }

    // No migration needed if versions are the same
    if (fromVersion === toVersion) {
      return {
        success: true,
        payload,
        fromVersion,
        toVersion,
        migrationPath: [],
      };
    }

    // Cannot downgrade
    if (fromVersion > toVersion) {
      return {
        success: false,
        payload,
        fromVersion,
        toVersion,
        migrationPath: [],
        error: `Cannot migrate backwards from version ${fromVersion} to ${toVersion}`,
      };
    }

    try {
      let currentPayload = payload;
      const migrationPath: number[] = [fromVersion];

      for (const schemaVersion of versions) {
        // Skip versions before our starting point
        if (schemaVersion.version <= fromVersion) {
          continue;
        }

        // Stop when we reach our target
        if (schemaVersion.version > toVersion) {
          break;
        }

        // Find the previous version's migration function
        const previousVersion = versions.find((v) => v.version === schemaVersion.version - 1);

        if (previousVersion?.migrateTo) {
          currentPayload = previousVersion.migrateTo(currentPayload);
          migrationPath.push(schemaVersion.version);

          this.logger.debug(
            {
              eventType,
              fromVersion: schemaVersion.version - 1,
              toVersion: schemaVersion.version,
            },
            'Migrated event'
          );
        } else if (schemaVersion.version <= toVersion) {
          // No migration function but we need to reach this version
          return {
            success: false,
            payload,
            fromVersion,
            toVersion,
            migrationPath,
            error: `No migration function from version ${schemaVersion.version - 1} to ${schemaVersion.version}`,
          };
        }
      }

      return {
        success: true,
        payload: currentPayload,
        fromVersion,
        toVersion,
        migrationPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        payload,
        fromVersion,
        toVersion,
        migrationPath: [fromVersion],
        error: `Migration failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Migrate to the latest version
   */
  migrateToLatest(eventType: string, fromVersion: number, payload: unknown): MigrationResult {
    const latestVersion = this.getLatestVersion(eventType);
    return this.migrate(eventType, fromVersion, latestVersion, payload);
  }

  /**
   * Get the latest version number for an event type
   */
  getLatestVersion(eventType: string): number {
    const versions = this.schemas.get(eventType);
    if (!versions || versions.length === 0) {
      return 1; // Default version for unknown event types
    }
    return versions[versions.length - 1]!.version;
  }

  /**
   * Get all registered versions for an event type
   */
  getVersions(eventType: string): number[] {
    const versions = this.schemas.get(eventType);
    return versions ? versions.map((v) => v.version) : [];
  }

  /**
   * Get schema for a specific version
   */
  getSchema<T = unknown>(eventType: string, version: number): ZodSchema<T> | null {
    const versions = this.schemas.get(eventType);
    if (!versions) return null;

    const schemaVersion = versions.find((v) => v.version === version);
    return schemaVersion ? (schemaVersion.schema as ZodSchema<T>) : null;
  }

  /**
   * Deprecate a schema version
   */
  deprecate(eventType: string, version: number, reason: string): void {
    const versions = this.schemas.get(eventType);
    if (!versions) return;

    const schemaVersion = versions.find((v) => v.version === version);
    if (schemaVersion) {
      schemaVersion.deprecated = true;
      schemaVersion.deprecationReason = reason;

      this.logger.info({ eventType, version, reason }, 'Deprecated event schema version');
    }
  }

  /**
   * Check if a version is deprecated
   */
  isDeprecated(eventType: string, version: number): boolean {
    const versions = this.schemas.get(eventType);
    if (!versions) return false;

    const schemaVersion = versions.find((v) => v.version === version);
    return schemaVersion?.deprecated ?? false;
  }

  /**
   * Get all registered event types
   */
  getEventTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Check if an event type is registered
   */
  hasEventType(eventType: string): boolean {
    return this.schemas.has(eventType);
  }

  /**
   * Get schema info for debugging
   */
  getSchemaInfo(eventType: string): EventSchemaVersion[] | null {
    const versions = this.schemas.get(eventType);
    return versions ? [...versions] : null;
  }

  /**
   * Clear all registered schemas (for testing)
   */
  clear(): void {
    this.schemas.clear();
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

/**
 * Global event schema registry instance
 */
export const eventSchemaRegistry = new EventSchemaRegistry();

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new event schema registry
 */
export function createEventSchemaRegistry(): EventSchemaRegistry {
  return new EventSchemaRegistry();
}

// ============================================================================
// COMMON EVENT SCHEMAS
// ============================================================================

/**
 * Register common MedicalCor domain event schemas
 */
export function registerCommonEventSchemas(
  registry: EventSchemaRegistry = eventSchemaRegistry
): void {
  // LeadCreated - v1
  registry.register('LeadCreated', {
    version: 1,
    schema: z.object({
      phone: z.string(),
      channel: z.enum(['whatsapp', 'voice', 'web', 'referral']),
    }),
    description: 'Initial lead created event',
  });

  // LeadScored - v1
  registry.register('LeadScored', {
    version: 1,
    schema: z.object({
      leadId: z.string().uuid(),
      score: z.number().int().min(1).max(5),
      classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
    }),
    migrateTo: (payload) => {
      const v1 = payload as { leadId: string; score: number; classification: string };
      return {
        ...v1,
        confidence: 0.5, // Default confidence for v1 events
        scoredAt: new Date().toISOString(),
      };
    },
    description: 'Initial lead scoring event',
  });

  // LeadScored - v2 (with confidence)
  registry.register('LeadScored', {
    version: 2,
    schema: z.object({
      leadId: z.string().uuid(),
      score: z.number().int().min(1).max(5),
      classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
      confidence: z.number().min(0).max(1),
      scoredAt: z.string().datetime().optional(),
    }),
    description: 'Added confidence score and timestamp',
  });

  // LeadQualified - v1
  registry.register('LeadQualified', {
    version: 1,
    schema: z.object({
      classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
    }),
    description: 'Lead qualified event',
  });

  // LeadAssigned - v1
  registry.register('LeadAssigned', {
    version: 1,
    schema: z.object({
      assignedTo: z.string(),
    }),
    description: 'Lead assigned to user',
  });

  // LeadConverted - v1
  registry.register('LeadConverted', {
    version: 1,
    schema: z.object({
      hubspotContactId: z.string(),
    }),
    migrateTo: (payload) => {
      const v1 = payload as { hubspotContactId: string };
      return {
        ...v1,
        convertedAt: new Date().toISOString(),
        conversionSource: 'unknown',
      };
    },
    description: 'Lead converted to contact',
  });

  // LeadConverted - v2 (with conversion metadata)
  registry.register('LeadConverted', {
    version: 2,
    schema: z.object({
      hubspotContactId: z.string(),
      convertedAt: z.string().datetime(),
      conversionSource: z.string().optional(),
    }),
    description: 'Added conversion timestamp and source',
  });

  // LeadLost - v1
  registry.register('LeadLost', {
    version: 1,
    schema: z.object({
      reason: z.string(),
    }),
    description: 'Lead marked as lost',
  });

  // AppointmentScheduled - v1
  registry.register('AppointmentScheduled', {
    version: 1,
    schema: z.object({
      appointmentId: z.string().uuid(),
      patientId: z.string().uuid(),
      doctorId: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      type: z.string(),
    }),
    description: 'Appointment scheduled',
  });

  // AppointmentCancelled - v1
  registry.register('AppointmentCancelled', {
    version: 1,
    schema: z.object({
      appointmentId: z.string().uuid(),
      reason: z.string().optional(),
      cancelledBy: z.string().optional(),
    }),
    description: 'Appointment cancelled',
  });

  // MessageSent - v1
  registry.register('MessageSent', {
    version: 1,
    schema: z.object({
      messageId: z.string(),
      channel: z.enum(['whatsapp', 'sms', 'email']),
      to: z.string(),
      content: z.string().optional(),
      templateId: z.string().optional(),
    }),
    description: 'Message sent to contact',
  });

  // ConsentRecorded - v1
  registry.register('ConsentRecorded', {
    version: 1,
    schema: z.object({
      consentId: z.string().uuid(),
      patientId: z.string().uuid(),
      consentType: z.string(),
      granted: z.boolean(),
      source: z.string(),
    }),
    description: 'Patient consent recorded',
  });
}
