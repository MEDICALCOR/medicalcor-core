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

import { requirePermission } from '@/lib/auth/server-action-auth';

// ============================================================================
// TYPES
// ============================================================================

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
// MOCK DATA GENERATORS
// ============================================================================

/**
 * Generate mock LTV statistics
 * @internal
 */
function generateMockStats(): LTVDashboardStats {
  return {
    totalRevenue: 1247500,
    totalOutstanding: 342800,
    avgLTV: 8450,
    totalCases: 156,
    paidCases: 98,
    partialCases: 34,
    monthlyGrowth: 12.5,
  };
}

/**
 * Generate mock top customers
 * @internal
 */
function generateMockTopCustomers(): LeadLTV[] {
  return [
    {
      leadId: 'lead-001',
      fullName: 'Maria Ionescu',
      email: 'maria.ionescu@email.com',
      phone: '+40721123456',
      totalCases: 3,
      completedCases: 2,
      totalCaseValue: 45000,
      totalPaid: 38000,
      totalOutstanding: 7000,
      avgCaseValue: 15000,
      firstCaseDate: '2024-03-15',
      lastCaseDate: '2024-11-20',
    },
    {
      leadId: 'lead-002',
      fullName: 'Ion Popescu',
      email: 'ion.popescu@email.com',
      phone: '+40722234567',
      totalCases: 2,
      completedCases: 2,
      totalCaseValue: 32000,
      totalPaid: 32000,
      totalOutstanding: 0,
      avgCaseValue: 16000,
      firstCaseDate: '2024-01-10',
      lastCaseDate: '2024-09-05',
    },
    {
      leadId: 'lead-003',
      fullName: 'Elena Gheorghe',
      email: 'elena.g@email.com',
      phone: '+40723345678',
      totalCases: 4,
      completedCases: 3,
      totalCaseValue: 28500,
      totalPaid: 21000,
      totalOutstanding: 7500,
      avgCaseValue: 7125,
      firstCaseDate: '2023-11-22',
      lastCaseDate: '2024-12-01',
    },
    {
      leadId: 'lead-004',
      fullName: 'Andrei Marin',
      email: 'andrei.m@email.com',
      phone: '+40724456789',
      totalCases: 1,
      completedCases: 1,
      totalCaseValue: 24000,
      totalPaid: 24000,
      totalOutstanding: 0,
      avgCaseValue: 24000,
      firstCaseDate: '2024-08-15',
      lastCaseDate: '2024-08-15',
    },
    {
      leadId: 'lead-005',
      fullName: 'Ana Dumitrescu',
      email: 'ana.d@email.com',
      phone: '+40725567890',
      totalCases: 2,
      completedCases: 1,
      totalCaseValue: 19500,
      totalPaid: 12000,
      totalOutstanding: 7500,
      avgCaseValue: 9750,
      firstCaseDate: '2024-06-10',
      lastCaseDate: '2024-11-28',
    },
  ];
}

/**
 * Generate mock monthly revenue
 * @internal
 */
function generateMockMonthlyRevenue(): MonthlyRevenue[] {
  const now = new Date();
  const months: MonthlyRevenue[] = [];

  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = date.toISOString().slice(0, 7);

    // Generate slightly varied revenue data
    const baseRevenue = 100000 + Math.floor(Math.random() * 50000);
    const refunds = Math.floor(baseRevenue * 0.02);

    months.push({
      month: monthStr,
      grossRevenue: baseRevenue,
      netRevenue: baseRevenue - refunds,
      refunds,
      paymentCount: 30 + Math.floor(Math.random() * 20),
      casesWithPayments: 20 + Math.floor(Math.random() * 15),
    });
  }

  return months;
}

/**
 * Generate mock case pipeline
 * @internal
 */
function generateMockCasePipeline(): CasePipeline[] {
  return [
    {
      status: 'pending',
      paymentStatus: 'unpaid',
      caseCount: 24,
      totalValue: 456000,
      paidValue: 0,
      outstandingValue: 456000,
    },
    {
      status: 'in_progress',
      paymentStatus: 'partial',
      caseCount: 34,
      totalValue: 612000,
      paidValue: 342000,
      outstandingValue: 270000,
    },
    {
      status: 'in_progress',
      paymentStatus: 'paid',
      caseCount: 18,
      totalValue: 324000,
      paidValue: 324000,
      outstandingValue: 0,
    },
    {
      status: 'completed',
      paymentStatus: 'paid',
      caseCount: 80,
      totalValue: 1440000,
      paidValue: 1440000,
      outstandingValue: 0,
    },
  ];
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

  // TODO: Replace with actual database queries when backend is ready
  // Use the lead_ltv, monthly_revenue, and case_pipeline views
  return generateMockStats();
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

  // TODO: Replace with actual database query
  // SELECT * FROM lead_ltv ORDER BY total_paid DESC LIMIT $1
  const customers = generateMockTopCustomers();
  return customers.slice(0, limit);
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

  // TODO: Replace with actual database query
  // SELECT * FROM monthly_revenue WHERE month >= DATE_TRUNC('month', NOW() - INTERVAL '$1 months')
  const revenue = generateMockMonthlyRevenue();
  return revenue.slice(0, months);
}

/**
 * Get case pipeline breakdown
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Array of case pipeline data by status and payment status
 */
export async function getCasePipelineAction(): Promise<CasePipeline[]> {
  await requirePermission('VIEW_ANALYTICS');

  // TODO: Replace with actual database query
  // SELECT * FROM case_pipeline WHERE clinic_id = $1
  return generateMockCasePipeline();
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
 * Export report action
 *
 * Generates an LTV report for export.
 *
 * @param format Export format ('csv' | 'xlsx' | 'pdf')
 * @requires VIEW_ANALYTICS permission
 * @returns Report data or download URL
 */
export async function exportLTVReportAction(
  format: 'csv' | 'xlsx' | 'pdf' = 'csv'
): Promise<{ success: boolean; message: string; downloadUrl?: string }> {
  await requirePermission('VIEW_ANALYTICS');

  // TODO: Implement actual report generation
  // For now, return a placeholder response
  return {
    success: false,
    message: `Export to ${format.toUpperCase()} is not yet implemented. This feature will be available soon.`,
  };
}
