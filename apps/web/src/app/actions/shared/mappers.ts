/**
 * @fileoverview Data Transformation Utilities for Server Actions
 *
 * Pure functions for mapping between HubSpot data formats and internal schemas.
 * All functions are:
 * - Pure (no side effects)
 * - Deterministic (same input = same output)
 * - Type-safe with explicit return types
 *
 * @module actions/shared/mappers
 */

import type { LeadClassification, LeadSource } from '@medicalcor/types';

// ============================================================================
// LIFECYCLE STAGE MAPPING
// ============================================================================

/**
 * Patient status derived from HubSpot lifecycle stage
 */
export type PatientStatus = 'lead' | 'active' | 'inactive' | 'archived';

/**
 * Maps HubSpot lifecycle stage to internal PatientStatus
 *
 * @param stage - HubSpot lifecycle stage value
 * @returns Normalized patient status
 *
 * @example
 * ```typescript
 * mapHubSpotStageToStatus('customer') // 'active'
 * mapHubSpotStageToStatus('lead') // 'lead'
 * mapHubSpotStageToStatus(undefined) // 'lead'
 * ```
 */
export function mapHubSpotStageToStatus(stage?: string): PatientStatus {
  switch (stage?.toLowerCase()) {
    case 'customer':
    case 'evangelist':
      return 'active';
    case 'lead':
    case 'subscriber':
    case 'marketingqualifiedlead':
    case 'salesqualifiedlead':
    case 'opportunity':
      return 'lead';
    case 'other':
      return 'inactive';
    case undefined:
    default:
      return 'lead';
  }
}

// ============================================================================
// LEAD SCORE MAPPING
// ============================================================================

/**
 * Score thresholds for lead classification
 * @constant
 */
export const LEAD_SCORE_THRESHOLDS = {
  HOT: 4,
  WARM: 2,
} as const;

/**
 * Maps numeric lead score to classification category
 *
 * @param score - Lead score string from HubSpot (1-5 scale)
 * @returns Lead classification: HOT (4-5), WARM (2-3), COLD (0-1)
 *
 * @example
 * ```typescript
 * mapScoreToClassification('5') // 'HOT'
 * mapScoreToClassification('3') // 'WARM'
 * mapScoreToClassification('1') // 'COLD'
 * mapScoreToClassification(undefined) // 'COLD'
 * ```
 */
export function mapScoreToClassification(score?: string): LeadClassification {
  const numScore = parseInt(score ?? '0', 10);
  if (numScore >= LEAD_SCORE_THRESHOLDS.HOT) return 'HOT';
  if (numScore >= LEAD_SCORE_THRESHOLDS.WARM) return 'WARM';
  return 'COLD';
}

// ============================================================================
// LEAD SOURCE MAPPING
// ============================================================================

/**
 * Source alias mappings for normalization
 * @constant
 */
const SOURCE_ALIASES: Record<string, LeadSource> = {
  // WhatsApp sources
  whatsapp: 'whatsapp',
  '360dialog': 'whatsapp',
  // Voice sources
  voice: 'voice',
  phone: 'voice',
  twilio: 'voice',
  // Facebook sources
  facebook: 'facebook',
  facebook_ads: 'facebook',
  // Google sources
  google: 'google',
  google_ads: 'google',
  // Referral
  referral: 'referral',
  // Web form sources
  web: 'web_form',
  website: 'web_form',
  form: 'web_form',
} as const;

/**
 * Maps HubSpot lead_source to normalized LeadSource enum
 *
 * @param source - Raw lead source string from HubSpot
 * @returns Normalized LeadSource value
 *
 * @example
 * ```typescript
 * mapLeadSource('360dialog') // 'whatsapp'
 * mapLeadSource('facebook_ads') // 'facebook'
 * mapLeadSource('unknown') // 'manual'
 * ```
 */
export function mapLeadSource(source?: string): LeadSource {
  const normalized = source?.toLowerCase();
  return normalized && normalized in SOURCE_ALIASES ? SOURCE_ALIASES[normalized] : 'manual';
}

// ============================================================================
// PHONE MASKING (GDPR COMPLIANCE)
// ============================================================================

/**
 * Number of visible characters at start of phone number
 * @constant
 */
const PHONE_VISIBLE_PREFIX = 6;

/**
 * Number of visible characters at end of phone number
 * @constant
 */
const PHONE_VISIBLE_SUFFIX = 3;

/**
 * Minimum phone length before masking
 * @constant
 */
const PHONE_MIN_LENGTH = 8;

/**
 * Masks phone number for display (GDPR compliance)
 *
 * @param phone - Full phone number
 * @returns Masked phone number with middle digits hidden
 *
 * @example
 * ```typescript
 * maskPhone('+40721234567') // '+40721***567'
 * maskPhone('1234567') // '1234567' (too short, unchanged)
 * ```
 */
