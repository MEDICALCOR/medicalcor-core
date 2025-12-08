/**
 * @fileoverview GDPR Erasure Service for Cognitive Memory
 *
 * H4 Production Fix: Implements GDPR Article 17 (Right to Erasure) for
 * the Cognitive Episodic Memory system.
 *
 * Provides:
 * - Soft delete of episodic events for a subject
 * - Removal of behavioral patterns
 * - Anonymization of memory data
 * - Audit logging for compliance
 *
 * @module core/cognitive/gdpr-erasure
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import type { SubjectType } from './types.js';

const logger = createLogger({ name: 'cognitive-gdpr-erasure' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a GDPR erasure operation
 */
export interface CognitiveErasureResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Subject type that was erased */
  readonly subjectType: SubjectType;

  /** Subject ID that was erased */
  readonly subjectId: string;

  /** Number of episodic events soft-deleted */
  readonly episodicEventsDeleted: number;

  /** Number of behavioral patterns deleted */
  readonly behavioralPatternsDeleted: number;

  /** Timestamp of erasure */
  readonly erasedAt: Date;

  /** Reason for erasure */
  readonly reason: string;

  /** Error message if failed */
  readonly error?: string;
}

/**
 * Options for erasure operation
 */
export interface ErasureOptions {
  /** Reason for erasure (for audit) */
  reason: string;

  /** User/system requesting erasure */
  requestedBy?: string;

  /** Related DSR request ID if any */
  dsrRequestId?: string;

  /** Whether to perform hard delete (permanent) vs soft delete */
  hardDelete?: boolean;

  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Audit log entry for erasure
 */
interface ErasureAuditEntry {
  subjectType: SubjectType;
  subjectId: string;
  episodicEventsDeleted: number;
  behavioralPatternsDeleted: number;
  reason: string;
  requestedBy?: string;
  dsrRequestId?: string;
  erasureType: 'soft' | 'hard';
  correlationId?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * CognitiveGDPRErasureService
 *
 * Handles GDPR erasure requests for the Cognitive Memory system.
 * Supports both soft delete (setting deleted_at) and hard delete (permanent removal).
 */
export class CognitiveGDPRErasureService {
  constructor(private readonly pool: Pool) {}

