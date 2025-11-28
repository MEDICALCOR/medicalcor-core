/**
 * @medicalcor/agents
 *
 * Claude Agent SDK powered intelligent agents for the MedicalCor platform.
 *
 * This package provides state-of-the-art AI agents that leverage Claude's
 * advanced reasoning capabilities for medical CRM operations.
 *
 * ## Available Agents
 *
 * - **ScoringAgent**: Multi-step lead qualification with context enrichment
 *
 * ## Key Features
 *
 * - Multi-step reasoning with tool use
 * - GDPR-compliant data handling
 * - Comprehensive audit logging
 * - Context enrichment from HubSpot
 * - Fallback scoring for reliability
 *
 * @example
 * ```typescript
 * import { createScoringAgent } from '@medicalcor/agents';
 *
 * const agent = createScoringAgent({
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 *   hubspotClient: hubspot,
 *   gdprConfig: {
 *     checkConsent: consentService.check,
 *   },
 * });
 *
 * const result = await agent.scoreContext({
 *   phone: '+40712345678',
 *   channel: 'whatsapp',
 *   firstTouchTimestamp: new Date().toISOString(),
 *   messageHistory: [
 *     { role: 'user', content: 'Bună, mă interesează implanturile All-on-4', timestamp: new Date().toISOString() },
 *   ],
 * });
 *
 * console.log(result);
 * // {
 * //   score: 4,
 * //   classification: 'HOT',
 * //   confidence: 0.85,
 * //   reasoning: 'Explicit All-on-4 interest detected...',
 * //   suggestedAction: 'Contactați imediat!...',
 * //   procedureInterest: ['All-on-4'],
 * // }
 * ```
 *
 * @packageDocumentation
 */

// Scoring Agent
export {
  ScoringAgent,
  createScoringAgent,
  ScoringAgentInputSchema,
  type ScoringAgentConfig,
} from './scoring-agent.js';

// Hooks
export {
  createGDPRHook,
  createAuditHook,
  createInMemoryAuditStore,
  redactPII,
  PII_FIELDS,
  GDPRConsentStatusSchema,
  type GDPRHookConfig,
  type GDPRAccessEvent,
  type ConsentCheckResult,
  type GDPRConsentStatus,
  type AuditHookConfig,
  type AuditEvent,
  type AuditEventType,
} from './hooks/index.js';
