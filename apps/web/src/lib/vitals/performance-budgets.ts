/**
 * Performance Budget Definitions
 *
 * Defines performance budgets for Core Web Vitals and other metrics.
 * These match the thresholds in lighthouserc.js for consistency.
 *
 * @see https://web.dev/performance-budgets-101/
 */

export interface PerformanceBudget {
  name: string;
  description: string;
  thresholds: {
    good: number;
    warning: number;
    poor: number;
  };
  unit: string;
}

export const CORE_WEB_VITALS: Record<string, PerformanceBudget> = {
  LCP: {
    name: 'Largest Contentful Paint',
    description: 'Time until the largest content element is rendered',
    thresholds: {
      good: 2500,
      warning: 4000,
      poor: 4000,
    },
    unit: 'ms',
  },
  FID: {
    name: 'First Input Delay',
    description: 'Time from first user interaction to browser response',
    thresholds: {
      good: 100,
      warning: 300,
      poor: 300,
    },
    unit: 'ms',
  },
  INP: {
    name: 'Interaction to Next Paint',
    description: 'Responsiveness to user interactions',
    thresholds: {
      good: 200,
      warning: 500,
      poor: 500,
    },
    unit: 'ms',
  },
  CLS: {
    name: 'Cumulative Layout Shift',
    description: 'Visual stability - measures unexpected layout shifts',
    thresholds: {
      good: 0.1,
      warning: 0.25,
      poor: 0.25,
    },
    unit: '',
  },
  FCP: {
    name: 'First Contentful Paint',
    description: 'Time until first content is painted',
    thresholds: {
      good: 1800,
      warning: 3000,
      poor: 3000,
    },
    unit: 'ms',
  },
  TTFB: {
    name: 'Time to First Byte',
    description: 'Server response time',
    thresholds: {
      good: 800,
      warning: 1800,
      poor: 1800,
    },
    unit: 'ms',
  },
};

export const RESOURCE_BUDGETS = {
  javascript: {
    name: 'JavaScript Bundle Size',
    maxSize: 500 * 1024, // 500KB
    unit: 'KB',
  },
  css: {
    name: 'CSS Bundle Size',
    maxSize: 100 * 1024, // 100KB
    unit: 'KB',
  },
  images: {
    name: 'Total Image Size',
    maxSize: 500 * 1024, // 500KB
    unit: 'KB',
  },
  total: {
    name: 'Total Page Weight',
    maxSize: 2000 * 1024, // 2MB
    unit: 'KB',
  },
  thirdPartyRequests: {
    name: 'Third-Party Requests',
    maxCount: 15,
    unit: 'requests',
  },
};

export const LIGHTHOUSE_SCORE_THRESHOLDS = {
  performance: {
    good: 90,
    warning: 80,
    poor: 50,
  },
  accessibility: {
    good: 100,
    warning: 90,
    poor: 70,
  },
  bestPractices: {
    good: 100,
    warning: 85,
    poor: 70,
  },
  seo: {
    good: 100,
    warning: 90,
    poor: 70,
  },
};

/**
 * Get rating for a metric value
 */
export function getMetricRating(
  metricName: keyof typeof CORE_WEB_VITALS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const budget = CORE_WEB_VITALS[metricName];

  if (value <= budget.thresholds.good) return 'good';
  if (value <= budget.thresholds.warning) return 'needs-improvement';
  return 'poor';
}

/**
 * Format metric value with appropriate unit
 */
export function formatMetricValue(metricName: string, value: number): string {
  const budget = CORE_WEB_VITALS[metricName] as PerformanceBudget | undefined;

  if (!budget) {
    return value.toFixed(2);
  }

  if (budget.unit === 'ms') {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}s`;
    }
    return `${Math.round(value)}ms`;
  }

  return value.toFixed(3);
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
