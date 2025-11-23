import type {
  AnalyticsData,
  ConversionFunnelStep,
  DashboardMetrics,
  LeadsByClassificationData,
  LeadsBySourceData,
  OperatorPerformance,
  ProcedureInterestData,
  TimeSeriesDataPoint,
} from './types';

// Generate time series data for last N days
function generateTimeSeriesData(
  days: number,
  baseValue: number,
  variance: number
): TimeSeriesDataPoint[] {
  const data: TimeSeriesDataPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const randomVariance = (Math.random() - 0.5) * 2 * variance;
    const value = Math.max(0, Math.round(baseValue + randomVariance));

    data.push({
      date: date.toISOString().split('T')[0],
      value,
    });
  }

  return data;
}

export function generateMockMetrics(): DashboardMetrics {
  return {
    totalLeads: 847,
    totalLeadsChange: 12.5,
    hotLeads: 156,
    hotLeadsChange: 8.3,
    appointmentsScheduled: 234,
    appointmentsChange: 15.2,
    conversionRate: 27.6,
    conversionRateChange: 3.4,
    avgResponseTime: 4.2,
    avgResponseTimeChange: -18.5,
    revenue: 125000,
    revenueChange: 22.1,
  };
}

export function generateMockLeadsOverTime(days = 30): TimeSeriesDataPoint[] {
  return generateTimeSeriesData(days, 25, 15);
}

export function generateMockAppointmentsOverTime(days = 30): TimeSeriesDataPoint[] {
  return generateTimeSeriesData(days, 8, 5);
}

export function generateMockLeadsBySource(): LeadsBySourceData[] {
  return [
    { source: 'WhatsApp', count: 425, percentage: 50.2, color: '#25D366' },
    { source: 'Voice', count: 212, percentage: 25.0, color: '#3B82F6' },
    { source: 'Web', count: 156, percentage: 18.4, color: '#8B5CF6' },
    { source: 'Referral', count: 54, percentage: 6.4, color: '#F59E0B' },
  ];
}

export function generateMockLeadsByClassification(): LeadsByClassificationData[] {
  return [
    { classification: 'HOT', count: 156, percentage: 18.4 },
    { classification: 'WARM', count: 389, percentage: 45.9 },
    { classification: 'COLD', count: 302, percentage: 35.7 },
  ];
}

export function generateMockConversionFunnel(): ConversionFunnelStep[] {
  return [
    { name: 'Lead-uri noi', count: 847, percentage: 100 },
    { name: 'Calificați', count: 623, percentage: 73.6, dropoff: 26.4 },
    { name: 'Contactați', count: 498, percentage: 58.8, dropoff: 20.0 },
    { name: 'Consultație programată', count: 312, percentage: 36.8, dropoff: 37.3 },
    { name: 'Consultație efectuată', count: 267, percentage: 31.5, dropoff: 14.4 },
    { name: 'Procedură rezervată', count: 234, percentage: 27.6, dropoff: 12.4 },
  ];
}

export function generateMockTopProcedures(): ProcedureInterestData[] {
  return [
    { procedure: 'Rinoplastie', count: 234, revenue: 45000 },
    { procedure: 'Blefaroplastie', count: 189, revenue: 28000 },
    { procedure: 'Lifting facial', count: 156, revenue: 52000 },
    { procedure: 'Liposucție', count: 134, revenue: 38000 },
    { procedure: 'Augmentare mamară', count: 98, revenue: 42000 },
  ];
}

export function generateMockOperatorPerformance(): OperatorPerformance[] {
  return [
    {
      id: 'op-1',
      name: 'Maria Popescu',
      leadsHandled: 156,
      conversions: 48,
      conversionRate: 30.8,
      avgResponseTime: 2.3,
      satisfaction: 4.8,
    },
    {
      id: 'op-2',
      name: 'Ion Ionescu',
      leadsHandled: 143,
      conversions: 39,
      conversionRate: 27.3,
      avgResponseTime: 3.1,
      satisfaction: 4.6,
    },
    {
      id: 'op-3',
      name: 'Ana Georgescu',
      leadsHandled: 128,
      conversions: 42,
      conversionRate: 32.8,
      avgResponseTime: 2.8,
      satisfaction: 4.9,
    },
    {
      id: 'op-4',
      name: 'Mihai Dumitrescu',
      leadsHandled: 112,
      conversions: 28,
      conversionRate: 25.0,
      avgResponseTime: 4.5,
      satisfaction: 4.3,
    },
  ];
}

export function generateMockAnalyticsData(): AnalyticsData {
  return {
    metrics: generateMockMetrics(),
    leadsOverTime: generateMockLeadsOverTime(),
    appointmentsOverTime: generateMockAppointmentsOverTime(),
    leadsBySource: generateMockLeadsBySource(),
    leadsByClassification: generateMockLeadsByClassification(),
    conversionFunnel: generateMockConversionFunnel(),
    topProcedures: generateMockTopProcedures(),
    operatorPerformance: generateMockOperatorPerformance(),
  };
}
