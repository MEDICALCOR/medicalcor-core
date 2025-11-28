/**
 * Scoring Module - Lead Qualification
 *
 * Provides AI-powered and rule-based lead scoring with:
 * - GPT-4o integration for intelligent scoring
 * - Rule-based fallback for reliability
 * - Zod schema validation for type safety
 * - Multi-language support (RO, EN, DE)
 *
 * @module domain/scoring
 */

export {
  ScoringService,
  createScoringService,
  type ScoringServiceConfig,
  type ScoringServiceDeps,
} from './scoring-service.js';
