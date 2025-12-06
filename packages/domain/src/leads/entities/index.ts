/**
 * @fileoverview Lead Entity Exports
 *
 * @module domain/leads/entities
 */

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
} from './Lead.js';
