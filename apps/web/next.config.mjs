import { withSentryConfig } from '@sentry/nextjs';
import withPWAInit from '@ducanh2912/next-pwa';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: process.env.ANALYZE_OPEN !== 'false',
});

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline',
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Docker containerization
  output: 'standalone',
  transpilePackages: [
    '@medicalcor/core',
    '@medicalcor/domain',
    '@medicalcor/types',
    '@medicalcor/integrations',
  ],
  // Configure webpack to resolve .js imports to .ts files for transpiled packages
  webpack: (config, { isServer }) => {
    // This allows ESM-style .js imports to resolve to .ts source files
    // when transpiling the monorepo packages
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    // Suppress build warnings that don't affect functionality
    // These warnings come from:
    // 1. OpenTelemetry/Sentry using dynamic requires for instrumentation
    // 2. Node.js modules being statically analyzed in Edge Runtime context
    //    (the code paths using these modules are never executed in Edge Runtime)
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      // OpenTelemetry uses dynamic requires for instrumentation
      {
        module: /@opentelemetry\/instrumentation/,
        message: /Critical dependency/,
      },
      // require-in-the-middle is used by OpenTelemetry for module interception
      {
        module: /require-in-the-middle/,
        message: /Critical dependency/,
      },
      // Prisma instrumentation dynamic requires
      {
        module: /@prisma\/instrumentation/,
        message: /Critical dependency/,
      },
      // Sentry OpenTelemetry integration
      {
        module: /@sentry\/opentelemetry/,
        message: /Critical dependency/,
      },
      // Node.js module warnings in Edge Runtime context
      // These modules are only used in server-side code paths, never in Edge middleware
      {
        module: /@medicalcor\/core/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /@aws-sdk/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /ioredis/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /pg-pool/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /pgpass/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /redis-errors/,
        message: /not supported in the Edge Runtime/,
      },
      {
        module: /pino/,
        message: /not supported in the Edge Runtime/,
      },
    ];

    return config;
  },
  // External packages that should not be bundled (Node.js only)
  // These packages contain Node.js-specific APIs incompatible with Edge Runtime
  serverExternalPackages: [
    // Database clients
    'ioredis',
    'pg',
    'pg-pool',
    'pgpass',
    // Authentication
    'bcryptjs',
    // Logging
    'pino',
    'pino-pretty',
    // OpenTelemetry (instrumentation uses Node.js require hooks)
    '@opentelemetry/api',
    '@opentelemetry/sdk-node',
    '@opentelemetry/instrumentation',
    '@opentelemetry/instrumentation-http',
    // Sentry server-side
    '@sentry/node',
    '@sentry/opentelemetry',
    // AWS SDK (used for encryption)
    '@aws-sdk/client-kms',
    '@aws-sdk/core',
    // Redis errors
    'redis-errors',
    // Module interception
    'require-in-the-middle',
  ],
  experimental: {
    // Note: PPR (Partial Prerendering) requires Next.js canary version
    // Disabled for stable 15.5.7 - can be re-enabled when canary is stable
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Note: instrumentationHook is no longer needed in Next.js 15+
    // instrumentation.ts is now automatically loaded
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. Run `pnpm lint` to check for ESLint issues.
    ignoreDuringBuilds: true,
  },
  // Security headers configuration
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js requires 'unsafe-inline' for initial hydration scripts in production
              // Using strict-dynamic allows scripts loaded by trusted scripts to execute
              "script-src 'self' 'strict-dynamic' 'sha256-' https:",
              // Styles: use hashes for inline styles injected by Next.js/styled-components
              "style-src 'self' https: 'sha256-'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https:",
              "connect-src 'self' wss: https: ws:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              'upgrade-insecure-requests',
              "object-src 'none'",
              "require-trusted-types-for 'script'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppresses all logs from the Sentry webpack plugin
  silent: true,

  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Upload source maps to Sentry (requires SENTRY_AUTH_TOKEN)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Widens the scope of Sentry error capturing
  widenClientFileUpload: true,

  // Routes browser requests to Sentry through a Next.js rewrite
  // Helps avoid ad-blockers
  tunnelRoute: '/monitoring',

  // Automatically annotate React components for more readable stack traces
  reactComponentAnnotation: {
    enabled: true,
  },
};

// Compose all config wrappers
// Order: bundleAnalyzer -> PWA -> Sentry (outermost)
const composedConfig = withBundleAnalyzer(withPWA(nextConfig));

// Only wrap with Sentry if DSN is configured
const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(composedConfig, sentryWebpackPluginOptions)
  : composedConfig;

export default finalConfig;
