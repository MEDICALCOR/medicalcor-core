/**
 * @fileoverview Secondary Ports Index
 *
 * Exports all secondary ports (driven ports) for the hexagonal architecture.
 * Secondary ports define what the application needs from infrastructure.
 *
 * @module application/ports/secondary
 */

// Persistence ports
// AllOnXCaseRepository will be added when implemented
// export * from './persistence/AllOnXCaseRepository.js';

// Messaging ports
export * from './messaging/EventPublisher.js';

// External service ports
export * from './external/AuditService.js';
