/**
 * Sentry Server Configuration
 *
 * This file configures the initialization of Sentry for the server side.
 * The config you add here will be used whenever the server handles a request.
 *
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Configure error filtering for server-side
  beforeSend(event, hint) {
    // Don't send errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[Sentry Server] Error captured (not sent in dev):', hint.originalException);
      return null;
    }

    const error = hint.originalException;
    if (error instanceof Error) {
      // Ignore expected authentication errors
      if (error.message.includes('Unauthorized') || error.message.includes('Authentication')) {
        // Log but don't report
        return null;
      }
    }

    return event;
  },

  // Configure environment
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Add custom tags
  initialScope: {
    tags: {
      app: 'medicalcor-web',
      type: 'server',
    },
  },

  // Enable profiling for performance
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
});
