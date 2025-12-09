/**
 * Voice handler shared types
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AIScoringContext } from '@medicalcor/types';

// Loosely typed clients to avoid tight coupling
export type HubSpotClient = any;
export type ScoringClient = any;
export type TriageClient = any;
export type ConsentClient = any;
export type OpenAIClient = any;
export type EventStoreClient = any;

export interface ScoreResult {
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  confidence: number;
  suggestedAction?: string;
  procedureInterest?: string[];
}

export interface TriageResult {
  urgencyLevel: string;
  routingRecommendation: string;
  notes?: string;
  prioritySchedulingRequested?: boolean;
}

export interface ConsentCheckResult {
  valid: boolean;
  missing: string[];
}

export interface VoiceProcessingContext {
  correlationId: string;
  normalizedPhone: string;
  hubspotContactId: string | undefined;
  callSid: string;
  transcript?: string;
  duration?: number;
}

export interface VoiceEventPayload {
  callSid: string;
  from: string;
  to?: string;
  direction?: string;
  status: string;
  duration?: number;
  hubspotContactId?: string;
  score?: number;
  classification?: string;
  sentiment?: string;
  hasTranscript?: boolean;
  hasRecording?: boolean;
}

export { AIScoringContext };
