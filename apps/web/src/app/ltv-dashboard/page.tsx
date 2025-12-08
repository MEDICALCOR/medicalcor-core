/**
 * LTV Dashboard Page
 *
 * H10 Production Fix: Customer Lifetime Value dashboard for revenue visibility.
 * Provides real-time visibility into case revenue, payments, and customer LTV.
 */

import { Suspense } from 'react';
import {
  getLTVStatsAction,
  getTopCustomersAction,
  getMonthlyRevenueAction,
  getCasePipelineAction,
  getPLTVSummaryAction,
} from './actions';
import { ExportReportButton } from './components/ExportReportButton';

export const metadata = {
  title: 'LTV Dashboard | MedicalCor',
  description: 'Customer Lifetime Value and revenue visibility dashboard',
};

export default function LTVDashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">LTV Dashboard</h1>
            <p className="mt-2 text-gray-600">Customer Lifetime Value and revenue visibility</p>
          </div>
          <div className="flex gap-2">
            <ExportReportButton />
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

      {/* pLTV Tier Distribution */}
      <Suspense fallback={<PLTVLoading />}>
        <PLTVSection />
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
  const stats = await getLTVStatsAction();

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
  const monthlyData = await getMonthlyRevenueAction();

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
                  title={formatCurrency(month.grossRevenue)}
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
  const leads = await getTopCustomersAction();

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
              <p className="font-semibold text-gray-900">{formatCurrency(lead.totalCaseValue)}</p>
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
  const pipeline = await getCasePipelineAction();

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
              <p className="text-sm text-gray-500">{formatCurrency(item.paidValue)} paid</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// pLTV tier configuration
const PLTV_TIERS = [
  { name: 'Diamond', color: 'bg-purple-500', label: 'DIAMOND' },
  { name: 'Platinum', color: 'bg-gray-400', label: 'PLATINUM' },
  { name: 'Gold', color: 'bg-yellow-500', label: 'GOLD' },
  { name: 'Silver', color: 'bg-slate-300', label: 'SILVER' },
  { name: 'Bronze', color: 'bg-amber-600', label: 'BRONZE' },
] as const;

async function PLTVSection() {
  const pltv = await getPLTVSummaryAction();
  const tierCounts = [
    pltv.diamondLeads,
    pltv.platinumLeads,
    pltv.goldLeads,
    pltv.silverLeads,
    pltv.bronzeLeads,
  ];
  const totalTiers = tierCounts.reduce((sum, count) => sum + count, 0);

  if (totalTiers === 0) {
    return (
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900">Predicted LTV (pLTV) Tiers</h2>
        <p className="text-sm text-gray-500">AI-powered customer value predictions</p>
        <div className="mt-6 flex items-center justify-center py-8 text-center">
          <p className="text-gray-500">
            No pLTV scores calculated yet. Scores are generated as leads interact with your clinic.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
      <PLTVHeader totalScored={pltv.totalScoredLeads} totalPredicted={pltv.totalPredictedLTV} />
      <PLTVTierBar tierCounts={tierCounts} totalTiers={totalTiers} />
      <PLTVTierLegend tierCounts={tierCounts} />
      <PLTVMetrics pltv={pltv} />
      {pltv.lastCalculation && (
        <p className="mt-4 text-xs text-gray-400">
          Last updated: {new Date(pltv.lastCalculation).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function PLTVHeader({
  totalScored,
  totalPredicted,
}: {
  totalScored: number;
  totalPredicted: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Predicted LTV (pLTV) Tiers</h2>
        <p className="text-sm text-gray-500">AI-powered predictions ({totalScored} leads scored)</p>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalPredicted)}</p>
        <p className="text-sm text-gray-500">Total Predicted Value</p>
      </div>
    </div>
  );
}

function PLTVTierBar({ tierCounts, totalTiers }: { tierCounts: number[]; totalTiers: number }) {
  return (
    <div className="mt-6 flex h-8 overflow-hidden rounded-lg">
      {PLTV_TIERS.map((tier, i) => {
        const pct = totalTiers > 0 ? (tierCounts[i] / totalTiers) * 100 : 0;
        if (pct === 0) return null;
        return (
          <div
            key={tier.label}
            className={`${tier.color} flex items-center justify-center text-xs font-medium text-white`}
            style={{ width: `${pct}%` }}
            title={`${tier.name}: ${tierCounts[i]} leads (${pct.toFixed(1)}%)`}
          >
            {pct > 10 && tierCounts[i]}
          </div>
        );
      })}
    </div>
  );
}

function PLTVTierLegend({ tierCounts }: { tierCounts: number[] }) {
  return (
    <div className="mt-4 grid grid-cols-5 gap-4">
      {PLTV_TIERS.map((tier, i) => (
        <div key={tier.label} className="text-center">
          <div className="flex items-center justify-center gap-2">
            <div className={`h-3 w-3 rounded ${tier.color}`} />
            <span className="text-sm font-medium text-gray-700">{tier.name}</span>
          </div>
          <p className="mt-1 text-lg font-bold text-gray-900">{tierCounts[i]}</p>
        </div>
      ))}
    </div>
  );
}

function PLTVMetrics({
  pltv,
}: {
  pltv: { avgPredictedLTV: number; highGrowthLeads: number; priorityLeads: number };
}) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
      <div className="text-center">
        <p className="text-sm text-gray-500">Avg Predicted LTV</p>
        <p className="text-lg font-semibold text-gray-900">
          {formatCurrency(pltv.avgPredictedLTV)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-500">High Growth Leads</p>
        <p className="text-lg font-semibold text-green-600">{pltv.highGrowthLeads}</p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-500">Priority Leads</p>
        <p className="text-lg font-semibold text-blue-600">{pltv.priorityLeads}</p>
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

function PLTVLoading() {
  return (
    <div className="mt-8 animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-56 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-40 rounded bg-gray-200" />
        </div>
        <div className="text-right">
          <div className="h-8 w-24 rounded bg-gray-200" />
          <div className="mt-1 h-3 w-20 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mt-6 h-8 w-full rounded-lg bg-gray-200" />
      <div className="mt-4 grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="text-center">
            <div className="mx-auto h-4 w-16 rounded bg-gray-200" />
            <div className="mx-auto mt-2 h-6 w-8 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableLoading({ title: _title }: { title: string }) {
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
