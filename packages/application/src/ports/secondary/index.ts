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
