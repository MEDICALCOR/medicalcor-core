/**
 * @fileoverview Secondary Ports Index
 *
 * Exports all secondary ports (driven ports) for the hexagonal architecture.
 * Secondary ports define what the application needs from infrastructure.
 *
 * @module application/ports/secondary
 */

// Messaging ports
export * from './messaging/EventPublisher.js';

// External service ports
export * from './external/AuditService.js';
export * from './external/InsuranceVerificationGateway.js';
export * from './external/FinancingService.js';
export * from './external/GeoIPService.js';

// Persistence ports
export * from './persistence/index.js';
