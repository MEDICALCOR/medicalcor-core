'use client';

import * as Sentry from '@sentry/nextjs';

/**
 * Web Vitals Reporting to Sentry with Performance Budget Tracking
 *
 * Reports Core Web Vitals and additional performance metrics to Sentry
 * for monitoring and alerting. Includes budget threshold checking.
 *
 * Core Web Vitals (Google's ranking factors):
 * - LCP (Largest Contentful Paint): Loading performance
 * - INP (Interaction to Next Paint): Interactivity (replaced FID)
 * - CLS (Cumulative Layout Shift): Visual stability
 *
 * Additional metrics:
 * - FCP (First Contentful Paint): Initial render
 * - TTFB (Time to First Byte): Server response time
 *
 * @see https://web.dev/vitals/
 */

export interface WebVitalsMetric {
  id: string;
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  entries: PerformanceEntry[];
  navigationType: 'navigate' | 'reload' | 'back_forward' | 'prerender';
}

/**
 * Performance budget thresholds aligned with Core Web Vitals
 * These values should match .performance-budget.json
 */
export const PERFORMANCE_BUDGETS = {
  // Core Web Vitals
  LCP: { good: 2500, needsImprovement: 4000, unit: 'ms' },
  INP: { good: 200, needsImprovement: 500, unit: 'ms' },
  CLS: { good: 0.1, needsImprovement: 0.25, unit: 'score' },
  // Additional metrics
  FCP: { good: 1800, needsImprovement: 3000, unit: 'ms' },
  TTFB: { good: 800, needsImprovement: 1800, unit: 'ms' },
  // Extended metrics
  TBT: { good: 200, needsImprovement: 600, unit: 'ms' },
  TTI: { good: 3800, needsImprovement: 7300, unit: 'ms' },
  SI: { good: 3400, needsImprovement: 5800, unit: 'ms' },
} as const;

// Legacy alias for backwards compatibility
export const THRESHOLDS = PERFORMANCE_BUDGETS;

export type MetricName = keyof typeof PERFORMANCE_BUDGETS;

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  metric: MetricName;
  value: number;
  budget: (typeof PERFORMANCE_BUDGETS)[MetricName];
  status: 'good' | 'needs-improvement' | 'poor';
  withinBudget: boolean;
  percentageOfBudget: number;
}

/**
 * Check if a metric value is within its performance budget
 */
export function checkBudget(name: MetricName, value: number): BudgetCheckResult {
  const budget = PERFORMANCE_BUDGETS[name];
  let status: 'good' | 'needs-improvement' | 'poor';

  if (value <= budget.good) {
    status = 'good';
  } else if (value <= budget.needsImprovement) {
    status = 'needs-improvement';
  } else {
    status = 'poor';
  }

  return {
    metric: name,
    value,
    budget,
    status,
    withinBudget: status === 'good',
    percentageOfBudget: (value / budget.good) * 100,
  };
}

/**
 * Report a Web Vitals metric to Sentry with budget tracking
 */
export function reportWebVitalToSentry(metric: WebVitalsMetric): void {
  const budgetCheck = checkBudget(metric.name, metric.value);

  // Skip if Sentry is not initialized
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    if (process.env.NODE_ENV === 'development') {
      const emoji =
        budgetCheck.status === 'good' ? '✅' : budgetCheck.status === 'needs-improvement' ? '⚠️' : '❌';
      console.debug(
        `[Web Vitals] ${emoji} ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating}) - ${budgetCheck.percentageOfBudget.toFixed(0)}% of budget`
      );
    }
    return;
  }

  // Report to Sentry with structured data including budget info
  Sentry.addBreadcrumb({
    category: 'web-vitals',
    message: `${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`,
    level: metric.rating === 'poor' ? 'warning' : 'info',
    data: {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType,
      // Budget tracking data
      budget: {
        good: budgetCheck.budget.good,
        needsImprovement: budgetCheck.budget.needsImprovement,
        withinBudget: budgetCheck.withinBudget,
        percentageOfBudget: budgetCheck.percentageOfBudget,
      },
    },
  });

  // Set as custom measurement for transaction
  Sentry.setMeasurement(metric.name, metric.value, metric.name === 'CLS' ? '' : 'millisecond');

  // Add budget-specific tags for filtering
  Sentry.setTag(`web-vital.${metric.name.toLowerCase()}.status`, budgetCheck.status);
  Sentry.setTag(`web-vital.${metric.name.toLowerCase()}.within-budget`, String(budgetCheck.withinBudget));

  // Alert on poor metrics or budget violations
  if (metric.rating === 'poor') {
    Sentry.captureMessage(`Poor ${metric.name} detected: ${metric.value.toFixed(2)}`, {
      level: 'warning',
      tags: {
        'web-vital': metric.name,
        rating: metric.rating,
        'budget-status': budgetCheck.status,
        'within-budget': String(budgetCheck.withinBudget),
      },
      extra: {
        value: metric.value,
        delta: metric.delta,
        threshold: PERFORMANCE_BUDGETS[metric.name],
        navigationType: metric.navigationType,
        percentageOfBudget: budgetCheck.percentageOfBudget,
      },
    });
  }
}

