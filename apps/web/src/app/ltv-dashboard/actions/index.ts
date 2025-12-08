'use server';

/**
 * @fileoverview LTV Dashboard Server Actions
 *
 * H10 Production Fix: Server actions for the LTV Dashboard.
 * Provides data fetching for customer lifetime value analytics.
 *
 * @module ltv-dashboard/actions
 * @security All actions require VIEW_ANALYTICS permission
 */

import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

// Lazy-initialized database connection
let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * pLTV tier summary
 */
export interface PLTVTierSummary {
  totalScoredLeads: number;
  diamondLeads: number;
  platinumLeads: number;
  goldLeads: number;
  silverLeads: number;
  bronzeLeads: number;
  avgPredictedLTV: number;
  avgConfidence: number;
  totalPredictedLTV: number;
  highGrowthLeads: number;
  priorityLeads: number;
  lastCalculation: string | null;
}

/**
 * Lead Lifetime Value data
 */
export interface LeadLTV {
  leadId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  totalCases: number;
  completedCases: number;
  totalCaseValue: number;
  totalPaid: number;
  totalOutstanding: number;
  avgCaseValue: number;
  firstCaseDate: string | null;
  lastCaseDate: string | null;
}

/**
 * Monthly revenue summary
 */
export interface MonthlyRevenue {
  month: string;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  paymentCount: number;
  casesWithPayments: number;
}

/**
 * Case pipeline breakdown
 */
export interface CasePipeline {
  status: string;
  paymentStatus: string;
  caseCount: number;
  totalValue: number;
  paidValue: number;
  outstandingValue: number;
}

/**
 * Dashboard statistics
 */
export interface LTVDashboardStats {
  totalRevenue: number;
  totalOutstanding: number;
  avgLTV: number;
  totalCases: number;
  paidCases: number;
  partialCases: number;
  monthlyGrowth: number;
}

/**
 * Complete dashboard data
 */
