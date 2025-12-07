/**
 * @fileoverview Tests for PostgreSQL Case Repository
 *
 * Tests case CRUD operations, payment handling, and LTV analytics queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresCaseRepository,
  createPostgresCaseRepository,
  type PostgresCaseRepositoryConfig,
} from '../PostgresCaseRepository.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockClient() {
  return {
    query: vi.fn(),
    release: vi.fn(),
  };
}

function createMockPool() {
  const mockClient = createMockClient();

  const mockPool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
    _mockClient: mockClient,
  };

  return mockPool;
}

/**
 * Create a repository with an injected mock pool for testing
 */
function createTestRepository(mockPool: ReturnType<typeof createMockPool>) {
  const config: PostgresCaseRepositoryConfig = {
    connectionString: 'postgresql://mock:mock@localhost/mock',
  };

  const repo = new PostgresCaseRepository(config);

  // Manually inject the mock pool
  (repo as any).pool = mockPool;

  return repo;
}

function createMockCaseRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'case-123',
    clinic_id: 'clinic-456',
    lead_id: 'lead-789',
    treatment_plan_id: 'tp-101',
    case_number: 'CASE-2024-00001',
    status: 'pending',
    total_amount: '10000.00',
    paid_amount: '2500.00',
    outstanding_amount: '7500.00',
    currency: 'EUR',
    payment_status: 'partial',
    financing_provider: null,
    financing_reference: null,
    financing_approved_at: null,
    started_at: null,
    completed_at: null,
    expected_completion_date: null,
    notes: 'Test case',
    metadata: {},
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

function createMockPaymentRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'pay-123',
    case_id: 'case-123',
    clinic_id: 'clinic-456',
    payment_reference: 'PAY-2024-000001',
    external_reference: null,
    amount: '2500.00',
    currency: 'EUR',
    type: 'payment',
    method: 'card',
    status: 'completed',
    processed_at: now,
    processor_name: 'Stripe',
    processor_transaction_id: 'pi_123',
    failure_reason: null,
    receipt_number: 'RCP-001',
    receipt_url: null,
    notes: null,
    metadata: {},
    received_by: null,
    created_by: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMockLeadLTVRow(overrides = {}) {
  const now = new Date();
  return {
    lead_id: 'lead-789',
    clinic_id: 'clinic-456',
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '+40721234567',
    lead_created_at: now,
    total_cases: '3',
    completed_cases: '2',
    total_case_value: '30000.00',
    total_paid: '25000.00',
    total_outstanding: '5000.00',
    avg_case_value: '10000.00',
    first_case_date: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
    last_case_date: now,
    ...overrides,
  };
}

function createMockMonthlyRevenueRow(overrides = {}) {
  return {
    month: new Date('2024-11-01'),
    clinic_id: 'clinic-456',
    cases_with_payments: '15',
    payment_count: '25',
    gross_revenue: '125000.00',
    refunds: '2500.00',
    net_revenue: '122500.00',
    avg_payment_amount: '5000.00',
    ...overrides,
  };
}

function createMockCasePipelineRow(overrides = {}) {
  return {
    clinic_id: 'clinic-456',
    status: 'in_progress',
    payment_status: 'partial',
    case_count: '25',
    total_value: '500000.00',
    paid_value: '250000.00',
    outstanding_value: '250000.00',
    avg_case_value: '20000.00',
    ...overrides,
  };
}

function createMockPaymentPlanRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'plan-123',
    case_id: 'case-123',
    name: '12-Month Plan',
    total_amount: '12000.00',
    number_of_installments: 12,
    installment_amount: '1000.00',
    frequency: 'monthly',
    start_date: now,
    next_due_date: now,
    status: 'active',
    installments_paid: 3,
    total_paid: '3000.00',
    interest_rate: '0.00',
    late_fee: '50.00',
    notes: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMockInstallmentRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'inst-123',
    payment_plan_id: 'plan-123',
    payment_id: null,
    installment_number: 1,
    amount: '1000.00',
    due_date: now,
    status: 'pending',
    paid_at: null,
    paid_amount: null,
    late_fee_applied: '0.00',
    reminder_sent_at: null,
    reminder_count: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresCaseRepository', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let repository: PostgresCaseRepository;

  beforeEach(() => {
    mockPool = createMockPool();
    repository = createTestRepository(mockPool);
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CASE OPERATIONS
  // ==========================================================================

  describe('findById', () => {
    it('should find a case by ID', async () => {
      const mockRow = createMockCaseRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findById('case-123');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM cases'), [
        'case-123',
      ]);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('case-123');
      expect(result!.totalAmount).toBe(10000);
      expect(result!.paidAmount).toBe(2500);
    });

    it('should return null when case not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByCaseNumber', () => {
    it('should find a case by case number', async () => {
      const mockRow = createMockCaseRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findByCaseNumber('clinic-456', 'CASE-2024-00001');

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
        'clinic-456',
        'CASE-2024-00001',
      ]);
      expect(result).not.toBeNull();
      expect(result!.caseNumber).toBe('CASE-2024-00001');
    });
  });

  describe('findMany', () => {
    it('should find cases with filters', async () => {
      const mockRows = [createMockCaseRow({ id: 'case-1' }), createMockCaseRow({ id: 'case-2' })];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findMany({ clinicId: 'clinic-456', status: 'pending' });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [createMockCaseRow()] });

      const result = await repository.findMany(
        { clinicId: 'clinic-456' },
        { limit: 10, offset: 20, orderBy: 'totalAmount', orderDirection: 'desc' }
      );

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });

    it('should filter by array of statuses', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [createMockCaseRow()] });

      await repository.findMany({
        clinicId: 'clinic-456',
        status: ['pending', 'in_progress'],
      });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('status = ANY'), [
        'clinic-456',
        ['pending', 'in_progress'],
        50,
        0,
      ]);
    });

    it('should filter by outstanding amount', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [createMockCaseRow()] });

      await repository.findMany({ clinicId: 'clinic-456', hasOutstanding: true });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('outstanding_amount > 0'),
        expect.any(Array)
      );
    });
  });

  describe('findByLeadId', () => {
    it('should find all cases for a lead', async () => {
      const mockRows = [createMockCaseRow({ id: 'case-1' }), createMockCaseRow({ id: 'case-2' })];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findByLeadId('lead-789');

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('lead_id = $1'), [
        'lead-789',
      ]);
    });
  });

  describe('create', () => {
    it('should create a new case', async () => {
      const mockRow = createMockCaseRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.create({
        clinicId: 'clinic-456',
        leadId: 'lead-789',
        treatmentPlanId: 'tp-101',
        caseNumber: 'CASE-2024-00001',
        totalAmount: 10000,
        currency: 'EUR',
      });

      expect(result.id).toBe('case-123');
      expect(result.status).toBe('pending');
      expect(result.paymentStatus).toBe('partial');
    });
  });

  describe('update', () => {
    it('should update case fields', async () => {
      const updatedRow = createMockCaseRow({ status: 'in_progress' });
      mockPool.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await repository.update('case-123', { status: 'in_progress' });

      expect(result.status).toBe('in_progress');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cases'),
        expect.any(Array)
      );
    });

    it('should throw error when case not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(repository.update('nonexistent', { status: 'in_progress' })).rejects.toThrow(
        'Case not found'
      );
    });
  });

  describe('softDelete', () => {
    it('should soft delete a case', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(repository.softDelete('case-123', 'user-456')).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('deleted_at = NOW()'), [
        'case-123',
        'user-456',
      ]);
    });

    it('should throw error when case not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(repository.softDelete('nonexistent')).rejects.toThrow('Case not found');
    });
  });

  describe('generateCaseNumber', () => {
    it('should generate a case number', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ case_number: 'CASE-2024-00005' }] });

      const result = await repository.generateCaseNumber('clinic-456');

      expect(result).toBe('CASE-2024-00005');
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('generate_case_number'), [
        'clinic-456',
      ]);
    });
  });

  // ==========================================================================
  // PAYMENT OPERATIONS
  // ==========================================================================

  describe('findPaymentById', () => {
    it('should find a payment by ID', async () => {
      const mockRow = createMockPaymentRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findPaymentById('pay-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('pay-123');
      expect(result!.amount).toBe(2500);
    });
  });

  describe('findPaymentsByCaseId', () => {
    it('should find payments for a case', async () => {
      const mockRows = [
        createMockPaymentRow({ id: 'pay-1' }),
        createMockPaymentRow({ id: 'pay-2' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findPaymentsByCaseId('case-123');

      expect(result).toHaveLength(2);
    });
  });

  describe('createPayment', () => {
    it('should create a new payment', async () => {
      const mockRow = createMockPaymentRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.createPayment({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        paymentReference: 'PAY-2024-000001',
        amount: 2500,
        method: 'card',
      });

      expect(result.id).toBe('pay-123');
      expect(result.amount).toBe(2500);
    });
  });

  describe('processPayment', () => {
    it('should process a payment', async () => {
      const mockRow = createMockPaymentRow({ status: 'completed' });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.processPayment('pay-123', 'Stripe', 'pi_123');

      expect(result.status).toBe('completed');
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("status = 'completed'"), [
        'pay-123',
        'Stripe',
        'pi_123',
      ]);
    });
  });

  describe('failPayment', () => {
    it('should fail a payment with reason', async () => {
      const mockRow = createMockPaymentRow({
        status: 'failed',
        failure_reason: 'Insufficient funds',
      });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.failPayment('pay-123', 'Insufficient funds');

      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe('Insufficient funds');
    });
  });

  describe('generatePaymentReference', () => {
    it('should generate a payment reference', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ next_seq: '42' }] });

      const result = await repository.generatePaymentReference('clinic-456');

      expect(result).toMatch(/^PAY-\d{4}-000042$/);
    });
  });

  // ==========================================================================
  // PAYMENT PLAN OPERATIONS
  // ==========================================================================

  describe('findPaymentPlanById', () => {
    it('should find a payment plan by ID', async () => {
      const mockRow = createMockPaymentPlanRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findPaymentPlanById('plan-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('plan-123');
      expect(result!.totalAmount).toBe(12000);
      expect(result!.numberOfInstallments).toBe(12);
    });
  });

  describe('createPaymentPlan', () => {
    it('should create a payment plan with installments', async () => {
      const mockPlanRow = createMockPaymentPlanRow();
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPlanRow] }) // INSERT plan
        .mockResolvedValueOnce(undefined) // INSERT installment 1
        .mockResolvedValueOnce(undefined) // INSERT installment 2
        .mockResolvedValueOnce(undefined) // INSERT installment 3
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await repository.createPaymentPlan(
        'case-123',
        '3-Month Plan',
        3000,
        3,
        'monthly',
        new Date()
      );

      expect(result.id).toBe('plan-123');
      expect(mockPool._mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPool._mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback on failure', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT plan fails

      await expect(
        repository.createPaymentPlan('case-123', 'Plan', 1000, 2, 'monthly', new Date())
      ).rejects.toThrow('Insert failed');

      expect(mockPool._mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('findInstallments', () => {
    it('should find installments for a payment plan', async () => {
      const mockRows = [
        createMockInstallmentRow({ installment_number: 1 }),
        createMockInstallmentRow({ installment_number: 2 }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findInstallments('plan-123');

      expect(result).toHaveLength(2);
      expect(result[0]!.installmentNumber).toBe(1);
    });
  });

  describe('findOverdueInstallments', () => {
    it('should find overdue installments', async () => {
      const mockRows = [createMockInstallmentRow({ status: 'overdue' })];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findOverdueInstallments('clinic-456');

      expect(result).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'overdue')"),
        ['clinic-456']
      );
    });
  });

  describe('markInstallmentPaid', () => {
    it('should mark an installment as paid', async () => {
      mockPool._mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // UPDATE installment
        .mockResolvedValueOnce(undefined) // UPDATE payment plan
        .mockResolvedValueOnce(undefined); // COMMIT

      await expect(
        repository.markInstallmentPaid('inst-123', 'pay-456', 1000)
      ).resolves.not.toThrow();

      expect(mockPool._mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  // ==========================================================================
  // ANALYTICS OPERATIONS
  // ==========================================================================

  describe('getLeadLTV', () => {
    it('should get LTV for a lead', async () => {
      const mockRow = createMockLeadLTVRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getLeadLTV('lead-789');

      expect(result).not.toBeNull();
      expect(result!.leadId).toBe('lead-789');
      expect(result!.totalPaid).toBe(25000);
      expect(result!.totalCases).toBe(3);
      expect(result!.completedCases).toBe(2);
    });

    it('should return null when lead not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getLeadLTV('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getClinicLeadLTVs', () => {
    it('should get paginated LTV for all leads in a clinic', async () => {
      const mockRows = [
        createMockLeadLTVRow({ lead_id: 'lead-1' }),
        createMockLeadLTVRow({ lead_id: 'lead-2' }),
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getClinicLeadLTVs('clinic-456', {
        limit: 10,
        offset: 0,
        orderBy: 'totalAmount',
        orderDirection: 'desc',
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getMonthlyRevenue', () => {
    it('should get monthly revenue for date range', async () => {
      const mockRows = [
        createMockMonthlyRevenueRow({ month: new Date('2024-11-01') }),
        createMockMonthlyRevenueRow({ month: new Date('2024-10-01') }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getMonthlyRevenue(
        'clinic-456',
        new Date('2024-10-01'),
        new Date('2024-11-30')
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.grossRevenue).toBe(125000);
      expect(result[0]!.netRevenue).toBe(122500);
    });
  });

  describe('getCasePipeline', () => {
    it('should get case pipeline summary', async () => {
      const mockRows = [
        createMockCasePipelineRow({ status: 'pending', payment_status: 'unpaid' }),
        createMockCasePipelineRow({ status: 'in_progress', payment_status: 'partial' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getCasePipeline('clinic-456');

      expect(result).toHaveLength(2);
      expect(result[0]!.caseCount).toBe(25);
      expect(result[0]!.totalValue).toBe(500000);
    });
  });

  describe('getTotalOutstanding', () => {
    it('should get total outstanding for a clinic', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '342800.50' }] });

      const result = await repository.getTotalOutstanding('clinic-456');

      expect(result).toBe(342800.5);
    });

    it('should return 0 when no outstanding', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await repository.getTotalOutstanding('clinic-456');

      expect(result).toBe(0);
    });
  });

  // ==========================================================================
  // COHORT LTV OPERATIONS
  // ==========================================================================

  describe('getCohortLTVSummaries', () => {
    it('should get cohort LTV summaries', async () => {
      const mockRows = [
        {
          clinic_id: 'clinic-456',
          cohort_month: new Date('2024-10-01'),
          acquisition_source: 'google',
          acquisition_channel: 'organic',
          cohort_size: '100',
          converted_leads: '25',
          conversion_rate: '25.00',
          total_revenue: '250000.00',
          total_collected: '200000.00',
          total_outstanding: '50000.00',
          avg_ltv: '2000.00',
          avg_ltv_converted: '8000.00',
          total_cases: '30',
          completed_cases: '20',
          avg_cases_per_customer: '1.20',
          avg_days_to_first_case: '15.5',
          max_months_active: '6',
          collection_rate: '80.00',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getCohortLTVSummaries('clinic-456', {
        startMonth: new Date('2024-01-01'),
        endMonth: new Date('2024-12-31'),
        limit: 12,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.cohortSize).toBe(100);
      expect(result[0]!.conversionRate).toBe(25);
      expect(result[0]!.avgLtv).toBe(2000);
    });
  });

  describe('getCohortComparisons', () => {
    it('should get cohort comparisons with growth metrics', async () => {
      const mockRows = [
        {
          clinic_id: 'clinic-456',
          cohort_month: new Date('2024-11-01'),
          cohort_size: '80',
          converted_leads: '20',
          conversion_rate: '25.00',
          total_collected: '160000.00',
          avg_ltv: '2000.00',
          avg_ltv_converted: '8000.00',
          collection_rate: '80.00',
          avg_days_to_first_case: '14.0',
          prev_cohort_avg_ltv: '1800.00',
          ltv_growth_vs_prev: '11.11',
          yoy_cohort_avg_ltv: '1500.00',
          ltv_growth_yoy: '33.33',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getCohortComparisons('clinic-456');

      expect(result).toHaveLength(1);
      expect(result[0]!.ltvGrowthVsPrev).toBeCloseTo(11.11);
      expect(result[0]!.ltvGrowthYoy).toBeCloseTo(33.33);
    });
  });

  describe('getCohortLTVEvolution', () => {
    it('should get LTV evolution for a cohort', async () => {
      const mockRows = [
        {
          clinic_id: 'clinic-456',
          cohort_month: new Date('2024-06-01'),
          months_since_acquisition: 0,
          cohort_size: '100',
          period_revenue: '50000.00',
          paying_customers: '20',
          cumulative_revenue: '50000.00',
          cumulative_ltv_per_lead: '500.00',
          paying_percentage: '20.00',
        },
        {
          clinic_id: 'clinic-456',
          cohort_month: new Date('2024-06-01'),
          months_since_acquisition: 1,
          cohort_size: '100',
          period_revenue: '30000.00',
          paying_customers: '15',
          cumulative_revenue: '80000.00',
          cumulative_ltv_per_lead: '800.00',
          paying_percentage: '15.00',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getCohortLTVEvolution(
        'clinic-456',
        new Date('2024-06-01'),
        24
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.monthsSinceAcquisition).toBe(0);
      expect(result[1]!.cumulativeRevenue).toBe(80000);
      expect(result[1]!.cumulativeLtvPerLead).toBe(800);
    });
  });

  describe('refreshCohortLTVViews', () => {
    it('should complete without error (views are regular, not materialized)', async () => {
      await expect(repository.refreshCohortLTVViews()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // CLOSE
  // ==========================================================================

  describe('close', () => {
    it('should close the pool', async () => {
      await repository.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createPostgresCaseRepository', () => {
  it('should create a repository instance', () => {
    const repo = createPostgresCaseRepository({
      connectionString: 'postgresql://test:test@localhost/test',
    });

    expect(repo).toBeInstanceOf(PostgresCaseRepository);
  });
});
