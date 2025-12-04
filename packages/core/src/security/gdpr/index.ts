/**
 * @fileoverview GDPR Compliance Module
 *
 * Exports all GDPR compliance services and utilities:
 * - DSRService: Data Subject Request handling (Articles 15-22)
 * - DataInventoryService: Records of Processing Activities (Article 30)
 * - RetentionService: Data retention policy management
 *
 * Note: OsaxAuditService is available separately via direct import from
 * './osax-audit.js' due to circular dependency with @medicalcor/domain.
 *
 * @module core/security/gdpr
 */

// DSR Service (Data Subject Requests)
export {
  PostgresDSRService,
  createDSRService,
  type DSRServiceDeps,
  type DSRType,
  type DSRStatus,
  type DSRResponse,
  type DataSubjectRequest,
  type DSRService,
} from './dsr-service.js';

// Data Inventory Service (Article 30)
export {
  PostgresDataInventoryService,
  createDataInventoryService,
  type DataInventoryServiceDeps,
  type DataCategory,
  type LegalBasis,
  type DataRecipient,
  type DataProcessingActivity,
  type ProcessingRecords,
  type DataInventoryService,
} from './data-inventory-service.js';

// Retention Service
export {
  PostgresRetentionService,
  createRetentionService,
  type RetentionServiceDeps,
  type DisposalMethod,
  type RetentionException,
  type RetentionPolicy,
  type RetentionCandidate,
  type DisposalError,
  type DisposalResult,
  type RetentionService,
} from './retention-service.js';
