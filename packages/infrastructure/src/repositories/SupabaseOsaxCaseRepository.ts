/**
 * @fileoverview Supabase OSAX Case Repository
 *
 * Repository for OSAX case persistence with:
 * - PHI encryption via RPC
 * - Circuit breaker for resilience
 * - Domain event publishing
 * - Correlation ID propagation
 *
 * HEXAGONAL ARCHITECTURE: Adapter implementing repository port
 *
 * @module infrastructure/repositories/SupabaseOsaxCaseRepository
 */

import { createLogger, type Logger } from '@medicalcor/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OsaxCase, ComponentScore } from '@medicalcor/domain/osax';

// ============================================================================
// ERROR TYPES
// ============================================================================

/** Base repository error */
export class OsaxRepositoryError extends Error {
  readonly code: string;
  readonly correlationId: string | null;

  constructor(message: string, code: string, correlationId?: string) {
    super(message);
    this.name = 'OsaxRepositoryError';
    this.code = code;
    this.correlationId = correlationId ?? null;
  }
}

/** PHI encryption failed */
export class EncryptionError extends OsaxRepositoryError {
  constructor(message: string, correlationId?: string) {
    super(message, 'ENCRYPTION_ERROR', correlationId);
    this.name = 'EncryptionError';
  }
}

/** Database operation failed */
export class DatabaseError extends OsaxRepositoryError {
  readonly operation: string;

  constructor(operation: string, message: string, correlationId?: string) {
    super(message, 'DATABASE_ERROR', correlationId);
    this.name = 'DatabaseError';
    this.operation = operation;
  }
}

/** Record not found */
export class NotFoundError extends OsaxRepositoryError {
  readonly recordId: string;

