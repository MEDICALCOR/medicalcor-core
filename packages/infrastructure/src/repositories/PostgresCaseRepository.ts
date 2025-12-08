/**
 * @fileoverview PostgreSQL Case Repository (Infrastructure Layer)
 *
 * Concrete PostgreSQL adapter implementing the ICaseRepository port
 * from the domain layer. Handles all database operations for cases,
 * payments, payment plans, and LTV analytics.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-case-repository
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the port (ICaseRepository) defined in the domain.
 * The domain layer depends only on the interface, not this implementation.
 *
 * @example
 * ```typescript
 * import { PostgresCaseRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresCaseRepository({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * const ltv = await repository.getLeadLTV('lead-uuid');
 * const revenue = await repository.getMonthlyRevenue('clinic-uuid', startDate, endDate);
 * ```
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger,
  RecordNotFoundError,
  type RecordUpdateError,
  type RecordDeleteError,
} from '@medicalcor/core';

// ============================================================================
// REPOSITORY ERROR TYPES
// ============================================================================

/** Error types that can be returned from PostgresCaseRepository operations */
export type CaseRepositoryError = RecordNotFoundError | RecordUpdateError | RecordDeleteError;

import type {
  Case,
  Payment,
  PaymentPlan,
  PaymentPlanInstallment,
  CreateCaseInput,
  CreatePaymentInput,
  ICaseRepository,
  CaseQueryFilters,
  PaginationOptions,
  PaginatedResult,
  LeadLTV,
  MonthlyRevenue,
  CasePipelineSummary,
  CohortLTVSummary,
  CohortComparison,
  CohortLTVEvolutionPoint,
  CohortQueryOptions,
} from '@medicalcor/domain';

