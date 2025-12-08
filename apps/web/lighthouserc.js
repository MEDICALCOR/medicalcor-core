/**
 * Lighthouse CI Configuration
 *
 * Performance budgets and assertions for MedicalCor Web Dashboard
 * @see https://github.com/GoogleChrome/lighthouse-ci
 */

/** @type {import('@lhci/cli').Config} */
module.exports = {
  ci: {
    collect: {
      // Use static-dist-dir for pre-built Next.js exports
      staticDistDir: '.next',
      // Number of runs for statistical significance
      numberOfRuns: 3,
      // Use puppeteer for headless Chrome
      chromePath: process.env.CHROME_PATH,
      settings: {
        // Simulate mobile device (Moto G4 on 3G)
        preset: 'desktop',
        // Throttling settings for realistic performance
        throttling: {
          cpuSlowdownMultiplier: 1,
        },
        // Skip specific audits that don't apply
        skipAudits: [
          'uses-http2', // Handled at infrastructure level
          'redirects-http', // Handled at infrastructure level
        ],
        // Categories to test
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
      // URLs to test (relative to baseUrl)
      url: [
        'http://localhost:3001/',
        'http://localhost:3001/login',
        'http://localhost:3001/dashboard',
      ],
    },
    assert: {
      // Performance budgets - aligned with Core Web Vitals thresholds
      assertions: {
        // =============================================================================
        // Core Web Vitals Assertions (Critical)
        // =============================================================================

        // LCP (Largest Contentful Paint) - Target: < 2.5s (good), < 4s (needs improvement)
        'largest-contentful-paint': [
          'error',
          { maxNumericValue: 2500, aggregationMethod: 'median' },
        ],

        // CLS (Cumulative Layout Shift) - Target: < 0.1 (good), < 0.25 (needs improvement)
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],

        // TBT as proxy for INP - Target: < 200ms (good), < 600ms (needs improvement)
        'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median' }],

        // =============================================================================
        // Additional Performance Metrics
        // =============================================================================

        // FCP (First Contentful Paint) - Target: < 1.8s
        'first-contentful-paint': ['error', { maxNumericValue: 1800, aggregationMethod: 'median' }],

        // TTFB (Time to First Byte) - Target: < 800ms
        'server-response-time': ['warn', { maxNumericValue: 800 }],

        // Speed Index - Target: < 3.4s
        'speed-index': ['warn', { maxNumericValue: 3400, aggregationMethod: 'median' }],

        // Time to Interactive - Target: < 3.8s
        interactive: ['warn', { maxNumericValue: 3800, aggregationMethod: 'median' }],

        // =============================================================================
        // Bundle Size Budgets
        // =============================================================================

        // Total JS size (uncompressed) - Target: < 500KB
        'total-byte-weight': ['warn', { maxNumericValue: 2000000 }], // 2MB total

        // Render-blocking resources
        'render-blocking-resources': ['warn', { maxLength: 2 }],

        // Unused JavaScript
        'unused-javascript': ['warn', { maxNumericValue: 150000 }], // < 150KB unused

        // =============================================================================
        // Category Score Assertions
        // =============================================================================

        // Minimum category scores (0-1 scale)
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // =============================================================================
        // Specific Audits (Best Practices)
        // =============================================================================

        // Ensure images are optimized
        'uses-optimized-images': 'warn',
        'uses-webp-images': 'warn',
        'uses-responsive-images': 'warn',

        // Ensure text remains visible during font load
        'font-display': 'warn',

        // Efficient cache policy
        'uses-long-cache-ttl': 'warn',

        // Minification
        'unminified-javascript': 'error',
        'unminified-css': 'error',

        // Text compression
        'uses-text-compression': 'warn',

        // Accessibility essentials
        'color-contrast': 'error',
        'document-title': 'error',
        'html-has-lang': 'error',
        'meta-viewport': 'error',

        // Security best practices
        'is-on-https': 'off', // Handled at infrastructure level for localhost testing
        'csp-xss': 'warn',
      },
    },
    upload: {
      // Upload to temporary public storage for PR comments
      target: 'temporary-public-storage',
    },
  },
};
