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

export * from './shared/index.js';
