/**
 * Next.js Instrumentation
 *
 * This file is loaded at the start of each server request.
 * Used to initialize Sentry for server-side error tracking.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Sentry initialization
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry initialization
    await import('../sentry.edge.config');
  }
}
