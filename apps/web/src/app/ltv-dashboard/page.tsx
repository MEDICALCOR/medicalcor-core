/**
 * LTV Dashboard Page
 *
 * H10 Production Fix: Customer Lifetime Value dashboard for revenue visibility.
 * Provides real-time visibility into case revenue, payments, and customer LTV.
 */

import { Suspense } from 'react';

export const metadata = {
  title: 'LTV Dashboard | MedicalCor',
  description: 'Customer Lifetime Value and revenue visibility dashboard',
};

// Mock data types - in production, these would come from the database
interface LeadLTV {
  leadId: string;
  fullName: string;
  email: string;
  phone: string;
  totalCases: number;
  completedCases: number;
  totalCaseValue: number;
  totalPaid: number;
  totalOutstanding: number;
  avgCaseValue: number;
  firstCaseDate: string | null;
  lastCaseDate: string | null;
}

interface MonthlyRevenue {
  month: string;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  paymentCount: number;
  casesWithPayments: number;
}

interface CasePipeline {
  status: string;
  paymentStatus: string;
  caseCount: number;
  totalValue: number;
  paidValue: number;
  outstandingValue: number;
}

interface DashboardStats {
  totalRevenue: number;
  totalOutstanding: number;
  avgLTV: number;
  totalCases: number;
  paidCases: number;
  partialCases: number;
  monthlyGrowth: number;
}

