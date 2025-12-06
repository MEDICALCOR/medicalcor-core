/**
 * @fileoverview Load Testing Schemas (L7 - Performance Baseline)
 *
 * Zod schemas for K6 load test result storage and dashboard display.
 * Supports storing test runs, endpoint metrics, and threshold results.
 *
 * @module @medicalcor/types/load-testing
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Load test scenario types matching K6 configurations
 */
export const LoadTestScenarioSchema = z.enum(['smoke', 'load', 'stress', 'soak', 'custom']);
export type LoadTestScenario = z.infer<typeof LoadTestScenarioSchema>;

/**
 * Overall test run status
 */
export const LoadTestStatusSchema = z.enum(['passed', 'failed', 'degraded']);
export type LoadTestStatus = z.infer<typeof LoadTestStatusSchema>;

// =============================================================================
// Threshold Schemas
// =============================================================================

/**
 * Individual threshold result
 */
export const ThresholdResultSchema = z.object({
  threshold: z.string(),
  passed: z.boolean(),
});
export type ThresholdResult = z.infer<typeof ThresholdResultSchema>;

/**
 * Map of metric names to threshold results
 */
export const ThresholdsMapSchema = z.record(z.string(), z.array(ThresholdResultSchema));
export type ThresholdsMap = z.infer<typeof ThresholdsMapSchema>;

// =============================================================================
// Input Schemas (for API requests)
// =============================================================================

/**
 * Core metrics from K6 test run
 */
export const LoadTestMetricsInputSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  successfulRequests: z.number().int().nonnegative().optional(),
  failedRequests: z.number().int().nonnegative().optional(),
  successRate: z.number().min(0).max(100),
  errorRate: z.number().min(0).max(100).optional(),

  // Virtual users
  vusMax: z.number().int().nonnegative().optional(),
  iterations: z.number().int().nonnegative().optional(),

  // Latency in milliseconds
  avgDuration: z.number().nonnegative(),
  minDuration: z.number().nonnegative().optional(),
  maxDuration: z.number().nonnegative().optional(),
  p50Duration: z.number().nonnegative().optional(),
  p90Duration: z.number().nonnegative().optional(),
  p95Duration: z.number().nonnegative(),
  p99Duration: z.number().nonnegative(),

  // Throughput
  requestsPerSecond: z.number().nonnegative().optional(),
  dataReceivedBytes: z.number().int().nonnegative().optional(),
  dataSentBytes: z.number().int().nonnegative().optional(),
});
export type LoadTestMetricsInput = z.infer<typeof LoadTestMetricsInputSchema>;

/**
 * Endpoint-specific metrics
 */
