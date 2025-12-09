/**
 * Types for voice transcription workflow
 */

import type { VapiTranscript, VapiCallSummary } from '@medicalcor/integrations';
import type { TriageResult } from '@medicalcor/domain';
import type { ScoringOutput } from '@medicalcor/types';

/**
 * Transcript analysis result
 */
export interface TranscriptAnalysisResult {
  transcript: VapiTranscript | null;
  analysis: {
    fullTranscript: string;
    customerMessages: string[];
    procedureMentions: string[];
  } | null;
  summary: VapiCallSummary | null;
}

/**
 * AI summary result
 */
export interface AISummaryResult {
  aiSummary: string | null;
  sentiment: { sentiment: 'positive' | 'neutral' | 'negative'; confidence: number } | null;
}

/**
 * Lead scoring result
 */
export interface LeadScoringResult {
  scoreResult: ScoringOutput | null;
  triageResult: TriageResult | null;
}

/**
 * GDPR consent check result
 */
export interface GdprConsentResult {
  hasConsent: boolean;
  hubspotContactId: string | undefined;
  consentCheckResult?: { valid: boolean; missing: string[] };
}

/**
 * Processing context
 */
export interface VoiceProcessingContext {
  callId: string;
  correlationId: string;
  normalizedPhone: string;
  customerName?: string;
  callType: 'inbound' | 'outbound';
  duration?: number;
}