  /**
   * Erase all cognitive memory data for a subject
   *
   * This implements GDPR Article 17 (Right to Erasure / Right to be Forgotten)
   * for the cognitive episodic memory system.
   *
   * @param subjectType - Type of subject (lead, patient, contact)
   * @param subjectId - UUID of the subject
   * @param options - Erasure options including reason and audit info
   * @returns Result of the erasure operation
   *
   * @example
   * ```typescript
   * const result = await erasureService.eraseSubjectMemory(
   *   'lead',
   *   'a1b2c3d4-...',
   *   { reason: 'GDPR erasure request', requestedBy: 'user-123' }
   * );
   * ```
   */
  async eraseSubjectMemory(
    subjectType: SubjectType,
    subjectId: string,
    options: ErasureOptions
  ): Promise<CognitiveErasureResult> {
    const client = await this.pool.connect();
    const startTime = Date.now();

    try {
      await client.query('BEGIN');

      let episodicEventsDeleted = 0;
      let behavioralPatternsDeleted = 0;

      if (options.hardDelete) {
        // Hard delete - permanent removal
        // First remove behavioral patterns (references episodic events)
        const patternsResult = await client.query(
          `DELETE FROM behavioral_patterns
           WHERE subject_type = $1 AND subject_id = $2
           RETURNING id`,
          [subjectType, subjectId]
        );
        behavioralPatternsDeleted = patternsResult.rowCount ?? 0;

        // Then remove episodic events
        const eventsResult = await client.query(
          `DELETE FROM episodic_events
           WHERE subject_type = $1 AND subject_id = $2
           RETURNING id`,
          [subjectType, subjectId]
        );
        episodicEventsDeleted = eventsResult.rowCount ?? 0;
      } else {
        // Soft delete - set deleted_at and clear sensitive data
        const eventsResult = await client.query(
          `UPDATE episodic_events
           SET
             deleted_at = NOW(),
             -- Clear embedding vector (anonymize)
             embedding = NULL,
             -- Clear summary (contains potentially identifying info)
             summary = '[REDACTED - GDPR ERASURE]',
             -- Clear key entities
             key_entities = '[]'::jsonb,
             -- Clear any metadata that might contain PII
             metadata = jsonb_build_object(
               'gdpr_erased', true,
               'erased_at', NOW()::text,
               'reason', $3
             ),
             updated_at = NOW()
           WHERE subject_type = $1
             AND subject_id = $2
             AND deleted_at IS NULL
           RETURNING id`,
          [subjectType, subjectId, options.reason]
        );
        episodicEventsDeleted = eventsResult.rowCount ?? 0;

        // Delete behavioral patterns (these are derived data, safe to hard delete)
        const patternsResult = await client.query(
          `DELETE FROM behavioral_patterns
           WHERE subject_type = $1 AND subject_id = $2
           RETURNING id`,
          [subjectType, subjectId]
        );
        behavioralPatternsDeleted = patternsResult.rowCount ?? 0;
      }

      // Log the erasure for audit compliance
      await this.logErasureAudit(client, {
        subjectType,
        subjectId,
        episodicEventsDeleted,
        behavioralPatternsDeleted,
        reason: options.reason,
        requestedBy: options.requestedBy,
        dsrRequestId: options.dsrRequestId,
        erasureType: options.hardDelete ? 'hard' : 'soft',
        correlationId: options.correlationId,
      });

      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      logger.info(
        {
          subjectType,
          subjectId: subjectId.substring(0, 8) + '...',
          episodicEventsDeleted,
          behavioralPatternsDeleted,
          erasureType: options.hardDelete ? 'hard' : 'soft',
          durationMs: duration,
        },
        'Cognitive memory GDPR erasure completed'
      );

      return {
        success: true,
        subjectType,
        subjectId,
        episodicEventsDeleted,
        behavioralPatternsDeleted,
        erasedAt: new Date(),
        reason: options.reason,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        {
          subjectType,
          subjectId: subjectId.substring(0, 8) + '...',
          error: errorMessage,
        },
        'Cognitive memory GDPR erasure failed'
      );

      return {
        success: false,
        subjectType,
        subjectId,
        episodicEventsDeleted: 0,
        behavioralPatternsDeleted: 0,
        erasedAt: new Date(),
        reason: options.reason,
        error: errorMessage,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Erase cognitive memory for multiple subjects
   *
   * Useful for batch erasure operations.
   */
  async eraseMultipleSubjects(
    subjects: { subjectType: SubjectType; subjectId: string }[],
    options: ErasureOptions
  ): Promise<CognitiveErasureResult[]> {
    const results: CognitiveErasureResult[] = [];

    for (const subject of subjects) {
      const result = await this.eraseSubjectMemory(subject.subjectType, subject.subjectId, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if a subject has any cognitive memory data
   */
  async hasMemoryData(subjectType: SubjectType, subjectId: string): Promise<boolean> {
    const result = await this.pool.query<{ has_data: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM episodic_events
        WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
        UNION ALL
        SELECT 1 FROM behavioral_patterns
        WHERE subject_type = $1 AND subject_id = $2
      ) as has_data`,
      [subjectType, subjectId]
    );

    return result.rows[0]?.has_data === true;
  }

  /**
   * Get count of memory records for a subject (for DSR data export)
   */
  async getMemoryDataCount(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<{ episodicEvents: number; behavioralPatterns: number }> {
    const eventsResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM episodic_events
       WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL`,
      [subjectType, subjectId]
    );

    const patternsResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM behavioral_patterns
       WHERE subject_type = $1 AND subject_id = $2`,
      [subjectType, subjectId]
    );

    return {
      episodicEvents: Number(eventsResult.rows[0]?.count ?? 0),
      behavioralPatterns: Number(patternsResult.rows[0]?.count ?? 0),
    };
  }

  /**
   * Export all cognitive memory data for a subject (GDPR portability)
   */
  async exportSubjectData(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<{
    episodicEvents: unknown[];
    behavioralPatterns: unknown[];
    exportedAt: Date;
  }> {
    const eventsResult = await this.pool.query(
      `SELECT
         id, subject_type, subject_id, event_type, event_category,
         source_channel, summary, key_entities, sentiment, intent,
         occurred_at, processed_at, metadata, created_at
       FROM episodic_events
       WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
       ORDER BY occurred_at DESC`,
      [subjectType, subjectId]
    );

    const patternsResult = await this.pool.query(
      `SELECT
         id, subject_type, subject_id, pattern_type, pattern_description,
         confidence, first_observed_at, last_observed_at, occurrence_count,
         metadata, created_at
       FROM behavioral_patterns
       WHERE subject_type = $1 AND subject_id = $2
       ORDER BY confidence DESC`,
      [subjectType, subjectId]
    );

    return {
      episodicEvents: eventsResult.rows,
      behavioralPatterns: patternsResult.rows,
      exportedAt: new Date(),
    };
  }

  /**
   * Purge soft-deleted records older than retention period
   *
   * Called by scheduled cleanup job to permanently remove
   * records that have been soft-deleted and exceeded retention.
   */
  async purgeExpiredRecords(retentionDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.pool.query(
      `DELETE FROM episodic_events
       WHERE deleted_at IS NOT NULL AND deleted_at < $1
       RETURNING id`,
      [cutoffDate]
    );

    const purgedCount = result.rowCount ?? 0;

    if (purgedCount > 0) {
      logger.info(
        { purgedCount, retentionDays },
        'Purged expired soft-deleted cognitive memory records'
      );
    }

    return purgedCount;
  }

  /**
   * Log erasure to audit table for GDPR compliance tracking
   */
  private async logErasureAudit(
    client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    entry: ErasureAuditEntry
  ): Promise<void> {
    // Try to log to gdpr_audit_log if it exists, otherwise log to domain_events
    try {
      await client.query(
        `INSERT INTO domain_events (
           id, event_type, aggregate_type, aggregate_id, payload, correlation_id
         ) VALUES (
           uuid_generate_v4(),
           'cognitive.memory_erased',
           $1,
           $2,
           $3,
           $4
         )`,
        [
          entry.subjectType,
          entry.subjectId,
          JSON.stringify({
            episodicEventsDeleted: entry.episodicEventsDeleted,
            behavioralPatternsDeleted: entry.behavioralPatternsDeleted,
            reason: entry.reason,
            requestedBy: entry.requestedBy,
            dsrRequestId: entry.dsrRequestId,
            erasureType: entry.erasureType,
            erasedAt: new Date().toISOString(),
          }),
          entry.correlationId,
        ]
      );
    } catch {
      // If domain_events doesn't exist, log via logger
      logger.info(
        {
          event: 'cognitive.memory_erased',
          ...entry,
          erasedAt: new Date().toISOString(),
        },
        'GDPR erasure audit log'
      );
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new CognitiveGDPRErasureService instance
 */
export function createCognitiveGDPRErasureService(pool: Pool): CognitiveGDPRErasureService {
  return new CognitiveGDPRErasureService(pool);
}
