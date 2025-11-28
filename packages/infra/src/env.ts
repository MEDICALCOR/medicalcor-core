/**
 * Environment Variable Validation
 *
 * Utilities for validating and accessing environment variables in a type-safe manner.
 * Re-exports core env validation and adds infra-specific schemas.
 */

import { z } from 'zod';

// =============================================================================
// Common Schema Helpers
// =============================================================================

/**
 * Parse a boolean from environment variable string
 */
export const booleanEnv = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .optional()
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

/**
 * Parse an integer from environment variable string
 */
export const intEnv = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : defaultValue));

/**
 * Parse a float from environment variable string
 */
export const floatEnv = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : defaultValue));

// =============================================================================
// Infrastructure Environment Schema
// =============================================================================

/**
 * Database configuration schema
 */
export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_SSL: booleanEnv.default('true'),
  DATABASE_POOL_MIN: intEnv(2),
  DATABASE_POOL_MAX: intEnv(10),
  DATABASE_IDLE_TIMEOUT_MS: intEnv(10000),
  DATABASE_CONNECTION_TIMEOUT_MS: intEnv(5000),
});

/**
 * Redis configuration schema
 */
export const RedisEnvSchema = z.object({
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: booleanEnv.default('false'),
  REDIS_CLUSTER_MODE: booleanEnv.default('false'),
  REDIS_RETRY_ATTEMPTS: intEnv(3),
  REDIS_RETRY_DELAY_MS: intEnv(1000),
});

/**
 * Deployment configuration schema
 */
export const DeploymentEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: intEnv(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DEPLOYMENT_REGION: z.string().optional(),
  DEPLOYMENT_INSTANCE_ID: z.string().optional(),
});

/**
 * Full infrastructure environment schema
 */
export const InfraEnvSchema = DatabaseEnvSchema.merge(RedisEnvSchema).merge(DeploymentEnvSchema);

export type InfraEnv = z.infer<typeof InfraEnvSchema>;

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validation result with typed errors
 */
export interface EnvValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]>;
}

/**
 * Validate environment variables against a schema
 *
 * @param schema - Zod schema to validate against
 * @param env - Environment object (defaults to process.env)
 * @returns Validation result with data or errors
 */
export function validateEnvSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  env: Record<string, string | undefined> = process.env
): EnvValidationResult<z.infer<typeof schema>> {
  const result = schema.safeParse(env);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Validate and return infrastructure environment or throw
 *
 * @param env - Environment object (defaults to process.env)
 * @throws Error with detailed validation messages
 */
export function validateInfraEnv(
  env: Record<string, string | undefined> = process.env
): InfraEnv {
  const result = validateEnvSchema(InfraEnvSchema, env);

  if (!result.success) {
    const errorMessages = Object.entries(result.errors ?? {})
      .map(([field, messages]) => `  ${field}: ${messages.join(', ')}`)
      .join('\n');

    throw new Error(`Infrastructure environment validation failed:\n${errorMessages}`);
  }

  return result.data!;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get a required environment variable or throw
 *
 * @param name - Environment variable name
 * @param message - Custom error message
 * @throws Error if variable is not set
 */
export function requireEnv(name: string, message?: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(message ?? `Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default
 *
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 */
export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Get list of missing environment variables from a list
 *
 * @param names - List of required variable names
 * @returns List of missing variable names
 */
export function getMissingEnvVars(names: string[]): string[] {
  return names.filter((name) => !process.env[name]);
}
