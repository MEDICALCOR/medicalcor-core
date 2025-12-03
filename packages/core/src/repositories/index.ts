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
 * - SupabaseOsaxCaseRepository implements IOsaxCaseRepository
 * - PostgresConsentRepository implements IConsentRepository
 *
 * @module @medicalcor/core/repositories
 */

// Scheduling Repository
export {
  PostgresSchedulingRepository,
  createPostgresSchedulingRepository,
  type PostgresSchedulingConfig,
} from './postgres-scheduling-repository.js';

// OSAX Case Repository
export { SupabaseOsaxCaseRepository } from './SupabaseOsaxCaseRepository.js';

// Consent Repository (GDPR compliance)
export {
  PostgresConsentRepository,
  createPostgresConsentRepository,
  type IConsentRepository,
  type ConsentDatabaseClient,
  type ConsentRecord,
  type ConsentAuditEntry,
  type ConsentType,
  type ConsentStatus,
  type ConsentSource,
} from './PostgresConsentRepository.js';
