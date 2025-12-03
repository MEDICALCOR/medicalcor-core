/**
 * Saga Repository for Distributed Transaction Persistence
 *
 * Provides durable storage for saga state, enabling:
 * - Saga recovery after process restart
 * - Distributed transaction coordination
 * - Compensation (rollback) workflow support
 * - Audit trail for business processes
 *
 * Sagas represent long-running business processes that span multiple
 * aggregate boundaries (e.g., lead onboarding, appointment booking).
 */

import { createLogger, type Logger } from '../logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Saga status values
 */
export type SagaStatus =
  | 'pending' // Not yet started
  | 'running' // Currently executing
  | 'completed' // Successfully finished
  | 'failed' // Failed and not recoverable
  | 'compensating' // Running compensation logic
  | 'compensated' // Successfully rolled back
  | 'timeout'; // Timed out

/**
 * Saga state interface
 */
export interface SagaState<T = unknown> {
  sagaId: string;
  sagaType: string;
  correlationId: string;
  state: T;
  status: SagaStatus;
  currentStep: number;
  totalSteps: number;
  stepHistory: SagaStepHistory[];
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  timeoutAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
}

/**
 * Step execution history entry
 */
export interface SagaStepHistory {
  step: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Options for creating a new saga
 */
export interface CreateSagaOptions<T> {
  sagaType: string;
  correlationId: string;
  initialState: T;
  totalSteps?: number;
  timeoutMs?: number;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

/**
 * Options for finding sagas
 */
export interface FindSagasOptions {
  sagaType?: string;
  status?: SagaStatus | SagaStatus[];
  correlationId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Saga repository interface (for testing/mocking)
 */
export interface SagaRepository {
  create<T>(options: CreateSagaOptions<T>): Promise<SagaState<T>>;
  save<T>(saga: SagaState<T>): Promise<void>;
  findById<T>(sagaId: string): Promise<SagaState<T> | null>;
  findByCorrelationId<T>(correlationId: string, sagaType: string): Promise<SagaState<T> | null>;
  findPending(sagaType?: string): Promise<SagaState[]>;
  findForRecovery(): Promise<SagaState[]>;
  markCompleted(sagaId: string): Promise<void>;
  markFailed(sagaId: string, error: string): Promise<void>;
  markCompensating(sagaId: string): Promise<void>;
  markCompensated(sagaId: string): Promise<void>;
  appendStepHistory(
    sagaId: string,
    stepName: string,
    data?: Record<string, unknown>
  ): Promise<void>;
  findTimedOut(): Promise<SagaState[]>;
  delete(sagaId: string): Promise<boolean>;
  cleanup(olderThanDays: number): Promise<number>;
}

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

interface SagaRow {
  saga_id: string;
  saga_type: string;
  correlation_id: string;
  state: Record<string, unknown>;
  status: SagaStatus;
  current_step: number;
  total_steps: number;
  step_history: SagaStepHistory[];
  started_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  timeout_at: Date | null;
  error_message: string | null;
  error_stack: string | null;
  retry_count: number;
  max_retries: number;
  metadata: Record<string, unknown>;
}

// ============================================================================
// IN-MEMORY SAGA REPOSITORY (for testing)
// ============================================================================

export class InMemorySagaRepository implements SagaRepository {
  private sagas = new Map<string, SagaState>();

  create<T>(options: CreateSagaOptions<T>): Promise<SagaState<T>> {
    const saga: SagaState<T> = {
      sagaId: crypto.randomUUID(),
      sagaType: options.sagaType,
      correlationId: options.correlationId,
      state: options.initialState,
      status: 'pending',
      currentStep: 0,
      totalSteps: options.totalSteps ?? 0,
      stepHistory: [],
      startedAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      timeoutAt: options.timeoutMs ? new Date(Date.now() + options.timeoutMs) : null,
      errorMessage: null,
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      metadata: options.metadata ?? {},
    };

    this.sagas.set(saga.sagaId, saga as SagaState);
    return Promise.resolve(saga);
  }

  save<T>(saga: SagaState<T>): Promise<void> {
    saga.updatedAt = new Date();
    this.sagas.set(saga.sagaId, saga as SagaState);
    return Promise.resolve();
  }

  findById<T>(sagaId: string): Promise<SagaState<T> | null> {
    const saga = this.sagas.get(sagaId);
    return Promise.resolve(saga ? (saga as SagaState<T>) : null);
  }

  findByCorrelationId<T>(correlationId: string, sagaType: string): Promise<SagaState<T> | null> {
    for (const saga of this.sagas.values()) {
      if (saga.correlationId === correlationId && saga.sagaType === sagaType) {
        return Promise.resolve(saga as SagaState<T>);
      }
    }
    return Promise.resolve(null);
  }

  findPending(sagaType?: string): Promise<SagaState[]> {
    const pending: SagaState[] = [];
    for (const saga of this.sagas.values()) {
      if (
        ['pending', 'running', 'compensating'].includes(saga.status) &&
        (!sagaType || saga.sagaType === sagaType)
      ) {
        pending.push(saga);
      }
    }
    return Promise.resolve(pending.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()));
  }

