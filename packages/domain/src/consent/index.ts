/**
 * Consent Module - GDPR-Compliant Consent Management
 *
 * Provides comprehensive consent management with:
 * - Full audit trail for compliance
 * - Policy versioning support
 * - Automatic expiration handling
 * - GDPR data export and erasure
 * - Repository pattern with PostgreSQL and in-memory implementations
 *
 * @module domain/consent
 */

export * from './consent-service.js';
export * from './consent-repository.js';
export { PostgresConsentRepository, type DatabaseClient } from './postgres-consent-repository.js';
