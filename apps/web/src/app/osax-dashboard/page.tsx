/**
 * OSAX Dashboard Page
 *
 * Main dashboard for OSAX (Obstructive Sleep Apnea) case management.
 */

import { Suspense } from 'react';
import { OsaxCaseTable } from './components/OsaxCaseTable';
import { getOsaxCases, getOsaxStatistics } from './actions/getOsaxCases';

export const metadata = {
  title: 'OSAX Dashboard | MedicalCor',
  description: 'Obstructive Sleep Apnea case management dashboard',
};

export default function OsaxDashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">OSAX Dashboard</h1>
        <p className="mt-2 text-gray-600">Manage and monitor Obstructive Sleep Apnea cases</p>
      </header>

      {/* Statistics Cards */}
      <Suspense fallback={<StatisticsLoading />}>
        <StatisticsSection />
      </Suspense>

      {/* Quick Filters */}
      <div className="mt-8 flex flex-wrap gap-2">
        <FilterButton label="All Cases" href="/osax-dashboard" />
        <FilterButton label="Urgent" href="/osax-dashboard?priority=URGENT" variant="danger" />
        <FilterButton
          label="Pending Review"
          href="/osax-dashboard?status=SCORED"
          variant="warning"
        />
        <FilterButton
          label="In Treatment"
          href="/osax-dashboard?status=IN_TREATMENT"
          variant="success"
        />
        <FilterButton label="Severe" href="/osax-dashboard?severity=SEVERE" variant="danger" />
      </div>

      {/* Cases Table */}
      <div className="mt-8">
        <Suspense fallback={<TableLoading />}>
          <CasesTableSection />
        </Suspense>
      </div>
    </div>
  );
}

async function StatisticsSection() {
  const stats = await getOsaxStatistics();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total Cases" value={stats.totalCases} subtitle="All time" icon="cases" />
      <StatCard
        title="Pending Review"
        value={stats.pendingReview}
        subtitle="Needs attention"
        icon="review"
        variant={stats.pendingReview > 10 ? 'warning' : 'default'}
      />
      <StatCard
        title="Active Treatments"
        value={stats.activeTreatments}
        subtitle="Currently in progress"
        icon="treatment"
        variant="success"
      />
      <StatCard
        title="Compliance Rate"
        value={`${stats.complianceRate}%`}
        subtitle="Treatment adherence"
        icon="compliance"
        variant={stats.complianceRate < 70 ? 'warning' : 'success'}
      />
    </div>
  );
}

async function CasesTableSection() {
  const cases = await getOsaxCases({
    limit: 20,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });

  return <OsaxCaseTable cases={cases} />;
}

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
    cases: '📋',
    review: '👁️',
    treatment: '💊',
    compliance: '📊',
  };

  return (
    <div className={`rounded-lg border p-6 ${variantClasses[variant]}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{iconMap[icon]}</span>
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <h3 className="mt-4 font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function FilterButton({
  label,
  href,
  variant = 'default',
}: {
  label: string;
  href: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const variantClasses = {
    default: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    success: 'bg-green-100 text-green-700 hover:bg-green-200',
    warning: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200',
  };

  return (
    <a
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${variantClasses[variant]}`}
    >
      {label}
    </a>
  );
}

function StatisticsLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-8 rounded bg-gray-200" />
            <div className="h-8 w-16 rounded bg-gray-200" />
          </div>
          <div className="mt-4 h-4 w-24 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function TableLoading() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex space-x-4">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
