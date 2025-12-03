/**
 * Consent Module (Domain Layer)
 *
 * GDPR-compliant consent management for patient data processing.
 *
 * ## Hexagonal Architecture
 *
 * This module exports:
 * - ConsentService: Domain service with business logic
 * - ConsentRepository: Port interface for persistence
 *
 * Repository implementations (adapters) are in @medicalcor/core/repositories:
 * - PostgresConsentRepository: Production-grade PostgreSQL implementation
 * - InMemoryConsentRepository: Test/development implementation
 *
 * @example
 * ```typescript
 * import { ConsentService } from '@medicalcor/domain/consent';
 * import { PostgresConsentRepository } from '@medicalcor/core/repositories';
 *
 * const repository = new PostgresConsentRepository({ pool: pgPool });
 * const consentService = new ConsentService({ repository });
 * ```
 *
 * @module domain/consent
 */

export * from './consent-service.js';
export * from './consent-repository.js';

// DEPRECATED: PostgresConsentRepository has been moved to @medicalcor/core/repositories
// Import from '@medicalcor/core' instead:
//   import { PostgresConsentRepository } from '@medicalcor/core/repositories';
// This re-export is kept for backward compatibility only
export { PostgresConsentRepository } from '@medicalcor/core/repositories';
