/**
 * Analytics metrics for dashboard and reports
 */
export interface AnalyticsMetrics {
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

/**
 * Time series data point for charts
 */
export interface TimeSeriesPoint {
  date: string;
  value: number;
}

/**
 * Lead distribution by source for pie charts
 */
export interface LeadsBySource {
  source: string;
  count: number;
  color: string;
}

/**
 * Conversion funnel step data
 */
export interface ConversionFunnelStep {
  name: string;
  count: number;
  percentage: number;
}

/**
 * Top procedure metrics
 */
export interface TopProcedure {
  procedure: string;
  count: number;
  revenue: number;
}

/**
 * Operator/agent performance metrics
 */
export interface OperatorPerformance {
  id: string;
  name: string;
  leadsHandled: number;
  conversions: number;
  conversionRate: number;
  avgResponseTime: number;
  satisfaction: number;
}

/**
 * Complete analytics data structure
 */
export interface AnalyticsData {
  metrics: AnalyticsMetrics;
  leadsOverTime: TimeSeriesPoint[];
  appointmentsOverTime: TimeSeriesPoint[];
  leadsBySource: LeadsBySource[];
  conversionFunnel: ConversionFunnelStep[];
  topProcedures: TopProcedure[];
  operatorPerformance: OperatorPerformance[];
}