export interface LTVDashboardData {
  stats: LTVDashboardStats;
  topCustomers: LeadLTV[];
  monthlyRevenue: MonthlyRevenue[];
  casePipeline: CasePipeline[];
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

/**
 * Row type from lead_ltv view
 */
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

/**
 * Row type from monthly_revenue view
 */
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

/**
 * Row type from case_pipeline view
 */
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

/**
 * Stats aggregate query row
 */
interface StatsRow {
  total_revenue: string;
  total_outstanding: string;
  avg_ltv: string;
  total_cases: string;
  paid_cases: string;
  partial_cases: string;
  current_month_revenue: string;
  previous_month_revenue: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert lead_ltv row to LeadLTV interface
 */
function rowToLeadLTV(row: LeadLTVRow): LeadLTV {
  return {
    leadId: row.lead_id,
    fullName: row.full_name ?? 'Unknown',
    email: row.email,
    phone: row.phone,
    totalCases: parseInt(row.total_cases, 10),
    completedCases: parseInt(row.completed_cases, 10),
    totalCaseValue: parseFloat(row.total_case_value),
    totalPaid: parseFloat(row.total_paid),
    totalOutstanding: parseFloat(row.total_outstanding),
    avgCaseValue: parseFloat(row.avg_case_value),
    firstCaseDate: row.first_case_date?.toISOString().slice(0, 10) ?? null,
    lastCaseDate: row.last_case_date?.toISOString().slice(0, 10) ?? null,
  };
}

/**
 * Convert monthly_revenue row to MonthlyRevenue interface
 */
function rowToMonthlyRevenue(row: MonthlyRevenueRow): MonthlyRevenue {
  return {
    month: row.month.toISOString().slice(0, 7),
    grossRevenue: parseFloat(row.gross_revenue),
    netRevenue: parseFloat(row.net_revenue),
    refunds: parseFloat(row.refunds),
    paymentCount: parseInt(row.payment_count, 10),
    casesWithPayments: parseInt(row.cases_with_payments, 10),
  };
}

/**
 * Convert case_pipeline row to CasePipeline interface
 */
function rowToCasePipeline(row: CasePipelineRow): CasePipeline {
  return {
    status: row.status,
    paymentStatus: row.payment_status,
    caseCount: parseInt(row.case_count, 10),
    totalValue: parseFloat(row.total_value),
    paidValue: parseFloat(row.paid_value),
    outstandingValue: parseFloat(row.outstanding_value),
  };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get LTV dashboard statistics
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Dashboard statistics summary
 */
export async function getLTVStatsAction(): Promise<LTVDashboardStats> {
  await requirePermission('VIEW_ANALYTICS');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  // Aggregate stats from cases and payments
  const result = await database.query<StatsRow>(
    `WITH monthly_totals AS (
      SELECT
        DATE_TRUNC('month', processed_at) AS month,
        SUM(CASE WHEN type != 'refund' THEN amount ELSE -amount END) AS net_revenue
      FROM payments
      WHERE clinic_id = $1
        AND status = 'completed'
        AND processed_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      GROUP BY DATE_TRUNC('month', processed_at)
    )
    SELECT
      COALESCE(SUM(c.paid_amount), 0) AS total_revenue,
      COALESCE(SUM(c.outstanding_amount), 0) AS total_outstanding,
      COALESCE(AVG(c.paid_amount) FILTER (WHERE c.paid_amount > 0), 0) AS avg_ltv,
      COUNT(*) AS total_cases,
      COUNT(*) FILTER (WHERE c.payment_status = 'paid') AS paid_cases,
      COUNT(*) FILTER (WHERE c.payment_status = 'partial') AS partial_cases,
      COALESCE((SELECT net_revenue FROM monthly_totals WHERE month = DATE_TRUNC('month', NOW())), 0) AS current_month_revenue,
      COALESCE((SELECT net_revenue FROM monthly_totals WHERE month = DATE_TRUNC('month', NOW() - INTERVAL '1 month')), 0) AS previous_month_revenue
    FROM cases c
    WHERE c.clinic_id = $1 AND c.deleted_at IS NULL`,
    [user.clinicId]
  );

  const stats = result.rows[0];
  const currentMonthRevenue = parseFloat(stats.current_month_revenue);
  const previousMonthRevenue = parseFloat(stats.previous_month_revenue);
  const monthlyGrowth =
    previousMonthRevenue > 0
      ? Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 1000) /
        10
      : 0;

  return {
    totalRevenue: parseFloat(stats.total_revenue),
    totalOutstanding: parseFloat(stats.total_outstanding),
    avgLTV: parseFloat(stats.avg_ltv),
    totalCases: parseInt(stats.total_cases, 10),
    paidCases: parseInt(stats.paid_cases, 10),
    partialCases: parseInt(stats.partial_cases, 10),
    monthlyGrowth,
  };
}

/**
 * Get top customers by lifetime value
 *
 * @param limit Maximum number of customers to return
 * @requires VIEW_ANALYTICS permission
 * @returns Array of lead LTV data sorted by value
 */
export async function getTopCustomersAction(limit = 10): Promise<LeadLTV[]> {
  await requirePermission('VIEW_ANALYTICS');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<LeadLTVRow>(
    `SELECT
      lead_id,
      clinic_id,
      full_name,
      email,
      phone,
      lead_created_at,
      total_cases,
      completed_cases,
      total_case_value,
      total_paid,
      total_outstanding,
      avg_case_value,
      first_case_date,
      last_case_date
    FROM lead_ltv
    WHERE clinic_id = $1 AND total_cases > 0
    ORDER BY total_paid DESC
    LIMIT $2`,
    [user.clinicId, limit]
  );

  return result.rows.map(rowToLeadLTV);
}

/**
 * Get monthly revenue data
 *
 * @param months Number of months of history to fetch
 * @requires VIEW_ANALYTICS permission
 * @returns Array of monthly revenue data
 */
export async function getMonthlyRevenueAction(months = 6): Promise<MonthlyRevenue[]> {
  await requirePermission('VIEW_ANALYTICS');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<MonthlyRevenueRow>(
    `SELECT
      month,
      clinic_id,
      cases_with_payments,
      payment_count,
      gross_revenue,
      refunds,
      net_revenue,
      avg_payment_amount
    FROM monthly_revenue
    WHERE clinic_id = $1
      AND month >= DATE_TRUNC('month', NOW() - ($2 || ' months')::INTERVAL)
    ORDER BY month DESC
    LIMIT $2`,
    [user.clinicId, months]
  );

  return result.rows.map(rowToMonthlyRevenue);
}

/**
 * Get case pipeline breakdown
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Array of case pipeline data by status and payment status
 */
export async function getCasePipelineAction(): Promise<CasePipeline[]> {
  await requirePermission('VIEW_ANALYTICS');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<CasePipelineRow>(
    `SELECT
      clinic_id,
      status,
      payment_status,
      case_count,
      total_value,
      paid_value,
      outstanding_value,
      avg_case_value
    FROM case_pipeline
    WHERE clinic_id = $1
    ORDER BY status, payment_status`,
    [user.clinicId]
  );

  return result.rows.map(rowToCasePipeline);
}

/**
 * Get complete LTV dashboard data
 *
 * Fetches all dashboard data in a single action for efficient loading.
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Complete dashboard data including stats, customers, revenue, and pipeline
 */
export async function getLTVDashboardDataAction(): Promise<LTVDashboardData> {
  await requirePermission('VIEW_ANALYTICS');

  // Fetch all data in parallel
  const [stats, topCustomers, monthlyRevenue, casePipeline] = await Promise.all([
    getLTVStatsAction(),
    getTopCustomersAction(5),
    getMonthlyRevenueAction(6),
    getCasePipelineAction(),
  ]);

  return {
    stats,
    topCustomers,
    monthlyRevenue,
    casePipeline,
  };
}

/**
 * Row type from clinic_pltv_summary view
 */
interface PLTVSummaryRow {
  clinic_id: string;
  total_scored_leads: string;
  diamond_leads: string;
  platinum_leads: string;
  gold_leads: string;
  silver_leads: string;
  bronze_leads: string;
  avg_predicted_ltv: string;
  avg_confidence: string;
  total_predicted_ltv: string;
  high_growth_leads: string;
  priority_leads: string;
  last_calculation: Date | null;
}

/**
 * Get pLTV tier summary for the clinic
 *
 * @requires VIEW_ANALYTICS permission
 * @returns pLTV tier distribution and summary statistics
 */
export async function getPLTVSummaryAction(): Promise<PLTVTierSummary> {
  await requirePermission('VIEW_ANALYTICS');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<PLTVSummaryRow>(
    `SELECT
      clinic_id,
      total_scored_leads,
      diamond_leads,
      platinum_leads,
      gold_leads,
      silver_leads,
      bronze_leads,
      avg_predicted_ltv,
      avg_confidence,
      total_predicted_ltv,
      high_growth_leads,
      priority_leads,
      last_calculation
    FROM clinic_pltv_summary
    WHERE clinic_id = $1`,
    [user.clinicId]
  );

  // Return empty summary if no data
  if (result.rows.length === 0) {
    return {
      totalScoredLeads: 0,
      diamondLeads: 0,
      platinumLeads: 0,
      goldLeads: 0,
      silverLeads: 0,
      bronzeLeads: 0,
      avgPredictedLTV: 0,
      avgConfidence: 0,
      totalPredictedLTV: 0,
      highGrowthLeads: 0,
      priorityLeads: 0,
      lastCalculation: null,
    };
  }

  const row = result.rows[0];
  return {
    totalScoredLeads: parseInt(row.total_scored_leads, 10),
    diamondLeads: parseInt(row.diamond_leads, 10),
    platinumLeads: parseInt(row.platinum_leads, 10),
    goldLeads: parseInt(row.gold_leads, 10),
    silverLeads: parseInt(row.silver_leads, 10),
    bronzeLeads: parseInt(row.bronze_leads, 10),
    avgPredictedLTV: parseFloat(row.avg_predicted_ltv),
    avgConfidence: parseFloat(row.avg_confidence),
    totalPredictedLTV: parseFloat(row.total_predicted_ltv),
    highGrowthLeads: parseInt(row.high_growth_leads, 10),
    priorityLeads: parseInt(row.priority_leads, 10),
    lastCalculation: row.last_calculation?.toISOString() ?? null,
  };
}

/**
 * Export report action
 *
 * Generates an LTV report for export.
 *
 * @param format Export format ('csv' | 'xlsx' | 'pdf')
 * @requires VIEW_ANALYTICS permission
 * @returns Report data with CSV content for download
 */
export async function exportLTVReportAction(
  format: 'csv' | 'xlsx' | 'pdf' = 'csv'
): Promise<{ success: boolean; message: string; data?: string; filename?: string }> {
  await requirePermission('VIEW_ANALYTICS');

  if (format !== 'csv') {
    return {
      success: false,
      message: `Export to ${format.toUpperCase()} is not yet implemented. CSV export is available.`,
    };
  }

  try {
    // Fetch all data needed for the report
    const [stats, topCustomers, monthlyRevenue, casePipeline] = await Promise.all([
      getLTVStatsAction(),
      getTopCustomersAction(100), // Get more customers for export
      getMonthlyRevenueAction(12), // Get 12 months for export
      getCasePipelineAction(),
    ]);

    // Generate CSV content
    const csvSections: string[] = [];

    // Section 1: Summary Statistics
    csvSections.push('LTV DASHBOARD REPORT');
    csvSections.push(`Generated: ${new Date().toISOString()}`);
    csvSections.push('');
    csvSections.push('SUMMARY STATISTICS');
    csvSections.push('Metric,Value');
    csvSections.push(`Total Revenue,${stats.totalRevenue}`);
    csvSections.push(`Total Outstanding,${stats.totalOutstanding}`);
    csvSections.push(`Average Customer LTV,${stats.avgLTV}`);
    csvSections.push(`Total Cases,${stats.totalCases}`);
    csvSections.push(`Paid Cases,${stats.paidCases}`);
    csvSections.push(`Partial Cases,${stats.partialCases}`);
    csvSections.push(`Monthly Growth %,${stats.monthlyGrowth}`);

    // Section 2: Monthly Revenue
    csvSections.push('');
    csvSections.push('MONTHLY REVENUE');
    csvSections.push('Month,Gross Revenue,Net Revenue,Refunds,Payment Count,Cases With Payments');
    for (const month of monthlyRevenue) {
      csvSections.push(
        `${month.month},${month.grossRevenue},${month.netRevenue},${month.refunds},${month.paymentCount},${month.casesWithPayments}`
      );
    }

    // Section 3: Top Customers
    csvSections.push('');
    csvSections.push('TOP CUSTOMERS BY LTV');
    csvSections.push(
      'Name,Email,Phone,Total Cases,Completed Cases,Total Value,Total Paid,Outstanding,Avg Case Value,First Case,Last Case'
    );
    for (const customer of topCustomers) {
      // Escape any commas in names
      const safeName = customer.fullName.includes(',')
        ? `"${customer.fullName}"`
        : customer.fullName;
      csvSections.push(
        `${safeName},${customer.email ?? ''},${customer.phone ?? ''},${customer.totalCases},${customer.completedCases},${customer.totalCaseValue},${customer.totalPaid},${customer.totalOutstanding},${customer.avgCaseValue},${customer.firstCaseDate ?? ''},${customer.lastCaseDate ?? ''}`
      );
    }

    // Section 4: Case Pipeline
    csvSections.push('');
    csvSections.push('CASE PIPELINE');
    csvSections.push('Status,Payment Status,Case Count,Total Value,Paid Value,Outstanding Value');
    for (const item of casePipeline) {
      csvSections.push(
        `${item.status},${item.paymentStatus},${item.caseCount},${item.totalValue},${item.paidValue},${item.outstandingValue}`
      );
    }

    const csvContent = csvSections.join('\n');
    const filename = `ltv-report-${new Date().toISOString().slice(0, 10)}.csv`;

    return {
      success: true,
      message: 'Report generated successfully',
      data: csvContent,
      filename,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}
