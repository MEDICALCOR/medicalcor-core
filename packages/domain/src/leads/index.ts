/**
 * @fileoverview Lead Bounded Context Exports
 *
 * Lead Aggregate Root and related DDD components.
 *
 * @module domain/leads
 *
 * This module provides:
 * - LeadAggregateRoot: The aggregate root for Lead lifecycle management
 * - LeadFactory: Factory for creating and reconstituting Lead aggregates
 * - Lead errors: Domain-specific error types
 *
 * USAGE:
 * ```typescript
 * import {
 *   LeadAggregateRoot,
 *   LeadFactory,
 *   leadFactory,
 * } from '@medicalcor/domain/leads';
 *
 * // Create a new lead
 * const lead = leadFactory.create({
 *   id: 'lead-123',
 *   phone: PhoneNumber.create('+40700000001'),
 *   source: 'whatsapp',
 * });
 *
 * // Score the lead
 * lead.score(LeadScore.hot(), {
 *   method: 'ai',
 *   reasoning: 'High intent detected',
 *   confidence: 0.9,
 * });
 *
 * // Get events for persistence
 * const events = lead.getUncommittedEvents();
 * ```
 */

// Entities
export {
  LeadAggregateRoot,
  type LeadAggregateState,
  type LeadDomainEvent,
  type CreateLeadParams,
  // Errors
  LeadError,
  LeadDeletedError,
  LeadClosedError,
  LeadAlreadyConvertedError,
  LeadLostError,
  InvalidStatusTransitionError,
} from './entities/index.js';

// Factories
export {
  LeadFactory,
  leadFactory,
  type LeadAggregateSnapshot,
  type LeadSnapshotState,
  type SerializedConversationEntry,
} from './factories/index.js';
