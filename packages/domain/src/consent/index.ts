export * from './consent-service.js';
export * from './consent-repository.js';

// NOTE: PostgresConsentRepository has been moved to @medicalcor/core/repositories
// to follow hexagonal architecture (domain should not contain infrastructure adapters).
// Import from: '@medicalcor/core/repositories/postgres-consent-repository'
