/**
 * @medicalcor/infra
 *
 * Infrastructure utilities for the MedicalCor platform.
 * Provides type-safe environment validation, health checks, and migration utilities.
 *
 * @module @medicalcor/infra
 * @version 0.1.0
 *
 * @example
 * ```typescript
 * import {
 *   validateInfraEnv,
 *   createHealthCheck,
 *   createMigrationManager,
 * } from '@medicalcor/infra';
 *
 * // Validate environment
 * const env = validateInfraEnv();
 *
 * // Setup health checks
 * const health = createHealthCheck({ version: '1.0.0', startTime: new Date() });
 * health.addCheck('database', createDatabaseChecker(() => db.query('SELECT 1')));
 *
 * // Run migrations
 * const migrations = createMigrationManager({ client: dbClient });
 * await migrations.run(migrationFiles);
 * ```
 */

export const VERSION = '0.1.0';

// =============================================================================
// Environment Validation
// =============================================================================

export {
  // Schema helpers
  booleanEnv,
  intEnv,
  floatEnv,
  // Schemas
  DatabaseEnvSchema,
  RedisEnvSchema,
  DeploymentEnvSchema,
  InfraEnvSchema,
  type InfraEnv,
  // Validation utilities
  type EnvValidationResult,
  validateEnvSchema,
  validateInfraEnv,
  // Helpers
  isProduction,
  isDevelopment,
  requireEnv,
  getEnv,
  getMissingEnvVars,
} from './env.js';

// =============================================================================
// Health Checks
// =============================================================================

export {
  // Types
  type HealthStatus,
  type DependencyCheck,
  type HealthCheckResponse,
  type HealthCheckConfig,
  type HealthChecker,
  // Factory
  createHealthCheck,
  // Common checkers
  createDatabaseChecker,
  createRedisChecker,
  createHttpChecker,
} from './health.js';

// =============================================================================
// Migrations
// =============================================================================

export {
  // Types
  type MigrationFile,
  type MigrationRecord,
  type MigrationResult,
  type MigrationSummary,
  type MigrationClient,
  type MigrationConfig,
  // Utilities
  computeChecksum,
  parseMigrationFiles,
  // Factory
  createMigrationManager,
} from './migrations.js';
