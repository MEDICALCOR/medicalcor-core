/**
 * Analytics types for MedicalCor Cortex
 */

// Time range options
export type TimeRange = '7d' | '30d' | '90d' | '12m' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

// Key metrics
export interface DashboardMetrics {
  totalLeads: number;
  totalLeadsChange: number;
  hotLeads: number;
  hotLeadsChange: number;
  appointmentsScheduled: number;
  appointmentsChange: number;
  conversionRate: number;
  conversionRateChange: number;
  avgResponseTime: number;
  avgResponseTimeChange: number;
  revenue: number;
  revenueChange: number;
}

// Chart data
export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface LeadsBySourceData {
  source: string;
  count: number;
  percentage: number;
  color: string;
}

export interface LeadsByClassificationData {
  classification: 'HOT' | 'WARM' | 'COLD';
  count: number;
  percentage: number;
}

export interface ConversionFunnelStep {
  name: string;
  count: number;
  percentage: number;
  dropoff?: number;
}

export interface ProcedureInterestData {
  procedure: string;
  count: number;
  revenue: number;
}

export interface OperatorPerformance {
  id: string;
  name: string;
  avatar?: string;
  leadsHandled: number;
  conversions: number;
  conversionRate: number;
  avgResponseTime: number;
  satisfaction: number;
}

// Analytics response
export interface AnalyticsData {
  metrics: DashboardMetrics;
  leadsOverTime: TimeSeriesDataPoint[];
  appointmentsOverTime: TimeSeriesDataPoint[];
  leadsBySource: LeadsBySourceData[];
  leadsByClassification: LeadsByClassificationData[];
  conversionFunnel: ConversionFunnelStep[];
  topProcedures: ProcedureInterestData[];
  operatorPerformance: OperatorPerformance[];
}
