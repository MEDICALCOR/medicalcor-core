/**
 * Lighthouse CI Configuration
 *
 * Performance budgets and Core Web Vitals thresholds for MedicalCor Web
 *
 * @see https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
 */

module.exports = {
  ci: {
    collect: {
      // Use static server for built assets
      staticDistDir: './.next',
      // Or start the dev/production server
      startServerCommand: 'pnpm start',
      startServerReadyPattern: 'ready on',
      startServerReadyTimeout: 30000,
      // URLs to audit
      url: [
        'http://localhost:3001/',
        'http://localhost:3001/login',
        'http://localhost:3001/patients',
      ],
      // Number of runs per URL
      numberOfRuns: 3,
      // Chrome flags for consistent results
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --headless',
        // Use mobile emulation for Core Web Vitals
        preset: 'desktop',
        // Categories to run
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    },
    assert: {
      // Performance budget assertions
      assertions: {
        // Core Web Vitals Thresholds (Google recommendations)
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.85 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // Largest Contentful Paint (LCP) - should be < 2.5s
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],

        // First Input Delay (FID) / Total Blocking Time (TBT) - should be < 100ms
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],

        // Cumulative Layout Shift (CLS) - should be < 0.1
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],

        // First Contentful Paint (FCP) - should be < 1.8s
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],

        // Time to Interactive - should be < 3.8s
        'interactive': ['warn', { maxNumericValue: 3800 }],

        // Speed Index - should be < 3.4s
        'speed-index': ['warn', { maxNumericValue: 3400 }],

        // Resource size budgets
        'resource-summary:script:size': ['warn', { maxNumericValue: 500000 }], // 500KB JS
        'resource-summary:stylesheet:size': ['warn', { maxNumericValue: 100000 }], // 100KB CSS
        'resource-summary:image:size': ['warn', { maxNumericValue: 500000 }], // 500KB images
        'resource-summary:total:size': ['warn', { maxNumericValue: 2000000 }], // 2MB total

        // Network request budgets
        'resource-summary:third-party:count': ['warn', { maxNumericValue: 15 }],

        // Accessibility audits
        'color-contrast': 'error',
        'image-alt': 'error',
        'label': 'error',
        'link-name': 'error',
        'button-name': 'error',

        // Best practices
        'uses-https': 'error',
        'no-vulnerable-libraries': 'warn',
        'csp-xss': 'warn',

        // SEO
        'document-title': 'error',
        'meta-description': 'warn',
        'robots-txt': 'warn',
      },
    },
    upload: {
      // Upload to temporary public storage for PR comments
      target: 'temporary-public-storage',
    },
  },
};
