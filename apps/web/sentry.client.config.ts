/**
 * Sentry Client Configuration
 *
 * This file configures the initialization of Sentry on the client.
 * The config you add here will be used whenever a user loads a page in their browser.
 *
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Replay configuration for session recording
  replaysOnErrorSampleRate: 1.0, // Always capture replays when an error occurs
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0, // Sample 10% of sessions in prod

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here
      maskAllText: true, // Mask all text for HIPAA compliance (medical data)
      blockAllMedia: true, // Block media for privacy
    }),
    Sentry.browserTracingIntegration({
      // Set up performance monitoring
      enableInp: true, // Interaction to Next Paint
    }),
  ],

  // Configure error filtering
  beforeSend(event, hint) {
    // Don't send errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[Sentry] Error captured (not sent in dev):', hint.originalException);
      return null;
    }

    // Filter out known non-actionable errors
    const error = hint.originalException;
    if (error instanceof Error) {
      // Ignore network errors (user's connection issue)
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        return null;
      }

      // Ignore cancelled requests
      if (error.name === 'AbortError') {
        return null;
      }
    }

    return event;
  },

  // Configure environment
  environment: process.env.NODE_ENV,

  // Release tracking (set by CI/CD)
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

  // Add custom tags for medical app context
  initialScope: {
    tags: {
      app: 'medicalcor-web',
      type: 'frontend',
    },
  },
});
