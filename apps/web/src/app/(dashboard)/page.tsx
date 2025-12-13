/**
 * @fileoverview Dashboard Page
 *
 * Main dashboard page using Server Components with Suspense.
 * Orchestrates parallel loading of dashboard sections.
 *
 * DESIGN:
 * - Main page < 40 lines
 * - Parallel loading with Suspense
 * - Server Components for each section
 *
 * @module web/app/(dashboard)/page
 */

import { Suspense } from 'react';
import { MetricsSection, MetricsSectionSkeleton } from './components/MetricsSection';
import { ChartsSection, ChartsSectionSkeleton } from './components/ChartsSection';
import { AlertsSection, AlertsSectionSkeleton } from './components/AlertsSection';

export const metadata = {
  title: 'Dashboard | MedicalCor',
  description: 'MedicalCor CRM Dashboard',
};

export default function DashboardPage() {
  return (
    <main className="container mx-auto py-6 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <Suspense fallback={<MetricsSectionSkeleton />}>
        <MetricsSection />
      </Suspense>

      <Suspense fallback={<ChartsSectionSkeleton />}>
        <ChartsSection />
      </Suspense>

      <Suspense fallback={<AlertsSectionSkeleton />}>
        <AlertsSection />
      </Suspense>
    </main>
  );
}