const logger = createLogger({ name: 'postgres-case-repository' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for PostgreSQL Case Repository
 */
export interface PostgresCaseRepositoryConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Maximum connections in the pool (default: 10) */
  maxConnections?: number;
  /** Default page size for paginated queries (default: 50) */
  defaultPageSize?: number;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface CaseRow {
  id: string;
  clinic_id: string;
  lead_id: string;
  treatment_plan_id: string;
  case_number: string;
  status: string;
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  currency: string;
  payment_status: string;
  financing_provider: string | null;
  financing_reference: string | null;
  financing_approved_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  expected_completion_date: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  version: number | null;
}

interface PaymentRow {
  id: string;
  case_id: string;
  clinic_id: string;
  payment_reference: string;
  external_reference: string | null;
  amount: string;
  currency: string;
  type: string;
  method: string;
  status: string;
  processed_at: Date | null;
  processor_name: string | null;
  processor_transaction_id: string | null;
  failure_reason: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  received_by: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentPlanRow {
  id: string;
  case_id: string;
  name: string;
  total_amount: string;
  number_of_installments: number;
  installment_amount: string;
  frequency: string;
  start_date: Date;
  next_due_date: Date | null;
  status: string;
  installments_paid: number;
  total_paid: string;
  interest_rate: string;
  late_fee: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface InstallmentRow {
  id: string;
  payment_plan_id: string;
  payment_id: string | null;
  installment_number: number;
  amount: string;
  due_date: Date;
  status: string;
  paid_at: Date | null;
  paid_amount: string | null;
  late_fee_applied: string;
  reminder_sent_at: Date | null;
  reminder_count: number;
  created_at: Date;
  updated_at: Date;
}

interface LeadLTVRow {
  lead_id: string;
  clinic_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  lead_created_at: Date;
  total_cases: string;
  completed_cases: string;
  total_case_value: string;
  total_paid: string;
  total_outstanding: string;
  avg_case_value: string;
  first_case_date: Date | null;
  last_case_date: Date | null;
}

interface MonthlyRevenueRow {
  month: Date;
  clinic_id: string;
  cases_with_payments: string;
  payment_count: string;
  gross_revenue: string;
  refunds: string;
  net_revenue: string;
  avg_payment_amount: string | null;
}

interface CasePipelineRow {
  clinic_id: string;
  status: string;
  payment_status: string;
  case_count: string;
  total_value: string;
  paid_value: string;
  outstanding_value: string;
  avg_case_value: string;
}

interface CohortLTVRow {
  clinic_id: string;
  cohort_month: Date;
  acquisition_source: string | null;
  acquisition_channel: string | null;
  cohort_size: string;
  converted_leads: string;
  conversion_rate: string | null;
  total_revenue: string;
  total_collected: string;
  total_outstanding: string;
  avg_ltv: string | null;
  avg_ltv_converted: string | null;
  total_cases: string;
  completed_cases: string;
  avg_cases_per_customer: string | null;
  avg_days_to_first_case: string | null;
  max_months_active: string | null;
  collection_rate: string | null;
}

interface CohortComparisonRow extends CohortLTVRow {
  prev_cohort_avg_ltv: string | null;
  ltv_growth_vs_prev: string | null;
  yoy_cohort_avg_ltv: string | null;
  ltv_growth_yoy: string | null;
}

interface CohortEvolutionRow {
  clinic_id: string;
  cohort_month: Date;
  months_since_acquisition: number;
  cohort_size: string;
  period_revenue: string;
  paying_customers: string;
  cumulative_revenue: string;
  cumulative_ltv_per_lead: string | null;
  paying_percentage: string | null;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the Case Repository
 *
 * This adapter implements the ICaseRepository port from the domain layer,
 * providing concrete PostgreSQL database operations for cases, payments,
 * and LTV analytics.
 *
 * Features:
 * - Connection pooling
 * - Soft delete support
 * - LTV analytics using pre-built database views
 * - Cohort analysis queries
 * - Pagination support
 * - RLS-aware queries (requires app.current_clinic_id setting)
 */
export class PostgresCaseRepository implements ICaseRepository {
  private pool: Pool;
  private defaultPageSize: number;

  constructor(config: PostgresCaseRepositoryConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 10,
    });
    this.defaultPageSize = config.defaultPageSize ?? 50;

    logger.info('PostgresCaseRepository initialized');
  }

  // ============================================================================
  // CASE OPERATIONS
  // ============================================================================

  async findById(id: string): Promise<Case | null> {
    const sql = `
      SELECT * FROM cases
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query<CaseRow>(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToCase(result.rows[0]!);
  }

  async findByCaseNumber(clinicId: string, caseNumber: string): Promise<Case | null> {
    const sql = `
      SELECT * FROM cases
      WHERE clinic_id = $1 AND case_number = $2 AND deleted_at IS NULL
    `;

    const result = await this.pool.query<CaseRow>(sql, [clinicId, caseNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToCase(result.rows[0]!);
  }

  async findMany(
    filters: CaseQueryFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Case>> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.clinicId) {
      conditions.push(`clinic_id = $${paramIndex++}`);
      params.push(filters.clinicId);
    }

    if (filters.leadId) {
      conditions.push(`lead_id = $${paramIndex++}`);
      params.push(filters.leadId);
    }

    if (filters.treatmentPlanId) {
      conditions.push(`treatment_plan_id = $${paramIndex++}`);
      params.push(filters.treatmentPlanId);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex++})`);
        params.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }
    }

    if (filters.paymentStatus) {
      if (Array.isArray(filters.paymentStatus)) {
        conditions.push(`payment_status = ANY($${paramIndex++})`);
        params.push(filters.paymentStatus);
      } else {
        conditions.push(`payment_status = $${paramIndex++}`);
        params.push(filters.paymentStatus);
      }
    }

    if (filters.hasOutstanding !== undefined) {
      if (filters.hasOutstanding) {
        conditions.push('outstanding_amount > 0');
      } else {
        conditions.push('outstanding_amount = 0');
      }
    }

    if (filters.createdAfter) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.createdAfter);
    }

    if (filters.createdBefore) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.createdBefore);
    }

    const whereClause = conditions.join(' AND ');
    const limit = pagination?.limit ?? this.defaultPageSize;
    const offset = pagination?.offset ?? 0;
    const orderBy = pagination?.orderBy ?? 'createdAt';
    const orderDirection = pagination?.orderDirection ?? 'desc';

    const orderByColumn = this.mapOrderByColumn(orderBy);

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM cases WHERE ${whereClause}`;
    const countResult = await this.pool.query<{ total: string }>(countSql, params);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Get paginated results
    const dataSql = `
      SELECT * FROM cases
      WHERE ${whereClause}
      ORDER BY ${orderByColumn} ${orderDirection.toUpperCase()}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const dataResult = await this.pool.query<CaseRow>(dataSql, params);
    const data = dataResult.rows.map((row) => this.mapRowToCase(row));

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  async findByLeadId(leadId: string): Promise<Case[]> {
    const sql = `
      SELECT * FROM cases
      WHERE lead_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<CaseRow>(sql, [leadId]);
    return result.rows.map((row) => this.mapRowToCase(row));
  }

  async create(input: CreateCaseInput): Promise<Case> {
    const id = uuidv4();
    const now = new Date();

    const sql = `
      INSERT INTO cases (
        id, clinic_id, lead_id, treatment_plan_id, case_number,
        status, total_amount, paid_amount, currency,
        payment_status, expected_completion_date, notes,
        created_by, created_at, updated_at, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        'pending', $6, 0, $7,
        'unpaid', $8, $9,
        $10, $11, $11, '{}'
      )
      RETURNING *
    `;

    const result = await this.pool.query<CaseRow>(sql, [
      id,
      input.clinicId,
      input.leadId,
      input.treatmentPlanId,
      input.caseNumber,
      input.totalAmount,
      input.currency ?? 'EUR',
      input.expectedCompletionDate ?? null,
      input.notes ?? null,
      input.createdBy ?? null,
      now,
    ]);

    logger.info({ caseId: id, clinicId: input.clinicId }, 'Case created');

    return this.mapRowToCase(result.rows[0]!);
  }

  /**
   * Update a case
   * @throws RecordNotFoundError if case not found
   */
  async update(id: string, updates: Partial<Omit<Case, 'id' | 'createdAt'>>): Promise<Case> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIndex = 2;

    const fieldMap: Record<string, string> = {
      clinicId: 'clinic_id',
      leadId: 'lead_id',
      treatmentPlanId: 'treatment_plan_id',
      caseNumber: 'case_number',
      status: 'status',
      totalAmount: 'total_amount',
      paidAmount: 'paid_amount',
      currency: 'currency',
      paymentStatus: 'payment_status',
      financingProvider: 'financing_provider',
      financingReference: 'financing_reference',
      financingApprovedAt: 'financing_approved_at',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      expectedCompletionDate: 'expected_completion_date',
      notes: 'notes',
      metadata: 'metadata',
      updatedBy: 'updated_by',
      deletedAt: 'deleted_at',
    };

    for (const [key, value] of Object.entries(updates)) {
      const column = fieldMap[key];
      if (column) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push(value);
      }
    }

    const sql = `
      UPDATE cases
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query<CaseRow>(sql, params);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('CaseRepository', 'Case', id);
    }

    logger.info({ caseId: id }, 'Case updated');

    return this.mapRowToCase(result.rows[0]!);
  }

  /**
   * Soft delete a case
   * @throws RecordNotFoundError if case not found
   */
  async softDelete(id: string, deletedBy?: string): Promise<void> {
    const sql = `
      UPDATE cases
      SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(sql, [id, deletedBy ?? null]);

    if (result.rowCount === 0) {
      throw new RecordNotFoundError('CaseRepository', 'Case', id);
    }

    logger.info({ caseId: id, deletedBy }, 'Case soft deleted');
  }

  async generateCaseNumber(clinicId: string): Promise<string> {
    const sql = 'SELECT generate_case_number($1) as case_number';
    const result = await this.pool.query<{ case_number: string }>(sql, [clinicId]);
    return result.rows[0]!.case_number;
  }

  // ============================================================================
  // PAYMENT OPERATIONS
  // ============================================================================

  async findPaymentById(id: string): Promise<Payment | null> {
    const sql = 'SELECT * FROM payments WHERE id = $1';
    const result = await this.pool.query<PaymentRow>(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPayment(result.rows[0]!);
  }

  async findPaymentsByCaseId(caseId: string): Promise<Payment[]> {
    const sql = `
      SELECT * FROM payments
      WHERE case_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<PaymentRow>(sql, [caseId]);
    return result.rows.map((row) => this.mapRowToPayment(row));
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const id = uuidv4();
    const now = new Date();

    const sql = `
      INSERT INTO payments (
        id, case_id, clinic_id, payment_reference,
        external_reference, amount, currency, type, method,
        status, notes, created_by, created_at, updated_at, metadata
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        'pending', $10, $11, $12, $12, '{}'
      )
      RETURNING *
    `;

    const result = await this.pool.query<PaymentRow>(sql, [
      id,
      input.caseId,
      input.clinicId,
      input.paymentReference,
      input.externalReference ?? null,
      input.amount,
      input.currency ?? 'EUR',
      input.type ?? 'payment',
      input.method,
      input.notes ?? null,
      input.createdBy ?? null,
      now,
    ]);

    logger.info({ paymentId: id, caseId: input.caseId }, 'Payment created');

    return this.mapRowToPayment(result.rows[0]!);
  }

  /**
   * Update a payment
   * @throws RecordNotFoundError if payment not found
   */
  async updatePayment(
    id: string,
    updates: Partial<Omit<Payment, 'id' | 'createdAt'>>
  ): Promise<Payment> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIndex = 2;

    const fieldMap: Record<string, string> = {
      caseId: 'case_id',
      clinicId: 'clinic_id',
      paymentReference: 'payment_reference',
      externalReference: 'external_reference',
      amount: 'amount',
      currency: 'currency',
      type: 'type',
      method: 'method',
      status: 'status',
      processedAt: 'processed_at',
      processorName: 'processor_name',
      processorTransactionId: 'processor_transaction_id',
      failureReason: 'failure_reason',
      receiptNumber: 'receipt_number',
      receiptUrl: 'receipt_url',
      notes: 'notes',
      metadata: 'metadata',
      receivedBy: 'received_by',
    };

    for (const [key, value] of Object.entries(updates)) {
      const column = fieldMap[key];
      if (column) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push(value);
      }
    }

    const sql = `
      UPDATE payments
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query<PaymentRow>(sql, params);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('CaseRepository', 'Payment', id);
    }

    logger.info({ paymentId: id }, 'Payment updated');

    return this.mapRowToPayment(result.rows[0]!);
  }

  /**
   * Process a payment
   * @throws RecordNotFoundError if payment not found
   */
  async processPayment(
    paymentId: string,
    processorName: string,
    processorTransactionId: string
  ): Promise<Payment> {
    const sql = `
      UPDATE payments
      SET status = 'completed',
          processed_at = NOW(),
          processor_name = $2,
          processor_transaction_id = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query<PaymentRow>(sql, [
      paymentId,
      processorName,
      processorTransactionId,
    ]);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('CaseRepository', 'Payment', paymentId);
    }

    logger.info({ paymentId, processorName }, 'Payment processed');

    return this.mapRowToPayment(result.rows[0]!);
  }

  /**
   * Mark a payment as failed
   * @throws RecordNotFoundError if payment not found
   */
  async failPayment(paymentId: string, reason: string): Promise<Payment> {
    const sql = `
      UPDATE payments
      SET status = 'failed',
          failure_reason = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query<PaymentRow>(sql, [paymentId, reason]);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('CaseRepository', 'Payment', paymentId);
    }

    logger.info({ paymentId, reason }, 'Payment failed');

    return this.mapRowToPayment(result.rows[0]!);
  }

  async generatePaymentReference(clinicId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PAY-${year}-`;

    const sql = `
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(payment_reference FROM 'PAY-[0-9]{4}-([0-9]+)') AS INTEGER)
      ), 0) + 1 as next_seq
      FROM payments
      WHERE clinic_id = $1
      AND payment_reference LIKE $2
    `;

    const result = await this.pool.query<{ next_seq: string }>(sql, [clinicId, `${prefix}%`]);
    const nextSeq = parseInt(result.rows[0]?.next_seq ?? '1', 10);

    return `${prefix}${nextSeq.toString().padStart(6, '0')}`;
  }

  // ============================================================================
  // PAYMENT PLAN OPERATIONS
  // ============================================================================

  async findPaymentPlanById(id: string): Promise<PaymentPlan | null> {
    const sql = 'SELECT * FROM payment_plans WHERE id = $1';
    const result = await this.pool.query<PaymentPlanRow>(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPaymentPlan(result.rows[0]!);
  }

  async findPaymentPlansByCaseId(caseId: string): Promise<PaymentPlan[]> {
    const sql = `
      SELECT * FROM payment_plans
      WHERE case_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<PaymentPlanRow>(sql, [caseId]);
    return result.rows.map((row) => this.mapRowToPaymentPlan(row));
  }

  async createPaymentPlan(
    caseId: string,
    name: string,
    totalAmount: number,
    numberOfInstallments: number,
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly',
    startDate: Date
  ): Promise<PaymentPlan> {
    const id = uuidv4();
    const installmentAmount = Math.ceil((totalAmount / numberOfInstallments) * 100) / 100;
    const now = new Date();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create the payment plan
      const planSql = `
        INSERT INTO payment_plans (
          id, case_id, name, total_amount, number_of_installments,
          installment_amount, frequency, start_date, next_due_date,
          status, installments_paid, total_paid,
          created_at, updated_at, metadata
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $8,
          'active', 0, 0,
          $9, $9, '{}'
        )
        RETURNING *
      `;

      const planResult = await client.query<PaymentPlanRow>(planSql, [
        id,
        caseId,
        name,
        totalAmount,
        numberOfInstallments,
        installmentAmount,
        frequency,
        startDate,
        now,
      ]);

      // Create installments
      const installmentSql = `
        INSERT INTO payment_plan_installments (
          id, payment_plan_id, installment_number, amount,
          due_date, status, late_fee_applied, reminder_count,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', 0, 0, $6, $6)
      `;

      for (let i = 0; i < numberOfInstallments; i++) {
        const dueDate = this.calculateInstallmentDueDate(startDate, frequency, i);
        await client.query(installmentSql, [uuidv4(), id, i + 1, installmentAmount, dueDate, now]);
      }

      await client.query('COMMIT');

      logger.info({ paymentPlanId: id, caseId, numberOfInstallments }, 'Payment plan created');

      return this.mapRowToPaymentPlan(planResult.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, caseId }, 'Failed to create payment plan');
      throw error;
    } finally {
      client.release();
    }
  }

  async findInstallments(paymentPlanId: string): Promise<PaymentPlanInstallment[]> {
    const sql = `
      SELECT * FROM payment_plan_installments
      WHERE payment_plan_id = $1
      ORDER BY installment_number ASC
    `;

    const result = await this.pool.query<InstallmentRow>(sql, [paymentPlanId]);
    return result.rows.map((row) => this.mapRowToInstallment(row));
  }

  async findOverdueInstallments(clinicId?: string): Promise<PaymentPlanInstallment[]> {
    let sql = `
      SELECT ppi.* FROM payment_plan_installments ppi
      JOIN payment_plans pp ON pp.id = ppi.payment_plan_id
      JOIN cases c ON c.id = pp.case_id
      WHERE ppi.status IN ('pending', 'overdue')
      AND ppi.due_date < CURRENT_DATE
      AND pp.status = 'active'
      AND c.deleted_at IS NULL
    `;

    const params: unknown[] = [];

    if (clinicId) {
      sql += ' AND c.clinic_id = $1';
      params.push(clinicId);
    }

    sql += ' ORDER BY ppi.due_date ASC';

    const result = await this.pool.query<InstallmentRow>(sql, params);
    return result.rows.map((row) => this.mapRowToInstallment(row));
  }

  async markInstallmentPaid(
    installmentId: string,
    paymentId: string,
    paidAmount: number
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update installment
      await client.query(
        `
        UPDATE payment_plan_installments
        SET status = 'paid',
            payment_id = $2,
            paid_at = NOW(),
            paid_amount = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
        [installmentId, paymentId, paidAmount]
      );

      // Update payment plan totals
      await client.query(
        `
        UPDATE payment_plans pp
        SET installments_paid = (
              SELECT COUNT(*) FROM payment_plan_installments
              WHERE payment_plan_id = pp.id AND status = 'paid'
            ),
            total_paid = (
              SELECT COALESCE(SUM(paid_amount), 0) FROM payment_plan_installments
              WHERE payment_plan_id = pp.id AND status = 'paid'
            ),
            next_due_date = (
              SELECT MIN(due_date) FROM payment_plan_installments
              WHERE payment_plan_id = pp.id AND status IN ('pending', 'overdue')
            ),
            status = CASE
              WHEN (SELECT COUNT(*) FROM payment_plan_installments
                    WHERE payment_plan_id = pp.id AND status IN ('pending', 'overdue')) = 0
              THEN 'completed'
              ELSE pp.status
            END,
            updated_at = NOW()
        WHERE pp.id = (
          SELECT payment_plan_id FROM payment_plan_installments WHERE id = $1
        )
      `,
        [installmentId]
      );

      await client.query('COMMIT');

      logger.info({ installmentId, paymentId, paidAmount }, 'Installment marked as paid');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // ANALYTICS OPERATIONS
  // ============================================================================

  async getLeadLTV(leadId: string): Promise<LeadLTV | null> {
    const sql = 'SELECT * FROM lead_ltv WHERE lead_id = $1';
    const result = await this.pool.query<LeadLTVRow>(sql, [leadId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToLeadLTV(result.rows[0]!);
  }

  async getClinicLeadLTVs(
    clinicId: string,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<LeadLTV>> {
    const limit = pagination?.limit ?? this.defaultPageSize;
    const offset = pagination?.offset ?? 0;
    const orderBy = pagination?.orderBy ?? 'totalAmount';
    const orderDirection = pagination?.orderDirection ?? 'desc';

    const orderByColumn = this.mapLTVOrderByColumn(orderBy);

    // Get total count
    const countSql = 'SELECT COUNT(*) as total FROM lead_ltv WHERE clinic_id = $1';
    const countResult = await this.pool.query<{ total: string }>(countSql, [clinicId]);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Get paginated results
    const dataSql = `
      SELECT * FROM lead_ltv
      WHERE clinic_id = $1
      ORDER BY ${orderByColumn} ${orderDirection.toUpperCase()}
      LIMIT $2 OFFSET $3
    `;

    const dataResult = await this.pool.query<LeadLTVRow>(dataSql, [clinicId, limit, offset]);
    const data = dataResult.rows.map((row) => this.mapRowToLeadLTV(row));

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  async getMonthlyRevenue(
    clinicId: string,
    startMonth: Date,
    endMonth: Date
  ): Promise<MonthlyRevenue[]> {
    const sql = `
      SELECT * FROM monthly_revenue
      WHERE clinic_id = $1
      AND month >= DATE_TRUNC('month', $2::timestamp)
      AND month <= DATE_TRUNC('month', $3::timestamp)
      ORDER BY month DESC
    `;

    const result = await this.pool.query<MonthlyRevenueRow>(sql, [clinicId, startMonth, endMonth]);
    return result.rows.map((row) => this.mapRowToMonthlyRevenue(row));
  }

  async getCasePipeline(clinicId: string): Promise<CasePipelineSummary[]> {
    const sql = 'SELECT * FROM case_pipeline WHERE clinic_id = $1';
    const result = await this.pool.query<CasePipelineRow>(sql, [clinicId]);
    return result.rows.map((row) => this.mapRowToCasePipeline(row));
  }

  async getTotalOutstanding(clinicId: string): Promise<number> {
    const sql = `
      SELECT COALESCE(SUM(outstanding_amount), 0) as total
      FROM cases
      WHERE clinic_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query<{ total: string }>(sql, [clinicId]);
    return parseFloat(result.rows[0]?.total ?? '0');
  }

  // ============================================================================
  // COHORT LTV OPERATIONS
  // ============================================================================

  async getCohortLTVSummaries(
    clinicId: string,
    options?: CohortQueryOptions
  ): Promise<CohortLTVSummary[]> {
    const conditions: string[] = ['l.clinic_id = $1', 'l.deleted_at IS NULL'];
    const params: unknown[] = [clinicId];
    let paramIndex = 2;

    if (options?.startMonth) {
      conditions.push(
        `DATE_TRUNC('month', l.created_at) >= DATE_TRUNC('month', $${paramIndex++}::timestamp)`
      );
      params.push(options.startMonth);
    }

    if (options?.endMonth) {
      conditions.push(
        `DATE_TRUNC('month', l.created_at) <= DATE_TRUNC('month', $${paramIndex++}::timestamp)`
      );
      params.push(options.endMonth);
    }

    if (options?.acquisitionSource) {
      conditions.push(`l.source = $${paramIndex++}`);
      params.push(options.acquisitionSource);
    }

    if (options?.acquisitionChannel) {
      conditions.push(`l.channel = $${paramIndex++}`);
      params.push(options.acquisitionChannel);
    }

    const whereClause = conditions.join(' AND ');
    const limit = options?.limit ?? 24;

    const sql = `
      WITH cohort_data AS (
        SELECT
          l.clinic_id,
          DATE_TRUNC('month', l.created_at) AS cohort_month,
          l.source AS acquisition_source,
          l.channel AS acquisition_channel,
          COUNT(DISTINCT l.id) AS cohort_size,
          COUNT(DISTINCT c.lead_id) AS converted_leads,
          COALESCE(SUM(c.total_amount), 0) AS total_revenue,
          COALESCE(SUM(c.paid_amount), 0) AS total_collected,
          COALESCE(SUM(c.outstanding_amount), 0) AS total_outstanding,
          COUNT(DISTINCT c.id) AS total_cases,
          COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed') AS completed_cases,
          AVG(EXTRACT(EPOCH FROM (c.created_at - l.created_at)) / 86400)
            FILTER (WHERE c.id IS NOT NULL) AS avg_days_to_first_case,
          MAX(EXTRACT(YEAR FROM AGE(CURRENT_DATE, l.created_at)) * 12 +
              EXTRACT(MONTH FROM AGE(CURRENT_DATE, l.created_at))) AS max_months_active
        FROM leads l
        LEFT JOIN cases c ON c.lead_id = l.id AND c.deleted_at IS NULL
        WHERE ${whereClause}
        GROUP BY l.clinic_id, DATE_TRUNC('month', l.created_at), l.source, l.channel
      )
      SELECT
        clinic_id,
        cohort_month,
        acquisition_source,
        acquisition_channel,
        cohort_size,
        converted_leads,
        CASE WHEN cohort_size > 0
          THEN (converted_leads::DECIMAL / cohort_size * 100)
          ELSE NULL
        END AS conversion_rate,
        total_revenue,
        total_collected,
        total_outstanding,
        CASE WHEN cohort_size > 0
          THEN (total_collected / cohort_size)
          ELSE NULL
        END AS avg_ltv,
        CASE WHEN converted_leads > 0
          THEN (total_collected / converted_leads)
          ELSE NULL
        END AS avg_ltv_converted,
        total_cases,
        completed_cases,
        CASE WHEN converted_leads > 0
          THEN (total_cases::DECIMAL / converted_leads)
          ELSE NULL
        END AS avg_cases_per_customer,
        avg_days_to_first_case,
        max_months_active,
        CASE WHEN total_revenue > 0
          THEN (total_collected / total_revenue * 100)
          ELSE NULL
        END AS collection_rate
      FROM cohort_data
      ORDER BY cohort_month DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    const result = await this.pool.query<CohortLTVRow>(sql, params);
    return result.rows.map((row) => this.mapRowToCohortLTVSummary(row));
  }

  async getCohortComparisons(
    clinicId: string,
    options?: CohortQueryOptions
  ): Promise<CohortComparison[]> {
    const conditions: string[] = ['l.clinic_id = $1', 'l.deleted_at IS NULL'];
    const params: unknown[] = [clinicId];
    let paramIndex = 2;

    if (options?.startMonth) {
      conditions.push(
        `DATE_TRUNC('month', l.created_at) >= DATE_TRUNC('month', $${paramIndex++}::timestamp)`
      );
      params.push(options.startMonth);
    }

    if (options?.endMonth) {
      conditions.push(
        `DATE_TRUNC('month', l.created_at) <= DATE_TRUNC('month', $${paramIndex++}::timestamp)`
      );
      params.push(options.endMonth);
    }

    const whereClause = conditions.join(' AND ');
    const limit = options?.limit ?? 12;

    const sql = `
      WITH cohort_data AS (
        SELECT
          l.clinic_id,
          DATE_TRUNC('month', l.created_at) AS cohort_month,
          COUNT(DISTINCT l.id) AS cohort_size,
          COUNT(DISTINCT c.lead_id) AS converted_leads,
          COALESCE(SUM(c.paid_amount), 0) AS total_collected,
          AVG(EXTRACT(EPOCH FROM (c.created_at - l.created_at)) / 86400)
            FILTER (WHERE c.id IS NOT NULL) AS avg_days_to_first_case,
          COALESCE(SUM(c.total_amount), 0) AS total_revenue
        FROM leads l
        LEFT JOIN cases c ON c.lead_id = l.id AND c.deleted_at IS NULL
        WHERE ${whereClause}
        GROUP BY l.clinic_id, DATE_TRUNC('month', l.created_at)
      ),
      cohort_metrics AS (
        SELECT
          *,
          CASE WHEN cohort_size > 0
            THEN (converted_leads::DECIMAL / cohort_size * 100)
            ELSE NULL
          END AS conversion_rate,
          CASE WHEN cohort_size > 0
            THEN (total_collected / cohort_size)
            ELSE NULL
          END AS avg_ltv,
          CASE WHEN converted_leads > 0
            THEN (total_collected / converted_leads)
            ELSE NULL
          END AS avg_ltv_converted,
          CASE WHEN total_revenue > 0
            THEN (total_collected / total_revenue * 100)
            ELSE NULL
          END AS collection_rate,
          LAG(CASE WHEN cohort_size > 0 THEN (total_collected / cohort_size) ELSE NULL END)
            OVER (ORDER BY cohort_month) AS prev_cohort_avg_ltv,
          LAG(CASE WHEN cohort_size > 0 THEN (total_collected / cohort_size) ELSE NULL END, 12)
            OVER (ORDER BY cohort_month) AS yoy_cohort_avg_ltv
        FROM cohort_data
      )
      SELECT
        clinic_id,
        cohort_month,
        cohort_size,
        converted_leads,
        conversion_rate,
        total_collected,
        avg_ltv,
        avg_ltv_converted,
        collection_rate,
        avg_days_to_first_case,
        prev_cohort_avg_ltv,
        CASE WHEN prev_cohort_avg_ltv > 0
          THEN ((avg_ltv - prev_cohort_avg_ltv) / prev_cohort_avg_ltv * 100)
          ELSE NULL
        END AS ltv_growth_vs_prev,
        yoy_cohort_avg_ltv,
        CASE WHEN yoy_cohort_avg_ltv > 0
          THEN ((avg_ltv - yoy_cohort_avg_ltv) / yoy_cohort_avg_ltv * 100)
          ELSE NULL
        END AS ltv_growth_yoy
      FROM cohort_metrics
      ORDER BY cohort_month DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    const result = await this.pool.query<CohortComparisonRow>(sql, params);
    return result.rows.map((row) => this.mapRowToCohortComparison(row));
  }

  async getCohortLTVEvolution(
    clinicId: string,
    cohortMonth: Date,
    maxMonths = 24
  ): Promise<CohortLTVEvolutionPoint[]> {
    const sql = `
      WITH cohort_leads AS (
        SELECT id, created_at
        FROM leads
        WHERE clinic_id = $1
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', $2::timestamp)
        AND deleted_at IS NULL
      ),
      cohort_size AS (
        SELECT COUNT(*) AS size FROM cohort_leads
      ),
      monthly_payments AS (
        SELECT
          EXTRACT(YEAR FROM AGE(DATE_TRUNC('month', p.processed_at), DATE_TRUNC('month', $2::timestamp))) * 12 +
          EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', p.processed_at), DATE_TRUNC('month', $2::timestamp))) AS months_since,
          SUM(CASE WHEN p.type != 'refund' THEN p.amount ELSE -p.amount END) AS period_revenue,
          COUNT(DISTINCT c.lead_id) AS paying_customers
        FROM payments p
        JOIN cases c ON c.id = p.case_id
        JOIN cohort_leads cl ON cl.id = c.lead_id
        WHERE p.status = 'completed'
        AND p.processed_at IS NOT NULL
        GROUP BY months_since
      )
      SELECT
        $1::UUID AS clinic_id,
        $2::TIMESTAMP AS cohort_month,
        mp.months_since AS months_since_acquisition,
        cs.size AS cohort_size,
        mp.period_revenue,
        mp.paying_customers,
        SUM(mp.period_revenue) OVER (ORDER BY mp.months_since) AS cumulative_revenue,
        CASE WHEN cs.size > 0
          THEN SUM(mp.period_revenue) OVER (ORDER BY mp.months_since) / cs.size
          ELSE NULL
        END AS cumulative_ltv_per_lead,
        CASE WHEN cs.size > 0
          THEN (mp.paying_customers::DECIMAL / cs.size * 100)
          ELSE NULL
        END AS paying_percentage
      FROM monthly_payments mp
      CROSS JOIN cohort_size cs
      WHERE mp.months_since >= 0 AND mp.months_since < $3
      ORDER BY mp.months_since ASC
    `;

    const result = await this.pool.query<CohortEvolutionRow>(sql, [
      clinicId,
      cohortMonth,
      maxMonths,
    ]);

    return result.rows.map((row) => this.mapRowToCohortEvolution(row));
  }

  async refreshCohortLTVViews(): Promise<void> {
    // The views are regular views (not materialized), so they don't need refresh.
    // If materialized views are added later, refresh them here:
    // await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY cohort_ltv_summary');
    await Promise.resolve();
    logger.info('Cohort LTV views are regular views - no refresh needed');
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mapRowToCase(row: CaseRow): Case {
    return {
      id: row.id,
      version: row.version ?? 1,
      clinicId: row.clinic_id,
      leadId: row.lead_id,
      treatmentPlanId: row.treatment_plan_id,
      caseNumber: row.case_number,
      status: row.status as Case['status'],
      totalAmount: parseFloat(row.total_amount),
      paidAmount: parseFloat(row.paid_amount),
      outstandingAmount: parseFloat(row.outstanding_amount),
      currency: row.currency,
      paymentStatus: row.payment_status as Case['paymentStatus'],
      financingProvider: row.financing_provider ?? undefined,
      financingReference: row.financing_reference ?? undefined,
      financingApprovedAt: row.financing_approved_at ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      expectedCompletionDate: row.expected_completion_date ?? undefined,
      notes: row.notes ?? undefined,
      metadata: row.metadata,
      createdBy: row.created_by ?? undefined,
      updatedBy: row.updated_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    };
  }

  private mapRowToPayment(row: PaymentRow): Payment {
    return {
      id: row.id,
      caseId: row.case_id,
      clinicId: row.clinic_id,
      paymentReference: row.payment_reference,
      externalReference: row.external_reference ?? undefined,
      amount: parseFloat(row.amount),
      currency: row.currency,
      type: row.type as Payment['type'],
      method: row.method as Payment['method'],
      status: row.status as Payment['status'],
      processedAt: row.processed_at ?? undefined,
      processorName: row.processor_name ?? undefined,
      processorTransactionId: row.processor_transaction_id ?? undefined,
      failureReason: row.failure_reason ?? undefined,
      receiptNumber: row.receipt_number ?? undefined,
      receiptUrl: row.receipt_url ?? undefined,
      notes: row.notes ?? undefined,
      metadata: row.metadata,
      receivedBy: row.received_by ?? undefined,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToPaymentPlan(row: PaymentPlanRow): PaymentPlan {
    return {
      id: row.id,
      caseId: row.case_id,
      name: row.name,
      totalAmount: parseFloat(row.total_amount),
      numberOfInstallments: row.number_of_installments,
      installmentAmount: parseFloat(row.installment_amount),
      frequency: row.frequency as PaymentPlan['frequency'],
      startDate: row.start_date,
      nextDueDate: row.next_due_date ?? undefined,
      status: row.status as PaymentPlan['status'],
      installmentsPaid: row.installments_paid,
      totalPaid: parseFloat(row.total_paid),
      interestRate: parseFloat(row.interest_rate),
      lateFee: parseFloat(row.late_fee),
      notes: row.notes ?? undefined,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToInstallment(row: InstallmentRow): PaymentPlanInstallment {
    return {
      id: row.id,
      paymentPlanId: row.payment_plan_id,
      paymentId: row.payment_id ?? undefined,
      installmentNumber: row.installment_number,
      amount: parseFloat(row.amount),
      dueDate: row.due_date,
      status: row.status as PaymentPlanInstallment['status'],
      paidAt: row.paid_at ?? undefined,
      paidAmount: row.paid_amount ? parseFloat(row.paid_amount) : undefined,
      lateFeeApplied: parseFloat(row.late_fee_applied),
      reminderSentAt: row.reminder_sent_at ?? undefined,
      reminderCount: row.reminder_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToLeadLTV(row: LeadLTVRow): LeadLTV {
    return {
      leadId: row.lead_id,
      clinicId: row.clinic_id,
      fullName: row.full_name ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      leadCreatedAt: row.lead_created_at,
      totalCases: parseInt(row.total_cases, 10),
      completedCases: parseInt(row.completed_cases, 10),
      totalCaseValue: parseFloat(row.total_case_value),
      totalPaid: parseFloat(row.total_paid),
      totalOutstanding: parseFloat(row.total_outstanding),
      avgCaseValue: parseFloat(row.avg_case_value),
      firstCaseDate: row.first_case_date ?? undefined,
      lastCaseDate: row.last_case_date ?? undefined,
    };
  }

  private mapRowToMonthlyRevenue(row: MonthlyRevenueRow): MonthlyRevenue {
    return {
      month: row.month,
      clinicId: row.clinic_id,
      casesWithPayments: parseInt(row.cases_with_payments, 10),
      paymentCount: parseInt(row.payment_count, 10),
      grossRevenue: parseFloat(row.gross_revenue),
      refunds: parseFloat(row.refunds),
      netRevenue: parseFloat(row.net_revenue),
      avgPaymentAmount: row.avg_payment_amount ? parseFloat(row.avg_payment_amount) : 0,
    };
  }

  private mapRowToCasePipeline(row: CasePipelineRow): CasePipelineSummary {
    return {
      clinicId: row.clinic_id,
      status: row.status as CasePipelineSummary['status'],
      paymentStatus: row.payment_status as CasePipelineSummary['paymentStatus'],
      caseCount: parseInt(row.case_count, 10),
      totalValue: parseFloat(row.total_value),
      paidValue: parseFloat(row.paid_value),
      outstandingValue: parseFloat(row.outstanding_value),
      avgCaseValue: parseFloat(row.avg_case_value),
    };
  }

  private mapRowToCohortLTVSummary(row: CohortLTVRow): CohortLTVSummary {
    return {
      clinicId: row.clinic_id,
      cohortMonth: row.cohort_month,
      acquisitionSource: row.acquisition_source,
      acquisitionChannel: row.acquisition_channel,
      cohortSize: parseInt(row.cohort_size, 10),
      convertedLeads: parseInt(row.converted_leads, 10),
      conversionRate: row.conversion_rate ? parseFloat(row.conversion_rate) : null,
      totalRevenue: parseFloat(row.total_revenue),
      totalCollected: parseFloat(row.total_collected),
      totalOutstanding: parseFloat(row.total_outstanding),
      avgLtv: row.avg_ltv ? parseFloat(row.avg_ltv) : null,
      avgLtvConverted: row.avg_ltv_converted ? parseFloat(row.avg_ltv_converted) : null,
      totalCases: parseInt(row.total_cases, 10),
      completedCases: parseInt(row.completed_cases, 10),
      avgCasesPerCustomer: row.avg_cases_per_customer
        ? parseFloat(row.avg_cases_per_customer)
        : null,
      avgDaysToFirstCase: row.avg_days_to_first_case
        ? parseFloat(row.avg_days_to_first_case)
        : null,
      maxMonthsActive: row.max_months_active ? parseInt(row.max_months_active, 10) : null,
      collectionRate: row.collection_rate ? parseFloat(row.collection_rate) : null,
    };
  }

  private mapRowToCohortComparison(row: CohortComparisonRow): CohortComparison {
    return {
      clinicId: row.clinic_id,
      cohortMonth: row.cohort_month,
      cohortSize: parseInt(row.cohort_size, 10),
      convertedLeads: parseInt(row.converted_leads, 10),
      conversionRate: row.conversion_rate ? parseFloat(row.conversion_rate) : null,
      totalCollected: parseFloat(row.total_collected),
      avgLtv: row.avg_ltv ? parseFloat(row.avg_ltv) : null,
      avgLtvConverted: row.avg_ltv_converted ? parseFloat(row.avg_ltv_converted) : null,
      collectionRate: row.collection_rate ? parseFloat(row.collection_rate) : null,
      avgDaysToFirstCase: row.avg_days_to_first_case
        ? parseFloat(row.avg_days_to_first_case)
        : null,
      prevCohortAvgLtv: row.prev_cohort_avg_ltv ? parseFloat(row.prev_cohort_avg_ltv) : null,
      ltvGrowthVsPrev: row.ltv_growth_vs_prev ? parseFloat(row.ltv_growth_vs_prev) : null,
      yoyCohortAvgLtv: row.yoy_cohort_avg_ltv ? parseFloat(row.yoy_cohort_avg_ltv) : null,
      ltvGrowthYoy: row.ltv_growth_yoy ? parseFloat(row.ltv_growth_yoy) : null,
    };
  }

  private mapRowToCohortEvolution(row: CohortEvolutionRow): CohortLTVEvolutionPoint {
    return {
      clinicId: row.clinic_id,
      cohortMonth: row.cohort_month,
      monthsSinceAcquisition: row.months_since_acquisition,
      cohortSize: parseInt(row.cohort_size, 10),
      periodRevenue: parseFloat(row.period_revenue),
      payingCustomers: parseInt(row.paying_customers, 10),
      cumulativeRevenue: parseFloat(row.cumulative_revenue),
      cumulativeLtvPerLead: row.cumulative_ltv_per_lead
        ? parseFloat(row.cumulative_ltv_per_lead)
        : null,
      payingPercentage: row.paying_percentage ? parseFloat(row.paying_percentage) : null,
    };
  }

  private mapOrderByColumn(orderBy: string): string {
    const mapping: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      totalAmount: 'total_amount',
      outstandingAmount: 'outstanding_amount',
    };
    return mapping[orderBy] ?? 'created_at';
  }

  private mapLTVOrderByColumn(orderBy: string): string {
    const mapping: Record<string, string> = {
      createdAt: 'lead_created_at',
      updatedAt: 'lead_created_at',
      totalAmount: 'total_paid',
      outstandingAmount: 'total_outstanding',
    };
    return mapping[orderBy] ?? 'total_paid';
  }

  private calculateInstallmentDueDate(
    startDate: Date,
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly',
    installmentIndex: number
  ): Date {
    const date = new Date(startDate);

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + installmentIndex * 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + installmentIndex * 14);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + installmentIndex);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + installmentIndex * 3);
        break;
      default: {
        // Exhaustive check - TypeScript will error if a case is missing
        const _exhaustive: never = frequency;
        throw new Error(`Unexpected frequency: ${String(_exhaustive)}`);
      }
    }

    return date;
  }

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgresCaseRepository connection pool closed');
  }
}

/**
 * Factory function to create a PostgreSQL Case Repository
 */
export function createPostgresCaseRepository(
  config: PostgresCaseRepositoryConfig
): PostgresCaseRepository {
  return new PostgresCaseRepository(config);
}
