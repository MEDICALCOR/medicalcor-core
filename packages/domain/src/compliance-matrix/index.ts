/**
 * Compliance Matrix Module
 *
 * Provides constraint compliance tracking across sprints for HIPAA, GDPR,
 * architectural, and quality requirements.
 *
 * @module @medicalcor/domain/compliance-matrix
 */

export {
  ComplianceMatrixService,
  createComplianceMatrixService,
  type ComplianceMatrixServiceOptions,
  type ComplianceMatrixConfig,
  type ComplianceLogger,
  type ComplianceEventPublisher,
} from './compliance-matrix-service.js';

export type { ComplianceMatrixRepository } from './compliance-matrix-repository.js';