export function maskPhone(phone: string): string {
  if (phone.length < PHONE_MIN_LENGTH) return phone;

  const masked = phone.length - PHONE_VISIBLE_PREFIX - PHONE_VISIBLE_SUFFIX;
  const maskLength = Math.max(masked, 3);

  return `${phone.slice(0, PHONE_VISIBLE_PREFIX)}${'*'.repeat(maskLength)}${phone.slice(-PHONE_VISIBLE_SUFFIX)}`;
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Time constants in milliseconds
 * @constant
 */
const TIME_MS = {
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
} as const;

/**
 * Romanian relative time labels
 * @constant
 */
const RELATIVE_TIME_LABELS = {
  NOW: 'acum',
  MINUTES: 'min',
  HOURS: 'ore',
  YESTERDAY: 'ieri',
  DAYS: 'zile',
} as const;

/**
 * Formats date as relative time string in Romanian
 *
 * @param date - ISO date string
 * @returns Human-readable relative time string
 *
 * @example
 * ```typescript
 * formatRelativeTime(new Date().toISOString()) // 'acum'
 * formatRelativeTime(thirtyMinutesAgo) // 'acum 30 min'
 * formatRelativeTime(twoHoursAgo) // 'acum 2 ore'
 * formatRelativeTime(yesterday) // 'ieri'
 * ```
 */
export function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();

  const diffMins = Math.floor(diffMs / TIME_MS.MINUTE);
  const diffHours = Math.floor(diffMs / TIME_MS.HOUR);
  const diffDays = Math.floor(diffMs / TIME_MS.DAY);

  if (diffMins < 1) return RELATIVE_TIME_LABELS.NOW;
  if (diffMins < 60)
    return `${RELATIVE_TIME_LABELS.NOW} ${diffMins} ${RELATIVE_TIME_LABELS.MINUTES}`;
  if (diffHours < 24)
    return `${RELATIVE_TIME_LABELS.NOW} ${diffHours} ${RELATIVE_TIME_LABELS.HOURS}`;
  if (diffDays === 1) return RELATIVE_TIME_LABELS.YESTERDAY;
  if (diffDays < 7) return `${RELATIVE_TIME_LABELS.NOW} ${diffDays} ${RELATIVE_TIME_LABELS.DAYS}`;

  return then.toLocaleDateString('ro-RO');
}

// ============================================================================
// PROCEDURE INTEREST PARSING
// ============================================================================

/**
 * Parses comma-separated procedure interest string into array
 *
 * @param procedureInterest - Comma-separated procedure string from HubSpot
 * @returns Array of trimmed procedure names, or undefined if empty
 *
 * @example
 * ```typescript
 * parseProcedureInterest('implant, whitening') // ['implant', 'whitening']
 * parseProcedureInterest('') // undefined
 * parseProcedureInterest(undefined) // undefined
 * ```
 */
export function parseProcedureInterest(procedureInterest?: string): string[] | undefined {
  if (!procedureInterest) return undefined;
  const procedures = procedureInterest
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return procedures.length > 0 ? procedures : undefined;
}

// ============================================================================
// CHANNEL DETECTION
// ============================================================================

/**
 * Communication channel type
 */
export type CommunicationChannel = 'whatsapp' | 'sms' | 'email';

/**
 * Determines communication channel from lead source
 *
 * @param leadSource - Lead source string from HubSpot
 * @returns Detected communication channel
 *
 * @example
 * ```typescript
 * detectChannel('whatsapp') // 'whatsapp'
 * detectChannel('sms_campaign') // 'sms'
 * detectChannel('website') // 'email'
 * ```
 */
export function detectChannel(leadSource?: string): CommunicationChannel {
  const source = leadSource?.toLowerCase() ?? '';

  if (source.includes('whatsapp')) return 'whatsapp';
  if (source.includes('sms')) return 'sms';
  return 'email';
}

// ============================================================================
// CONVERSATION STATUS MAPPING
// ============================================================================

/**
 * Conversation status type
 */
export type ConversationStatus = 'active' | 'waiting' | 'resolved' | 'archived';

/**
 * Maps HubSpot lead status to conversation status
 *
 * @param leadStatus - Lead status string from HubSpot
 * @returns Normalized conversation status
 *
 * @example
 * ```typescript
 * mapConversationStatus('new') // 'active'
 * mapConversationStatus('pending') // 'waiting'
 * mapConversationStatus('closed') // 'resolved'
 * ```
 */
export function mapConversationStatus(leadStatus?: string): ConversationStatus {
  const status = leadStatus?.toLowerCase() ?? '';

  if (status.includes('active') || status.includes('new')) return 'active';
  if (status.includes('waiting') || status.includes('pending')) return 'waiting';
  if (status.includes('resolved') || status.includes('closed')) return 'resolved';
  return 'active';
}