export const EndpointMetricsInputSchema = z.object({
  endpointName: z.string().min(1).max(100),
  endpointUrl: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),

  totalRequests: z.number().int().nonnegative(),
  successfulRequests: z.number().int().nonnegative().optional(),
  failedRequests: z.number().int().nonnegative().optional(),

  avgDuration: z.number().nonnegative(),
  minDuration: z.number().nonnegative().optional(),
  maxDuration: z.number().nonnegative().optional(),
  p50Duration: z.number().nonnegative().optional(),
  p90Duration: z.number().nonnegative().optional(),
  p95Duration: z.number().nonnegative().optional(),
  p99Duration: z.number().nonnegative().optional(),

  statusCodes: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type EndpointMetricsInput = z.infer<typeof EndpointMetricsInputSchema>;

/**
 * Complete load test result submission
 */
export const CreateLoadTestResultSchema = z.object({
  // Test identification
  runId: z.string().uuid().optional(),
  scenario: LoadTestScenarioSchema,
  environment: z.string().min(1).max(50).default('local'),
  baseUrl: z.string().url(),

  // Timing
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  durationSeconds: z.number().nonnegative().optional(),

  // Metrics
  metrics: LoadTestMetricsInputSchema,

  // Thresholds
  thresholds: ThresholdsMapSchema.optional(),
  thresholdsPassed: z.boolean().optional(),

  // Endpoint metrics
  endpoints: z.array(EndpointMetricsInputSchema).optional(),

  // Metadata
  tags: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateLoadTestResult = z.infer<typeof CreateLoadTestResultSchema>;

// =============================================================================
// Output Schemas (for API responses and dashboard)
// =============================================================================

/**
 * Load test result from database
 */
export const LoadTestResultSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  scenario: LoadTestScenarioSchema,
  environment: z.string(),
  baseUrl: z.string(),

  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().nullable(),

  status: LoadTestStatusSchema,

  totalRequests: z.number(),
  successfulRequests: z.number(),
  failedRequests: z.number(),
  successRate: z.number(),
  errorRate: z.number(),

  vusMax: z.number(),
  iterations: z.number(),

  avgDuration: z.number(),
  minDuration: z.number(),
  maxDuration: z.number(),
  p50Duration: z.number(),
  p90Duration: z.number(),
  p95Duration: z.number(),
  p99Duration: z.number(),

  requestsPerSecond: z.number(),
  dataReceivedBytes: z.number(),
  dataSentBytes: z.number(),

  thresholds: ThresholdsMapSchema.nullable(),
  thresholdsPassed: z.boolean(),

  tags: z.record(z.string(), z.string()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),

  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
});
export type LoadTestResult = z.infer<typeof LoadTestResultSchema>;

/**
 * Endpoint metrics from database
 */
export const LoadTestEndpointMetricsSchema = z.object({
  id: z.string().uuid(),
  resultId: z.string().uuid(),
  endpointName: z.string(),
  endpointUrl: z.string().nullable(),
  method: z.string(),

  totalRequests: z.number(),
  successfulRequests: z.number(),
  failedRequests: z.number(),

  avgDuration: z.number(),
  minDuration: z.number(),
  maxDuration: z.number(),
  p50Duration: z.number(),
  p90Duration: z.number(),
  p95Duration: z.number(),
  p99Duration: z.number(),

  statusCodes: z.record(z.string(), z.number()).nullable(),

  createdAt: z.string().datetime(),
});
export type LoadTestEndpointMetrics = z.infer<typeof LoadTestEndpointMetricsSchema>;

// =============================================================================
// Dashboard Schemas
// =============================================================================

/**
 * Summary statistics for dashboard
 */
export const LoadTestSummaryStatsSchema = z.object({
  totalRuns: z.number(),
  passedRuns: z.number(),
  failedRuns: z.number(),
  degradedRuns: z.number(),
  avgP95Duration: z.number(),
  avgSuccessRate: z.number(),
  lastRunAt: z.string().datetime().nullable(),
});
export type LoadTestSummaryStats = z.infer<typeof LoadTestSummaryStatsSchema>;

/**
 * Trend data point for charts
 */
export const LoadTestTrendPointSchema = z.object({
  date: z.string(),
  p95Duration: z.number(),
  p99Duration: z.number(),
  avgDuration: z.number(),
  successRate: z.number(),
  totalRequests: z.number(),
  scenario: LoadTestScenarioSchema,
  status: LoadTestStatusSchema,
});
export type LoadTestTrendPoint = z.infer<typeof LoadTestTrendPointSchema>;

/**
 * Scenario breakdown for donut chart
 */
export const ScenarioBreakdownSchema = z.object({
  scenario: LoadTestScenarioSchema,
  count: z.number(),
  avgP95: z.number(),
  passRate: z.number(),
});
export type ScenarioBreakdown = z.infer<typeof ScenarioBreakdownSchema>;

/**
 * Environment comparison data
 */
export const EnvironmentComparisonSchema = z.object({
  environment: z.string(),
  avgP95: z.number(),
  avgP99: z.number(),
  avgSuccessRate: z.number(),
  totalRuns: z.number(),
});
export type EnvironmentComparison = z.infer<typeof EnvironmentComparisonSchema>;

/**
 * Complete dashboard data
 */
export const LoadTestDashboardDataSchema = z.object({
  stats: LoadTestSummaryStatsSchema,
  trends: z.array(LoadTestTrendPointSchema),
  scenarioBreakdown: z.array(ScenarioBreakdownSchema),
  environmentComparison: z.array(EnvironmentComparisonSchema),
  recentRuns: z.array(LoadTestResultSchema),
});
export type LoadTestDashboardData = z.infer<typeof LoadTestDashboardDataSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Time range for querying load test results
 */
export const LoadTestTimeRangeSchema = z.enum(['7d', '30d', '90d', '6m', '1y']);
export type LoadTestTimeRange = z.infer<typeof LoadTestTimeRangeSchema>;

/**
 * Query parameters for fetching load test results
 */
export const LoadTestQuerySchema = z.object({
  timeRange: LoadTestTimeRangeSchema.default('30d'),
  scenario: LoadTestScenarioSchema.optional(),
  environment: z.string().optional(),
  status: LoadTestStatusSchema.optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});
export type LoadTestQuery = z.infer<typeof LoadTestQuerySchema>;
