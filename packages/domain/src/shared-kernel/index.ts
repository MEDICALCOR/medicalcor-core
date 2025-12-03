/**
 * @fileoverview Shared Kernel
 *
 * Shared kernel containing cross-cutting concerns that are used
 * across all bounded contexts. This includes:
 * - Value Objects (LeadScore, PhoneNumber, etc.)
 * - Repository Interfaces (ILeadRepository, ICrmGateway, etc.)
 * - Domain Events
 * - Common Types and Utilities
 *
 * @module domain/shared-kernel
 */

export * from './value-objects/index.js';
export * from './repository-interfaces/index.js';
export * from './domain-events/index.js';
export * from './utils/index.js';
