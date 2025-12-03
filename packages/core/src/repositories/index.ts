/**
 * @fileoverview Repository Implementations (Infrastructure Layer)
 *
 * This module exports concrete repository implementations that fulfill
 * the port interfaces defined in the domain layer.
 *
 * ## Hexagonal Architecture
 *
 * Repositories here are **ADAPTERS** implementing domain **PORTS**:
 * - PostgresSchedulingRepository implements ISchedulingRepository
 * - PostgresConsentRepository implements ConsentRepository
 * - SupabaseOsaxCaseRepository implements IOsaxCaseRepository
 *
 * NOTE: These files are excluded from the main build to avoid circular
 * dependencies with @medicalcor/domain. Import directly if needed.
 *
 * @module @medicalcor/core/repositories
 */

// Scheduling Repository
export {
  PostgresSchedulingRepository,
  createPostgresSchedulingRepository,
  type PostgresSchedulingConfig,
} from './postgres-scheduling-repository.js';

// Consent Repository
// NOTE: PostgresConsentRepository implementation is in @medicalcor/integrations
// to avoid circular dependency issues (repositories depend on domain types).
// Import from: '@medicalcor/integrations' or use the reference implementation below.
// The reference implementation in ./postgres-consent-repository.ts is excluded from build.

// OSAX Case Repository
export { SupabaseOsaxCaseRepository } from './SupabaseOsaxCaseRepository.js';
