/**
 * @module architecture/events
 *
 * Event-Driven Architecture
 * =========================
 *
 * Complete event infrastructure for:
 * - Event Bus (pub/sub)
 * - Event Store (event sourcing)
 * - Process Managers / Sagas
 * - Outbox Pattern
 * - Dead Letter Queue
 */

export * from './event-bus.js';
export * from './event-sourcing.js';
export * from './outbox.js';
export * from './process-manager.js';
