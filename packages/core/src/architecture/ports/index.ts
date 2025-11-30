/**
 * @module architecture/ports
 *
 * Hexagonal Architecture Ports
 * ============================
 *
 * Ports define the interfaces between the application core and the outside world.
 * - Inbound (Driving) Ports: How the outside world interacts with the application
 * - Outbound (Driven) Ports: How the application interacts with external systems
 */

export * from './inbound.js';
export * from './outbound.js';
export * from './adapters.js';
