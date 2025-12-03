export * from './consent-service.js';
export * from './consent-repository.js';

// DEPRECATED: PostgresConsentRepository has been moved to @medicalcor/core/repositories
// Import from '@medicalcor/core' instead:
//   import { PostgresConsentRepository } from '@medicalcor/core/repositories';
// This re-export is kept for backward compatibility only
export { PostgresConsentRepository } from '@medicalcor/core/repositories';
