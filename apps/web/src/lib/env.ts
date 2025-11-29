/**
 * Environment Variable Validation
 *
 * Provides build-time and runtime validation of environment variables.
 * Inspired by t3-env pattern for type-safe environment configuration.
 *
 * IMPORTANT: This file validates environment variables at import time.
 * If validation fails, the application will fail to start/build.
 *
 * @module lib/env
 */

import { z } from 'zod';

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Server-side environment variables
 * These are only available on the server and should NEVER be exposed to the client
 */
const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().optional(),

  // Authentication
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_URL: z.string().url().optional(),

  // External Services (Server-only secrets)
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  HUBSPOT_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // Feature flags
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

/**
 * Client-side environment variables
 * These are exposed to the browser and must be prefixed with NEXT_PUBLIC_
 *
 * SECURITY WARNING: Never put secrets in client-side variables!
 */
const clientEnvSchema = z.object({
  // API URLs
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),

  // Supabase (public keys only)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // Vapi (public key for voice integration)
  NEXT_PUBLIC_VAPI_PUBLIC_KEY: z.string().optional(),

  // Analytics (public IDs only)
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),

  // Sentry (public DSN)
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // Feature flags
  NEXT_PUBLIC_ENABLE_ANALYTICS: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  NEXT_PUBLIC_ENABLE_AI_COPILOT: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  NEXT_PUBLIC_MAINTENANCE_MODE: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

// =============================================================================
// Validation and Export
// =============================================================================

/**
 * Validate server environment variables
 * Only runs on the server side
 */
function validateServerEnv() {
  if (typeof window !== 'undefined') {
    // We're in the browser, return empty object
    // Server vars should never be accessed client-side
    return {} as z.infer<typeof serverEnvSchema>;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid server environment variables:');
    console.error(parsed.error.flatten().fieldErrors);

    // In production, fail hard if critical vars are missing
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid server environment variables');
    }

    // In development, warn but continue with defaults
    console.warn('⚠️ Running with missing server environment variables');
    return {} as z.infer<typeof serverEnvSchema>;
  }

  return parsed.data;
}

/**
 * Validate client environment variables
 * Runs both on server and client
 */
function validateClientEnv() {
  const clientEnvValues: Record<string, string | undefined> = {};

  // Collect NEXT_PUBLIC_ variables
  for (const key of Object.keys(clientEnvSchema.shape)) {
    clientEnvValues[key] = process.env[key];
  }

  const parsed = clientEnvSchema.safeParse(clientEnvValues);

  if (!parsed.success) {
    console.error('❌ Invalid client environment variables:');
    console.error(parsed.error.flatten().fieldErrors);

    // In production, fail hard
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid client environment variables');
    }

    // In development, warn but continue
    console.warn('⚠️ Running with missing client environment variables');
    return {} as z.infer<typeof clientEnvSchema>;
  }

  return parsed.data;
}

// =============================================================================
// Exported Environment Objects
// =============================================================================

/**
 * Server-side environment variables (only available in Server Components, API routes)
 *
 * @example
 * ```ts
 * import { serverEnv } from '@/lib/env';
 * const dbUrl = serverEnv.DATABASE_URL;
 * ```
 */
export const serverEnv = validateServerEnv();

/**
 * Client-side environment variables (available everywhere)
 *
 * @example
 * ```ts
 * import { clientEnv } from '@/lib/env';
 * const apiUrl = clientEnv.NEXT_PUBLIC_API_URL;
 * ```
 */
export const clientEnv = validateClientEnv();

/**
 * Combined environment (use with caution - server vars only work server-side)
 *
 * @example
 * ```ts
 * import { env } from '@/lib/env';
 * // On server: env.DATABASE_URL works
 * // On client: env.DATABASE_URL is undefined
 * ```
 */
export const env = {
  ...serverEnv,
  ...clientEnv,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if we're running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if we're running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(feature: 'analytics' | 'ai_copilot' | 'maintenance'): boolean {
  switch (feature) {
    case 'analytics':
      return clientEnv.NEXT_PUBLIC_ENABLE_ANALYTICS === true;
    case 'ai_copilot':
      return clientEnv.NEXT_PUBLIC_ENABLE_AI_COPILOT === true;
    case 'maintenance':
      return clientEnv.NEXT_PUBLIC_MAINTENANCE_MODE === true;
    default:
      return false;
  }
}

/**
 * Get the API base URL
 */
export function getApiUrl(): string {
  return clientEnv.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

/**
 * Get the WebSocket URL
 */
export function getWsUrl(): string {
  return clientEnv.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';
}
