/**
 * @fileoverview Primary Ports Index
 *
 * Exports all primary ports (driving ports) for the hexagonal architecture.
 * Primary ports define what the application offers to the outside world.
 *
 * @module application/ports/primary
 *
 * PRIMARY PORTS (Driving Side):
 * These interfaces define what the application offers to external actors.
 * Driving adapters (REST API, CLI, webhooks) implement these contracts.
 *
 * Available Ports:
 * - LeadScoringUseCase: AI-powered lead qualification operations
 * - PatientAcquisitionUseCase: Complete lead-to-patient journey management
 */

// Lead Scoring Use Case
export type {
  LeadScoringUseCase,
  LeadScoringUseCaseConfig,
  ScoreLeadInput,
  ScoreLeadOutput,
  BatchScoreInput,
  BatchScoreOutput,
  BatchScoreItemResult,
  GetScoreHistoryInput,
  ScoreHistoryOutput,
  ScoreHistoryEntry,
  ScoringStats,
  MessageHistoryEntry,
  LeadClassification,
  LeadChannel,
  ScoringMethod,
} from './LeadScoringUseCase.js';

// Patient Acquisition Use Case
export type {
  PatientAcquisitionUseCase,
  PatientAcquisitionUseCaseConfig,
  RegisterLeadInput,
  RegisterLeadOutput,
  QualifyLeadInput,
  QualifyLeadOutput,
  ConvertToPatientInput,
  ConvertToPatientOutput,
  MarkLeadLostInput,
  MarkLeadLostOutput,
  AssignAgentInput,
  AssignAgentOutput,
  ListLeadsQuery,
  LeadListOutput,
  LeadSummary,
  PipelineStats,
  LeadStatus,
  LostReason,
  PatientDemographics,
  MedicalContext,
  ConsentRecord,
} from './PatientAcquisitionUseCase.js';
