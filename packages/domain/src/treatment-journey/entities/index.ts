/**
 * @fileoverview Treatment Journey Entities
 *
 * Exports all entities for the treatment journey domain.
 *
 * @module domain/treatment-journey/entities
 */

export {
  // Types
  type JourneyPhase,
  type MilestoneType,
  type JourneyStatus,
  type JourneyMilestone,
  type JourneyCommunication,
  type JourneyOutcome,
  type JourneyRiskFlag,
  type JourneyFinancials,
  type TreatmentJourney,
  type CreateTreatmentJourneyInput,

  // Factory functions
  generateJourneyNumber,
  createTreatmentJourney,

  // Phase management
  advanceToPhase,

  // Milestone management
  completeMilestone,
  scheduleMilestone,

  // Communication tracking
  recordCommunication,

  // Risk management
  raiseRiskFlag,
  resolveRiskFlag,

  // Outcome tracking
  recordOutcome,

  // Financial tracking
  updateFinancials,
  recordPayment,

  // Entity linking
  linkLabCase,
  linkAppointment,

  // Query helpers
  isJourneyAtRisk,
  hasOverdueMilestones,
  needsFollowUp,
  getCompletedMilestoneCount,
  getMilestonesByPhase,
  getJourneySummary,
} from './TreatmentJourney.js';