  findForRecovery(): Promise<SagaState[]> {
    return this.findPending();
  }

  markCompleted(sagaId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (saga) {
      saga.status = 'completed';
      saga.completedAt = new Date();
      saga.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  markFailed(sagaId: string, error: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (saga) {
      saga.status = 'failed';
      saga.errorMessage = error;
      saga.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  markCompensating(sagaId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (saga) {
      saga.status = 'compensating';
      saga.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  markCompensated(sagaId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (saga) {
      saga.status = 'compensated';
      saga.completedAt = new Date();
      saga.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  appendStepHistory(
    sagaId: string,
    stepName: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (saga) {
      saga.stepHistory.push({
        step: stepName,
        timestamp: new Date().toISOString(),
        data,
      });
      saga.updatedAt = new Date();
    }
    return Promise.resolve();
  }

  findTimedOut(): Promise<SagaState[]> {
    const now = new Date();
    const timedOut: SagaState[] = [];
    for (const saga of this.sagas.values()) {
      if (['pending', 'running'].includes(saga.status) && saga.timeoutAt && saga.timeoutAt <= now) {
        timedOut.push(saga);
      }
    }
    return Promise.resolve(timedOut);
  }

  delete(sagaId: string): Promise<boolean> {
    return Promise.resolve(this.sagas.delete(sagaId));
  }

  cleanup(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let deleted = 0;
    for (const [id, saga] of this.sagas) {
      if (
        ['completed', 'failed', 'compensated'].includes(saga.status) &&
        saga.completedAt &&
        saga.completedAt < cutoff
      ) {
        this.sagas.delete(id);
        deleted++;
      }
    }
    return Promise.resolve(deleted);
  }

  // Test helpers
  clear(): void {
    this.sagas.clear();
  }

  size(): number {
    return this.sagas.size;
  }
}

// ============================================================================
// POSTGRESQL SAGA REPOSITORY
// ============================================================================

export class PostgresSagaRepository implements SagaRepository {
  private pool: unknown;
  private logger: Logger;
  private initialized = false;

  constructor(private connectionString?: string) {
    this.logger = createLogger({ name: 'saga-repository' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.connectionString) {
      throw new Error('PostgreSQL connection string required');
    }

    const pg = await import('pg');
    this.pool = new pg.default.Pool({
      connectionString: this.connectionString,
      max: 5,
    });

    this.initialized = true;
    this.logger.info('Saga repository initialized');
  }

  private async getClient(): Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: SagaRow[]; rowCount: number }>;
    release: () => void;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    return (this.pool as { connect: () => Promise<unknown> }).connect() as Promise<{
      query: (sql: string, params?: unknown[]) => Promise<{ rows: SagaRow[]; rowCount: number }>;
      release: () => void;
    }>;
  }

  async create<T>(options: CreateSagaOptions<T>): Promise<SagaState<T>> {
    const client = await this.getClient();

    try {
      const timeoutAt = options.timeoutMs ? new Date(Date.now() + options.timeoutMs) : null;

      const result = await client.query(
        `INSERT INTO saga_store (
          saga_type, correlation_id, state, status, current_step, total_steps,
          timeout_at, max_retries, metadata, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          options.sagaType,
          options.correlationId,
          JSON.stringify(options.initialState),
          'pending',
          0,
          options.totalSteps ?? 0,
          timeoutAt,
          options.maxRetries ?? 3,
          JSON.stringify(options.metadata ?? {}),
          options.createdBy ?? null,
        ]
      );

      const saga = this.rowToSaga<T>(result.rows[0]!);

      this.logger.debug(
        { sagaId: saga.sagaId, sagaType: saga.sagaType, correlationId: saga.correlationId },
        'Created new saga'
      );

      return saga;
    } finally {
      client.release();
    }
  }

  async save<T>(saga: SagaState<T>): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `UPDATE saga_store SET
          state = $2,
          status = $3,
          current_step = $4,
          total_steps = $5,
          step_history = $6,
          completed_at = $7,
          timeout_at = $8,
          error_message = $9,
          retry_count = $10,
          metadata = $11
        WHERE saga_id = $1`,
        [
          saga.sagaId,
          JSON.stringify(saga.state),
          saga.status,
          saga.currentStep,
          saga.totalSteps,
          JSON.stringify(saga.stepHistory),
          saga.completedAt,
          saga.timeoutAt,
          saga.errorMessage,
          saga.retryCount,
          JSON.stringify(saga.metadata),
        ]
      );

      this.logger.debug(
        { sagaId: saga.sagaId, status: saga.status, currentStep: saga.currentStep },
        'Saved saga'
      );
    } finally {
      client.release();
    }
  }

  async findById<T>(sagaId: string): Promise<SagaState<T> | null> {
    const client = await this.getClient();

    try {
      const result = await client.query(`SELECT * FROM saga_store WHERE saga_id = $1`, [sagaId]);

      if (result.rows.length === 0) return null;
      return this.rowToSaga<T>(result.rows[0]!);
    } finally {
      client.release();
    }
  }

  async findByCorrelationId<T>(
    correlationId: string,
    sagaType: string
  ): Promise<SagaState<T> | null> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT * FROM saga_store
         WHERE correlation_id = $1 AND saga_type = $2
         ORDER BY started_at DESC
         LIMIT 1`,
        [correlationId, sagaType]
      );

      if (result.rows.length === 0) return null;
      return this.rowToSaga<T>(result.rows[0]!);
    } finally {
      client.release();
    }
  }

  async findPending(sagaType?: string): Promise<SagaState[]> {
    const client = await this.getClient();

    try {
      const params: unknown[] = [];
      let query = `
        SELECT * FROM saga_store
        WHERE status IN ('pending', 'running', 'compensating')
      `;

      if (sagaType) {
        query += ` AND saga_type = $1`;
        params.push(sagaType);
      }

      query += ` ORDER BY started_at ASC`;

      const result = await client.query(query, params);
      return result.rows.map((row) => this.rowToSaga(row));
    } finally {
      client.release();
    }
  }

  async findForRecovery(): Promise<SagaState[]> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        SELECT * FROM saga_store
        WHERE status IN ('pending', 'running', 'compensating')
        ORDER BY saga_type, started_at ASC
      `);

      return result.rows.map((row) => this.rowToSaga(row));
    } finally {
      client.release();
    }
  }

  async markCompleted(sagaId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `UPDATE saga_store
         SET status = 'completed', completed_at = NOW()
         WHERE saga_id = $1`,
        [sagaId]
      );

      this.logger.info({ sagaId }, 'Saga completed');
    } finally {
      client.release();
    }
  }

  async markFailed(sagaId: string, error: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `UPDATE saga_store
         SET status = 'failed', error_message = $2, completed_at = NOW()
         WHERE saga_id = $1`,
        [sagaId, error]
      );

      this.logger.error({ sagaId, error }, 'Saga failed');
    } finally {
      client.release();
    }
  }

  async markCompensating(sagaId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `UPDATE saga_store
         SET status = 'compensating'
         WHERE saga_id = $1`,
        [sagaId]
      );

      this.logger.info({ sagaId }, 'Saga entering compensation');
    } finally {
      client.release();
    }
  }

  async markCompensated(sagaId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `UPDATE saga_store
         SET status = 'compensated', completed_at = NOW()
         WHERE saga_id = $1`,
        [sagaId]
      );

      this.logger.info({ sagaId }, 'Saga compensated (rolled back)');
    } finally {
      client.release();
    }
  }

  async appendStepHistory(
    sagaId: string,
    stepName: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(`SELECT append_saga_step($1, $2, $3)`, [
        sagaId,
        stepName,
        JSON.stringify(data),
      ]);
    } finally {
      client.release();
    }
  }

  async findTimedOut(): Promise<SagaState[]> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        SELECT * FROM saga_store
        WHERE status IN ('pending', 'running')
          AND timeout_at IS NOT NULL
          AND timeout_at <= NOW()
        ORDER BY timeout_at ASC
      `);

      return result.rows.map((row) => this.rowToSaga(row));
    } finally {
      client.release();
    }
  }

  async delete(sagaId: string): Promise<boolean> {
    const client = await this.getClient();

    try {
      const result = await client.query(`DELETE FROM saga_store WHERE saga_id = $1`, [sagaId]);

      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async cleanup(olderThanDays: number): Promise<number> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `DELETE FROM saga_store
         WHERE status IN ('completed', 'failed', 'compensated')
           AND completed_at < NOW() - INTERVAL '1 day' * $1`,
        [olderThanDays]
      );

      const deleted = result.rowCount;
      if (deleted > 0) {
        this.logger.info({ deleted, olderThanDays }, 'Cleaned up old sagas');
      }

      return deleted;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await (this.pool as { end: () => Promise<void> }).end();
      this.initialized = false;
    }
  }

  private rowToSaga<T>(row: SagaRow): SagaState<T> {
    return {
      sagaId: row.saga_id,
      sagaType: row.saga_type,
      correlationId: row.correlation_id,
      state: row.state as T,
      status: row.status,
      currentStep: row.current_step,
      totalSteps: row.total_steps,
      stepHistory: row.step_history,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      timeoutAt: row.timeout_at,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      metadata: row.metadata,
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a saga repository
 */
export function createSagaRepository(connectionString?: string): SagaRepository {
  if (connectionString) {
    return new PostgresSagaRepository(connectionString);
  }
  return new InMemorySagaRepository();
}

/**
 * Create an in-memory saga repository (for testing)
 */
export function createInMemorySagaRepository(): InMemorySagaRepository {
  return new InMemorySagaRepository();
}