/**
 * Initialize Web Vitals reporting with budget tracking
 *
 * Call this in your app's entry point to start collecting metrics.
 * Uses the web-vitals library via Next.js's built-in reporting.
 */
export function initWebVitalsReporting(): void {
  if (typeof window === 'undefined') return;

  // Use PerformanceObserver for custom metrics
  try {
    // Observe Long Tasks for potential INP issues
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          const severity = entry.duration > 100 ? 'warning' : 'info';

          // Check against TBT budget
          const tbtBudget = PERFORMANCE_BUDGETS.TBT;
          const exceedsBudget = entry.duration > tbtBudget.good;

          Sentry.addBreadcrumb({
            category: 'performance',
            message: `Long Task detected: ${entry.duration.toFixed(0)}ms${exceedsBudget ? ' (exceeds budget)' : ''}`,
            level: severity,
            data: {
              duration: entry.duration,
              startTime: entry.startTime,
              exceedsBudget,
              budgetThreshold: tbtBudget.good,
            },
          });
        }
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });

    // Observe Layout Shifts for CLS debugging
    const layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };

        // Only track unexpected layout shifts
        if (!layoutShift.hadRecentInput && layoutShift.value > 0.01) {
          const clsBudget = PERFORMANCE_BUDGETS.CLS;
          const severity = layoutShift.value > clsBudget.good ? 'warning' : 'info';

          Sentry.addBreadcrumb({
            category: 'performance',
            message: `Layout Shift: ${layoutShift.value.toFixed(4)}`,
            level: severity,
            data: {
              value: layoutShift.value,
              startTime: entry.startTime,
              exceedsBudget: layoutShift.value > clsBudget.good,
              budgetThreshold: clsBudget.good,
            },
          });
        }
      }
    });
    layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });

    // Observe Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];

      if (lastEntry) {
        const lcpValue = lastEntry.startTime;
        const lcpBudget = PERFORMANCE_BUDGETS.LCP;

        if (lcpValue > lcpBudget.good) {
          Sentry.addBreadcrumb({
            category: 'performance',
            message: `LCP candidate: ${lcpValue.toFixed(0)}ms`,
            level: lcpValue > lcpBudget.needsImprovement ? 'warning' : 'info',
            data: {
              value: lcpValue,
              exceedsBudget: lcpValue > lcpBudget.good,
              element: (lastEntry as PerformanceEntry & { element?: Element }).element?.tagName,
            },
          });
        }
      }
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch {
    // PerformanceObserver not supported in this environment
  }
}

/**
 * Report Next.js specific metrics with budget tracking
 * Called from instrumentation or _app.tsx
 */
export function reportNextjsMetric(metric: {
  id: string;
  name: string;
  startTime: number;
  value: number;
  label: 'web-vital' | 'custom';
}): void {
  if (metric.label === 'web-vital') {
    const metricName = metric.name as keyof typeof PERFORMANCE_BUDGETS;
    const rating = getRating(metricName, metric.value);

    reportWebVitalToSentry({
      id: metric.id,
      name: metric.name as WebVitalsMetric['name'],
      value: metric.value,
      rating,
      delta: metric.value,
      entries: [],
      navigationType: 'navigate',
    });
  } else {
    // Custom Next.js metrics (hydration, route change, etc.)
    Sentry.setMeasurement(metric.name, metric.value, 'millisecond');

    // Log hydration performance in development
    if (process.env.NODE_ENV === 'development' && metric.name.includes('hydrat')) {
      console.debug(`[Next.js] ${metric.name}: ${metric.value.toFixed(2)}ms`);
    }
  }
}

/**
 * Get the rating for a metric value based on performance budgets
 */
function getRating(
  name: keyof typeof PERFORMANCE_BUDGETS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const budget = PERFORMANCE_BUDGETS[name];

  if (!budget) {
    return 'good'; // Unknown metric, assume good
  }

  if (value <= budget.good) return 'good';
  if (value <= budget.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Get all current performance budgets for display/configuration
 */
export function getPerformanceBudgets(): typeof PERFORMANCE_BUDGETS {
  return { ...PERFORMANCE_BUDGETS };
}

/**
 * Create a performance report from collected metrics
 */
export interface PerformanceReport {
  timestamp: number;
  url: string;
  metrics: BudgetCheckResult[];
  overallStatus: 'good' | 'needs-improvement' | 'poor';
  budgetViolations: string[];
}

export function createPerformanceReport(metrics: { name: MetricName; value: number }[]): PerformanceReport {
  const results = metrics.map((m) => checkBudget(m.name, m.value));
  const violations = results.filter((r) => !r.withinBudget).map((r) => r.metric);

  let overallStatus: 'good' | 'needs-improvement' | 'poor' = 'good';

  for (const result of results) {
    if (result.status === 'poor') {
      overallStatus = 'poor';
      break;
    }
    if (result.status === 'needs-improvement' && overallStatus === 'good') {
      overallStatus = 'needs-improvement';
    }
  }

  return {
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    metrics: results,
    overallStatus,
    budgetViolations: violations,
  };
}