// Mock data generators - replace with actual server actions
async function getLTVStats(): Promise<DashboardStats> {
  // Simulated delay
  await new Promise((resolve) => setTimeout(resolve, 100));

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

async function getTopLeadsByLTV(): Promise<LeadLTV[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return [
    {
      leadId: '1',
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
      leadId: '2',
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
      leadId: '3',
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
      leadId: '4',
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
      leadId: '5',
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

async function getMonthlyRevenue(): Promise<MonthlyRevenue[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return [
    {
      month: '2024-12',
      grossRevenue: 145000,
      netRevenue: 142500,
      refunds: 2500,
      paymentCount: 45,
      casesWithPayments: 32,
    },
    {
      month: '2024-11',
      grossRevenue: 132000,
      netRevenue: 130000,
      refunds: 2000,
      paymentCount: 41,
      casesWithPayments: 28,
    },
    {
      month: '2024-10',
      grossRevenue: 128500,
      netRevenue: 127000,
      refunds: 1500,
      paymentCount: 38,
      casesWithPayments: 26,
    },
    {
      month: '2024-09',
      grossRevenue: 115000,
      netRevenue: 114000,
      refunds: 1000,
      paymentCount: 35,
      casesWithPayments: 24,
    },
    {
      month: '2024-08',
      grossRevenue: 98000,
      netRevenue: 96500,
      refunds: 1500,
      paymentCount: 30,
      casesWithPayments: 22,
    },
    {
      month: '2024-07',
      grossRevenue: 105000,
      netRevenue: 104000,
      refunds: 1000,
      paymentCount: 33,
      casesWithPayments: 23,
    },
  ];
}

async function getCasePipeline(): Promise<CasePipeline[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

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

export default function LTVDashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">LTV Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Customer Lifetime Value and revenue visibility
            </p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              Export Report
            </button>
          </div>
        </div>
      </header>

      {/* Main Statistics */}
      <Suspense fallback={<StatisticsLoading />}>
        <StatisticsSection />
      </Suspense>

      {/* Revenue Chart */}
      <Suspense fallback={<ChartLoading />}>
        <RevenueChartSection />
      </Suspense>

      {/* Two Column Layout */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Top Customers by LTV */}
        <Suspense fallback={<TableLoading title="Top Customers by LTV" />}>
          <TopCustomersSection />
        </Suspense>

        {/* Case Pipeline */}
        <Suspense fallback={<TableLoading title="Case Pipeline" />}>
          <CasePipelineSection />
        </Suspense>
      </div>
    </div>
  );
}

async function StatisticsSection() {
  const stats = await getLTVStats();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Revenue"
        value={formatCurrency(stats.totalRevenue)}
        subtitle="All time collected"
        icon="revenue"
        variant="success"
      />
      <StatCard
        title="Outstanding"
        value={formatCurrency(stats.totalOutstanding)}
        subtitle="Pending collection"
        icon="outstanding"
        variant={stats.totalOutstanding > 200000 ? 'warning' : 'default'}
      />
      <StatCard
        title="Avg. Customer LTV"
        value={formatCurrency(stats.avgLTV)}
        subtitle="Per customer"
        icon="ltv"
      />
      <StatCard
        title="Monthly Growth"
        value={`+${stats.monthlyGrowth}%`}
        subtitle="vs. last month"
        icon="growth"
        variant="success"
      />
    </div>
  );
}

async function RevenueChartSection() {
  const monthlyData = await getMonthlyRevenue();

  // Find max value for scaling
  const maxRevenue = Math.max(...monthlyData.map((m) => m.grossRevenue));

  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-gray-900">Monthly Revenue Trend</h2>
      <p className="text-sm text-gray-500">Last 6 months performance</p>

      {/* Simple bar chart */}
      <div className="mt-6 flex items-end gap-4" style={{ height: '200px' }}>
        {monthlyData.reverse().map((month) => {
          const height = (month.grossRevenue / maxRevenue) * 100;
          const monthName = new Date(month.month + '-01').toLocaleDateString('en-US', {
            month: 'short',
          });

          return (
            <div key={month.month} className="flex flex-1 flex-col items-center">
              <div className="relative w-full">
                <div
                  className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600"
                  style={{ height: `${height * 2}px` }}
                  title={`${formatCurrency(month.grossRevenue)}`}
                />
                {month.refunds > 0 && (
                  <div
                    className="absolute bottom-0 w-full rounded-t bg-red-400"
                    style={{ height: `${(month.refunds / maxRevenue) * 200}px` }}
                    title={`Refunds: ${formatCurrency(month.refunds)}`}
                  />
                )}
              </div>
              <span className="mt-2 text-xs text-gray-600">{monthName}</span>
              <span className="text-xs font-medium text-gray-900">
                {formatCurrency(month.netRevenue, true)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-blue-500" />
          <span className="text-sm text-gray-600">Gross Revenue</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-red-400" />
          <span className="text-sm text-gray-600">Refunds</span>
        </div>
      </div>
    </div>
  );
}

async function TopCustomersSection() {
  const leads = await getTopLeadsByLTV();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Top Customers by LTV</h2>
          <p className="text-sm text-gray-500">Highest lifetime value customers</p>
        </div>
        <a href="/patients" className="text-sm text-blue-600 hover:text-blue-700">
          View all
        </a>
      </div>

      <div className="mt-4 divide-y divide-gray-100">
        {leads.map((lead, index) => (
          <div key={lead.leadId} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600">
                {index + 1}
              </span>
              <div>
                <p className="font-medium text-gray-900">{lead.fullName}</p>
                <p className="text-sm text-gray-500">
                  {lead.totalCases} cases | {lead.completedCases} completed
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">
                {formatCurrency(lead.totalCaseValue)}
              </p>
              {lead.totalOutstanding > 0 && (
                <p className="text-sm text-amber-600">
                  {formatCurrency(lead.totalOutstanding)} outstanding
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function CasePipelineSection() {
  const pipeline = await getCasePipeline();

  const totalValue = pipeline.reduce((sum, p) => sum + p.totalValue, 0);
  const totalPaid = pipeline.reduce((sum, p) => sum + p.paidValue, 0);
  const totalCases = pipeline.reduce((sum, p) => sum + p.caseCount, 0);

  const statusLabels: Record<string, string> = {
    pending: 'Pending Start',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    on_hold: 'On Hold',
  };

  const paymentLabels: Record<string, string> = {
    unpaid: 'Unpaid',
    partial: 'Partially Paid',
    paid: 'Fully Paid',
    overpaid: 'Overpaid',
    refunded: 'Refunded',
  };

  const paymentColors: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    overpaid: 'bg-blue-100 text-blue-700',
    refunded: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Case Pipeline</h2>
          <p className="text-sm text-gray-500">Cases by status and payment</p>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">{totalCases}</p>
          <p className="text-sm text-gray-500">Total Cases</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid, true)}</p>
          <p className="text-sm text-gray-500">Collected</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600">
            {Math.round((totalPaid / totalValue) * 100)}%
          </p>
          <p className="text-sm text-gray-500">Collection Rate</p>
        </div>
      </div>

      {/* Pipeline breakdown */}
      <div className="mt-4 divide-y divide-gray-100">
        {pipeline.map((item, index) => (
          <div key={index} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${paymentColors[item.paymentStatus]}`}
              >
                {paymentLabels[item.paymentStatus]}
              </span>
              <div>
                <p className="font-medium text-gray-900">{statusLabels[item.status]}</p>
                <p className="text-sm text-gray-500">{item.caseCount} cases</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">{formatCurrency(item.totalValue)}</p>
              <p className="text-sm text-gray-500">
                {formatCurrency(item.paidValue)} paid
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const variantClasses = {
    default: 'bg-white border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    danger: 'bg-red-50 border-red-200',
  };

  const iconMap: Record<string, string> = {
    revenue: '💰',
    outstanding: '⏳',
    ltv: '👤',
    growth: '📈',
    cases: '📋',
  };

  return (
    <div className={`rounded-lg border p-6 ${variantClasses[variant]}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{iconMap[icon]}</span>
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <h3 className="mt-4 font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function formatCurrency(amount: number, compact = false): string {
  if (compact && amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================================
// LOADING STATES
// ============================================================================

function StatisticsLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-8 rounded bg-gray-200" />
            <div className="h-8 w-20 rounded bg-gray-200" />
          </div>
          <div className="mt-4 h-4 w-24 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="mt-8 animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-32 rounded bg-gray-200" />
      <div className="mt-6 flex items-end gap-4" style={{ height: '200px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex-1">
            <div
              className="w-full rounded-t bg-gray-200"
              style={{ height: `${Math.random() * 150 + 50}px` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableLoading({ title }: { title: string }) {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-32 rounded bg-gray-200" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gray-200" />
              <div>
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="mt-1 h-3 w-24 rounded bg-gray-200" />
              </div>
            </div>
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
