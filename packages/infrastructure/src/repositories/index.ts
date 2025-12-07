/**
 * @fileoverview Repository Adapters
 *
 * PostgreSQL adapters implementing domain repository interfaces.
 *
 * @module @medicalcor/infrastructure/repositories
 */

export {
  PostgresCaseRepository,
  createPostgresCaseRepository,
  type PostgresCaseRepositoryConfig,
} from './PostgresCaseRepository.js';
