/**
 * @fileoverview Repository Implementations (Infrastructure Layer)
 *
 * This module exports concrete repository implementations that fulfill
 * the port interfaces defined in the domain layer.
 *
 * ## Hexagonal Architecture
 *
 * Repositories here are **ADAPTERS** implementing domain **PORTS**:
 * - PostgresConsentRepository implements IConsentRepository
 *
 * @module @medicalcor/core/repositories
 */

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

// In-Memory Consent Repository (Test/Development)
export {
  InMemoryConsentRepository,
  createInMemoryConsentRepository,
} from './InMemoryConsentRepository.js';
