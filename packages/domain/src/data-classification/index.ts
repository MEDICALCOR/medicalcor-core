/**
 * Data Classification Module (L6 Feature)
 *
 * Provides explicit PII/PHI/sensitive labels for database tables.
 * Supports HIPAA/GDPR compliance with comprehensive data inventory.
 *
 * @module @medicalcor/domain/data-classification
 *
 * @example
 * ```typescript
 * import {
 *   DataClassificationService,
 *   createDataClassificationService,
 * } from '@medicalcor/domain';
 *
 * // Create service with repository
 * const service = createDataClassificationService({ repository });
 *
 * // Get classification for a table
 * const classification = await service.getTableClassification('leads');
 *
 * // Generate compliance report
 * const report = await service.generateComplianceReport();
 * ```
 */

export {
  DataClassificationService,
  createDataClassificationService,
  type DataClassificationServiceOptions,
  type DataClassificationConfig,
  type ClassificationLogger,
} from './data-classification-service.js';

export {
  type DataClassificationRepository,
  type ClassificationRepositoryResult,
  type ClassificationRepositoryError,
  type ClassificationRepositoryErrorCode,
} from './data-classification-repository.js';
