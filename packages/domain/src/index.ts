/**
 * @fileoverview Domain Package Exports
 *
 * Central export point for all domain services, types, and utilities.
 *
 * @module @medicalcor/domain
 *
 * @example
 * ```typescript
 * import {
 *   // Services
 *   createScoringService,
 *   createTriageService,
 *   createConsentService,
 *   createLanguageService,
 *   SchedulingService,
 *
 *   // Types
 *   Result,
 *   ok,
 *   err,
 *   DomainError,
 *
 *   // Schemas
 *   ConsentRequestSchema,
 *   TriageInputSchema,
 * } from '@medicalcor/domain';
 * ```
 */

// ============================================================================
// DOMAIN SERVICES
// ============================================================================

export * from './scoring/index.js';
export * from './triage/index.js';
export * from './scheduling/index.js';
export * from './consent/index.js';
export * from './language/index.js';

// ============================================================================
// SHARED TYPES & UTILITIES
// ============================================================================

// Export shared types from types.ts
export * from './shared/types.js';

// Export schemas and validation helpers, excluding types that conflict
// with the domain service exports above
export {
  // Common schemas
  ContactIdSchema,
  PhoneNumberSchema,
  EmailSchema,
  ISODateStringSchema,
  SupportedLanguageSchema,

  // Consent schemas
  ConsentTypeSchema,
  ConsentStatusSchema,
  ConsentChannelSchema,
  ConsentMethodSchema,
  ConsentSourceSchema,
  ConsentRequestSchema,

  // Scoring schemas
  LeadChannelSchema,
  MessageHistoryEntrySchema,
  UTMParametersSchema,
  AIScoringContextSchema,

  // Triage schemas
  LeadScoreClassificationSchema,
  TriageInputSchema,

  // Scheduling schemas
  TimeSlotSchema,
  DateStringSchema,
  ProcedureTypeSchema,
  AppointmentSlotSchema,
  BookAppointmentRequestSchema,
  AvailableSlotsRequestSchema,

  // Language schemas
  LanguageDetectionRequestSchema,
  TranslationRequestSchema,

  // Helpers
  validateWithResult,
  withValidation,

  // Non-conflicting types from schemas (types that don't exist in domain services)
  type ConsentChannel,
  type ConsentMethod,
  type LeadChannel,
  type MessageHistoryEntry,
  type UTMParameters,
  type AIScoringContext,
  type LeadScoreClassification,
  type DateString,
  type ProcedureType,
  type AppointmentSlot,
  type BookAppointmentRequest,
  type AvailableSlotsRequest,
  type LanguageDetectionRequest,
} from './shared/schemas.js';
