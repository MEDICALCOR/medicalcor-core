/**
 * @fileoverview Unified GDPR Erasure Service
 *
 * H7 Production Fix: Comprehensive GDPR Article 17 (Right to Erasure)
 * implementation covering ALL tables with personal data.
 *
 * This service coordinates erasure across:
 * - CRM data (leads, interactions, treatment_plans, cases)
 * - Communication data (message_log, consent_records)
 * - Cognitive memory (episodic_events, behavioral_patterns)
 * - Analytics data (lead_scoring_history, message_embeddings)
 * - Financial data (payments - anonymization only)
 * - Event sourcing (domain_events - PII masking)
 *
 * @module core/security/gdpr/unified-erasure-service
 */

import { createLogger } from '../../logger.js';
import type { SubjectType } from '../../cognitive/types.js';
import type { DatabasePool, PoolClient } from '../../database.js';

const logger = createLogger({ name: 'unified-gdpr-erasure' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Subject identifier for erasure - can identify by various means
 */
export interface ErasureSubject {
  /** Primary identifier type */
  readonly identifierType: 'lead_id' | 'phone' | 'email' | 'hubspot_id';
  /** The identifier value */
  readonly identifier: string;
  /** Clinic ID for multi-tenant isolation */
  readonly clinicId?: string;
  /** Subject type for cognitive memory */
  readonly subjectType?: SubjectType;
}

/**
 * Options for unified erasure operation
 */
export interface UnifiedErasureOptions {
  /** Reason for erasure (required for GDPR compliance) */
  readonly reason: string;
  /** Who or what is requesting the erasure */
  readonly requestedBy: string;
  /** Related DSR request ID if applicable */
  readonly dsrRequestId?: string;
  /** Hard delete (permanent) vs soft delete */
  readonly hardDelete?: boolean;
  /** Correlation ID for distributed tracing */
  readonly correlationId: string;
  /** Skip certain tables (for partial erasure) */
  readonly skipTables?: string[];
  /** Include dependent records (default: true) */
  readonly includeDependents?: boolean;
}

/**
 * Result from a single table erasure
 */
export interface TableErasureResult {
  readonly tableName: string;
  readonly recordsAffected: number;
  readonly erasureType: 'soft_delete' | 'hard_delete' | 'anonymize' | 'skipped';
  readonly error?: string;
}

/**
 * Comprehensive result from unified erasure
 */
export interface UnifiedErasureResult {
  readonly success: boolean;
  readonly identifier: string;
  readonly identifierType: string;
  readonly totalRecordsAffected: number;
  readonly tableResults: TableErasureResult[];
  readonly erasedAt: Date;
  readonly reason: string;
  readonly requestedBy: string;
  readonly dsrRequestId?: string;
  readonly correlationId: string;
  readonly retentionPeriodDays?: number;
  readonly estimatedPermanentDeletion?: Date;
  readonly errors: string[];
}

/**
 * Tables with PII and their erasure strategy
 */
interface TableConfig {
  /** Table name */
  name: string;
  /** How to identify subject records */
  identifierColumn: string;
  /** How to find records: 'direct' (column match) or 'via_lead' (join through leads) */
  lookupStrategy: 'direct' | 'via_lead' | 'via_case';
  /** Erasure strategy */
  strategy: 'soft_delete' | 'hard_delete' | 'anonymize';
  /** Fields to anonymize (for anonymize strategy) */
  anonymizeFields?: string[];
  /** Has deleted_at column */
  hasSoftDelete: boolean;
  /** Dependencies (tables that reference this one) */
  dependsOn?: string[];
}

// ============================================================================
// TABLE CONFIGURATION
// ============================================================================

/**
 * All tables containing PII with their erasure configuration
 */
const TABLE_CONFIGS: TableConfig[] = [
  // === CRM Core ===
  {
    name: 'leads',
    identifierColumn: 'id',
    lookupStrategy: 'direct',
    strategy: 'soft_delete',
    hasSoftDelete: true,
  },
  {
    name: 'interactions',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'soft_delete',
    hasSoftDelete: true,
    dependsOn: ['leads'],
  },
  {
    name: 'treatment_plans',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'soft_delete',
    hasSoftDelete: true,
    dependsOn: ['leads'],
  },
  {
    name: 'lead_events',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'hard_delete', // Immutable events - must hard delete for GDPR
    hasSoftDelete: false,
    dependsOn: ['leads'],
  },

  // === Cases & Payments (anonymize - legal retention required) ===
  {
    name: 'cases',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'soft_delete',
    hasSoftDelete: true,
    dependsOn: ['leads', 'treatment_plans'],
  },
  {
    name: 'payments',
    identifierColumn: 'case_id',
    lookupStrategy: 'via_case',
    strategy: 'anonymize', // Financial records need retention
    anonymizeFields: ['notes'],
    hasSoftDelete: false,
    dependsOn: ['cases'],
  },
  {
    name: 'payment_plans',
    identifierColumn: 'case_id',
    lookupStrategy: 'via_case',
    strategy: 'soft_delete',
    hasSoftDelete: false, // Will add deleted_at
    dependsOn: ['cases'],
  },

  // === Communication ===
  {
    name: 'message_log',
    identifierColumn: 'phone',
    lookupStrategy: 'direct',
    strategy: 'soft_delete',
    hasSoftDelete: true,
  },
  {
    name: 'consent_records',
    identifierColumn: 'phone',
    lookupStrategy: 'direct',
    strategy: 'soft_delete',
    hasSoftDelete: true,
  },

  // === Scheduling ===
  {
    name: 'appointments',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'soft_delete',
    hasSoftDelete: true,
    dependsOn: ['leads'],
  },

  // === Analytics ===
  {
    name: 'lead_scoring_history',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'hard_delete',
    hasSoftDelete: false,
    dependsOn: ['leads'],
  },
  {
    name: 'message_embeddings',
    identifierColumn: 'phone',
    lookupStrategy: 'direct',
    strategy: 'hard_delete', // Embeddings of personal messages
    hasSoftDelete: false,
  },

  // === Cognitive Memory ===
  {
    name: 'episodic_events',
    identifierColumn: 'subject_id',
    lookupStrategy: 'direct',
    strategy: 'soft_delete',
    hasSoftDelete: true,
  },
  {
    name: 'behavioral_patterns',
    identifierColumn: 'subject_id',
    lookupStrategy: 'direct',
    strategy: 'hard_delete',
    hasSoftDelete: false,
  },

  // === Knowledge Graph ===
  {
    name: 'knowledge_entities',
    identifierColumn: 'source_id',
    lookupStrategy: 'direct',
    strategy: 'soft_delete',
    hasSoftDelete: true,
  },

  // === Waiting List ===
  {
    name: 'waiting_list',
    identifierColumn: 'lead_id',
    lookupStrategy: 'via_lead',
    strategy: 'soft_delete',
    hasSoftDelete: true,
    dependsOn: ['leads'],
  },

  // === Domain Events (special handling - PII masking) ===
  {
    name: 'domain_events',
    identifierColumn: 'aggregate_id',
    lookupStrategy: 'direct',
    strategy: 'anonymize',
    anonymizeFields: ['payload'],
    hasSoftDelete: false,
  },
];

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * UnifiedGDPRErasureService
 *
 * Coordinates GDPR Article 17 erasure across all tables containing personal data.
 * Ensures comprehensive data erasure while maintaining audit trails and legal compliance.
 */
export class UnifiedGDPRErasureService {
  private readonly RETENTION_PERIOD_DAYS = 30;

  constructor(private readonly pool: DatabasePool) {}

  /**
   * Process all tables for erasure in dependency order
   */
  private async processAllTables(
    client: PoolClient,
    subject: ErasureSubject,
    leadIds: string[],
    caseIds: string[],
    options: UnifiedErasureOptions
  ): Promise<{
    tableResults: TableErasureResult[];
    totalRecordsAffected: number;
    errors: string[];
  }> {
    const tableResults: TableErasureResult[] = [];
    const errors: string[] = [];
    let totalRecordsAffected = 0;

    const sortedTables = this.sortTablesByDependency(TABLE_CONFIGS);

    for (const tableConfig of sortedTables) {
      const result = await this.processTableErasure(
        client,
        tableConfig,
        subject,
        leadIds,
        caseIds,
        options
      );

      tableResults.push(result.tableResult);
      totalRecordsAffected += result.tableResult.recordsAffected;
      if (result.error) {
        errors.push(result.error);
      }
    }

    return { tableResults, totalRecordsAffected, errors };
  }

  /**
   * Process erasure for a single table with error handling
   */
  private async processTableErasure(
    client: PoolClient,
    tableConfig: TableConfig,
    subject: ErasureSubject,
    leadIds: string[],
    caseIds: string[],
    options: UnifiedErasureOptions
  ): Promise<{ tableResult: TableErasureResult; error?: string }> {
    if (options.skipTables?.includes(tableConfig.name)) {
      return {
        tableResult: { tableName: tableConfig.name, recordsAffected: 0, erasureType: 'skipped' },
      };
    }

    try {
      const tableResult = await this.eraseFromTable(
        client,
        tableConfig,
        subject,
        leadIds,
        caseIds,
        options
      );
      return { tableResult };
    } catch (err) {
      const errorMsg = `Failed to erase from ${tableConfig.name}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      logger.error({ table: tableConfig.name, error: err }, 'Table erasure failed');
      return {
        tableResult: {
          tableName: tableConfig.name,
          recordsAffected: 0,
          erasureType: 'skipped',
          error: errorMsg,
        },
        error: errorMsg,
      };
    }
  }

  /**
   * Build success result for erasure operation
   */
  private buildSuccessResult(
    subject: ErasureSubject,
    options: UnifiedErasureOptions,
    tableResults: TableErasureResult[],
    totalRecordsAffected: number,
    errors: string[]
  ): UnifiedErasureResult {
    const permanentDeletionDate = new Date();
    permanentDeletionDate.setDate(permanentDeletionDate.getDate() + this.RETENTION_PERIOD_DAYS);

    return {
      success: errors.length === 0,
      identifier: subject.identifier,
      identifierType: subject.identifierType,
      totalRecordsAffected,
      tableResults,
      erasedAt: new Date(),
      reason: options.reason,
      requestedBy: options.requestedBy,
      dsrRequestId: options.dsrRequestId,
      correlationId: options.correlationId,
      retentionPeriodDays: options.hardDelete ? undefined : this.RETENTION_PERIOD_DAYS,
      estimatedPermanentDeletion: options.hardDelete ? undefined : permanentDeletionDate,
      errors,
    };
  }

  /**
   * Build failure result for erasure operation
   */
  private buildFailureResult(
    subject: ErasureSubject,
    options: UnifiedErasureOptions,
    tableResults: TableErasureResult[],
    errorMessage: string
  ): UnifiedErasureResult {
    return {
      success: false,
      identifier: subject.identifier,
      identifierType: subject.identifierType,
      totalRecordsAffected: 0,
      tableResults,
      erasedAt: new Date(),
      reason: options.reason,
      requestedBy: options.requestedBy,
      dsrRequestId: options.dsrRequestId,
      correlationId: options.correlationId,
      errors: [errorMessage],
    };
  }

  /**
   * Erase all personal data for a subject across the entire system
   *
   * @param subject - The subject to erase
   * @param options - Erasure options
   * @returns Comprehensive erasure result
   *
   * @example
   * ```typescript
   * const result = await erasureService.eraseSubject(
   *   { identifierType: 'phone', identifier: '+40123456789' },
   *   { reason: 'GDPR erasure request', requestedBy: 'user-123', correlationId: 'req-456' }
   * );
   * ```
   */
  async eraseSubject(
    subject: ErasureSubject,
    options: UnifiedErasureOptions
  ): Promise<UnifiedErasureResult> {
    const client = await this.pool.connect();
    const startTime = Date.now();
    let tableResults: TableErasureResult[] = [];

    logger.info(
      {
        identifierType: subject.identifierType,
        identifier: this.maskIdentifier(subject.identifier),
        clinicId: subject.clinicId,
        hardDelete: options.hardDelete,
        correlationId: options.correlationId,
      },
      'Starting unified GDPR erasure'
    );

    try {
      await client.query('BEGIN');

      // Step 1: Resolve subject identifiers
      const leadIds = await this.resolveLeadIds(client, subject);
      const caseIds = await this.resolveCaseIds(client, leadIds);

      logger.info(
        {
          leadCount: leadIds.length,
          caseCount: caseIds.length,
          correlationId: options.correlationId,
        },
        'Resolved subject records'
      );

      // Step 2: Process all tables
      const {
        tableResults: results,
        totalRecordsAffected,
        errors,
      } = await this.processAllTables(client, subject, leadIds, caseIds, options);
      tableResults = results;

      // Step 3: Log audit entry and commit
      await this.logErasureAudit(client, subject, options, tableResults, totalRecordsAffected);
      await client.query('COMMIT');

      logger.info(
        {
          identifier: this.maskIdentifier(subject.identifier),
          totalRecordsAffected,
          tableCount: tableResults.length,
          errorCount: errors.length,
          durationMs: Date.now() - startTime,
          correlationId: options.correlationId,
        },
        'Unified GDPR erasure completed'
      );

      return this.buildSuccessResult(subject, options, tableResults, totalRecordsAffected, errors);
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        {
          identifier: this.maskIdentifier(subject.identifier),
          error: errorMessage,
          correlationId: options.correlationId,
        },
        'Unified GDPR erasure failed'
      );

      return this.buildFailureResult(subject, options, tableResults, errorMessage);
    } finally {
      client.release();
    }
  }

  /**
   * Get a preview of what would be erased (dry run)
   */
  async previewErasure(
    subject: ErasureSubject
  ): Promise<{ tableName: string; recordCount: number }[]> {
    const client = await this.pool.connect();

    try {
      const leadIds = await this.resolveLeadIds(client, subject);
      const caseIds = await this.resolveCaseIds(client, leadIds);
      const preview: { tableName: string; recordCount: number }[] = [];

      for (const tableConfig of TABLE_CONFIGS) {
        const count = await this.countRecords(client, tableConfig, subject, leadIds, caseIds);
        if (count > 0) {
          preview.push({ tableName: tableConfig.name, recordCount: count });
        }
      }

      return preview;
    } finally {
      client.release();
    }
  }

  /**
   * Purge soft-deleted records older than retention period
   */
  async purgeExpiredRecords(): Promise<{ tableName: string; purgedCount: number }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIOD_DAYS);
    const results: { tableName: string; purgedCount: number }[] = [];

    for (const tableConfig of TABLE_CONFIGS) {
      if (tableConfig.hasSoftDelete) {
        try {
          const result = await this.pool.query(
            `DELETE FROM ${tableConfig.name}
             WHERE deleted_at IS NOT NULL AND deleted_at < $1
             RETURNING id`,
            [cutoffDate]
          );
          const purgedCount = result.rowCount ?? 0;
          if (purgedCount > 0) {
            results.push({ tableName: tableConfig.name, purgedCount });
          }
        } catch {
          // Table might not exist, skip
        }
      }
    }

    logger.info({ results, cutoffDate }, 'Expired records purged');
    return results;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Resolve all lead IDs for a subject identifier
   */
  private async resolveLeadIds(client: PoolClient, subject: ErasureSubject): Promise<string[]> {
    let query: string;
    const params: unknown[] = [];

    switch (subject.identifierType) {
      case 'lead_id':
        return [subject.identifier];

      case 'phone':
        query = 'SELECT id FROM leads WHERE phone = $1';
        params.push(subject.identifier);
        break;

      case 'email':
        query = 'SELECT id FROM leads WHERE email = $1';
        params.push(subject.identifier);
        break;

      case 'hubspot_id':
        query = 'SELECT id FROM leads WHERE external_contact_id = $1 AND external_source = $2';
        params.push(subject.identifier, 'hubspot');
        break;

      default:
        return [];
    }

    if (subject.clinicId) {
      query += ` AND clinic_id = $${params.length + 1}`;
      params.push(subject.clinicId);
    }

    const result = await client.query<{ id: string }>(query, params);
    return result.rows.map((r) => r.id);
  }

  /**
   * Resolve case IDs from lead IDs
   */
  private async resolveCaseIds(client: PoolClient, leadIds: string[]): Promise<string[]> {
    if (leadIds.length === 0) return [];

    const result = await client.query<{ id: string }>(
      'SELECT id FROM cases WHERE lead_id = ANY($1)',
      [leadIds]
    );
    return result.rows.map((r) => r.id);
  }

  /**
   * Execute soft delete strategy on a table
   */
  private async executeSoftDelete(
    client: PoolClient,
    tableName: string,
    hasSoftDelete: boolean,
    whereClause: { condition: string; params: unknown[] }
  ): Promise<{ recordsAffected: number; erasureType: 'soft_delete' | 'hard_delete' }> {
    if (hasSoftDelete) {
      const result = await client.query(
        `UPDATE ${tableName}
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE ${whereClause.condition} AND deleted_at IS NULL
         RETURNING id`,
        whereClause.params
      );
      return { recordsAffected: result.rowCount ?? 0, erasureType: 'soft_delete' };
    }

    // Fallback to hard delete if no soft delete column
    const result = await client.query(
      `DELETE FROM ${tableName} WHERE ${whereClause.condition} RETURNING id`,
      whereClause.params
    );
    return { recordsAffected: result.rowCount ?? 0, erasureType: 'hard_delete' };
  }

  /**
   * Execute hard delete strategy on a table
   */
  private async executeHardDelete(
    client: PoolClient,
    tableName: string,
    whereClause: { condition: string; params: unknown[] }
  ): Promise<{ recordsAffected: number; erasureType: 'hard_delete' }> {
    const result = await client.query(
      `DELETE FROM ${tableName} WHERE ${whereClause.condition} RETURNING id`,
      whereClause.params
    );
    return { recordsAffected: result.rowCount ?? 0, erasureType: 'hard_delete' };
  }

  /**
   * Execute anonymization for domain_events table (special JSONB handling)
   */
  private async anonymizeDomainEvents(
    client: PoolClient,
    whereClause: { condition: string; params: unknown[] }
  ): Promise<number> {
    const result = await client.query(
      `UPDATE domain_events
       SET payload = jsonb_set(
         jsonb_set(
           jsonb_set(payload, '{phone}', '"[REDACTED]"'::jsonb, false),
           '{email}', '"[REDACTED]"'::jsonb, false
         ),
         '{name}', '"[REDACTED]"'::jsonb, false
       ),
       updated_at = NOW()
       WHERE ${whereClause.condition}
       RETURNING id`,
      whereClause.params
    );
    return result.rowCount ?? 0;
  }

  /**
   * Execute generic field anonymization on a table
   */
  private async anonymizeFields(
    client: PoolClient,
    tableName: string,
    fields: string[],
    whereClause: { condition: string; params: unknown[] }
  ): Promise<number> {
    const setClauses = fields.map((field) => `${field} = '[REDACTED - GDPR]'`).join(', ');
    const result = await client.query(
      `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClause.condition} RETURNING id`,
      whereClause.params
    );
    return result.rowCount ?? 0;
  }

  /**
   * Execute anonymize strategy on a table
   */
  private async executeAnonymize(
    client: PoolClient,
    tableName: string,
    anonymizeFields: string[] | undefined,
    whereClause: { condition: string; params: unknown[] }
  ): Promise<{ recordsAffected: number; erasureType: 'anonymize' }> {
    let recordsAffected = 0;

    if (tableName === 'domain_events') {
      recordsAffected = await this.anonymizeDomainEvents(client, whereClause);
    } else if (anonymizeFields && anonymizeFields.length > 0) {
      recordsAffected = await this.anonymizeFields(client, tableName, anonymizeFields, whereClause);
    }

    return { recordsAffected, erasureType: 'anonymize' };
  }

  /**
   * Erase records from a single table using the configured strategy
   */
  private async eraseFromTable(
    client: PoolClient,
    config: TableConfig,
    subject: ErasureSubject,
    leadIds: string[],
    caseIds: string[],
    options: UnifiedErasureOptions
  ): Promise<TableErasureResult> {
    const tableExists = await this.tableExists(client, config.name);
    if (!tableExists) {
      return { tableName: config.name, recordsAffected: 0, erasureType: 'skipped' };
    }

    const whereClause = this.buildWhereClause(config, subject, leadIds, caseIds);
    if (!whereClause.condition) {
      return { tableName: config.name, recordsAffected: 0, erasureType: 'skipped' };
    }

    const strategy = options.hardDelete ? 'hard_delete' : config.strategy;

    switch (strategy) {
      case 'soft_delete': {
        const result = await this.executeSoftDelete(
          client,
          config.name,
          config.hasSoftDelete,
          whereClause
        );
        return { tableName: config.name, ...result };
      }

      case 'hard_delete': {
        const result = await this.executeHardDelete(client, config.name, whereClause);
        return { tableName: config.name, ...result };
      }

      case 'anonymize': {
        const result = await this.executeAnonymize(
          client,
          config.name,
          config.anonymizeFields,
          whereClause
        );
        return { tableName: config.name, ...result };
      }

      default:
        return { tableName: config.name, recordsAffected: 0, erasureType: 'skipped' };
    }
  }

  /**
   * Count records that would be affected
   */
  private async countRecords(
    client: PoolClient,
    config: TableConfig,
    subject: ErasureSubject,
    leadIds: string[],
    caseIds: string[]
  ): Promise<number> {
    const tableExists = await this.tableExists(client, config.name);
    if (!tableExists) return 0;

    const whereClause = this.buildWhereClause(config, subject, leadIds, caseIds);
    if (!whereClause.condition) return 0;

    const deletedFilter = config.hasSoftDelete ? ' AND deleted_at IS NULL' : '';
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${config.name} WHERE ${whereClause.condition}${deletedFilter}`,
      whereClause.params
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Build WHERE clause for a table based on lookup strategy
   */
  private buildWhereClause(
    config: TableConfig,
    subject: ErasureSubject,
    leadIds: string[],
    caseIds: string[]
  ): { condition: string; params: unknown[] } {
    switch (config.lookupStrategy) {
      case 'direct':
        if (config.identifierColumn === 'phone' && subject.identifierType === 'phone') {
          return { condition: 'phone = $1', params: [subject.identifier] };
        }
        if (config.identifierColumn === 'subject_id' && subject.identifierType === 'lead_id') {
          return { condition: 'subject_id = $1', params: [subject.identifier] };
        }
        if (config.identifierColumn === 'aggregate_id' && leadIds.length > 0) {
          return { condition: 'aggregate_id = ANY($1)', params: [leadIds] };
        }
        if (config.identifierColumn === 'source_id' && leadIds.length > 0) {
          return { condition: 'source_id = ANY($1)', params: [leadIds] };
        }
        if (config.identifierColumn === 'id' && subject.identifierType === 'lead_id') {
          return { condition: 'id = $1', params: [subject.identifier] };
        }
        return { condition: '', params: [] };

      case 'via_lead':
        if (leadIds.length === 0) return { condition: '', params: [] };
        return { condition: `${config.identifierColumn} = ANY($1)`, params: [leadIds] };

      case 'via_case':
        if (caseIds.length === 0) return { condition: '', params: [] };
        return { condition: `${config.identifierColumn} = ANY($1)`, params: [caseIds] };

      default:
        return { condition: '', params: [] };
    }
  }

  /**
   * Check if a table exists
   */
  private async tableExists(client: PoolClient, tableName: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) as exists`,
      [tableName]
    );
    return result.rows[0]?.exists === true;
  }

  /**
   * Sort tables by dependency (children first for deletion)
   */
  private sortTablesByDependency(tables: TableConfig[]): TableConfig[] {
    const sorted: TableConfig[] = [];
    const visited = new Set<string>();

    const visit = (table: TableConfig): void => {
      if (visited.has(table.name)) return;

      // Visit dependencies first (but we want them AFTER in deletion order)
      // So we add the table before visiting dependencies
      visited.add(table.name);

      // Find tables that depend on this one and visit them first
      for (const t of tables) {
        if (t.dependsOn?.includes(table.name)) {
          visit(t);
        }
      }

      sorted.push(table);
    };

    // Start with tables that have no dependencies
    const noDeps = tables.filter((t) => !t.dependsOn || t.dependsOn.length === 0);
    for (const t of noDeps) {
      visit(t);
    }

    // Then process remaining
    for (const t of tables) {
      visit(t);
    }

    // Reverse to get children first (for foreign key constraints)
    return sorted.reverse();
  }

  /**
   * Log erasure to audit table
   */
  private async logErasureAudit(
    client: PoolClient,
    subject: ErasureSubject,
    options: UnifiedErasureOptions,
    tableResults: TableErasureResult[],
    totalRecordsAffected: number
  ): Promise<void> {
    try {
      await client.query(
        `INSERT INTO domain_events (
           id, event_type, aggregate_type, aggregate_id, payload, correlation_id
         ) VALUES (
           uuid_generate_v4(),
           'gdpr.unified_erasure_completed',
           'gdpr_subject',
           $1,
           $2,
           $3
         )`,
        [
          subject.identifier,
          JSON.stringify({
            identifierType: subject.identifierType,
            clinicId: subject.clinicId,
            reason: options.reason,
            requestedBy: options.requestedBy,
            dsrRequestId: options.dsrRequestId,
            hardDelete: options.hardDelete,
            totalRecordsAffected,
            tableResults: tableResults.map((r) => ({
              table: r.tableName,
              count: r.recordsAffected,
              type: r.erasureType,
            })),
            erasedAt: new Date().toISOString(),
          }),
          options.correlationId,
        ]
      );
    } catch {
      // If domain_events doesn't exist, just log
      logger.info(
        {
          event: 'gdpr.unified_erasure_completed',
          identifier: this.maskIdentifier(subject.identifier),
          totalRecordsAffected,
          correlationId: options.correlationId,
        },
        'GDPR erasure audit log (fallback)'
      );
    }
  }

  /**
   * Mask identifier for logging
   */
  private maskIdentifier(identifier: string): string {
    if (identifier.length <= 4) return '****';
    return identifier.substring(0, 2) + '****' + identifier.substring(identifier.length - 2);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new UnifiedGDPRErasureService instance
 */
export function createUnifiedGDPRErasureService(pool: DatabasePool): UnifiedGDPRErasureService {
  return new UnifiedGDPRErasureService(pool);
}
