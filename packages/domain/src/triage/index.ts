/**
 * Triage Module - Lead Routing and Priority Assessment
 *
 * Provides intelligent lead routing with:
 * - Priority scheduling based on patient needs
 * - Team assignment based on procedure interest
 * - VIP phone management
 * - Safety disclaimers for priority cases
 *
 * @module domain/triage
 */

export {
  TriageService,
  createTriageService,
  type TriageResult,
  type TriageInput,
  type TriageConfig,
} from './triage-service.js';
