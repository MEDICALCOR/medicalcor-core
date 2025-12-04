/**
 * Next.js Instrumentation
 *
 * This file is loaded at the start of each server request.
 * Used to initialize Sentry for server-side error tracking and
 * validate critical environment variables at boot time.
 *
 * PLATINUM STANDARD: Fail fast on missing critical configuration.
 * The system should crash immediately on boot if required secrets are missing,
 * rather than failing during a user request.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

/**
 * Validate critical environment variables required for secure operation.
 * Throws immediately if critical configuration is missing in production.
 */
function validateCriticalEnv() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Critical secrets that MUST be present in production
  const criticalSecrets = [
    { name: 'AUTH_SECRET', minLength: 32, description: 'NextAuth secret key' },
  ];

  // Important secrets that SHOULD be present for full functionality
  const importantSecrets = [{ name: 'DATABASE_URL', description: 'PostgreSQL connection string' }];

  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate critical secrets
  for (const secret of criticalSecrets) {
    const value = process.env[secret.name];
    if (!value) {
      const msg = `Missing critical environment variable: ${secret.name} (${secret.description})`;
      if (isProduction) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    } else if (secret.minLength && value.length < secret.minLength) {
      const msg = `${secret.name} must be at least ${secret.minLength} characters`;
      if (isProduction) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // Validate important secrets
  for (const secret of importantSecrets) {
    const value = process.env[secret.name];
    if (!value) {
      warnings.push(
        `Missing environment variable: ${secret.name} (${secret.description}) - some features may not work`
      );
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('[Instrumentation] Environment configuration warnings:');
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  // Fail hard in production if critical secrets are missing
  if (errors.length > 0) {
    console.error('[Instrumentation] FATAL: Missing critical environment configuration:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    throw new Error(
      `Application startup failed: ${errors.length} critical environment variable(s) missing. ` +
        'See logs for details. This is a security requirement for medical/HIPAA compliance.'
    );
  }

  if (isProduction) {
    console.info('[Instrumentation] Environment validation passed');
  }
}

export async function register() {
  // Validate environment on server startup (not in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    validateCriticalEnv();

    // Server-side Sentry initialization
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry initialization
    await import('../sentry.edge.config');
  }
}
