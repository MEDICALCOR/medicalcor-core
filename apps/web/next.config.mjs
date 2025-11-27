import { withSentryConfig } from '@sentry/nextjs';
import withPWAInit from '@ducanh2912/next-pwa';

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
  transpilePackages: ['@medicalcor/core', '@medicalcor/domain', '@medicalcor/types', '@medicalcor/integrations'],
  experimental: {
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

// Only wrap with Sentry if DSN is configured
const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(withPWA(nextConfig), sentryWebpackPluginOptions)
  : withPWA(nextConfig);

export default finalConfig;
