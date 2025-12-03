'use client';

import * as Sentry from '@sentry/nextjs';

/**
 * Web Vitals Reporting to Sentry
 *
 * Reports Core Web Vitals and additional performance metrics to Sentry
 * for monitoring and alerting.
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

// Thresholds for Web Vitals ratings (in milliseconds, except CLS which is unitless)
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
} as const;

/**
 * Report a Web Vitals metric to Sentry
 */
export function reportWebVitalToSentry(metric: WebVitalsMetric): void {
  // Skip if Sentry is not initialized
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Web Vitals]', metric.name, metric.value, metric.rating);
    }
    return;
  }

  // Report to Sentry with structured data
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
    },
  });

  // Set as custom measurement for transaction
  Sentry.setMeasurement(metric.name, metric.value, metric.name === 'CLS' ? '' : 'millisecond');

  // Alert on poor metrics
  if (metric.rating === 'poor') {
    Sentry.captureMessage(`Poor ${metric.name} detected: ${metric.value.toFixed(2)}`, {
      level: 'warning',
      tags: {
        'web-vital': metric.name,
        rating: metric.rating,
      },
      extra: {
        value: metric.value,
        delta: metric.delta,
        threshold: THRESHOLDS[metric.name],
        navigationType: metric.navigationType,
      },
    });
  }
}

/**
 * Initialize Web Vitals reporting
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
          Sentry.addBreadcrumb({
            category: 'performance',
            message: `Long Task detected: ${entry.duration.toFixed(0)}ms`,
            level: entry.duration > 100 ? 'warning' : 'info',
            data: {
              duration: entry.duration,
              startTime: entry.startTime,
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
        if (!layoutShift.hadRecentInput && layoutShift.value > 0.05) {
          Sentry.addBreadcrumb({
            category: 'performance',
            message: `Layout Shift: ${layoutShift.value.toFixed(4)}`,
            level: 'info',
            data: {
              value: layoutShift.value,
              startTime: entry.startTime,
            },
          });
        }
      }
    });
    layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
  } catch {
    // PerformanceObserver not supported
  }
}

/**
 * Report Next.js specific metrics
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
    const rating = getRating(metric.name as keyof typeof THRESHOLDS, metric.value);
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
  }
}

/**
 * Get the rating for a metric value
 */
function getRating(
  name: keyof typeof THRESHOLDS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];

  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}