  constructor(recordId: string, correlationId?: string) {
    super(`OSAX case not found: ${recordId}`, 'NOT_FOUND', correlationId);
    this.name = 'NotFoundError';
    this.recordId = recordId;
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30000;

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

interface OsaxCaseRow {
  id: string;
  subject_id: string;
  subject_type: 'lead' | 'patient';
  status: string;
  global_score: number | null;
  risk_class: 'RED' | 'YELLOW' | 'GREEN' | null;
  component_scores: Record<string, ComponentScore> | null;
  encrypted_medical_data: string | null;
  encryption_key_id: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  correlation_id: string | null;
}

// ============================================================================
// EVENT BUS INTERFACE
// ============================================================================

interface EventBus {
  publish(event: {
    type: string;
    aggregateId: string;
    aggregateType: string;
    correlationId?: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

const logger: Logger = createLogger({ name: 'supabase-osax-case-repository' });

/**
 * Supabase OSAX Case Repository
 *
 * Implements persistence for OSAX cases with PHI encryption.
 */
export class SupabaseOsaxCaseRepository {
  private readonly supabase: SupabaseClient;
  private readonly eventBus: EventBus;
  private readonly circuitBreaker: CircuitBreakerState;

  constructor(supabase: SupabaseClient, eventBus: EventBus) {
    this.supabase = supabase;
    this.eventBus = eventBus;
    this.circuitBreaker = {
      failures: 0,
      lastFailure: null,
      isOpen: false,
    };
  }

  /**
   * Save an OSAX case (create or update)
   */
  async save(osaxCase: OsaxCase, correlationId?: string): Promise<OsaxCase> {
    const corrId = correlationId ?? crypto.randomUUID();
    logger.info({ caseId: osaxCase.id, correlationId: corrId }, 'Saving OSAX case');

    const encryptedData = await this.encryptPHI(osaxCase, corrId);
    await this.persistToDatabase(osaxCase, encryptedData, corrId);
    await this.publishEvent('osax.case.saved', osaxCase, corrId);

    return osaxCase;
  }

  /**
   * Find OSAX case by ID
   */
  async findById(id: string, correlationId?: string): Promise<OsaxCase | null> {
    const corrId = correlationId ?? crypto.randomUUID();
    logger.debug({ caseId: id, correlationId: corrId }, 'Finding OSAX case by ID');

    const result = await this.supabase
      .from('osax_cases')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (result.error?.code === 'PGRST116') return null;
    if (result.error) throw new DatabaseError('findById', result.error.message, corrId);
    if (!result.data) return null;

    const row = result.data as OsaxCaseRow;
    const decryptedData = await this.decryptPHI(row, corrId);
    return this.rowToEntity(row, decryptedData);
  }

  /**
   * Find OSAX cases by subject ID
   */
  async findBySubjectId(subjectId: string, correlationId?: string): Promise<OsaxCase[]> {
    const corrId = correlationId ?? crypto.randomUUID();
    logger.debug({ subjectId, correlationId: corrId }, 'Finding OSAX cases by subject ID');

    const result = await this.supabase
      .from('osax_cases')
      .select('*')
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (result.error) throw new DatabaseError('findBySubjectId', result.error.message, corrId);

    const rows = (result.data ?? []) as OsaxCaseRow[];
    const cases: OsaxCase[] = [];

    for (const row of rows) {
      try {
        const decryptedData = await this.decryptPHI(row, corrId);
        cases.push(this.rowToEntity(row, decryptedData));
      } catch (err) {
        logger.warn({ caseId: row.id, error: err }, 'Failed to decrypt case, skipping');
      }
    }

    return cases;
  }

  /**
   * Soft delete an OSAX case
   */
  async delete(id: string, correlationId?: string): Promise<void> {
    const corrId = correlationId ?? crypto.randomUUID();
    logger.info({ caseId: id, correlationId: corrId }, 'Soft deleting OSAX case');

    const result = await this.supabase
      .from('osax_cases')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        correlation_id: corrId,
      })
      .eq('id', id);

    if (result.error) throw new DatabaseError('delete', result.error.message, corrId);

    await this.publishEvent('osax.case.deleted', { id } as unknown as OsaxCase, corrId);
  }

  /**
   * Save multiple OSAX cases in batch
   */
  async saveAll(cases: OsaxCase[], correlationId?: string): Promise<void> {
    const corrId = correlationId ?? crypto.randomUUID();
    logger.info({ count: cases.length, correlationId: corrId }, 'Batch saving OSAX cases');

    const errors: Error[] = [];

    for (const osaxCase of cases) {
      try {
        await this.save(osaxCase, corrId);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        logger.warn({ caseId: osaxCase.id, error: err }, 'Failed to save case in batch');
      }
    }

    if (errors.length > 0) {
      throw new DatabaseError(
        'saveAll',
        `Batch save failed: ${errors.length}/${cases.length} cases failed`,
        corrId
      );
    }
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async encryptPHI(osaxCase: OsaxCase, correlationId: string): Promise<Buffer | null> {
    if (this.isCircuitOpen()) {
      throw new EncryptionError('Encryption service unavailable (circuit open)', correlationId);
    }

    if (!osaxCase.encryptedMedicalData) return null;

    try {
      const result = await this.supabase.rpc('encrypt_phi', {
        plaintext: osaxCase.encryptedMedicalData.toString('base64'),
        key_id: osaxCase.encryptionKeyId,
      });

      if (result.error) throw result.error;
      this.recordSuccess();
      return Buffer.from(result.data as string, 'base64');
    } catch (err) {
      this.recordFailure();
      const message = err instanceof Error ? err.message : String(err);
      throw new EncryptionError(message, correlationId);
    }
  }

  private async decryptPHI(row: OsaxCaseRow, correlationId: string): Promise<Buffer | null> {
    if (!row.encrypted_medical_data) return null;

    if (this.isCircuitOpen()) {
      throw new EncryptionError('Decryption service unavailable (circuit open)', correlationId);
    }

    try {
      const result = await this.supabase.rpc('decrypt_phi', {
        ciphertext: row.encrypted_medical_data,
        key_id: row.encryption_key_id,
      });

      if (result.error) throw result.error;
      this.recordSuccess();
      return Buffer.from(result.data as string, 'base64');
    } catch (err) {
      this.recordFailure();
      const message = err instanceof Error ? err.message : String(err);
      throw new EncryptionError(message, correlationId);
    }
  }

  private async persistToDatabase(
    osaxCase: OsaxCase,
    encryptedData: Buffer | null,
    correlationId: string
  ): Promise<void> {
    const row: Partial<OsaxCaseRow> = {
      id: osaxCase.id,
      subject_id: osaxCase.subjectId,
      subject_type: osaxCase.subjectType,
      status: osaxCase.status,
      global_score: osaxCase.globalScore,
      risk_class: osaxCase.riskClass,
      component_scores: osaxCase.componentScores,
      encrypted_medical_data: encryptedData?.toString('base64') ?? null,
      encryption_key_id: osaxCase.encryptionKeyId,
      updated_at: new Date().toISOString(),
      correlation_id: correlationId,
    };

    const result = await this.supabase.from('osax_cases').upsert(row, { onConflict: 'id' });

    if (result.error) throw new DatabaseError('persist', result.error.message, correlationId);
  }

  private async publishEvent(
    eventType: string,
    osaxCase: OsaxCase,
    correlationId: string
  ): Promise<void> {
    try {
      await this.eventBus.publish({
        type: eventType,
        aggregateId: osaxCase.id,
        aggregateType: 'OsaxCase',
        correlationId,
        payload: {
          caseId: osaxCase.id,
          subjectId: osaxCase.subjectId,
          status: osaxCase.status,
          riskClass: osaxCase.riskClass,
        },
      });
    } catch (err) {
      logger.warn({ error: err, correlationId }, 'Failed to publish event (best-effort)');
    }
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;

    if (this.circuitBreaker.lastFailure) {
      const elapsed = Date.now() - this.circuitBreaker.lastFailure.getTime();
      if (elapsed > CIRCUIT_BREAKER_RESET_MS) {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
        logger.info('Circuit breaker reset');
        return false;
      }
    }

    return true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = new Date();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      logger.warn({ failures: this.circuitBreaker.failures }, 'Circuit breaker opened');
    }
  }

  private recordSuccess(): void {
    this.circuitBreaker.failures = 0;
  }

  private rowToEntity(row: OsaxCaseRow, decryptedData: Buffer | null): OsaxCase {
    return {
      id: row.id,
      subjectId: row.subject_id,
      subjectType: row.subject_type,
      status: row.status as OsaxCase['status'],
      globalScore: row.global_score,
      riskClass: row.risk_class,
      componentScores: row.component_scores,
      encryptedMedicalData: decryptedData,
      encryptionKeyId: row.encryption_key_id,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      correlationId: row.correlation_id,
    };
  }
}

/**
 * Factory function
 */
export function createSupabaseOsaxCaseRepository(
  supabase: SupabaseClient,
  eventBus: EventBus
): SupabaseOsaxCaseRepository {
  return new SupabaseOsaxCaseRepository(supabase, eventBus);
}
